import { describe, expect, it } from 'vitest';
import catalogueJson from '../src/data/tools.json';
import { CatalogueError, ToolIndex, parseToolCatalogue } from '../src/engine/toolCatalogue';
import { isToolMeshKey } from '../src/data/toolMeshKeys';

describe('parseToolCatalogue', () => {
  it('accepts the shipped catalogue', () => {
    const catalogue = parseToolCatalogue(catalogueJson);
    expect(catalogue.tools.length).toBeGreaterThan(0);
  });

  it('rejects a tool with an unknown action', () => {
    const bad = {
      version: 1,
      tools: [
        {
          id: 'x',
          name: 'X',
          shortName: 'X',
          category: 'cutting',
          mesh: 'scalpel',
          actions: ['cauterise'],
          description: 'd',
        },
      ],
    };
    expect(() => parseToolCatalogue(bad)).toThrow(CatalogueError);
    expect(() => parseToolCatalogue(bad)).toThrow(/cauterise/);
  });

  it('rejects a tool with an unknown category', () => {
    const bad = {
      version: 1,
      tools: [
        {
          id: 'x',
          name: 'X',
          shortName: 'X',
          category: 'plumbing',
          mesh: 'scalpel',
          actions: ['cut'],
          description: 'd',
        },
      ],
    };
    expect(() => parseToolCatalogue(bad)).toThrow(/plumbing/);
  });

  it('rejects duplicate tool ids', () => {
    const tool = {
      id: 'dup',
      name: 'X',
      shortName: 'X',
      category: 'cutting',
      mesh: 'scalpel',
      actions: ['cut'],
      description: 'd',
    };
    expect(() => parseToolCatalogue({ version: 1, tools: [tool, tool] })).toThrow(/duplicate/);
  });

  it('rejects a missing required field', () => {
    const bad = {
      version: 1,
      tools: [{ id: 'x', name: 'X', category: 'cutting', mesh: 'scalpel', actions: ['cut'] }],
    };
    expect(() => parseToolCatalogue(bad)).toThrow(/shortName/);
  });

  it('reads an optional todo, and rejects an empty one', () => {
    const tool = {
      id: 'x',
      name: 'X',
      shortName: 'X',
      category: 'cutting',
      mesh: 'scalpel',
      actions: ['cut'],
      description: 'd',
    };
    const withTodo = parseToolCatalogue({ version: 1, tools: [{ ...tool, todo: 'check it' }] });
    expect(withTodo.tools[0]?.todo).toBe('check it');
    expect(parseToolCatalogue({ version: 1, tools: [tool] }).tools[0]?.todo).toBeUndefined();
    expect(() => parseToolCatalogue({ version: 1, tools: [{ ...tool, todo: '' }] })).toThrow(/todo/);
  });
});

describe('shipped catalogue integrity', () => {
  const catalogue = parseToolCatalogue(catalogueJson);

  // Guards the data → scene mapping: a typo'd mesh name would otherwise show up
  // as an instrument that silently refuses to appear in the tray.
  it('only references mesh archetypes that exist', () => {
    const unknown = catalogue.tools.filter((tool) => !isToolMeshKey(tool.mesh));
    expect(unknown.map((tool) => `${tool.id} -> ${tool.mesh}`)).toEqual([]);
  });

  it('gives every tool a tray label short enough not to wrap', () => {
    const tooLong = catalogue.tools.filter((tool) => tool.shortName.length > 12);
    expect(tooLong.map((tool) => tool.shortName)).toEqual([]);
  });

  // The drill never offers two tools drawn alike (src/engine/drill.ts), so a
  // shared mesh quietly shrinks the choices. Only the two syringes share one:
  // what tells them apart is what they hold.
  it('draws each open instrument with its own mesh, apart from the syringes', () => {
    const open = catalogue.tools.filter((tool) => tool.category !== 'laparoscopic');
    const counts = new Map<string, number>();
    for (const tool of open) counts.set(tool.mesh, (counts.get(tool.mesh) ?? 0) + 1);
    const shared = [...counts].filter(([, count]) => count > 1).map(([mesh]) => mesh);
    expect(shared).toEqual(['syringe']);
  });
});

describe('ToolIndex', () => {
  const index = new ToolIndex(parseToolCatalogue(catalogueJson));

  it('looks tools up by id', () => {
    expect(index.get('scalpel')?.name).toBe('Scalpel, #10 Blade');
    expect(index.get('nope')).toBeUndefined();
    expect(index.has('scalpel')).toBe(true);
  });

  it('throws from require() for an unknown id', () => {
    expect(() => index.require('nope')).toThrow(/unknown tool id/);
  });

  it('reports which actions a tool supports', () => {
    expect(index.supports('scalpel', 'incise')).toBe(true);
    expect(index.supports('scalpel', 'suture')).toBe(false);
    expect(index.supports('nope', 'cut')).toBe(false);
  });
});
