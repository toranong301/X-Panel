export function safeLocalStorageGet(key: string): string | null {
  try {
    const canUseStorage = typeof window !== 'undefined' && typeof localStorage !== 'undefined';
    if (!canUseStorage) return null;
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function safeLocalStorageSet(key: string, value: string): void {
  try {
    const canUseStorage = typeof window !== 'undefined' && typeof localStorage !== 'undefined';
    if (!canUseStorage) return;
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

export function safeLocalStorageRemove(key: string): void {
  try {
    const canUseStorage = typeof window !== 'undefined' && typeof localStorage !== 'undefined';
    if (!canUseStorage) return;
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}
