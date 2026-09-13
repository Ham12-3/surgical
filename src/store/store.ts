/**
 * A minimal observable store. Deliberately tiny: the app has a handful of
 * slices (session, settings, progress) and pulling in a state library for that
 * would cost more than it saves.
 *
 * Semantics worth knowing:
 * - `set` shallow-merges a patch and notifies only if something actually changed
 *   (reference equality per key), so redundant writes don't churn the UI.
 * - Listeners added during a notify run are not called until the next change,
 *   and listeners removed during a run are not called. Both fall out of
 *   iterating over a snapshot of the listener set.
 */

export type Listener<T> = (state: T, previous: T) => void;
export type Unsubscribe = () => void;

export interface Store<T extends object> {
  get(): Readonly<T>;
  set(patch: Partial<T> | ((previous: Readonly<T>) => Partial<T>)): void;
  subscribe(listener: Listener<T>): Unsubscribe;
  /** Subscribe to one derived value; fires only when that value changes. */
  select<U>(selector: (state: Readonly<T>) => U, listener: (value: U) => void): Unsubscribe;
}

export function createStore<T extends object>(initial: T): Store<T> {
  let state: T = { ...initial };
  const listeners = new Set<Listener<T>>();

  const get = (): Readonly<T> => state;

  const set: Store<T>['set'] = (patch) => {
    const resolved = typeof patch === 'function' ? patch(state) : patch;
    let changed = false;
    for (const key of Object.keys(resolved) as Array<keyof T>) {
      if (!Object.is(state[key], resolved[key])) {
        changed = true;
        break;
      }
    }
    if (!changed) return;

    const previous = state;
    state = { ...state, ...resolved };
    for (const listener of [...listeners]) listener(state, previous);
  };

  const subscribe: Store<T>['subscribe'] = (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  const select: Store<T>['select'] = (selector, listener) => {
    let current = selector(state);
    return subscribe((next) => {
      const value = selector(next);
      if (Object.is(value, current)) return;
      current = value;
      listener(value);
    });
  };

  return { get, set, subscribe, select };
}
