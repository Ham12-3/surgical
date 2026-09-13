import { woundStage } from '../data/procedures/appendectomyStage';
import { isPatientModel } from '../data/zones';
import { buildReport } from '../engine/procedure/report';
import { ProcedureRun } from '../engine/procedure/run';
import type { Procedure, ProcedureMode, ProcedureStep } from '../engine/procedure/types';
import { RESTING_VITALS, stepVitals, type VitalsState } from '../engine/procedure/vitals';
import { MODE_RULES } from '../engine/scoring';
import type { ToolIndex } from '../engine/toolCatalogue';
import { isCameraPreset } from '../scene/cameras';
import type { ModelLibrary } from '../scene/modelLibrary';
import { ProcedureScene } from '../scene/procedureScene';
import type { QualityLevel } from '../store/settings';
import { element } from './dom';
import {
  describeOutcome,
  feedbackBox,
  modeChoice,
  modeTitle,
  quizContent,
  readoutLines,
  reportContent,
  stepContent,
  type StepFeedback,
} from './procedurePanels';
import { actions, header, type ButtonSpec } from './suturePadPanels';
import { ToolTray } from './toolTray';

type Phase = 'choose' | 'step' | 'quiz' | 'report';

/** How often the vitals and the clock in the panel are rewritten, in seconds. */
const READOUT_INTERVAL = 0.25;

export interface ProcedureScreenOptions {
  /** Where the screen mounts; it covers the whole of it. */
  host: HTMLElement;
  procedure: Procedure;
  tools: ToolIndex;
  models: ModelLibrary;
  quality: QualityLevel;
  onExit: () => void;
}

/**
 * A procedure played in the theatre: choose a mode, then work through the
 * steps with the instruments on the tray, answering each step's question as
 * it comes, and finish on the report card.
 *
 * The engine judges every click (`ProcedureRun`); this screen turns a click
 * into a `ToolAction`, and turns what the run says back into the panel, the
 * wound, the monitor and the camera. The content is unreviewed, so every
 * panel carries the "Unreviewed content" badge (CLAUDE.md, non-negotiable 2).
 */
export class ProcedureScreen {
  readonly scene: ProcedureScene;

  private readonly root: HTMLElement;
  private readonly panel: HTMLElement;
  private readonly tray: ToolTray;
  private readonly readouts = element('div', 'suture__readout procedure__readouts');
  private readonly zoneLine = element('p', 'drill__count procedure__zone');
  private readonly cleanup: Array<() => void> = [];
  private phase: Phase = 'choose';
  private mode: ProcedureMode = 'learn';
  private run: ProcedureRun | null = null;
  private vitals: VitalsState = RESTING_VITALS;
  private feedback: StepFeedback | null = null;
  private hints: string[] = [];
  private quiz: { readonly step: ProcedureStep; chosen: string | null } | null = null;
  private sinceReadout = 0;

  constructor(private readonly options: ProcedureScreenOptions) {
    const { procedure } = options;
    if (!isPatientModel(procedure.model)) throw new Error(`Procedure "${procedure.id}" needs unknown model "${procedure.model}"`);

    this.root = element('section', 'drill procedure');
    this.root.setAttribute('aria-label', procedure.title);
    const stageHost = element('div', 'drill__stage');
    this.panel = element('div', 'drill__panel');
    this.root.append(stageHost, this.panel);
    options.host.append(this.root);

    this.scene = new ProcedureScene({
      container: stageHost,
      model: procedure.model,
      tools: options.tools,
      trayToolIds: procedure.trayToolIds,
      models: options.models,
      quality: options.quality,
      onAction: (aim, toolId) => this.act(toolId, aim.zoneId, aim.offset, aim.avoid),
      onToolPicked: (toolId) => this.tray.setSelected(toolId),
      onAim: (aim) => this.showZone(aim?.zoneId ?? null),
    });
    this.tray = new ToolTray({
      tools: options.tools,
      toolIds: procedure.trayToolIds,
      onSelect: (toolId) => this.scene.setTool(toolId),
    });
    stageHost.append(this.tray.element);
    this.cleanup.push(this.scene.viewer.onFrame((delta) => this.tick(delta)));
    this.choose();
  }

  dispose(): void {
    for (const undo of this.cleanup) undo();
    this.tray.dispose();
    this.scene.dispose();
    this.root.remove();
  }

  private get procedure(): Procedure {
    return this.options.procedure;
  }

  private get rules(): (typeof MODE_RULES)[ProcedureMode] {
    return MODE_RULES[this.mode];
  }

  // --- Phases -----------------------------------------------------------------

  private choose(): void {
    this.phase = 'choose';
    this.run = null;
    this.quiz = null;
    this.vitals = RESTING_VITALS;
    this.scene.setVitals(this.vitals);
    this.scene.setBleeding(0);
    // Only the appendectomy has a wound to draw; other variants ignore it.
    this.scene.setWoundStage(woundStage(new Set()));
    this.scene.setTargetZone(null);
    this.scene.setPinnedZone(null);
    this.scene.setHoverHighlight(true);
    this.scene.setCameraPreset('surgeon');
    this.tray.setShowLabels(true);
    this.tray.setSelected(null);
    this.panel.replaceChildren(
      header(this.procedure.title),
      ...modeChoice(this.procedure, (mode) => this.start(mode)),
      actions([['Back to theatre', () => this.options.onExit(), true]]),
    );
  }

  private start(mode: ProcedureMode): void {
    this.mode = mode;
    this.run = new ProcedureRun(this.procedure, mode);
    this.vitals = RESTING_VITALS;
    this.feedback = null;
    this.tray.setShowLabels(this.rules.toolLabels);
    this.scene.setHoverHighlight(this.rules.hints);
    this.beginStep();
  }

