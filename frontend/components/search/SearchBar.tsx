'use client';

import { css } from '@emotion/css';
import { SearchInput } from '@leafygreen-ui/search-input';
import { useDarkMode } from '@/components/Providers';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

export default function SearchBar({ value, onChange }: SearchBarProps) {
  const { darkMode } = useDarkMode();

  return (
    <div className={css`margin-bottom: 20px;`}>
      <SearchInput
        aria-label="Search documents"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        darkMode={darkMode}
      />
    </div>
  );
}
