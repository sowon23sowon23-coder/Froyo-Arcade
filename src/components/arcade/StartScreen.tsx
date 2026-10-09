import type { ReactNode } from 'react';

export type Rule = { icon: ReactNode; title: string; text: string };

export function RuleList({ rules }: { rules: Rule[] }) {
  return (
    <ul className="rule-list card">
      {rules.map((rule) => (
        <li key={rule.title}>
          <span className="rule-icon" aria-hidden="true">
            {rule.icon}
          </span>
          <span className="rule-text">
            <b>{rule.title}</b>
            <span>{rule.text}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Intro screen every game opens on: art, one-line pitch, rules, and the start button. */
export function StartScreen({
  hero,
  title,
  description,
  rules,
  children,
  actions,
}: {
  hero: ReactNode;
  title: string;
  description: string;
  rules: Rule[];
  /** Game-specific setup (character pick, progress, ...), shown above the rules. */
  children?: ReactNode;
  actions: ReactNode;
}) {
  return (
    <div className="start screen-in">
      <div className="start-hero">{hero}</div>
      <div className="start-title">
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {children}
      <section>
        <h3 className="section-label">How to play</h3>
        <RuleList rules={rules} />
      </section>
      <div className="start-actions">{actions}</div>
    </div>
  );
}
