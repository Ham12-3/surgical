import { woundStage } from '../data/procedures/appendectomyStage';
import { isPatientModel } from '../data/zones';
import type { Report } from '../engine/procedure/report';
import type { Procedure, ProcedureMode } from '../engine/procedure/types';
import type { RunReward } from '../engine/progression';
import type { ToolIndex } from '../engine/toolCatalogue';
import { isCameraPreset } from '../scene/cameras';
import type { ModelLibrary } from '../scene/modelLibrary';
import { ProcedureScene } from '../scene/procedureScene';
import type { Settings } from '../store/settings';
import { element } from './dom';
import { listenForProcedureKeys } from './procedureKeys';
import { describeOutcome, feedbackBox, modeChoice, modeTitle, pauseOverlay, quizContent } from './procedurePanels';
import { readoutLines, reportContent, stepContent } from './procedurePanels';
import { ProcedureSession } from './procedureSession';
import { rewardContent } from './rewardPanel';
import { actions, header, type ButtonSpec } from './suturePadPanels';
import { ToolTray } from './toolTray';

/** How often the vitals and the clock in the panel are rewritten, in seconds. */
const READOUT_INTERVAL = 0.25;

export interface ProcedureScreenOptions {
  /** Where the screen mounts; it covers the whole of it. */
  host: HTMLElement;
  procedure: Procedure;
  tools: ToolIndex;
  models: ModelLibrary;
  settings: Settings;
  /** Start straight in this mode when it is unlocked; otherwise the mode choice shows. */
  initialMode?: ProcedureMode | undefined;
  isUnlocked?: (mode: ProcedureMode) => boolean;
  /** Count a finished run toward progression; what it earned joins the report card. */
  onFinish?: (report: Report) => RunReward | null;
  onExit: () => void;
}

/**
 * A procedure played in the theatre: choose a mode, work through the steps
 * with the instruments on the tray, answer each step's question as it comes,
 * and finish on the report card.
 *
 * The rules of play are the session's (`ProcedureSession`); this screen turns
 * a click into a call on it, and what it says into the panel, the wound, the
 * monitor and the camera. The content is unreviewed, so every panel carries
 * the "Unreviewed content" badge (CLAUDE.md, non-negotiable 2), and the pause
 * menu repeats the disclaimer.
 */
export class ProcedureScreen {
  readonly scene: ProcedureScene;
  readonly session: ProcedureSession;

  private readonly root: HTMLElement;
  private readonly panel: HTMLElement;
  private readonly tray: ToolTray;
  private readonly readouts = element('div', 'suture__readout procedure__readouts');
  private readonly zoneLine = element('p', 'drill__count procedure__zone');
  private readonly cleanup: Array<() => void> = [];
  private pauseMenu: HTMLElement | null = null;
  private sinceReadout = 0;