  private beginStep(): void {
    const run = this.run;
    const step = run?.step;
    if (!run || !step) {
      this.finish();
      return;
    }
    this.phase = 'step';
    this.hints = [];
    this.scene.setTargetZone(step.target.zoneId, this.rules.highlightTarget);
    this.scene.setPinnedZone(run.highlightZone);
    if (step.camera && isCameraPreset(step.camera)) this.scene.setCameraPreset(step.camera);
    this.render();
  }

  private act(toolId: string, zoneId: string | null, offset: number, avoid: boolean): void {
    const run = this.run;
    const step = run?.step;
    if (this.phase !== 'step' || !run || !step || !zoneId) return;
    // A click carries no action of its own: the instrument does what the step
    // asks if it can, and otherwise the first thing it does.
    const tools = this.options.tools;
    const action = tools.supports(toolId, step.action) ? step.action : (tools.get(toolId)?.actions[0] ?? step.action);
    const outcome = run.perform({ toolId, zoneId, action, offset, avoid });
    this.feedback = describeOutcome(outcome, this.mode);
    if (!outcome.advanced) {
      this.render();
      return;
    }
    this.scene.setWoundStage(woundStage(this.completed()));
    if (step.quiz) {
      this.phase = 'quiz';
      this.quiz = { step, chosen: null };
      this.renderQuiz();
      return;
    }
    this.beginStep();
  }

  private answer(option: string): void {
    const quiz = this.quiz;
    if (!quiz || quiz.chosen !== null || !this.run) return;
    this.run.answerQuiz(quiz.step.id, option);
    quiz.chosen = option;
    this.renderQuiz();
  }

  private finish(): void {
    const run = this.run;
    if (!run) return;
    this.phase = 'report';
    this.scene.setTargetZone(null);
    this.scene.setPinnedZone(null);
    this.scene.setBleeding(0);
    this.tray.setSelected(null);
    const report = buildReport(this.procedure, this.mode, run.results(), this.vitals, run.elapsedSeconds);
    this.panel.replaceChildren(
      header(`${this.procedure.title}: ${modeTitle(this.mode)}`),
      ...reportContent(report),
      actions([
        ['Choose a mode', () => this.choose(), false],
        ['Back to theatre', () => this.options.onExit(), true],
      ]),
    );
  }

  // --- Panel ------------------------------------------------------------------

  private completed(): Set<string> {
    return new Set((this.run?.results() ?? []).filter((record) => record.completed).map((record) => record.stepId));
  }

  private hint(): void {
    const next = this.run?.nextHint() ?? null;
    const none = 'No more hints for this step.';
    if (next) this.hints.push(next);
    else if (this.hints.at(-1) !== none) this.hints.push(none);
    this.render();
  }

  private render(): void {
    const run = this.run;
    const step = run?.step;
    if (!run || !step) return;
    const suggested = run.suggestedTool && this.rules.toolLabels ? (this.options.tools.get(run.suggestedTool)?.name ?? null) : null;
    this.updateReadouts();
    const buttons: ButtonSpec[] = [];
    if (this.rules.hints) buttons.push(['Hint', () => this.hint(), false]);
    buttons.push(['Start again', () => this.choose(), true], ['Leave', () => this.options.onExit(), true]);
    this.panel.replaceChildren(
      header(`Step ${run.stepNumber} of ${this.procedure.steps.length}: ${modeTitle(this.mode)}`),
      ...stepContent({
        procedure: this.procedure,
        step,
        mode: this.mode,
        completed: this.completed(),
        feedback: this.feedback,
        hints: this.hints,
        suggestedTool: suggested,
        readouts: this.readouts,
        zone: this.zoneLine,
      }),
      actions(buttons),
    );
  }

  private renderQuiz(): void {
    const quiz = this.quiz;
    if (!quiz) return;
    const index = this.procedure.steps.indexOf(quiz.step) + 1;
    const next: ButtonSpec[] =
      quiz.chosen === null
        ? [['Leave', () => this.options.onExit(), true]]
        : [['Continue', () => this.continueAfterQuiz(), false]];
    this.panel.replaceChildren(
      header(`Step ${index} of ${this.procedure.steps.length}: ${modeTitle(this.mode)}`),
      ...(this.feedback ? [feedbackBox(this.feedback)] : []),
      ...quizContent({ step: quiz.step, chosen: quiz.chosen, reveal: this.mode !== 'assessment', onAnswer: (option) => this.answer(option) }),
      actions(next),
    );
  }

  private continueAfterQuiz(): void {
    this.quiz = null;
    this.beginStep();
  }

  /** The zone under the instrument, named only in the modes that name things. */
  private showZone(zoneId: string | null): void {
    const text = zoneId && this.phase === 'step' && this.rules.hints ? (this.scene.zones.label(zoneId) ?? '') : '';
    if (this.zoneLine.textContent !== text) this.zoneLine.textContent = text;
  }

  private updateReadouts(): void {
    const seconds = this.run && this.rules.timed ? this.run.elapsedSeconds : null;
    this.readouts.replaceChildren(...readoutLines(this.vitals, seconds));
  }

  private tick(delta: number): void {
    const run = this.run;
    if (!run || run.finished || this.phase !== 'step') return;
    run.tick(delta);
    this.vitals = stepVitals(this.vitals, delta, { bleedMlPerSecond: run.bleedMlPerSecond });
    this.scene.setVitals(this.vitals);
    this.scene.setBleeding(run.bleedMlPerSecond);
    this.sinceReadout += delta;
    if (this.sinceReadout < READOUT_INTERVAL) return;
    this.sinceReadout = 0;
    this.updateReadouts();
  }
}
