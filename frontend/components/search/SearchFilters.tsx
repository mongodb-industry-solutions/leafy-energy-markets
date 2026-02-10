'use client';

import { css } from '@emotion/css';
import { Select, Option } from '@leafygreen-ui/select';
import { useDarkMode } from '@/components/Providers';
import type { DocumentType } from '@/lib/types';

interface SearchFiltersProps {
  selectedType: DocumentType | 'All';
  onTypeChange: (type: DocumentType | 'All') => void;
}

export default function SearchFilters({ selectedType, onTypeChange }: SearchFiltersProps) {
  const { darkMode } = useDarkMode();

  return (
    <div className={css`margin-bottom: 20px; max-width: 240px;`}>
      <Select
        label="Document Type"
        value={selectedType}
        onChange={(val) => onTypeChange(val as DocumentType | 'All')}
        darkMode={darkMode}
        size="small"
      >
        <Option value="All">All Types</Option>
        <Option value="Research">Research</Option>
        <Option value="ESG">ESG</Option>
        <Option value="Asset">Asset</Option>
      </Select>
    </div>
  );
}
