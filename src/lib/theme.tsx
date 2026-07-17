import { createContext, useContext, useEffect, ReactNode } from 'react';

type Theme = 'light' | 'dark';
const Ctx = createContext<{ theme: Theme; toggle: () => void } | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const getInitial = (): Theme => {
    if (typeof window !== 'undefined' && localStorage.getItem('theme') === 'dark') return 'dark';
    return 'light';
  };

  const apply = (t: Theme) => {
    document.documentElement.classList.toggle('dark', t === 'dark');
    localStorage.setItem('theme', t);
  };

  useEffect(() => {
    apply(getInitial());
  }, []);

  const toggle = () => {
    const next: Theme = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
    apply(next);
  };

  return <Ctx.Provider value={{ theme: 'light', toggle }}>{children}</Ctx.Provider>;
}

export function useTheme() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useTheme must be inside ThemeProvider');
  return c;
}
