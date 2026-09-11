import * as THREE from 'three';
import manifestJson from '../../assets/manifest.json';
import { TRIANGLE_BUDGETS, parseAssetManifest, type AssetEntry } from '../data/assetManifest';
import { applyStudioEnvironment } from '../scene/environment';
import { ModelLibrary } from '../scene/modelLibrary';
import { VitalsDisplay } from '../scene/models/vitalsDisplay';
import { Hinge } from '../scene/articulation';
import { colors, createMaterials } from '../scene/palette';
import { createSceneTextures } from '../scene/textures';
import { Viewer } from '../scene/viewer';

/**
 * Dev-only asset viewer, served at /asset-viewer.html by `npm run dev` and left
 * out of the production build.
 *
 * Shows one model from assets/manifest.json at a time, in the app's own
 * materials and environment lighting under an overhead spot, with its
 * triangle count against budget, its named nodes, a wireframe toggle and a
 * 1.8 m reference figure: the in-app half of the realism checklist.
 * `?asset=<id>` opens a given model.
 */

const host = document.querySelector<HTMLElement>('#viewer');
const panel = document.querySelector<HTMLElement>('#panel');
if (!host || !panel) throw new Error('asset-viewer.html is missing #viewer or #panel');

const manifest = parseAssetManifest(manifestJson);
const models = await ModelLibrary.load(manifest.assets, import.meta.env.BASE_URL);

const viewer = new Viewer({ container: host, target: new THREE.Vector3(0, 0.5, 0) });
const { camera, controls, disposer, scene } = viewer;
// Models run from a needle holder to a whole room: no fog, and a camera free
// to go anywhere, unlike the procedure view.
scene.fog = null;
controls.minDistance = 0.02;
controls.maxDistance = 30;
controls.minPolarAngle = 0;
controls.maxPolarAngle = Math.PI * 0.98;
camera.near = 0.005;
camera.far = 100;
camera.updateProjectionMatrix();

applyStudioEnvironment(viewer.renderer, scene, disposer);
const materials = createMaterials(disposer, createSceneTextures(disposer));

// The room's hemisphere and fill lights, and a spot standing in for the
// surgical light, re-aimed at whichever model is shown.
scene.add(new THREE.HemisphereLight(0xdfe9f2, 0x30363f, 0.3));
const fill = new THREE.DirectionalLight(0xd8e4f0, 0.4);
fill.position.set(-2.2, 2.4, 2.0);
scene.add(fill);
const spot = new THREE.SpotLight(colors.lightWarm, 3, 0, Math.PI / 5, 0.85, 2);
spot.castShadow = true;
spot.shadow.mapSize.set(1024, 1024);
spot.shadow.bias = -0.0012;
scene.add(spot, spot.target);
disposer.add(() => spot.dispose());

const grid = new THREE.GridHelper(8, 80, 0x3a4652, 0x222a31);
scene.add(grid);
const figure = referenceFigure(materials.paint);
scene.add(figure);
disposer.track(grid);
disposer.track(figure);

let current: THREE.Object3D | null = null;
let vitals: VitalsDisplay | null = null;
let hinge: Hinge | null = null;

// --- Panel -------------------------------------------------------------------
const select = element('select');
for (const asset of manifest.assets) {
  const option = element('option', models.ids.includes(asset.id) ? asset.id : `${asset.id} (did not load)`);
  option.value = asset.id;
  select.append(option);
}
const wireframe = checkbox('Wireframe', false);
const showFigure = checkbox('1.8 m reference figure', true);
const showGrid = checkbox('Floor grid, 10 cm squares', true);
// Only shown for a model with a hinge, to check it opens the way the real
// instrument does.
const opening = slider('Jaw opening');
const info = element('div');
const drawCalls = element('div');
drawCalls.className = 'muted';
panel.append(
  element('strong', 'Asset viewer (dev)'),
  select,
  wireframe.label,
  showFigure.label,
  showGrid.label,
  opening.label,
  info,
  drawCalls,
);

select.addEventListener('change', () => showAsset(select.value));
wireframe.input.addEventListener('change', () => {
  for (const material of Object.values(materials)) {
    if (material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshBasicMaterial) {
      material.wireframe = wireframe.input.checked;
    }
  }
});
showFigure.input.addEventListener('change', () => {
  figure.visible = showFigure.input.checked;
});
showGrid.input.addEventListener('change', () => {
  grid.visible = showGrid.input.checked;
});
opening.input.addEventListener('input', () => hinge?.set(Number(opening.input.value)));

let sinceReadout = 0;
viewer.onFrame((delta) => {
  vitals?.update(delta);
  sinceReadout += delta;
  if (sinceReadout < 0.5) return;
  sinceReadout = 0;
  // Counted over the whole view, grid and figure included.
  drawCalls.textContent = `${viewer.renderer.info.render.calls} draw calls in view`;
});
viewer.start();

const initial = new URLSearchParams(window.location.search).get('asset') ?? manifest.assets[0]?.id;
if (initial) {
  select.value = initial;
  showAsset(initial);
}

