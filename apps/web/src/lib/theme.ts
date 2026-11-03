import { useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark' | 'system';

// Only the preference lives in localStorage (per browser, harmless if lost).
// index.html applies the same rule before first paint, so there's no flash.
const KEY = 'theme';
const media = window.matchMedia?.('(prefers-color-scheme: dark)'); // undefined in jsdom
const listeners = new Set<() => void>();

function read(): Theme {
  try {
    const saved = localStorage.getItem(KEY);
    return saved === 'light' || saved === 'dark' ? saved : 'system';
  } catch {
    return 'system';
  }
}

let theme = read();

function apply() {
  document.documentElement.classList.toggle('dark', theme === 'dark' || (theme === 'system' && !!media?.matches));
  listeners.forEach((notify) => notify());
}

media?.addEventListener('change', apply);

export function setTheme(next: Theme) {
  theme = next;
  try {
    if (next === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, next);
  } catch {
    // storage blocked (private mode): the choice lasts for this page only
  }
  apply();
}

function subscribe(notify: () => void) {
  listeners.add(notify);
  return () => listeners.delete(notify);
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, () => theme);
}
