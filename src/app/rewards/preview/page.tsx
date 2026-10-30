import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PROMOTION } from '@/rewards/config';
import { CouponMockup } from '@/rewards/ui/CouponMockup';

export const metadata: Metadata = { title: 'Reward Mockup', robots: { index: false, follow: false } };

/** For reviewing the coupon screens before launch. Gone as soon as the promotion leaves draft. */
export default function Page() {
  if (!PROMOTION.draft) notFound();
  return <CouponMockup />;
}
