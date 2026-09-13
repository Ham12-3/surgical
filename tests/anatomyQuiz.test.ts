import { describe, expect, it } from 'vitest';
import { abdomenOpenZones } from '../src/data/zones/abdomenOpen';
import { ANATOMY_QUIZ_LENGTH, createAnatomyQuiz, quizzable, scoreAnatomyQuiz } from '../src/engine/anatomyQuiz';
import { seededRandom } from '../src/engine/drill';

/** The open abdomen's structures as the explorer offers them: the general skin zone behind the rest left out. */
const structures = abdomenOpenZones.zones
  .filter((zone) => (zone.priority ?? 0) >= 0)
  .map((zone) => ({ id: zone.id, label: zone.label, layer: zone.layer ?? 0 }));

describe('anatomy quiz', () => {
  it('only asks about structures that share their layer with another', () => {
    const ids = quizzable(structures).map((structure) => structure.id);
    expect(ids).toEqual(expect.arrayContaining(['umbilicus', 'mcburney_point', 'mesoappendix', 'small_bowel']));
    expect(ids).not.toContain('peritoneum');
    expect(ids).not.toContain('subcutaneous_fat');
  });

  it('asks each structure once, from the surface inward', () => {
    const questions = createAnatomyQuiz(structures, seededRandom(7));
    expect(questions).toHaveLength(ANATOMY_QUIZ_LENGTH);
    expect(new Set(questions.map((question) => question.id)).size).toBe(questions.length);
    const layers = questions.map((question) => question.layer);
    expect(layers).toEqual([...layers].sort((a, b) => a - b));
  });

  it('gives the same quiz for the same seed', () => {
    expect(createAnatomyQuiz(structures, seededRandom(42))).toEqual(createAnatomyQuiz(structures, seededRandom(42)));
  });

  it('asks no more than there are structures to ask about', () => {
    expect(createAnatomyQuiz(structures.slice(0, 3), seededRandom(1), 10)).toHaveLength(2);
  });

  it('scores the answers and lists what was missed', () => {
    const questions = [
      { id: 'umbilicus', label: 'Umbilicus', layer: 0 },
      { id: 'caecum', label: 'Caecum', layer: 5 },
    ];
    expect(scoreAnatomyQuiz(questions, ['mcburney_point', 'caecum'])).toEqual({ correct: 1, total: 2, missed: ['Umbilicus'] });
  });
});
