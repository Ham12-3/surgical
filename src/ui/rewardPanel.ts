import { badgeById } from '../engine/badges';
import type { LevelProgress, RunReward } from '../engine/progression';
import { element } from './dom';

/**
 * What a finished run earned, for the foot of a results panel: the
 * experience, a new level or rank, and any badge earned for the first time.
 */
export function rewardContent(reward: RunReward | null): HTMLElement[] {
  if (!reward) return [];
  const { before, after } = reward;
  const box = element('div', 'reward');
  box.setAttribute('role', 'status');
  box.append(element('div', 'reward__xp', `+${reward.xpGained} XP`));
  if (after.level > before.level) {
    const rank = after.rank !== before.rank ? ` New rank: ${after.rank}.` : '';
    box.append(element('div', 'reward__level', `Level ${after.level}.${rank}`));
  }
  box.append(progressBar(after));
  for (const id of reward.newBadges) {
    const badge = badgeById(id);
    if (!badge) continue;
    const line = element('div', 'reward__badge');
    line.append(element('strong', '', `Badge earned: ${badge.title}`), element('span', 'procedure__mode-text', badge.description));
    box.append(line);
  }
  return [box];
}

/** How far through the current level the student is, as a labelled bar. */
export function progressBar(progress: LevelProgress): HTMLElement {
  const wrap = element('div', 'level-bar');
  const bar = element('progress', 'level-bar__track');
  bar.max = 100;
  bar.value = Math.round(progress.fraction * 100);
  bar.setAttribute('aria-label', `Progress to level ${progress.level + 1}`);
  const into = progress.xp - progress.levelStartXp;
  const span = progress.nextLevelXp - progress.levelStartXp;
  wrap.append(bar, element('span', 'drill__count', `${into} of ${span} XP to level ${progress.level + 1}`));
  return wrap;
}
