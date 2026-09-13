import { actionForKey, type KeyBindings } from '../store/keyBindings';
import type { ProcedureSession } from './procedureSession';
import { isTypingTarget } from './toolTray';

export interface ProcedureKeyHandlers {
  /** Each returns whether it used the key. */
  pause(): boolean;
  hint(): boolean;
}

/** The pause and hint handlers a procedure screen wants: each acts only when the session allows it. */
export function sessionKeyHandlers(session: ProcedureSession, act: { togglePause: () => void; hint: () => void }): ProcedureKeyHandlers {
  const underWay = (): boolean => session.phase === 'step' || session.phase === 'handling';
  return {
    pause: () => {
      if (!underWay() && session.phase !== 'quiz') return false;
      act.togglePause();
      return true;
    },
    hint: () => {
      if (!session.rules.hints || !underWay() || session.paused) return false;
      act.hint();
      return true;
    },
  };
}

/**
 * The procedure screen's own keys, as the player has bound them: pause and
 * hint. The tray listens for its instrument keys itself. Returns the function
 * that stops listening.
 */
export function listenForProcedureKeys(keys: KeyBindings, handlers: ProcedureKeyHandlers): () => void {
  const onKey = (event: KeyboardEvent): void => {
    if (event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target)) return;
    const action = actionForKey(keys, event.key);
    const used = action?.kind === 'pause' ? handlers.pause() : action?.kind === 'hint' ? handlers.hint() : false;
    if (used) event.preventDefault();
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}
