import type { MistakeCode } from '../engine/procedure/run';
import type { RunReward } from '../engine/progression';

/**
 * The sound cues as data: the tones each one plays, and the caption that says
 * the same thing in words, since the brief asks for every sound to have a
 * caption. Free of the Web Audio API, so the table is tested in plain Node;
 * sound.ts plays it.
 *
 * Cues are short, soft and few. They confirm what the panel already says;
 * nothing in the simulator can only be heard.
 */

export const CUE_NAMES = ['pick_up', 'step_done', 'not_accepted', 'protected', 'run_complete', 'badge', 'level_up'] as const;
export type CueName = (typeof CUE_NAMES)[number];

export interface Tone {
  /** Pitch, Hz. */
  readonly frequency: number;
  /** When the tone starts, seconds after the cue does. */
  readonly at: number;
  /** Seconds. */
  readonly duration: number;
  readonly type: OscillatorType;
  /** Peak loudness, 0 to 1, before the player's volume. */
  readonly gain: number;
}

export interface Cue {
  readonly caption: string;
  readonly tones: readonly Tone[];
}

function tone(frequency: number, at: number, duration: number, gain = 0.3, type: OscillatorType = 'sine'): Tone {
  return { frequency, at, duration, type, gain };
}

export const CUES: Readonly<Record<CueName, Cue>> = {
  pick_up: { caption: 'Soft click: instrument picked up', tones: [tone(1200, 0, 0.04, 0.15, 'triangle')] },
  step_done: { caption: 'Rising chime: step done', tones: [tone(660, 0, 0.12), tone(880, 0.1, 0.2)] },
  not_accepted: { caption: 'Low tone: not accepted', tones: [tone(233, 0, 0.24, 0.3, 'triangle')] },
  protected: {
    caption: 'Two low pulses: a structure to protect',
    tones: [tone(196, 0, 0.14, 0.16, 'square'), tone(196, 0.22, 0.14, 0.16, 'square')],
  },
  run_complete: { caption: 'Three rising tones: run complete', tones: [tone(523, 0, 0.18), tone(659, 0.15, 0.18), tone(784, 0.3, 0.32)] },
  badge: { caption: 'Bright chime: badge earned', tones: [tone(1047, 0, 0.14, 0.22), tone(1319, 0.1, 0.3, 0.22)] },
  level_up: {
    caption: 'Fanfare: new level',
    tones: [tone(523, 0, 0.12), tone(659, 0.1, 0.12), tone(784, 0.2, 0.12), tone(1047, 0.3, 0.4)],
  },
};

/** The cue for what a click on the patient came to. Pass no mistake where the mode should not reveal one. */
export function clickCue(accepted: boolean, mistake: MistakeCode | null): CueName {
  if (accepted) return 'step_done';
  return mistake === 'protected_structure' ? 'protected' : 'not_accepted';
}

/** The cue for a finished run: the biggest thing it earned. */
export function rewardCue(reward: RunReward): CueName {
  if (reward.after.level > reward.before.level) return 'level_up';
  return reward.newBadges.length > 0 ? 'badge' : 'run_complete';
}

/** How long a cue lasts, from its first tone starting to its last ending. */
export function cueLength(cue: Cue): number {
  return Math.max(0, ...cue.tones.map((part) => part.at + part.duration));
}
