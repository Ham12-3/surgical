import type { ActionType, Tool, ToolCatalogue, ToolCategory } from './types';
import { isActionType } from './types';

/**
 * Validation and lookup for the shared tool catalogue.
 *
 * The catalogue arrives as untyped JSON, so it is checked here rather than
 * trusted. A bad entry throws with the offending id in the message — a content
 * author adding a tool should get a useful error, not a silent `undefined` two
 * screens later.
 */

const CATEGORIES: readonly ToolCategory[] = [
  'prep',
  'injection',
  'cutting',
  'grasping',
  'clamping',
  'retracting',
  'suturing',
  'haemostasis',
  'irrigation',
  'laparoscopic',
];

export class CatalogueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CatalogueError';
  }
}

function requireString(value: unknown, field: string, context: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new CatalogueError(`${context}: "${field}" must be a non-empty string`);
  }
  return value;
}

function parseTool(raw: unknown, index: number): Tool {
  if (typeof raw !== 'object' || raw === null) {
    throw new CatalogueError(`tool at index ${index}: expected an object`);
  }
  const record = raw as Record<string, unknown>;
  const id = requireString(record['id'], 'id', `tool at index ${index}`);
  const context = `tool "${id}"`;

  const category = requireString(record['category'], 'category', context);
  if (!(CATEGORIES as readonly string[]).includes(category)) {
    throw new CatalogueError(`${context}: unknown category "${category}"`);
  }

  const rawActions = record['actions'];
  if (!Array.isArray(rawActions) || rawActions.length === 0) {
    throw new CatalogueError(`${context}: "actions" must be a non-empty array`);
  }
  const actions: ActionType[] = [];
  for (const action of rawActions) {
    if (typeof action !== 'string' || !isActionType(action)) {
      throw new CatalogueError(`${context}: unknown action "${String(action)}"`);
    }
    actions.push(action);
  }

  return {
    id,
    name: requireString(record['name'], 'name', context),
    shortName: requireString(record['shortName'], 'shortName', context),
    category: category as ToolCategory,
    mesh: requireString(record['mesh'], 'mesh', context),
    actions,
    description: requireString(record['description'], 'description', context),
  };
}

export function parseToolCatalogue(raw: unknown): ToolCatalogue {
  if (typeof raw !== 'object' || raw === null) {
    throw new CatalogueError('catalogue: expected an object');
  }
  const record = raw as Record<string, unknown>;
  const version = record['version'];
  if (typeof version !== 'number') {
    throw new CatalogueError('catalogue: "version" must be a number');
  }
  const rawTools = record['tools'];
  if (!Array.isArray(rawTools)) {
    throw new CatalogueError('catalogue: "tools" must be an array');
  }

  const tools = rawTools.map(parseTool);
  const seen = new Set<string>();
  for (const tool of tools) {
    if (seen.has(tool.id)) throw new CatalogueError(`duplicate tool id "${tool.id}"`);
    seen.add(tool.id);
  }

  return { version, tools };
}

/** Indexed view over a catalogue, so lookups are not repeated linear scans. */
export class ToolIndex {
  private readonly byId: ReadonlyMap<string, Tool>;

  constructor(catalogue: ToolCatalogue) {
    this.byId = new Map(catalogue.tools.map((tool) => [tool.id, tool]));
  }

  get(id: string): Tool | undefined {
    return this.byId.get(id);
  }

  /** Throws rather than returning undefined, for call sites that cannot recover. */
  require(id: string): Tool {
    const tool = this.byId.get(id);
    if (!tool) throw new CatalogueError(`unknown tool id "${id}"`);
    return tool;
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  get ids(): string[] {
    return [...this.byId.keys()];
  }

  /** Can this instrument perform this action at all? Step rules are separate. */
  supports(toolId: string, action: ActionType): boolean {
    return this.byId.get(toolId)?.actions.includes(action) ?? false;
  }
}
