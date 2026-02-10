'use client';

import Banner from '@leafygreen-ui/banner';
import { useDarkMode } from '@/components/Providers';

interface ErrorBannerProps {
  message: string;
}

export default function ErrorBanner({ message }: ErrorBannerProps) {
  const { darkMode } = useDarkMode();

  return (
    <Banner variant="danger" darkMode={darkMode}>
      {message}
    </Banner>
  );
}
