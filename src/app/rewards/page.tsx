import type { Metadata } from 'next';
import { RewardsPage } from '@/rewards/ui/RewardsPage';

export const metadata: Metadata = { title: 'My Rewards' };

export default function Page() {
  return <RewardsPage />;
}
