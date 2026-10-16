import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ClaimPage } from '@/rewards/ui/ClaimPage';

export const metadata: Metadata = { title: 'Claim Reward' };

export default function Page() {
  return (
    <Suspense>
      <ClaimPage />
    </Suspense>
  );
}
