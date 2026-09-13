import {
  DEFAULT_KEYS,
  describeKey,
  isBindable,
  KEY_ACTIONS,
  keyFor,
  rebind,
  sameAction,
  type KeyAction,
} from '../store/keyBindings';
import { CONTENT_LEVELS, QUALITY_LEVELS, type ContentLevel, type QualityLevel, type Settings } from '../store/settings';
import { DISCLAIMER_TEXT } from './disclaimer';
import { element } from './dom';

export interface SettingsScreenOptions {
  host: HTMLElement;
  settings: Settings;
  /** Every change, as it happens: the app applies and saves it. */
  onChange: (settings: Settings) => void;
  onResetProgress: () => void;
  /** Play a cue at the chosen volume, so the setting can be heard. */
  onTestSound?: () => void;
}

const QUALITY_TEXT: Readonly<Record<QualityLevel, string>> = {
  low: 'Low: no lamp shadow, for older or slower graphics.',
  medium: 'Medium: the tuned look, for most laptops.',
  high: 'High: ambient occlusion and bloom, for dedicated graphics.',
};

const CONTENT_TEXT: Readonly<Record<ContentLevel, string>> = {
  reduced: 'Reduced: muted tissue colours, and a thin dark film where it bleeds.',
  schematic: 'Schematic: each tissue in a flat, distinct colour, and no blood.',
};

function actionLabel(action: KeyAction): string {
  switch (action.kind) {
    case 'tool':
      return `Instrument ${action.slot + 1}`;
    case 'hint':
      return 'Ask for a hint';
    case 'pause':
      return 'Pause a procedure';
  }
}

/**
 * Settings: graphics and content level, accessibility, sound, controls and
 * progress. Each change applies and saves as soon as it is made.
 */
export class SettingsScreen {
  private readonly root = element('section', 'page settings');
  private readonly keyList = element('div', 'settings__keys');
  private readonly keyNote = element('p', 'suture__hint suture__warn');
  private readonly detach: () => void;
  private settings: Settings;
  private capturing: KeyAction | null = null;

  constructor(private readonly options: SettingsScreenOptions) {
    this.settings = options.settings;
    this.root.setAttribute('aria-label', 'Settings');
    const inner = element('div', 'page__inner');
    inner.append(
      element('h1', 'page__title', 'Settings'),
      this.graphics(),
      this.accessibility(),
      this.sound(),
      this.controls(),
      this.progress(),
      this.about(),
    );
    this.root.append(inner);
    options.host.append(this.root);

    // While a control is waiting for its key, the next key press is taken
    // here, in the capture phase, before anything else in the app sees it.
    const onKey = (event: KeyboardEvent): void => {
      const action = this.capturing;
      if (!action) return;
      event.preventDefault();
      event.stopPropagation();
      if (isBindable(event.key)) this.update({ keys: rebind(this.settings.keys, action, event.key) });
      else this.keyNote.textContent = 'Enter, Space, Tab and modifier keys are kept for other controls.';
      this.capturing = null;
      this.renderKeys();
    };
    window.addEventListener('keydown', onKey, true);
    this.detach = () => window.removeEventListener('keydown', onKey, true);
  }

  dispose(): void {
    this.detach();
    this.root.remove();
  }

  private update(patch: Partial<Settings>): void {
    this.settings = { ...this.settings, ...patch };
    this.options.onChange(this.settings);
  }

  private graphics(): HTMLElement {
    const section = this.section('Graphics and content');
    section.append(
      this.choice('quality', 'Graphics quality', QUALITY_LEVELS, QUALITY_TEXT, this.settings.quality, (quality) =>
        this.update({ quality }),
      ),
      this.choice('content', 'Content level', CONTENT_LEVELS, CONTENT_TEXT, this.settings.contentLevel, (contentLevel) =>
        this.update({ contentLevel }),
      ),
      element('p', 'suture__hint', 'There is no level with realistic blood: bleeding stays subtle so the simulator can be used anywhere.'),
    );
    return section;
  }

  private accessibility(): HTMLElement {
    const section = this.section('Accessibility');
    section.append(
      this.toggle(
        'Colourblind-safe colours',
        'Right and wrong in blue and orange instead of green and red. Their symbols and shapes stay either way.',
        this.settings.colourblindSafe,
        (colourblindSafe) => this.update({ colourblindSafe }),
      ),
      this.toggle(
        'Reduced motion',
        'The camera and the wound change at once instead of moving smoothly.',
        this.settings.reducedMotion,
        (reducedMotion) => this.update({ reducedMotion }),
      ),
    );
    return section;
  }

