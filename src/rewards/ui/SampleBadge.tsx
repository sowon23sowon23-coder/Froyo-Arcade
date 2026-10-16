import { PROMOTION } from '../config';

/** Marks reward details that the business hasn't confirmed yet (PROMOTION.draft). */
export function SampleBadge() {
  if (!PROMOTION.draft) return null;
  return (
    <span className="badge rw-sample" title="The reward details shown here are placeholders and may change.">
      Sample terms · not final
    </span>
  );
}
