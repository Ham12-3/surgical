import { element } from './dom';

/**
 * The disclaimer that the first launch, the home screen, the pause menu and
 * the settings all show (CLAUDE.md, non-negotiable 1). It stays in the top
 * bar too.
 */
export const DISCLAIMER_TEXT =
  'Surgical Trainer is an educational simulator. It is not a medical device or certified training, and it is no substitute for supervised clinical training. Its procedure content has not yet been checked by a clinician.';

/**
 * The first-launch disclaimer: a dialog the student acknowledges before
 * anything else. Returns a function that removes it.
 */
export function showDisclaimerDialog(host: HTMLElement, onAccept: () => void): () => void {
  const overlay = element('div', 'modal');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'disclaimer-title');
  const card = element('div', 'modal__card');
  const title = element('h2', 'drill__prompt', 'Before you start');
  title.id = 'disclaimer-title';
  const button = element('button', 'drill__button', 'I understand');
  button.type = 'button';
  const remove = (): void => overlay.remove();
  button.addEventListener('click', () => {
    remove();
    onAccept();
  });
  card.append(
    title,
    element('p', 'suture__hint', DISCLAIMER_TEXT),
    element('p', 'suture__hint', 'Your progress is saved in this browser only.'),
    button,
  );
  overlay.append(card);
  host.append(overlay);
  button.focus();
  return remove;
}