  private sound(): HTMLElement {
    const section = this.section('Sound');
    const volume = element('label', 'settings__option settings__range');
    const slider = element('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '100';
    slider.step = '5';
    slider.value = String(Math.round(this.settings.volume * 100));
    slider.addEventListener('input', () => this.update({ volume: Number(slider.value) / 100 }));
    const test = element('button', 'drill__button drill__button--quiet', 'Play a test cue');
    test.type = 'button';
    test.addEventListener('click', () => this.options.onTestSound?.());
    volume.append(element('span', '', 'Volume'), slider, test);
    section.append(
      this.toggle(
        'Sound cues',
        'Short tones when a step is done, when something is not accepted, and when a run ends.',
        this.settings.sound,
        (sound) => this.update({ sound }),
      ),
      volume,
      this.toggle('Captions', 'Every sound cue also written at the foot of the screen.', this.settings.captions, (captions) =>
        this.update({ captions }),
      ),
    );
    return section;
  }

  private controls(): HTMLElement {
    const section = this.section('Controls');
    const reset = element('button', 'drill__button drill__button--quiet', 'Reset keys');
    reset.type = 'button';
    reset.addEventListener('click', () => {
      this.capturing = null;
      this.update({ keys: DEFAULT_KEYS });
      this.renderKeys();
    });
    section.append(
      element('p', 'suture__hint', 'Choose a control, then press the key you want for it. A key already in use swaps places with it.'),
      this.keyList,
      this.keyNote,
      reset,
    );
    this.renderKeys();
    return section;
  }

  private renderKeys(): void {
    const rows = KEY_ACTIONS.map((action) => {
      const waiting = this.capturing !== null && sameAction(this.capturing, action);
      const key = describeKey(keyFor(this.settings.keys, action));
      const button = element('button', 'drill__button drill__button--quiet settings__key-button', waiting ? 'Press a key' : key);
      button.type = 'button';
      button.setAttribute('aria-label', `${actionLabel(action)}: ${key}. Change`);
      button.addEventListener('click', () => {
        this.capturing = waiting ? null : action;
        this.keyNote.textContent = '';
        this.renderKeys();
      });
      const row = element('div', 'settings__key');
      row.append(element('span', '', actionLabel(action)), button);
      return row;
    });
    this.keyList.replaceChildren(...rows);
  }

  private progress(): HTMLElement {
    const section = this.section('Progress');
    const button = element('button', 'drill__button drill__button--quiet', 'Reset progress');
    button.type = 'button';
    let armed = false;
    button.addEventListener('click', () => {
      if (!armed) {
        armed = true;
        button.textContent = 'Click again to erase all progress';
        return;
      }
      this.options.onResetProgress();
      button.textContent = 'Progress erased';
      button.disabled = true;
    });
    section.append(
      element('p', 'suture__hint', 'Experience, rank, badges and best scores are kept in this browser. Resetting erases them, and cannot be undone.'),
      button,
    );
    return section;
  }

  private about(): HTMLElement {
    const section = this.section('About');
    section.append(element('p', 'suture__hint', DISCLAIMER_TEXT));
    return section;
  }

  private section(title: string): HTMLElement {
    const section = element('section', 'card settings__section');
    section.append(element('h2', 'card__title', title));
    return section;
  }

  private choice<T extends string>(
    name: string,
    legend: string,
    values: readonly T[],
    labels: Readonly<Record<T, string>>,
    current: T,
    onPick: (value: T) => void,
  ): HTMLElement {
    const fieldset = element('fieldset', 'settings__field');
    fieldset.append(element('legend', 'settings__legend', legend));
    for (const value of values) {
      const input = element('input');
      input.type = 'radio';
      input.name = name;
      input.value = value;
      input.checked = value === current;
      input.addEventListener('change', () => {
        if (input.checked) onPick(value);
      });
      const label = element('label', 'settings__option');
      label.append(input, element('span', '', labels[value]));
      fieldset.append(label);
    }
    return fieldset;
  }

  private toggle(title: string, description: string, checked: boolean, onToggle: (checked: boolean) => void): HTMLElement {
    const input = element('input');
    input.type = 'checkbox';
    input.checked = checked;
    input.addEventListener('change', () => onToggle(input.checked));
    const text = element('span', 'settings__text');
    text.append(element('strong', '', title), element('span', 'procedure__mode-text', description));
    const label = element('label', 'settings__option');
    label.append(input, text);
    return label;
  }
}
