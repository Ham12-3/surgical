import type { ToolIndex } from '../engine/toolCatalogue';
import { DEFAULT_KEYS, describeKey, normaliseKey } from '../store/keyBindings';

export interface ToolTrayOptions {
  tools: ToolIndex;
  /** Tool ids for this procedure, in tray order. */
  toolIds: readonly string[];
  onSelect: (toolId: string | null) => void;
  /** Exam mode hides names but keeps the keys. */
  showLabels?: boolean;
  /** Keys for the first ten slots, in tray order: the player's bindings (keyBindings.ts). */
  keys?: readonly string[];
}

/**
 * The bottom instrument tray.
 *
 * The first ten tools in tray order each have a key, 1 to 9 and 0 unless the
 * player has rebound them. Pressing the key of the tool already held puts it
 * down, which matters because "no instrument in hand" is a real state — you
 * should be able to look at the field without something hovering over it.
 */
export class ToolTray {
  readonly element: HTMLElement;

  private readonly buttons = new Map<string, HTMLButtonElement>();
  private readonly keyOrder: string[] = [];
  private selected: string | null = null;
  private readonly detach: () => void;

  constructor(private readonly options: ToolTrayOptions) {
    const keys = options.keys ?? DEFAULT_KEYS.tools;
    this.element = document.createElement('div');
    this.element.className = 'tool-tray';
    this.element.setAttribute('role', 'toolbar');
    this.element.setAttribute('aria-label', 'Instrument tray');

    options.toolIds.forEach((toolId, index) => {
      const tool = options.tools.get(toolId);
      if (!tool) {
        console.warn(`Tray references unknown tool "${toolId}"`);
        return;
      }

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'tool-tray__button';
      button.setAttribute('aria-pressed', 'false');
      button.title = `${tool.name} — ${tool.description}`;

      const shortcut = keys[index];
      if (shortcut) {
        const key = document.createElement('span');
        key.className = 'tool-tray__key';
        key.textContent = describeKey(shortcut);
        button.append(key);
        this.keyOrder[index] = toolId;
      }

      const name = document.createElement('span');
      name.className = 'tool-tray__name';
      name.textContent = tool.shortName;
      button.append(name);

      button.addEventListener('click', () => this.toggle(toolId));
      this.element.append(button);
      this.buttons.set(toolId, button);
    });

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      const index = keys.indexOf(normaliseKey(event.key));
      const toolId = index >= 0 ? this.keyOrder[index] : undefined;
      if (!toolId) return;
      event.preventDefault();
      this.toggle(toolId);
    };
    window.addEventListener('keydown', onKeyDown);
    this.detach = () => window.removeEventListener('keydown', onKeyDown);

    this.setShowLabels(options.showLabels ?? true);
  }

  /** Pick up a tool, or pass null to put everything down. */
  setSelected(toolId: string | null): void {
    if (this.selected === toolId) return;
    if (this.selected) this.buttons.get(this.selected)?.setAttribute('aria-pressed', 'false');
    this.selected = toolId;
    if (toolId) this.buttons.get(toolId)?.setAttribute('aria-pressed', 'true');
    this.options.onSelect(toolId);
  }

  setShowLabels(show: boolean): void {
    this.element.classList.toggle('tool-tray--unlabelled', !show);
    // Titles carry the tool name too, so they have to go in exam mode as well.
    for (const [toolId, button] of this.buttons) {
      const tool = this.options.tools.get(toolId);
      button.title = show && tool ? `${tool.name} — ${tool.description}` : '';
    }
  }

  dispose(): void {
    this.detach();
    this.element.remove();
    this.buttons.clear();
  }

  private toggle(toolId: string): void {
    this.setSelected(this.selected === toolId ? null : toolId);
  }
}

/** A key press meant for a text field or a select, which the game's keys leave alone. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}
