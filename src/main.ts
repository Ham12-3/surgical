import './ui/styles.css';
import toolsJson from './data/tools.json';
import suturePadJson from './data/drills/suturePad.json';
import manifestJson from '../assets/manifest.json';
import { parseAssetManifest } from './data/assetManifest';
import { loadProcedure, procedureIds } from './data/procedures';
import { parseSuturePadConfig } from './engine/suturing/config';
import { parseToolCatalogue, ToolIndex } from './engine/toolCatalogue';
import { CAMERA_PRESETS } from './scene/cameras';
import { ModelLibrary } from './scene/modelLibrary';
import { App } from './ui/app';

/**
 * Startup: parse and validate the data, fetch the models, open storage, and
 * hand all of it to the app (src/ui/app.ts). A bad procedure or catalogue
 * fails here, loudly, before anything is drawn.
 */

const container = document.querySelector<HTMLElement>('#app');
if (!container) throw new Error('#app container is missing from index.html');

const catalogue = parseToolCatalogue(toolsJson);
const tools = new ToolIndex(catalogue);
const cameraPresets = Object.keys(CAMERA_PRESETS);
const procedures = procedureIds.map((id) => loadProcedure(id, { toolIds: tools.ids, cameraPresets }));

// Every model listed in assets/manifest.json is fetched once, before anything
// is mounted, so building the room and the tools stays synchronous. A model
// that fails to load falls back to a code-built stand-in rather than stopping
// the app.
const manifest = parseAssetManifest(manifestJson);
// Dev only: `?models=off` skips the models, so the code-built stand-ins can be
// profiled against them in the same build and page state.
const skipModels =
  import.meta.env.DEV && new URLSearchParams(window.location.search).get('models') === 'off';
const models = await ModelLibrary.load(skipModels ? [] : manifest.assets, import.meta.env.BASE_URL);

// Settings and progress persist in localStorage, which can be missing or throw
// (private windows, blocked site data); the app then runs on the defaults.
const storage = ((): Storage | null => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
})();

const app = new App({
  container,
  tools,
  // The brief's starting set is the open instruments; the laparoscopic ones
  // join the drill with their own phase.
  drillTools: catalogue.tools.filter((tool) => tool.category !== 'laparoscopic'),
  procedures,
  suturePadConfig: parseSuturePadConfig(suturePadJson),
  models,
  storage,
});

if (import.meta.env.DEV) {
  const { installDevHandle } = await import('./devHandle');
  installDevHandle(app);
}
