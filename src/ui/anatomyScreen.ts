import { layerStage } from '../data/procedures/appendectomyStage';
import { getZoneManifest } from '../data/zones';
import { deepestLayer, zoneIdsOnLayer } from '../data/zones/layers';
import { createAnatomyQuiz, scoreAnatomyQuiz, type QuizStructure } from '../engine/anatomyQuiz';
import { seededRandom } from '../engine/drill';
import type { ToolIndex } from '../engine/toolCatalogue';
import { woundCamera } from '../scene/cameras';
import type { ModelLibrary } from '../scene/modelLibrary';
import type { ZoneHit } from '../scene/models/zones';
import { ProcedureScene } from '../scene/procedureScene';
import type { Settings } from '../store/settings';
import { element } from './dom';
import type { CueName } from './soundCues';
import { actions, header } from './suturePadPanels';

export interface AnatomyScreenOptions {
  host: HTMLElement;
  tools: ToolIndex;
  models: ModelLibrary;
  settings: Settings;
  /** Play a sound cue (sound.ts). */
  onCue?: (cue: CueName) => void;
  onExit: () => void;
}

interface Quiz {
  readonly questions: readonly QuizStructure[];
  readonly answers: string[];
  /** The current question has been answered, and waits for Next. */
  answered: boolean;
}

const MODEL = 'abdomen-open';

/**
 * The anatomy explorer: the open abdomen with nothing to operate on. A slider
 * opens the wall a layer at a time; the structures on the layer on show are
 * listed, and named and highlighted under the pointer; and a quiz names a
 * structure for the student to find with a click.
 *
 * The layers and organs are the procedure's stylised ones, flagged for review
 * in src/data/zones/abdomenOpen.ts, so the panel carries the "Unreviewed
 * content" badge and says the view is schematic.
 */
export class AnatomyScreen {
  readonly scene: ProcedureScene;

  private readonly root = element('section', 'drill explorer');
  private readonly panel = element('div', 'drill__panel');
  private readonly manifest = getZoneManifest(MODEL);
  private readonly slider = element('input', 'explorer__slider');
  private readonly layerTitle = element('h2', 'drill__prompt');
  private readonly structureList = element('div', 'drill__options');
  private readonly nameLine = element('p', 'drill__count procedure__zone');
  private depth = 0;
  private hovered: string | null = null;
  private quiz: Quiz | null = null;

  constructor(private readonly options: AnatomyScreenOptions) {
    const { settings } = options;
    this.root.setAttribute('aria-label', 'Anatomy explorer');
    const stageHost = element('div', 'drill__stage');
    this.root.append(stageHost, this.panel);
    options.host.append(this.root);

    this.scene = new ProcedureScene({
      container: stageHost,
      model: MODEL,
      tools: options.tools,
      trayToolIds: [],
      models: options.models,
      quality: settings.quality,
      contentLevel: settings.contentLevel,
      reducedMotion: settings.reducedMotion,
      onZoneHover: (hit) => this.hover(hit),
      onZoneClick: (hit) => this.pick(hit),
    });
    this.scene.setCameraPreset(woundCamera(0), false);

    this.slider.type = 'range';
    this.slider.min = '0';
    this.slider.max = String(deepestLayer(this.manifest));
    this.slider.step = '1';
    this.slider.setAttribute('aria-label', 'Layer on show');
    this.slider.addEventListener('input', () => {
      this.setDepth(Number(this.slider.value));
      this.showLayerDetails();
    });
    this.explore();
  }

  dispose(): void {
    this.scene.dispose();
    this.root.remove();
  }

  private layerName(layer: number): string {
    return this.manifest.layerNames?.[layer] ?? `Layer ${layer + 1}`;
  }

  /** Open the wall down to a layer, and let only that layer's structures be picked. */
  private setDepth(depth: number): void {
    // Deep structures can only be reached looking down into the wound.
    if (woundCamera(depth) !== woundCamera(this.depth)) this.scene.setCameraPreset(woundCamera(depth));
    this.depth = depth;
    this.slider.value = String(depth);
    this.slider.setAttribute('aria-valuetext', this.layerName(depth));
    this.scene.setWoundStage(layerStage(depth));
    this.scene.zones.setPickable(zoneIdsOnLayer(this.manifest, depth));
    this.scene.setPinnedZone(null);
  }

  // --- Exploring --------------------------------------------------------------

  private explore(): void {
    this.quiz = null;
    this.scene.setHoverHighlight(true);
    const scale = element('div', 'explorer__scale');
    scale.append(element('span', '', this.layerName(0)), element('span', '', this.layerName(deepestLayer(this.manifest))));
    this.panel.replaceChildren(
      header('Anatomy explorer'),
      element('p', 'suture__hint', 'Drag the slider to open the abdominal wall one layer at a time. Point at a structure to name it, or choose one below to see where it is.'),
      this.slider,
      scale,
      this.layerTitle,
      this.structureList,
      this.nameLine,
      element('p', 'suture__hint suture__warn', 'The layers and organs are drawn schematically, to show their order rather than their exact size or position.'),
      actions([
        ['Test yourself', () => this.startQuiz(), false],
        ['Home', () => this.options.onExit(), true],
      ]),
    );
    this.setDepth(this.depth);
    this.showLayerDetails();
  }

