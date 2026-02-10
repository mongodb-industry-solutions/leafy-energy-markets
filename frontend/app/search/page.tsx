'use client';

import { useState, useMemo } from 'react';
import PageHeader from '@/components/shared/PageHeader';
import SearchBar from '@/components/search/SearchBar';
import SearchFilters from '@/components/search/SearchFilters';
import SearchResults from '@/components/search/SearchResults';
import SearchEmptyState from '@/components/search/SearchEmptyState';
import { searchDocuments } from '@/lib/mock-data';
import type { DocumentType } from '@/lib/types';

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<DocumentType | 'All'>('All');

  const filteredResults = useMemo(() => {
    let results = searchDocuments;

    if (typeFilter !== 'All') {
      results = results.filter((d) => d.type === typeFilter);
    }

    if (query.trim()) {
      const q = query.toLowerCase();
      results = results.filter(
        (d) =>
          d.title.toLowerCase().includes(q) ||
          d.snippet.toLowerCase().includes(q) ||
          d.source.toLowerCase().includes(q)
      );
    }

    return results;
  }, [query, typeFilter]);

  return (
    <div>
      <PageHeader
        title="Market Intelligence"
        subtitle="Search research reports, ESG assessments, and asset performance data"
      />
      <SearchBar value={query} onChange={setQuery} />
      <SearchFilters selectedType={typeFilter} onTypeChange={setTypeFilter} />
      {filteredResults.length > 0 ? (
        <SearchResults results={filteredResults} />
      ) : (
        <SearchEmptyState />
      )}
    </div>
  );
}