  constructor(private readonly options: ProcedureScreenOptions) {
    const { procedure, settings } = options;
    if (!isPatientModel(procedure.model)) throw new Error(`Procedure "${procedure.id}" needs unknown model "${procedure.model}"`);
    this.session = new ProcedureSession(procedure, options.tools);

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
      quality: settings.quality,
      contentLevel: settings.contentLevel,
      reducedMotion: settings.reducedMotion,
      onAction: (aim, toolId) => this.act(toolId, aim.zoneId, aim.offset, aim.avoid),
      onToolPicked: (toolId) => this.tray.setSelected(toolId),
      onAim: (aim) => this.showZone(aim?.zoneId ?? null),
    });
    this.tray = new ToolTray({
      tools: options.tools,
      toolIds: procedure.trayToolIds,
      keys: settings.keys.tools,
      onSelect: (toolId) => this.scene.setTool(toolId),
    });
    stageHost.append(this.tray.element);

    const { session } = this;
    this.cleanup.push(
      listenForProcedureKeys(settings.keys, {
        pause: () => {
          if (session.phase !== 'step' && session.phase !== 'quiz') return false;
          this.setPaused(!session.paused);
          return true;
        },
        hint: () => {
          if (!session.rules.hints || session.phase !== 'step' || session.paused) return false;
          this.hint();
          return true;
        },
      }),
      this.scene.viewer.onFrame((delta) => this.tick(delta)),
    );

    const mode = options.initialMode;
    if (mode && this.unlocked(mode)) this.start(mode);
    else this.choose();
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

  private unlocked(mode: ProcedureMode): boolean {
    return this.options.isUnlocked?.(mode) ?? true;
  }

  // --- Phases -----------------------------------------------------------------

  private choose(): void {
    this.setPaused(false);
    this.session.reset();
    this.scene.setVitals(this.session.vitals);
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
      ...modeChoice(this.procedure, (mode) => this.start(mode), (mode) => this.unlocked(mode)),
      actions([['Home', () => this.options.onExit(), true]]),
    );
  }

  private start(mode: ProcedureMode): void {
    this.session.start(mode);
    this.tray.setShowLabels(this.session.rules.toolLabels);
    this.scene.setHoverHighlight(this.session.rules.hints);
    this.beginStep();
  }

  private beginStep(): void {
    const run = this.session.run;
    const step = run?.step;
    if (!run || !step) {
      this.finish();
      return;
    }
    this.scene.setTargetZone(step.target.zoneId, this.session.rules.highlightTarget);
    this.scene.setPinnedZone(run.highlightZone);
    if (step.camera && isCameraPreset(step.camera)) this.scene.setCameraPreset(step.camera);
    this.render();
  }

  private act(toolId: string, zoneId: string | null, offset: number, avoid: boolean): void {
    const change = this.session.act(toolId, zoneId, offset, avoid);
    if (change === 'ignored') return;
    if (change === 'refused') {
      this.render();
      return;
    }
    this.scene.setWoundStage(woundStage(this.session.completed()));
    if (change === 'quiz') this.renderQuiz();
    else this.beginStep();
  }

  private answer(option: string): void {
    if (this.session.answer(option) !== null) this.renderQuiz();
  }

  private continueAfterQuiz(): void {
    if (this.session.continueAfterQuiz() !== 'ignored') this.beginStep();
  }

  private finish(): void {
    const report = this.session.report();
    if (!report) return;
    this.scene.setTargetZone(null);
    this.scene.setPinnedZone(null);
    this.scene.setBleeding(0);
    this.tray.setSelected(null);
    const reward = this.options.onFinish?.(report) ?? null;
    this.panel.replaceChildren(
      header(`${this.procedure.title}: ${modeTitle(report.mode)}`),
      ...reportContent(report),
      ...rewardContent(reward),
      actions([
        ['Choose a mode', () => this.choose(), false],
        ['Home', () => this.options.onExit(), true],
      ]),
    );
  }

  private setPaused(paused: boolean): void {
    this.session.setPaused(paused);
    this.pauseMenu?.remove();
    this.pauseMenu = null;
    if (!this.session.paused) return;
    this.pauseMenu = pauseOverlay([
      ['Resume', () => this.setPaused(false), false],
      ['Start again', () => this.choose(), true],
      ['Home', () => this.options.onExit(), true],
    ]);
    this.root.append(this.pauseMenu);
    this.pauseMenu.querySelector('button')?.focus();
  }

  // --- Panel ------------------------------------------------------------------

  private hint(): void {
    this.session.hint();
    this.render();
  }

  private render(): void {
    const { session } = this;
    const run = session.run;
    const step = run?.step;
    if (!run || !step) return;
    const { rules } = session;
    const suggested = run.suggestedTool && rules.toolLabels ? (this.options.tools.get(run.suggestedTool)?.name ?? null) : null;
    this.updateReadouts();
    const buttons: ButtonSpec[] = [];
    if (rules.hints) buttons.push(['Hint', () => this.hint(), false]);
    buttons.push(['Pause', () => this.setPaused(true), true], ['Home', () => this.options.onExit(), true]);
    this.panel.replaceChildren(
      header(`Step ${run.stepNumber} of ${this.procedure.steps.length}: ${modeTitle(session.mode)}`),
      ...stepContent({
        procedure: this.procedure,
        step,
        mode: session.mode,
        completed: session.completed(),
        feedback: session.outcome ? describeOutcome(session.outcome, session.mode) : null,
        hints: session.hints,
        suggestedTool: suggested,
        readouts: this.readouts,
        zone: this.zoneLine,
      }),
      actions(buttons),
    );
  }

  private renderQuiz(): void {
    const { session } = this;
    const quiz = session.quiz;
    if (!quiz) return;
    const index = this.procedure.steps.indexOf(quiz.step) + 1;
    const next: ButtonSpec[] =
      quiz.chosen === null
        ? [['Pause', () => this.setPaused(true), true]]
        : [['Continue', () => this.continueAfterQuiz(), false]];
    const outcome = session.outcome;
    this.panel.replaceChildren(
      header(`Step ${index} of ${this.procedure.steps.length}: ${modeTitle(session.mode)}`),
      ...(outcome ? [feedbackBox(describeOutcome(outcome, session.mode))] : []),
      ...quizContent({
        step: quiz.step,
        chosen: quiz.chosen,
        reveal: session.mode !== 'assessment',
        onAnswer: (option) => this.answer(option),
      }),
      actions(next),
    );
  }

  /** The zone under the instrument, named only in the modes that name things. */
  private showZone(zoneId: string | null): void {
    const { session } = this;
    const text = zoneId && session.phase === 'step' && session.rules.hints ? (this.scene.zones.label(zoneId) ?? '') : '';
    if (this.zoneLine.textContent !== text) this.zoneLine.textContent = text;
  }

  private updateReadouts(): void {
    const run = this.session.run;
    const seconds = run && this.session.rules.timed ? run.elapsedSeconds : null;
    this.readouts.replaceChildren(...readoutLines(this.session.vitals, seconds));
  }

  private tick(delta: number): void {
    if (!this.session.tick(delta)) return;
    this.scene.setVitals(this.session.vitals);
    this.scene.setBleeding(this.session.bleedMlPerSecond);
    this.sinceReadout += delta;
    if (this.sinceReadout < READOUT_INTERVAL) return;
    this.sinceReadout = 0;
    this.updateReadouts();
  }
}
