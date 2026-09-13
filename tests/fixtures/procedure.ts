import type { Procedure } from '../../src/engine/procedure/types';
import type { ProcedureContext } from '../../src/engine/procedure/parse';

/**
 * A two-step stand-in procedure for the engine's tests, with the same shape as
 * a real one but none of its content: what is being tested is the machinery,
 * not the surgery.
 */

export const testContext: ProcedureContext = {
  toolIds: new Set(['scalpel', 'toothed_forceps', 'kelly_clamp', 'needle_holder']),
  zoneIds: new Set(['skin_line', 'deep_layer', 'artery']),
  cameraPresets: new Set(['surgeon', 'close']),
  patientModels: new Set(['abdomen-open']),
};

/** The same procedure as raw JSON, for the parser's tests. */
export const rawProcedure = {
  id: 'test_procedure',
  title: 'Test procedure',
  difficulty: 2,
  estimatedMinutes: 4,
  model: 'abdomen-open',
  reviewed: false,
  references: ['A textbook, chapter on nothing in particular'],
  todo: ['Everything here is made up for the tests.'],
  trayToolIds: ['scalpel', 'toothed_forceps', 'kelly_clamp'],
  steps: [
    {
      id: 'cut_skin',
      title: 'Cut the skin',
      objective: 'Cut along the marked line.',
      explanation: 'The line is where the deeper work is easiest to reach.',
      instruments: ['scalpel'],
      action: 'incise',
      target: { zoneId: 'skin_line', tolerance: 0.6 },
      camera: 'close',
      hints: ['Follow the line.', 'One smooth stroke.'],
      commonErrors: [{ code: 'wrong_place', feedback: 'Stay on the marked line.' }],
      quiz: { question: 'Which blade?', options: ['#10', '#15'], answer: '#10' },
    },
    {
      id: 'clamp_vessel',
      title: 'Clamp the vessel',
      objective: 'Put a clamp across it.',
      explanation: 'Clamping first means the cut end is never left to bleed.',
      instruments: ['kelly_clamp'],
      action: 'clamp',
      target: { zoneId: 'deep_layer' },
      hints: ['The clamp is instrument 3.'],
      commonErrors: [],
      bleedMlPerSecond: 4,
    },
  ],
};

/** The parsed form, for tests that play a run rather than validate JSON. */
export const testProcedure: Procedure = {
  id: 'test_procedure',
  title: 'Test procedure',
  difficulty: 2,
  estimatedMinutes: 4,
  model: 'abdomen-open',
  reviewed: false,
  references: ['A textbook, chapter on nothing in particular'],
  todo: ['Everything here is made up for the tests.'],
  trayToolIds: ['scalpel', 'toothed_forceps', 'kelly_clamp'],
  steps: [
    {
      id: 'cut_skin',
      title: 'Cut the skin',
      objective: 'Cut along the marked line.',
      explanation: 'The line is where the deeper work is easiest to reach.',
      instruments: ['scalpel'],
      action: 'incise',
      target: { zoneId: 'skin_line', tolerance: 0.6 },
      camera: 'close',
      hints: ['Follow the line.', 'One smooth stroke.'],
      commonErrors: [{ code: 'wrong_place', feedback: 'Stay on the marked line.' }],
      quiz: { question: 'Which blade?', options: ['#10', '#15'], answer: '#10' },
    },
    {
      id: 'clamp_vessel',
      title: 'Clamp the vessel',
      objective: 'Put a clamp across it.',
      explanation: 'Clamping first means the cut end is never left to bleed.',
      instruments: ['kelly_clamp'],
      action: 'clamp',
      target: { zoneId: 'deep_layer' },
      hints: ['The clamp is instrument 3.'],
      commonErrors: [],
      bleedMlPerSecond: 4,
    },
  ],
};

/** A correct action for the first step. */
export const goodIncision = {
  toolId: 'scalpel',
  zoneId: 'skin_line',
  action: 'incise',
  offset: 0.2,
  avoid: false,
} as const;

/** A correct action for the second step. */
export const goodClamp = {
  toolId: 'kelly_clamp',
  zoneId: 'deep_layer',
  action: 'clamp',
  offset: 0.4,
  avoid: false,
} as const;