// --- Showing a model -----------------------------------------------------------
function showAsset(id: string): void {
  if (current) {
    scene.remove(current);
    // Each copy owns its geometry; the materials are the shared palette.
    current.traverse((object) => {
      if (object instanceof THREE.Mesh) object.geometry.dispose();
    });
    current = null;
  }
  hinge = null;
  opening.label.hidden = true;
  const asset = manifest.assets.find((entry) => entry.id === id);
  const root = asset ? models.instantiate(asset.id, materials) : null;
  if (!asset || !root) {
    info.replaceChildren(element('p', `"${id}" did not load; the console says why.`));
    return;
  }
  root.traverse((object) => {
    object.castShadow = true;
    object.receiveShadow = true;
  });
  scene.add(root);
  current = root;
  hinge = asset.hingeDegrees === undefined ? null : Hinge.find(root, asset.hingeDegrees);
  opening.label.hidden = hinge === null;
  opening.input.value = '0';
  if (!vitals && root.getObjectByName('screen')) vitals = new VitalsDisplay(materials.screen, disposer);
  frame(root);
  describe(asset, root);
}

/** Aim the camera, the spot and the reference figure at a model. */
function frame(root: THREE.Object3D): void {
  const box = new THREE.Box3().setFromObject(root);
  const centre = box.getCenter(new THREE.Vector3());
  const size = Math.max(box.getSize(new THREE.Vector3()).length(), 0.1);
  controls.target.copy(centre);
  camera.position.copy(centre).add(new THREE.Vector3(0.6, 0.45, 0.8).normalize().multiplyScalar(size * 1.3));
  controls.update();

  // Keep roughly the field's illuminance, about 3 units, whatever the
  // distance: with inverse-square falloff that is 3 times distance squared.
  spot.position.copy(centre).add(new THREE.Vector3(0.2 * size, Math.max(size, 0.6), 0.25 * size));
  spot.target.position.copy(centre);
  spot.intensity = 3 * spot.position.distanceToSquared(centre);

  figure.position.set(box.min.x - 0.45, 0, centre.z);
}

function describe(asset: AssetEntry, root: THREE.Object3D): void {
  let triangles = 0;
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const geometry = object.geometry as THREE.BufferGeometry;
    triangles += (geometry.index?.count ?? geometry.getAttribute('position').count) / 3;
  });
  const budget = TRIANGLE_BUDGETS[asset.category];
  const size = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());

  const budgetLine = element('div', `${triangles.toLocaleString()} of ${budget.toLocaleString()} triangles`);
  budgetLine.className = triangles <= budget ? 'ok' : 'bad';

  const required = element('ul');
  for (const name of asset.requiredNodes) {
    const found = root.getObjectByName(name) !== undefined;
    const item = element('li', `${found ? '✓' : '✗'} ${name}`);
    item.className = found ? 'ok' : 'bad';
    required.append(item);
  }
  const nodes = element('ul');
  for (const child of root.children) nodes.append(element('li', child.name || '(unnamed)'));

  info.replaceChildren(
    element('p', `${asset.category}, version ${asset.version}, licence: ${asset.license}`),
    budgetLine,
    element('div', `${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)} m (x × y × z)`),
    element('p', asset.requiredNodes.length ? 'Required nodes' : 'No required nodes'),
    required,
    element('div', 'Top-level nodes'),
    nodes,
  );
}

/** A plain 1.8 m figure: capsule legs, torso and arms, and a head whose top sits at 1.8 m. */
function referenceFigure(material: THREE.Material): THREE.Group {
  const group = new THREE.Group();
  // Each capsule is `length + 2 * radius` tall, centred at `y`.
  const parts: Array<[radius: number, length: number, x: number, y: number]> = [
    [0.07, 0.76, -0.1, 0.45],
    [0.07, 0.76, 0.1, 0.45],
    [0.17, 0.44, 0, 1.17],
    [0.05, 0.56, -0.25, 1.1],
    [0.05, 0.56, 0.25, 1.1],
  ];
  for (const [radius, length, x, y] of parts) {
    const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 4, 12), material);
    mesh.position.set(x, y, 0);
    group.add(mesh);
  }
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), material);
  head.position.y = 1.69;
  group.add(head);
  return group;
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}

function checkbox(text: string, checked: boolean): { label: HTMLLabelElement; input: HTMLInputElement } {
  const label = element('label');
  const input = element('input');
  input.type = 'checkbox';
  input.checked = checked;
  label.append(input, ` ${text}`);
  return { label, input };
}

/** A 0 to 1 range input, hidden until a model needs it. */
function slider(text: string): { label: HTMLLabelElement; input: HTMLInputElement } {
  const label = element('label');
  const input = element('input');
  input.type = 'range';
  input.min = '0';
  input.max = '1';
  input.step = '0.01';
  input.value = '0';
  label.append(`${text} `, input);
  label.hidden = true;
  return { label, input };
}
