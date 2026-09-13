/** An in-memory Storage, so the stores' tests run in plain Node without jsdom. */
export function memoryStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial));
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => {
      data.delete(key);
    },
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

/** Storage that throws on every access, as blocked site data does. */
export function blockedStorage(): Storage {
  const storage = memoryStorage();
  const refuse = (): never => {
    throw new Error('blocked');
  };
  storage.getItem = refuse;
  storage.setItem = refuse;
  storage.removeItem = refuse;
  return storage;
}
