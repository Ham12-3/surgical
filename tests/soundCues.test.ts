import { describe, expect, it } from 'vitest';
import { levelProgress, type RunReward } from '../src/engine/progression';
import { clickCue, CUE_NAMES, CUES, cueLength, rewardCue } from '../src/ui/soundCues';

describe('sound cues', () => {
  it.each(CUE_NAMES)('%s has a caption that says what it means', (name) => {
    const { caption } = CUES[name];
    expect(caption.length).toBeGreaterThan(10);
    // A sound, then what it means: "Rising chime: step done".
    expect(caption).toMatch(/^[A-Z][^:]+: .+/);
  });

  it.each(CUE_NAMES)('%s stays short, soft and in a comfortable range', (name) => {
    const cue = CUES[name];
    expect(cue.tones.length).toBeGreaterThan(0);
    expect(cueLength(cue)).toBeLessThanOrEqual(1);
    for (const tone of cue.tones) {
      expect(tone.frequency).toBeGreaterThanOrEqual(150);
      expect(tone.frequency).toBeLessThanOrEqual(2000);
      expect(tone.gain).toBeGreaterThan(0);
      expect(tone.gain).toBeLessThanOrEqual(0.4);
      expect(tone.duration).toBeGreaterThan(0.02);
      expect(tone.at).toBeGreaterThanOrEqual(0);
    }
  });

  it('gives every cue its own caption', () => {
    const captions = CUE_NAMES.map((name) => CUES[name].caption);
    expect(new Set(captions).size).toBe(captions.length);
  });

  it('sounds a click as done, not accepted, or a structure to protect', () => {
    expect(clickCue(true, null)).toBe('step_done');
    expect(clickCue(false, 'wrong_instrument')).toBe('not_accepted');
    expect(clickCue(false, 'protected_structure')).toBe('protected');
    // Assessment passes no mistake, so it cannot give one away by sound.
    expect(clickCue(false, null)).toBe('not_accepted');
  });

  it('sounds a finished run by the biggest thing it earned', () => {
    const reward = (before: number, after: number, badges: RunReward['newBadges'] = []): RunReward => ({
      xpGained: after - before,
      before: levelProgress(before),
      after: levelProgress(after),
      newBadges: badges,
    });
    expect(rewardCue(reward(0, 50))).toBe('run_complete');
    expect(rewardCue(reward(0, 50, ['first_case']))).toBe('badge');
    expect(rewardCue(reward(80, 130, ['first_case']))).toBe('level_up');
  });
});
