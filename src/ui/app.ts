import { isPatientModel, patientModels, type PatientModel } from '../data/zones';
import type { Procedure, ProcedureMode } from '../engine/procedure/types';
import { attemptFromReport, isModeUnlocked, recordActivity, type Activity, type Profile, type RunReward } from '../engine/progression';
import type { SuturePadConfig } from '../engine/suturing/types';
import type { ToolIndex } from '../engine/toolCatalogue';
import type { Tool } from '../engine/types';
import type { CameraPresetName } from '../scene/cameras';
import type { ModelLibrary } from '../scene/modelLibrary';
import type { ProcedureScene } from '../scene/procedureScene';
import { emptyProgress, saveDrillProgress } from '../store/drillProgress';
import { clearProfile, loadProfile, saveProfile } from '../store/profile';
import { loadSettings, saveSettings, type Settings } from '../store/settings';
import { emptySutureProgress, saveSutureProgress } from '../store/sutureProgress';
import { AnatomyScreen } from './anatomyScreen';
import { createAppShell, type AppScreen, type AppShell } from './appShell';
import { showDisclaimerDialog } from './disclaimer';
import { DrillScreen } from './drillScreen';
import { HomeScreen, type HomeTarget } from './homeScreen';
import { ProcedureScreen } from './procedureScreen';
import { SettingsScreen } from './settingsScreen';
import { SoundCues } from './sound';
import { rewardCue, type CueName } from './soundCues';
import { SuturePadScreen } from './suturePadScreen';
import { TheatreScreen } from './theatreScreen';

export interface AppOptions {
  container: HTMLElement;
  tools: ToolIndex;
  /** The instruments the identification drill asks about. */
  drillTools: readonly Tool[];
  procedures: readonly Procedure[];
  suturePadConfig: SuturePadConfig;
  models: ModelLibrary;
  storage: Storage | null;
}

/** Which procedure to open, and in which mode if one was chosen on the home screen. */
export interface ProcedureLaunch {
  readonly procedureId: string;
  readonly mode?: ProcedureMode | undefined;
}

interface Screen {
  dispose(): void;
}

/**
 * The app: one screen at a time below the top bar, the settings and the
 * profile they share, and the progress each finished run adds.
 *
 * Whatever was showing is torn down before the next screen is built, so only
 * one renderer holds the graphics card at a time.
 */
export class App {
  private readonly shell: AppShell;
  private readonly sound: SoundCues;
  private settings: Settings;
  private profile: Profile;
  private screen: AppScreen = 'home';
  private current: Screen | null = null;
  private model: PatientModel = patientModels[0] ?? 'forearm';
  private preset: CameraPresetName = 'surgeon';

  constructor(private readonly options: AppOptions) {
    const prefersReducedMotion =
      typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.settings = loadSettings(options.storage, prefersReducedMotion);
    this.profile = loadProfile(options.storage);
    this.shell = createAppShell(options.container, patientModels, {
      onPreset: (name) => {
        this.preset = name;
        this.shell.setActivePreset(name);
        this.activeScene?.setCameraPreset(name);
      },
      onModelChange: (model) => {
        if (!isPatientModel(model) || this.screen !== 'theatre') return;
        this.model = model;
        this.show('theatre');
      },
      onHome: () => this.show('home'),
      onSettings: () => this.show(this.screen === 'settings' ? 'home' : 'settings'),
    });
    this.sound = new SoundCues(this.shell.root, this.settings);
    this.shell.setModel(this.model);
    this.applyPageSettings();
    this.show('home');
    if (!this.settings.disclaimerAccepted) {
      showDisclaimerDialog(options.container, () => this.updateSettings({ ...this.settings, disclaimerAccepted: true }));
    }
  }

  /** The 3D scene on screen, if the screen has one. */
  get activeScene(): ProcedureScene | null {
    const current = this.current;
    return current instanceof TheatreScreen || current instanceof ProcedureScreen || current instanceof AnatomyScreen
      ? current.scene
      : null;
  }

