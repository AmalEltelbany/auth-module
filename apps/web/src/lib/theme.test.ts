import { afterEach, describe, expect, it, vi } from 'vitest';
import { setTheme } from './theme';

const isDark = () => document.documentElement.classList.contains('dark');

afterEach(() => {
  setTheme('system');
  vi.restoreAllMocks();
});

describe('theme store', () => {
  it('Dark adds the .dark class and saves the choice', () => {
    setTheme('dark');
    expect(isDark()).toBe(true);
    expect(localStorage.getItem('theme')).toBe('dark');
  });

  it('Light removes the class and saves the choice', () => {
    setTheme('dark');
    setTheme('light');
    expect(isDark()).toBe(false);
    expect(localStorage.getItem('theme')).toBe('light');
  });

  it('System forgets the choice and follows the OS (light in jsdom)', () => {
    setTheme('dark');
    setTheme('system');
    expect(localStorage.getItem('theme')).toBeNull();
    expect(isDark()).toBe(false);
  });

  it('still applies the theme when storage is blocked (private mode)', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    expect(() => setTheme('dark')).not.toThrow();
    expect(isDark()).toBe(true);
  });
});
