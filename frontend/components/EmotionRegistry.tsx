'use client';

import { useState } from 'react';
import { useServerInsertedHTML } from 'next/navigation';
import createCache from '@emotion/cache';
import { CacheProvider } from '@emotion/react';

export default function EmotionRegistry({ children }: { children: React.ReactNode }) {
  const [cache] = useState(() => {
    const c = createCache({ key: 'lg' });
    c.compat = true;
    return c;
  });

  useServerInsertedHTML(() => {
    const entries = (cache as any).inserted;
    if (!entries || Object.keys(entries).length === 0) return null;

    const styles = Object.values(entries).join('');
    const names = Object.keys(entries).join(' ');

    // Clear inserted after flushing
    (cache as any).inserted = {};

    return (
      <style
        data-emotion={`${cache.key} ${names}`}
        dangerouslySetInnerHTML={{ __html: styles }}
      />
    );
  });

  return <CacheProvider value={cache}>{children}</CacheProvider>;
}
