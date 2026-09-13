import { PROCEDURE_MODES, type ProcedureMode } from './procedure/types';
import type { Profile } from './progression';

/**
 * What to do next, for the home screen. The order follows the brief's
 * starting path: the instruments, then suturing, then each procedure in
 * Learn, Practice and Assessment. Once all of that is passed, it points back
 * at whatever has the lowest best mark.
 */

export type Recommendation =
  | { readonly kind: 'drill'; readonly reason: string }
  | { readonly kind: 'suture'; readonly reason: string }
  | { readonly kind: 'procedure'; readonly procedureId: string; readonly mode: ProcedureMode; readonly reason: string };

/** A best mark below this is worth going back to. */
export const REVISIT_BELOW = 80;

const MODE_REASONS: Readonly<Record<ProcedureMode, string>> = {
  learn: 'Walk through it with the targets shown and each step explained.',
  practice: 'Try it with hints only when you ask for them, for a mark.',
  assessment: 'Try it with no hints and nothing highlighted, for a mark.',
};

export function recommendNext(profile: Profile, procedureIds: readonly string[]): Recommendation {
  if (profile.drill.runs === 0) return { kind: 'drill', reason: 'Start by learning the instruments on the tray.' };
  if (profile.suture.runs === 0) {
    return { kind: 'suture', reason: 'Practise simple interrupted sutures before a whole procedure.' };
  }
  for (const procedureId of procedureIds) {
    const record = profile.procedures[procedureId];
    const mode = PROCEDURE_MODES.find((candidate) => record === undefined || !record[candidate].passed);
    if (mode) return { kind: 'procedure', procedureId, mode, reason: MODE_REASONS[mode] };
  }

  const candidates: Array<{ readonly best: number; readonly next: Recommendation }> = [
    {
      best: profile.drill.best,
      next: { kind: 'drill', reason: `Your best drill is ${profile.drill.best}%. Go again and name every instrument.` },
    },
    {
      best: profile.suture.best,
      next: { kind: 'suture', reason: `Your best on the suturing pad is ${profile.suture.best}. Go again for a higher mark.` },
    },
    ...procedureIds.map((procedureId) => {
      const best = profile.procedures[procedureId]?.assessment.best ?? 0;
      const next: Recommendation = {
        kind: 'procedure',
        procedureId,
        mode: 'assessment',
        reason: `Your best Assessment mark is ${best}. Go again for a higher one.`,
      };
      return { best, next };
    }),
  ];
  const weakest = candidates.filter((candidate) => candidate.best < REVISIT_BELOW).sort((a, b) => a.best - b.best)[0];
  if (weakest) return weakest.next;

  const first = procedureIds[0];
  return first
    ? { kind: 'procedure', procedureId: first, mode: 'assessment', reason: 'Everything passed. Try Assessment again for a higher mark.' }
    : { kind: 'drill', reason: 'Keep your instrument names sharp.' };
}
