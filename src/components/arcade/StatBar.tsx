import type { ReactNode } from 'react';

export type StatItem = {
  label: string;
  value: ReactNode;
  tone?: 'brand' | 'warn';
};

export function StatBar({ items, className }: { items: StatItem[]; className?: string }) {
  return (
    <div className={`stat-bar${className ? ` ${className}` : ''}`}>
      {items.map((item) => (
        <div key={item.label} className={`stat${item.tone ? ` tone-${item.tone}` : ''}`}>
          <span className="stat-label">{item.label}</span>
          <span className="stat-value">{item.value}</span>
        </div>
      ))}
    </div>
  );
}
