import { describe, expect, it } from 'vitest';
import catalogueJson from '../src/data/tools.json';
import { parseToolCatalogue } from '../src/engine/toolCatalogue';
import { createDrill, scoreDrill, seededRandom, shuffle } from '../src/engine/drill';
import type { Tool, ToolCategory } from '../src/engine/types';

function tool(id: string, category: ToolCategory, mesh = id): Tool {
  return { id, name: id, shortName: id, category, mesh, actions: ['inspect'], description: id };
}

const cutting = ['a', 'b', 'c', 'd'].map((id) => tool(`cut_${id}`, 'cutting'));
const retracting = ['a', 'b', 'c', 'd'].map((id) => tool(`retract_${id}`, 'retracting'));
const pool = [...cutting, ...retracting];

describe('seededRandom and shuffle', () => {
  it('repeat exactly for the same seed', () => {
    expect(shuffle(pool, seededRandom(7))).toEqual(shuffle(pool, seededRandom(7)));
    expect(shuffle(pool, seededRandom(7))).not.toEqual(shuffle(pool, seededRandom(8)));
  });

  it('keep every item', () => {
    expect(shuffle(pool, seededRandom(3)).map((t) => t.id).sort()).toEqual(pool.map((t) => t.id).sort());
  });
});

describe('createDrill', () => {
  const drill = createDrill(pool, seededRandom(42), 6, 4);

  it('asks each instrument at most once, up to the question count', () => {
    expect(drill).toHaveLength(6);
    expect(new Set(drill.map((q) => q.toolId)).size).toBe(6);
    expect(createDrill(pool, seededRandom(1), 50, 4)).toHaveLength(pool.length);
  });

  it('offers four distinct options with the answer among them', () => {
    for (const question of drill) {
      expect(question.options).toHaveLength(4);
      expect(new Set(question.options).size).toBe(4);
      expect(question.options).toContain(question.toolId);
    }
  });

  it('draws wrong options from the same category first', () => {
    for (const question of drill) {
      const category = question.toolId.split('_')[0];
      for (const option of question.options) expect(option.split('_')[0]).toBe(category);
    }
  });

  it('never offers a look-alike drawn with the same mesh', () => {
    const syringes = [tool('syringe_a', 'injection', 'syringe'), tool('syringe_b', 'injection', 'syringe')];
    const questions = createDrill([...syringes, ...cutting], seededRandom(5), 10, 4);
    for (const question of questions.filter((q) => q.toolId.startsWith('syringe'))) {
      expect(question.options.filter((id) => id.startsWith('syringe'))).toEqual([question.toolId]);
    }
  });

  it('refuses a pool too small to fill the options', () => {
    expect(() => createDrill(cutting.slice(0, 3), seededRandom(1), 3, 4)).toThrow(/not enough/);
  });

  it('builds from the shipped catalogue', () => {
    const tools = parseToolCatalogue(catalogueJson).tools;
    const questions = createDrill(tools, seededRandom(9));
    expect(questions).toHaveLength(10);
  });
});

describe('scoreDrill', () => {
  it('counts correct answers, rounds the percentage and lists the misses in order', () => {
    const result = scoreDrill([
      { toolId: 'a', chosenId: 'a' },
      { toolId: 'b', chosenId: 'x' },
      { toolId: 'c', chosenId: 'c' },
    ]);
    expect(result).toEqual({ correct: 2, total: 3, percent: 67, missed: ['b'] });
  });

  it('scores an empty drill as zero rather than dividing by it', () => {
    expect(scoreDrill([]).percent).toBe(0);
  });
});
