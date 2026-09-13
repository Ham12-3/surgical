import { bitePoint, type BitePath } from '../engine/suturing/geometry';
import type { PadDimensions } from '../engine/suturing/types';

/**
 * Diagrams for the suturing pad's feedback, drawn as SVG: one bite in
 * cross-section, and the row of sutures along the wound.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';
/** Pixels per millimetre in the cross-section. */
const SECTION_SCALE = 6;
/** Millimetres shown either side of the wound in the cross-section. */
const SECTION_HALF_SPAN = 22;
/** Pixels per millimetre along the row. */
const ROW_SCALE = 4;
const LAYER_COLOURS = ['#d8a284', '#e4c58f', '#e2dac9', '#8e979f'] as const;
const WOUND_COLOUR = '#3a2522';
const THREAD_COLOUR = '#12161c';
const LABEL_COLOUR = '#e7edf3';

function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attributes: Record<string, string | number>,
  text?: string,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
  if (text !== undefined) node.textContent = text;
  return node;
}

/** A bite in cross-section: the layers to scale, the wound, the needle's path, and where it went in and came out. */
export function biteSection(path: BitePath, pad: PadDimensions): SVGSVGElement {
  const halfGap = pad.woundGapMm / 2;
  const thicknesses = [pad.skinMm, pad.fatMm, pad.fasciaMm, pad.baseMm];
  const depth = thicknesses.reduce((sum, value) => sum + value, 0);
  const top = 20;
  const width = SECTION_HALF_SPAN * 2 * SECTION_SCALE;
  const height = top + depth * SECTION_SCALE;
  const x = (mm: number): number => (mm + SECTION_HALF_SPAN) * SECTION_SCALE;
  const y = (mm: number): number => top + mm * SECTION_SCALE;
  const entryMm = -path.entryX - halfGap;
  const caught = path.exitMm > 0;

  const root = svg('svg', {
    viewBox: `0 0 ${width} ${height}`,
    class: 'suture__diagram',
    role: 'img',
    'aria-label': `Cross-section of the bite: in ${entryMm.toFixed(1)} mm from the edge, ${
      caught ? `out ${path.exitMm.toFixed(1)} mm from the far edge` : 'out inside the wound'
    }, ${path.depthMm.toFixed(1)} mm deep.`,
  });
  let layerTop = 0;
  thicknesses.forEach((thickness, index) => {
    root.append(svg('rect', { x: 0, y: y(layerTop), width, height: thickness * SECTION_SCALE, fill: LAYER_COLOURS[index] ?? '#888' }));
    layerTop += thickness;
  });
  root.append(svg('rect', { x: x(-halfGap), y: y(0), width: pad.woundGapMm * SECTION_SCALE, height: pad.woundDepthMm * SECTION_SCALE, fill: WOUND_COLOUR }));

  const points = Array.from({ length: 33 }, (_, i) => bitePoint(path, i / 32));
  root.append(svg('polyline', {
    points: points.map((point) => `${x(point.x).toFixed(1)},${y(point.depth).toFixed(1)}`).join(' '),
    fill: 'none',
    stroke: THREAD_COLOUR,
    'stroke-width': 2.5,
    'stroke-linecap': 'round',
  }));

  const exitX = path.exitMm + halfGap;
  const label = (mmX: number, text: string, anchor: string): SVGTextElement =>
    svg('text', { x: x(mmX), y: top - 6, fill: LABEL_COLOUR, 'font-size': 11, 'text-anchor': anchor }, text);
  root.append(
    svg('circle', { cx: x(path.entryX), cy: y(0), r: 3, fill: THREAD_COLOUR }),
    svg('circle', { cx: x(exitX), cy: y(0), r: 3, fill: THREAD_COLOUR }),
    label(path.entryX, `in ${entryMm.toFixed(1)} mm`, 'end'),
    label(exitX, caught ? `out ${path.exitMm.toFixed(1)} mm` : 'out in the wound', 'start'),
    svg('text', { x: x(path.centreX), y: Math.min(y(path.depthMm) + 14, height - 3), fill: '#1b1f26', 'font-size': 11, 'text-anchor': 'middle' }, `${path.depthMm.toFixed(1)} mm deep`),
  );
  return root;
}

/** The row of sutures along the wound, with the gap between each neighbouring pair. */
export function rowDiagram(alongMm: readonly number[], pad: PadDimensions): SVGSVGElement {
  const margin = 6;
  const half = pad.woundLengthMm / 2;
  const width = (pad.woundLengthMm + margin * 2) * ROW_SCALE;
  const height = 64;
  const middle = 38;
  const x = (mm: number): number => (mm + half + margin) * ROW_SCALE;
  const sorted = [...alongMm].sort((a, b) => a - b);

  const root = svg('svg', {
    viewBox: `0 0 ${width} ${height}`,
    class: 'suture__diagram',
    role: 'img',
    'aria-label': `The sutures along the wound, ${sorted.length} of them.`,
  });
  root.append(svg('line', { x1: x(-half), y1: middle, x2: x(half), y2: middle, stroke: WOUND_COLOUR, 'stroke-width': 4, 'stroke-linecap': 'round' }));
  sorted.forEach((along, index) => {
    root.append(svg('line', { x1: x(along), y1: middle - 9, x2: x(along), y2: middle + 9, stroke: LABEL_COLOUR, 'stroke-width': 2.5, 'stroke-linecap': 'round' }));
    const next = sorted[index + 1];
    if (next === undefined) return;
    root.append(svg('text', { x: x((along + next) / 2), y: middle - 16, fill: LABEL_COLOUR, 'font-size': 11, 'text-anchor': 'middle' }, `${(next - along).toFixed(1)}`));
  });
  root.append(svg('text', { x: width - 2, y: height - 4, fill: '#94a2b1', 'font-size': 10, 'text-anchor': 'end' }, 'gaps in mm'));
  return root;
}
