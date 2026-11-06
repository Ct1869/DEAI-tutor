'use client';
import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('dark');

  useEffect(() => {
    const stored = (typeof localStorage !== 'undefined' && localStorage.getItem('theme')) as Theme | null;
    const initial: Theme = stored === 'light' || stored === 'dark' ? stored : 'dark';
    setTheme(initial);
    document.documentElement.setAttribute('data-theme', initial);
  }, []);

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('theme', next); } catch {}
  }

  return (
    <button
      type="button"
      className="pillbtn theme-toggle"
      onClick={toggle}
      aria-label={theme === 'dark' ? 'Zu hellem Design wechseln' : 'Zu dunklem Design wechseln'}
      title={theme === 'dark' ? 'Hell' : 'Dunkel'}
    >
      {theme === 'dark' ? '☀' : '☾'}
    </button>
  );
}