  private showLayerDetails(): void {
    const deepest = deepestLayer(this.manifest);
    this.layerTitle.textContent = `Layer ${this.depth + 1} of ${deepest + 1}: ${this.layerName(this.depth)}`;
    const buttons = this.manifest.zones
      .filter((zone) => (zone.layer ?? 0) === this.depth)
      .map((zone) => {
        const button = element('button', 'drill__option', zone.avoid ? `${zone.label} (to protect)` : zone.label);
        button.type = 'button';
        button.addEventListener('click', () => this.name(zone.id, zone.label));
        return button;
      });
    this.structureList.replaceChildren(...buttons);
    this.nameLine.textContent = '';
  }

  private name(zoneId: string, label: string): void {
    this.scene.setPinnedZone(zoneId);
    this.nameLine.textContent = label;
  }

  private hover(hit: ZoneHit | null): void {
    const id = hit?.id ?? null;
    if (this.quiz || id === this.hovered) return;
    this.hovered = id;
    if (hit) this.nameLine.textContent = hit.label;
  }

  // --- Quiz -------------------------------------------------------------------

  private startQuiz(): void {
    // The general skin zone sits behind the specific ones, so it is not a
    // structure to find; nor is one to protect, which lies mostly out of the
    // opening (the packed-off ileum), though the explorer still lists it.
    const structures = this.manifest.zones
      .filter((zone) => (zone.priority ?? 0) >= 0 && !zone.avoid)
      .map((zone) => ({ id: zone.id, label: zone.label, layer: zone.layer ?? 0 }));
    this.quiz = { questions: createAnatomyQuiz(structures, seededRandom(Date.now() >>> 0)), answers: [], answered: false };
    this.scene.setHoverHighlight(false);
    this.ask();
  }

  private ask(): void {
    const quiz = this.quiz;
    if (!quiz) return;
    const question = quiz.questions[quiz.answers.length];
    if (!question) {
      this.finishQuiz(quiz);
      return;
    }
    quiz.answered = false;
    this.setDepth(question.layer);
    // Each question starts from the view it was checked from, however the camera was left.
    this.scene.setCameraPreset(woundCamera(question.layer));
    this.panel.replaceChildren(
      header(`Question ${quiz.answers.length + 1} of ${quiz.questions.length}`),
      element('h2', 'drill__prompt', `Find: ${question.label}`),
      element('p', 'suture__hint', `Layer on show: ${this.layerName(question.layer)}. Click the structure in the view.`),
      actions([['Stop the quiz', () => this.explore(), true]]),
    );
  }

  private pick(hit: ZoneHit): void {
    const quiz = this.quiz;
    if (!quiz) {
      this.name(hit.id, hit.label);
      return;
    }
    const question = quiz.questions[quiz.answers.length];
    if (!question || quiz.answered) return;
    quiz.answers.push(hit.id);
    quiz.answered = true;
    const right = hit.id === question.id;
    this.options.onCue?.(right ? 'step_done' : 'not_accepted');
    // Show where the structure asked for is, whether or not it was found.
    this.scene.setPinnedZone(question.id);
    const last = quiz.answers.length === quiz.questions.length;
    this.panel.replaceChildren(
      header(`Question ${quiz.answers.length} of ${quiz.questions.length}`),
      element('h2', 'drill__prompt', `Find: ${question.label}`),
      element(
        'div',
        `drill__verdict drill__verdict--${right ? 'right' : 'wrong'}`,
        right ? `✓ Right: ${question.label}.` : `✗ That was ${hit.label}. ${question.label} is highlighted now.`,
      ),
      actions([
        [last ? 'See results' : 'Next', () => this.ask(), false],
        ['Stop the quiz', () => this.explore(), true],
      ]),
    );
  }

  private finishQuiz(quiz: Quiz): void {
    const result = scoreAnatomyQuiz(quiz.questions, quiz.answers);
    this.quiz = null;
    this.scene.setHoverHighlight(true);
    this.scene.setPinnedZone(null);
    this.options.onCue?.('run_complete');
    const children: HTMLElement[] = [header('Results'), element('div', 'drill__score', `${result.correct} / ${result.total}`)];
    if (result.missed.length > 0) {
      const list = element('ul', 'drill__list');
      for (const label of result.missed) list.append(element('li', '', label));
      children.push(element('h2', 'drill__prompt', 'Worth another look'), list);
    } else {
      children.push(element('p', 'drill__count', 'Every structure found.'));
    }
    children.push(
      actions([
        ['Test again', () => this.startQuiz(), false],
        ['Explore', () => this.explore(), true],
        ['Home', () => this.options.onExit(), true],
      ]),
    );
    this.panel.replaceChildren(...children);
  }
}
