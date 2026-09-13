import { CAMERA_PRESETS, type CameraPresetName } from '../scene/cameras';

/** What fills the app below the top bar. */
export type AppScreen = 'home' | 'settings' | 'theatre' | 'drill' | 'suture' | 'procedure';

export interface AppShellHandlers {
  onPreset(name: CameraPresetName): void;
  /** The patient model picker: Phase 1 scaffolding, shown in the theatre only. */
  onModelChange(model: string): void;
  onHome(): void;
  onSettings(): void;
}

export interface AppShell {
  root: HTMLElement;
  sceneHost: HTMLElement;
  status: StatusPanel;
  /** Highlight the active camera preset button. */
  setActivePreset(name: CameraPresetName): void;
  setModel(model: string): void;
  /** Show what belongs to a screen: its name, and the theatre's own controls in the theatre. */
  setScreen(screen: AppScreen): void;
  mountTray(element: HTMLElement): void;
}

export interface StatusPanel {
  setZone(label: string | null, avoid: boolean): void;
  setHint(text: string): void;
}

const PRESET_LABELS: Record<CameraPresetName, string> = {
  surgeon: 'Surgeon',
  overhead: 'Overhead',
  assistant: 'Assistant',
  close: 'Close',
  wide: 'Wide',
};

const SCREEN_NAMES: Record<AppScreen, string> = {
  home: 'Home',
  settings: 'Settings',
  theatre: 'Operating theatre',
  drill: 'Instrument identification drill',
  suture: 'Suturing practice pad',
  procedure: 'Procedure',
};

function topbarButton(className: string, text: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `camera-presets__button topbar__nav ${className}`;
  button.textContent = text;
  return button;
}

/**
 * Builds the static HUD chrome: the top bar with its navigation and the
 * disclaimer, the scene host, and the theatre's camera presets and status
 * readout. Screens mount into the root below the top bar, which stays above
 * them.
 */
export function createAppShell(container: HTMLElement, models: readonly string[], handlers: AppShellHandlers): AppShell {
  container.replaceChildren();

  const sceneHost = document.createElement('div');
  sceneHost.className = 'scene-host';
  container.append(sceneHost);

  // --- Top bar ---------------------------------------------------------------
  const topbar = document.createElement('header');
  topbar.className = 'topbar';

  const titleBlock = document.createElement('div');
  const title = document.createElement('div');
  title.className = 'topbar__title';
  title.textContent = 'Surgical Trainer';
  const subtitle = document.createElement('div');
  subtitle.className = 'topbar__subtitle';
  titleBlock.append(title, subtitle);

  const homeButton = topbarButton('topbar__home', 'Home');
  homeButton.addEventListener('click', () => handlers.onHome());
  const settingsButton = topbarButton('topbar__settings', 'Settings');
  settingsButton.setAttribute('aria-pressed', 'false');
  settingsButton.addEventListener('click', () => handlers.onSettings());

  const modelSelect = document.createElement('select');
  modelSelect.className = 'camera-presets__button topbar__nav topbar__model';
  modelSelect.setAttribute('aria-label', 'Patient model');
  for (const model of models) {
    const option = document.createElement('option');
    option.value = model;
    option.textContent = model;
    modelSelect.append(option);
  }
  modelSelect.addEventListener('change', () => handlers.onModelChange(modelSelect.value));

  const disclaimer = document.createElement('div');
  disclaimer.className = 'disclaimer';
  disclaimer.textContent = 'Educational use only — not clinical guidance';

  topbar.append(titleBlock, homeButton, settingsButton, modelSelect, disclaimer);
  container.append(topbar);

  // --- Camera presets --------------------------------------------------------
  const presetBar = document.createElement('div');
  presetBar.className = 'camera-presets';
  const presetButtons = new Map<CameraPresetName, HTMLButtonElement>();

  for (const name of Object.keys(CAMERA_PRESETS) as CameraPresetName[]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'camera-presets__button';
    button.textContent = PRESET_LABELS[name];
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => handlers.onPreset(name));
    presetBar.append(button);
    presetButtons.set(name, button);
  }
  container.append(presetBar);

  // --- Status readout --------------------------------------------------------
  const status = document.createElement('div');
  status.className = 'status';
  const zoneLine = document.createElement('div');
  zoneLine.className = 'status__zone';
  zoneLine.textContent = 'No zone under cursor';
  const hintLine = document.createElement('div');
  hintLine.className = 'status__hint';
  status.append(zoneLine, hintLine);
  container.append(status);

  let activePreset: CameraPresetName | null = null;

  return {
    root: container,
    sceneHost,
    status: {
      setZone(label, avoid) {
        zoneLine.textContent = label ?? 'No zone under cursor';
        zoneLine.classList.toggle('status__zone--avoid', avoid);
      },
      setHint(text) {
        hintLine.textContent = text;
      },
    },
    setActivePreset(name) {
      if (activePreset) presetButtons.get(activePreset)?.setAttribute('aria-pressed', 'false');
      activePreset = name;
      presetButtons.get(name)?.setAttribute('aria-pressed', 'true');
    },
    setModel(model) {
      modelSelect.value = model;
    },
    setScreen(screen) {
      subtitle.textContent = SCREEN_NAMES[screen];
      homeButton.hidden = screen === 'home';
      settingsButton.setAttribute('aria-pressed', String(screen === 'settings'));
      modelSelect.hidden = screen !== 'theatre';
      container.classList.toggle('app--screen', screen !== 'theatre');
    },
    mountTray(element) {
      container.append(element);
    },
  };
}
