import { BADGES } from '../engine/badges';
import { PROCEDURE_MODES, type Procedure, type ProcedureMode } from '../engine/procedure/types';
import { isModeUnlocked, levelProgress, type Profile } from '../engine/progression';
import { recommendNext, type Recommendation } from '../engine/recommend';
import { MODE_RULES } from '../engine/scoring';
import { DISCLAIMER_TEXT } from './disclaimer';
import { element } from './dom';
import { formatTime, LOCKED_TEXT, modeTitle } from './procedurePanels';
import { progressBar } from './rewardPanel';

export type HomeTarget =
  | { readonly kind: 'drill' }
  | { readonly kind: 'suture' }
  | { readonly kind: 'theatre' }
  | { readonly kind: 'procedure'; readonly procedureId: string; readonly mode: ProcedureMode };

export interface HomeScreenOptions {
  host: HTMLElement;
  profile: Profile;
  procedures: readonly Procedure[];
  onOpen: (target: HomeTarget) => void;
}

/**
 * The home screen: rank and experience, what to do next, everything there is
 * to practise, the badges and the latest runs. It is built from the profile
 * each time it opens, and nothing on it changes while it shows.
 */
export class HomeScreen {
  private readonly root = element('section', 'page home');

  constructor(private readonly options: HomeScreenOptions) {
    this.root.setAttribute('aria-label', 'Home');
    const inner = element('div', 'page__inner');
    inner.append(this.intro(), this.progress(), this.next(), this.library(), this.badges());
    const recent = this.recent();
    if (recent) inner.append(recent);
    this.root.append(inner);
    options.host.append(this.root);
  }

  dispose(): void {
    this.root.remove();
  }

  private intro(): HTMLElement {
    const section = element('header', 'home__intro');
    section.append(
      element('h1', 'page__title', 'Surgical Trainer'),
      element('p', 'page__lead', 'Practise the instruments, suturing and a first procedure in 3D, at your own pace.'),
      element('p', 'page__disclaimer', DISCLAIMER_TEXT),
    );
    return section;
  }

  private progress(): HTMLElement {
    const progress = levelProgress(this.options.profile.xp);
    const card = element('section', 'card home__rank');
    card.setAttribute('aria-label', 'Your progress');
    card.append(
      element('div', 'card__eyebrow', `Level ${progress.level} · ${progress.xp} XP`),
      element('h2', 'card__title', progress.rank),
      progressBar(progress),
      element('p', 'suture__hint', 'Ranks show how far you have worked through this simulator. They say nothing about clinical competence.'),
    );
    return card;
  }

  private next(): HTMLElement {
    const { profile, procedures } = this.options;
    const recommendation = recommendNext(profile, procedures.map((procedure) => procedure.id));
    const { title, target } = describe(recommendation, procedures);
    const card = element('section', 'card home__next');
    card.setAttribute('aria-label', 'Recommended next');
    card.append(
      element('div', 'card__eyebrow', 'Next'),
      element('h2', 'card__title', title),
      element('p', 'suture__hint', recommendation.reason),
      this.button('Start', () => this.options.onOpen(target)),
    );
    return card;
  }

  private library(): HTMLElement {
    const { profile, procedures } = this.options;
    const grid = element('div', 'home__grid');
    grid.append(
      this.skillCard(
        'Instrument identification drill',
        'Name the open instruments: ten questions, four names to choose from.',
        profile.drill.runs === 0 ? 'Not tried yet.' : `Best ${profile.drill.best}% over ${plural(profile.drill.runs, 'run')}.`,
        'Start the drill',
        { kind: 'drill' },
      ),
      this.skillCard(
        'Suturing practice pad',
        'Place five simple interrupted sutures, judged on each bite, the knot and the row.',
        profile.suture.runs === 0 ? 'Not tried yet.' : `Best ${profile.suture.best} over ${plural(profile.suture.runs, 'run')}.`,
        'Open the pad',
        { kind: 'suture' },
      ),
      ...procedures.map((procedure) => this.procedureCard(procedure)),
      this.skillCard(
        'Operating theatre',
        'Look around the theatre and pick up the instruments, with nothing marked.',
        '',
        'Enter the theatre',
        { kind: 'theatre' },
      ),
    );
    const section = element('section', 'home__section');
    section.setAttribute('aria-label', 'Practise');
    section.append(element('h2', 'home__heading', 'Practise'), grid);
    return section;
  }

