import {
  createDrill,
  scoreDrill,
  seededRandom,
  type DrillAnswer,
  type DrillQuestion,
} from '../engine/drill';
import type { Tool } from '../engine/types';
import { InstrumentStage } from '../scene/instrumentStage';
import type { ModelLibrary } from '../scene/modelLibrary';
import { isToolMeshKey } from '../scene/tools/toolMeshes';
import { loadDrillProgress, recordDrillResult, saveDrillProgress } from '../store/drillProgress';
import type { Activity, RunReward } from '../engine/progression';
import { rewardContent } from './rewardPanel';

export interface DrillScreenOptions {
  /** Where the screen mounts; it covers the whole of it. */
  host: HTMLElement;
  /** The instruments the drill asks about. */
  tools: readonly Tool[];
  models: ModelLibrary;
  storage: Storage | null;
  onExit: () => void;
  /** Counts a finished run toward progression; what it earned joins the results. */
  onActivity?: (activity: Activity) => RunReward | null;
}

/**
 * The instrument identification drill: an instrument on the turntable, four
 * names to choose from, then what it is for. Ten questions, then the score,
 * the best so far, and the instruments to go over again.
 *
 * Keys 1 to 4 answer and Enter moves on. The instrument descriptions have not
 * been checked by a clinician yet, so the panel carries the "Unreviewed
 * content" badge (CLAUDE.md, non-negotiable 2).
 */
export class DrillScreen {
  private readonly root: HTMLElement;
  private readonly panel: HTMLElement;
  private readonly stage: InstrumentStage;
  private readonly byId: ReadonlyMap<string, Tool>;
  private readonly detachKeys: () => void;
  private questions: DrillQuestion[] = [];
  private answers: DrillAnswer[] = [];
  private index = 0;
  private optionButtons: Array<{ id: string; button: HTMLButtonElement }> = [];
  private advance: (() => void) | null = null;

  constructor(private readonly options: DrillScreenOptions) {
    this.byId = new Map(options.tools.map((tool) => [tool.id, tool]));
    this.root = element('section', 'drill');
    this.root.setAttribute('aria-label', 'Instrument identification drill');
    const stageHost = element('div', 'drill__stage');
    this.panel = element('div', 'drill__panel');
    this.root.append(stageHost, this.panel);
    options.host.append(this.root);
    this.stage = new InstrumentStage(stageHost, options.models);

    const onKey = (event: KeyboardEvent): void => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const choice = Number(event.key);
      const option = Number.isInteger(choice) ? this.optionButtons[choice - 1] : undefined;
      if (option && !option.button.disabled) {
        event.preventDefault();
        this.answer(option.id);
      } else if (event.key === 'Enter' && this.advance) {
        event.preventDefault();
        this.advance();
      }
    };
    window.addEventListener('keydown', onKey);
    this.detachKeys = () => window.removeEventListener('keydown', onKey);
    this.start();
  }

  dispose(): void {
    this.detachKeys();
    this.stage.dispose();
    this.root.remove();
  }

  private start(): void {
    this.questions = createDrill(this.options.tools, seededRandom(Date.now() >>> 0));
    this.answers = [];
    this.index = 0;
    this.showQuestion();
  }

  private showQuestion(): void {
    const question = this.questions[this.index];
    if (!question) {
      this.finish();
      return;
    }
    const tool = this.byId.get(question.toolId);
    if (tool && isToolMeshKey(tool.mesh)) this.stage.show(tool.mesh);
    this.advance = null;

    const list = element('div', 'drill__options');
    this.optionButtons = question.options.map((id, index) => {
      const button = element('button', 'drill__option');
      button.type = 'button';
      button.append(element('span', 'drill__key', String(index + 1)), this.byId.get(id)?.name ?? id);
      button.addEventListener('click', () => this.answer(id));
      list.append(button);
      return { id, button };
    });

    this.panel.replaceChildren(
      this.header(`Question ${this.index + 1} of ${this.questions.length}`),
      element('h2', 'drill__prompt', 'Which instrument is this?'),
      list,
      this.actions([['Leave drill', () => this.options.onExit(), true]]),
    );
  }

  private answer(chosenId: string): void {
    const question = this.questions[this.index];
    if (!question || this.advance) return;
    this.answers.push({ toolId: question.toolId, chosenId });
    const right = chosenId === question.toolId;

    for (const { id, button } of this.optionButtons) {
      button.disabled = true;
      if (id === question.toolId) {
        button.classList.add('drill__option--right');
        button.append(' ✓');
      } else if (id === chosenId) {
        button.classList.add('drill__option--wrong');
        button.append(' ✗');
      }
    }

    const tool = this.byId.get(question.toolId);
    const feedback = element('div', 'drill__feedback');
    feedback.append(
      element(
        'div',
        `drill__verdict drill__verdict--${right ? 'right' : 'wrong'}`,
        right ? 'Correct' : `Not quite: this is the ${tool?.name ?? question.toolId}`,
      ),
      tool?.description ?? '',
    );
    const last = this.index === this.questions.length - 1;
    this.advance = () => {
      this.index += 1;
      this.showQuestion();
    };
    this.panel.replaceChildren(
      this.header(`Question ${this.index + 1} of ${this.questions.length}`),
      element('h2', 'drill__prompt', 'Which instrument is this?'),
      this.panel.querySelector('.drill__options') ?? element('div'),
      feedback,
      this.actions([
        [last ? 'See results' : 'Next', this.advance, false],
        ['Leave drill', () => this.options.onExit(), true],
      ]),
    );
  }

  private finish(): void {
    const result = scoreDrill(this.answers);
    const progress = recordDrillResult(loadDrillProgress(this.options.storage), result);
    saveDrillProgress(this.options.storage, progress);
    const reward = this.options.onActivity?.({ kind: 'drill', percent: result.percent }) ?? null;
    this.optionButtons = [];
    this.advance = () => this.start();

    const summary = element('div');
    summary.append(
      element('div', 'drill__score', `${result.correct} / ${result.total}`),
      element(
        'div',
        'drill__count',
        `${result.percent}% this time. Best ${progress.bestPercent}% over ${progress.attempts} ${progress.attempts === 1 ? 'run' : 'runs'}.`,
      ),
    );
    const children: HTMLElement[] = [this.header('Results'), summary];
    if (result.missed.length > 0) {
      const review = element('ul', 'drill__list');
      for (const id of result.missed) {
        const tool = this.byId.get(id);
        const item = element('li');
        item.append(element('strong', '', tool?.name ?? id), `: ${tool?.description ?? ''}`);
        review.append(item);
      }
      children.push(element('h2', 'drill__prompt', 'Worth another look'), review);
    } else {
      children.push(element('p', 'drill__count', 'Every instrument named correctly.'));
    }
    children.push(
      ...rewardContent(reward),
      this.actions([
        ['Try again', () => this.start(), false],
        ['Home', () => this.options.onExit(), true],
      ]),
    );
    this.panel.replaceChildren(...children);
  }

  private header(text: string): HTMLElement {
    const header = element('div', 'drill__header');
    header.append(element('span', 'drill__count', text), element('span', 'drill__badge', 'Unreviewed content'));
    return header;
  }

  private actions(buttons: Array<[label: string, onClick: () => void, quiet: boolean]>): HTMLElement {
    const row = element('div', 'drill__actions');
    for (const [label, onClick, quiet] of buttons) {
      const button = element('button', quiet ? 'drill__button drill__button--quiet' : 'drill__button', label);
      button.type = 'button';
      button.addEventListener('click', onClick);
      row.append(button);
    }
    return row;
  }
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