  get currentScreen(): Screen | null {
    return this.current;
  }

  show(screen: AppScreen, launch?: ProcedureLaunch): void {
    this.current?.dispose();
    this.current = null;
    this.screen = screen;
    this.shell.setScreen(screen);
    this.current = this.build(screen, launch);
    if (screen === 'theatre') this.shell.setActivePreset(this.preset);
  }

  private build(screen: AppScreen, launch: ProcedureLaunch | undefined): Screen | null {
    const { options } = this;
    const host = this.shell.root;
    const onExit = (): void => this.show('home');
    const onActivity = (activity: Activity): RunReward => this.record(activity);
    const onCue = (cue: CueName): void => this.sound.play(cue);
    switch (screen) {
      case 'home':
        return new HomeScreen({ host, profile: this.profile, procedures: options.procedures, onOpen: (target) => this.open(target) });
      case 'settings':
        return new SettingsScreen({
          host,
          settings: this.settings,
          onChange: (settings) => this.updateSettings(settings),
          onResetProgress: () => this.resetProgress(),
          onTestSound: () => this.sound.play('step_done'),
        });
      case 'theatre':
        return new TheatreScreen({
          shell: this.shell,
          model: this.model,
          tools: options.tools,
          models: options.models,
          settings: this.settings,
          preset: this.preset,
          openAbdomenTray: options.procedures.find((procedure) => procedure.model === 'abdomen-open')?.trayToolIds ?? [],
        });
      case 'drill':
        return new DrillScreen({
          host,
          tools: options.drillTools,
          models: options.models,
          storage: options.storage,
          onExit,
          onActivity,
          onCue,
        });
      case 'suture':
        return new SuturePadScreen({
          host,
          config: options.suturePadConfig,
          models: options.models,
          storage: options.storage,
          onExit,
          onActivity,
        });
      case 'explorer':
        return new AnatomyScreen({ host, tools: options.tools, models: options.models, settings: this.settings, onCue, onExit });
      case 'procedure': {
        const procedure = options.procedures.find((candidate) => candidate.id === launch?.procedureId) ?? options.procedures[0];
        if (!procedure) return null;
        return new ProcedureScreen({
          host,
          procedure,
          tools: options.tools,
          models: options.models,
          settings: this.settings,
          initialMode: launch?.mode,
          isUnlocked: (mode) => isModeUnlocked(this.profile, procedure.id, mode),
          onFinish: (report) => this.record({ kind: 'procedure', attempt: attemptFromReport(report, new Date()) }),
          onCue,
          onExit,
        });
      }
    }
  }

  private open(target: HomeTarget): void {
    if (target.kind === 'procedure') this.show('procedure', { procedureId: target.procedureId, mode: target.mode });
    else this.show(target.kind);
  }

  /** Count a finished run: the new profile is saved at once, and what it earned goes back to the screen. */
  private record(activity: Activity): RunReward {
    const { profile, reward } = recordActivity(this.profile, activity, new Date());
    this.profile = profile;
    saveProfile(this.options.storage, profile);
    this.sound.play(rewardCue(reward));
    return reward;
  }

  private updateSettings(settings: Settings): void {
    this.settings = settings;
    saveSettings(this.options.storage, settings);
    this.sound.configure(settings);
    this.applyPageSettings();
  }

  /** The settings the page's styles carry, rather than a scene. */
  private applyPageSettings(): void {
    const root = this.shell.root;
    root.classList.toggle('app--colourblind', this.settings.colourblindSafe);
    root.classList.toggle('app--reduced-motion', this.settings.reducedMotion);
  }

  private resetProgress(): void {
    const { storage } = this.options;
    clearProfile(storage);
    saveDrillProgress(storage, emptyProgress());
    saveSutureProgress(storage, emptySutureProgress());
    this.profile = loadProfile(storage);
  }
}
