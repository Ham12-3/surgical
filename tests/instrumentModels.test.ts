import { describe, expect, it } from 'vitest';
import catalogueJson from '../src/data/tools.json';
import manifestJson from '../assets/manifest.json';
import { parseToolCatalogue } from '../src/engine/toolCatalogue';
import { parseAssetManifest } from '../src/data/assetManifest';

/**
 * The drill and the tray should show every open instrument as its Blender
 * model, not the code-built stand-in behind it. The syringes and the sponge
 * stick are not in the brief's starting set, so they stay code-built for now
 * (DECISIONS.md, D24); the laparoscopic instruments join with their phase.
 */
const STILL_CODE_BUILT: ReadonlySet<string> = new Set(['syringe', 'swab']);

describe('instrument models', () => {
  const tools = parseToolCatalogue(catalogueJson).tools;
  const assets = parseAssetManifest(manifestJson).assets;
  const drawn = new Set<string>(assets.flatMap((asset) => (asset.meshKey ? [asset.meshKey] : [])));

  it('gives every open instrument a Blender model', () => {
    const missing = tools
      .filter((tool) => tool.category !== 'laparoscopic')
      .filter((tool) => !drawn.has(tool.mesh) && !STILL_CODE_BUILT.has(tool.mesh))
      .map((tool) => `${tool.id} (${tool.mesh})`);
    expect(missing).toEqual([]);
  });

  it('models nothing no tool draws', () => {
    const meshes = new Set(tools.map((tool) => tool.mesh));
    expect([...drawn].filter((key) => !meshes.has(key))).toEqual([]);
  });
});
