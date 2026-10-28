import { useEffect, useState } from 'react';

/** Whether a CSS media query currently matches (updates on change). */
export function useMedia(query: string): boolean {
  const [match, setMatch] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(query).matches);
  useEffect(() => {
    const m = matchMedia(query);
    const on = () => setMatch(m.matches);
    on();
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, [query]);
  return match;
}

/** Phone layout: one area at a time with a bottom navigation bar (keep in sync with styles.css). */
export const PHONE = '(max-width: 720px)';
