export function safeLocalStorageGet(key: string): string | null {
  try {
    if (typeof window === 'undefined') return null;
    if (!('localStorage' in window)) return null;
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function safeLocalStorageSet(key: string, value: string): void {
  try {
    if (typeof window === 'undefined') return;
    if (!('localStorage' in window)) return;
    window.localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

export function safeLocalStorageRemove(key: string): void {
  try {
    if (typeof window === 'undefined') return;
    if (!('localStorage' in window)) return;
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}
