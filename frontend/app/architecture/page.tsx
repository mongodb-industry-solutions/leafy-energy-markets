'use client';

import Image from 'next/image';
import PageHeader from '@/components/shared/PageHeader';

export default function ArchitecturePage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <PageHeader
        title="Architecture"
        subtitle="System architecture diagram"
      />
      <div style={{ width: '100%', position: 'relative' }}>
        <Image
          src="/img/architecture.jpeg"
          alt="System Architecture Diagram"
          width={1920}
          height={1080}
          style={{ width: '100%', height: 'auto', borderRadius: '12px' }}
          priority
        />
      </div>
    </div>
  );
}
