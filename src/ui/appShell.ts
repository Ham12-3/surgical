import { CAMERA_PRESETS, type CameraPresetName } from '../scene/cameras';
import { QUALITY_LEVELS, isQualityLevel, type QualityLevel } from '../store/settings';

export interface AppShell {
  root: HTMLElement;
  sceneHost: HTMLElement;
  status: StatusPanel;
  /** Highlight the active camera preset button. */
  setActivePreset(name: CameraPresetName): void;
  /** Temporary Phase 1 scaffolding, replaced by the home screen in Phase 3. */
  onModelChange(handler: (model: string) => void): void;
  /** Graphics quality picker, until the settings screen takes it over. */
  onQualityChange(handler: (level: QualityLevel) => void): void;
  setQuality(level: QualityLevel): void;
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

const QUALITY_LABELS: Record<QualityLevel, string> = {
  low: 'Quality: Low',
  medium: 'Quality: Medium',
  high: 'Quality: High',
};

/**
 * Builds the static HUD chrome: title bar with the disclaimer, the scene host,
 * the camera preset buttons and the status readout.
 *
 * Screens (home, procedure, review) mount into this in later phases.
 */
export function createAppShell(
  container: HTMLElement,
  onPreset: (name: CameraPresetName) => void,
  models: readonly string[],
): AppShell {
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
  subtitle.textContent = 'Phase 1 — scene, camera and instrument tray';
  titleBlock.append(title, subtitle);
  topbar.append(titleBlock);

  const modelSelect = document.createElement('select');
  modelSelect.className = 'camera-presets__button';
  modelSelect.style.pointerEvents = 'auto';
  modelSelect.setAttribute('aria-label', 'Patient model');
  for (const model of models) {
    const option = document.createElement('option');
    option.value = model;
    option.textContent = model;
    modelSelect.append(option);
  }
  topbar.append(modelSelect);

  const qualitySelect = document.createElement('select');
  qualitySelect.className = 'camera-presets__button';
  qualitySelect.style.pointerEvents = 'auto';
  qualitySelect.setAttribute('aria-label', 'Graphics quality');
  for (const level of QUALITY_LEVELS) {
    const option = document.createElement('option');
    option.value = level;
    option.textContent = QUALITY_LABELS[level];
    qualitySelect.append(option);
  }
  topbar.append(qualitySelect);

  const disclaimer = document.createElement('div');
  disclaimer.className = 'disclaimer';
  disclaimer.textContent = 'Educational use only — not clinical guidance';
  topbar.append(disclaimer);

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
    button.addEventListener('click', () => onPreset(name));
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
    onModelChange(handler) {
      modelSelect.addEventListener('change', () => handler(modelSelect.value));
    },
    onQualityChange(handler) {
      qualitySelect.addEventListener('change', () => {
        if (isQualityLevel(qualitySelect.value)) handler(qualitySelect.value);
      });
    },
    setQuality(level) {
      qualitySelect.value = level;
    },
    mountTray(element) {
      container.append(element);
    },
  };
}