  private skillCard(title: string, description: string, record: string, action: string, target: HomeTarget): HTMLElement {
    const card = element('article', 'card');
    card.append(element('h3', 'card__title', title), element('p', 'suture__hint', description));
    if (record) card.append(element('p', 'drill__count', record));
    card.append(this.button(action, () => this.options.onOpen(target)));
    return card;
  }

  private procedureCard(procedure: Procedure): HTMLElement {
    const { profile } = this.options;
    const record = profile.procedures[procedure.id];
    const card = element('article', 'card home__procedure');
    const heading = element('div', 'drill__header');
    heading.append(element('h3', 'card__title', procedure.title));
    if (!procedure.reviewed) heading.append(element('span', 'drill__badge', 'Unreviewed content'));
    card.append(
      heading,
      element('p', 'drill__count', `Difficulty ${procedure.difficulty} · about ${procedure.estimatedMinutes} minutes · ${procedure.steps.length} steps`),
    );
    const modes = element('ul', 'home__modes');
    for (const mode of PROCEDURE_MODES) {
      const open = isModeUnlocked(profile, procedure.id, mode);
      const mine = record?.[mode];
      let status: string;
      if (!open) status = LOCKED_TEXT;
      else if (!mine || mine.runs === 0) status = 'Not tried yet.';
      else if (MODE_RULES[mode].scored) status = `Best ${mine.best}${mine.passed ? ', passed' : ', not passed yet'}.`;
      else status = `Finished ${plural(mine.runs, 'time')}.`;

      const info = element('div', 'home__mode-info');
      info.append(element('strong', '', modeTitle(mode)), element('span', 'procedure__mode-text', status));
      const button = this.button('Start', () => this.options.onOpen({ kind: 'procedure', procedureId: procedure.id, mode }));
      button.disabled = !open;
      button.setAttribute('aria-label', `Start ${procedure.title} in ${modeTitle(mode)}`);
      const item = element('li', 'home__mode');
      item.append(info, button);
      modes.append(item);
    }
    card.append(modes);
    return card;
  }

  private badges(): HTMLElement {
    const earned = this.options.profile.badges;
    const grid = element('ul', 'home__badges');
    for (const badge of BADGES) {
      const when = earned[badge.id];
      const item = element('li', when ? 'badge badge--earned' : 'badge');
      item.append(
        element('strong', '', badge.title),
        element('span', 'procedure__mode-text', badge.description),
        element('span', 'drill__count', when ? `Earned ${formatDate(when)}` : 'Not yet'),
      );
      grid.append(item);
    }
    const count = BADGES.filter((badge) => earned[badge.id] !== undefined).length;
    const section = element('section', 'home__section');
    section.setAttribute('aria-label', 'Badges');
    section.append(element('h2', 'home__heading', `Badges: ${count} of ${BADGES.length}`), grid);
    return section;
  }

  private recent(): HTMLElement | null {
    const { profile, procedures } = this.options;
    if (profile.recent.length === 0) return null;
    const list = element('ol', 'procedure__steps');
    for (const attempt of profile.recent) {
      const title = procedures.find((procedure) => procedure.id === attempt.procedureId)?.title ?? attempt.procedureId;
      const mark = MODE_RULES[attempt.mode].scored ? `${attempt.score}, ${attempt.passed ? 'passed' : 'not passed'}` : 'finished';
      const item = element('li', 'procedure__step');
      item.append(
        element('span', '', `${title}: ${modeTitle(attempt.mode)}`),
        element('span', 'procedure__step-score', `${mark} · ${formatTime(attempt.seconds)} · ${formatDate(attempt.finishedAt)}`),
      );
      list.append(item);
    }
    const section = element('section', 'home__section');
    section.setAttribute('aria-label', 'Recent runs');
    section.append(element('h2', 'home__heading', 'Recent runs'), list);
    return section;
  }

  private button(label: string, onClick: () => void): HTMLButtonElement {
    const button = element('button', 'drill__button', label);
    button.type = 'button';
    button.addEventListener('click', onClick);
    return button;
  }
}

function describe(recommendation: Recommendation, procedures: readonly Procedure[]): { title: string; target: HomeTarget } {
  switch (recommendation.kind) {
    case 'drill':
      return { title: 'Instrument identification drill', target: { kind: 'drill' } };
    case 'suture':
      return { title: 'Suturing practice pad', target: { kind: 'suture' } };
    case 'procedure': {
      const procedure = procedures.find((candidate) => candidate.id === recommendation.procedureId);
      return {
        title: `${procedure?.title ?? recommendation.procedureId}: ${modeTitle(recommendation.mode)}`,
        target: { kind: 'procedure', procedureId: recommendation.procedureId, mode: recommendation.mode },
      };
    }
  }
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString();
}
