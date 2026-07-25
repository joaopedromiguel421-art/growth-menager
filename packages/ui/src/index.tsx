import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";

export function Card({
  children,
  className = "",
  ...properties
}: HTMLAttributes<HTMLElement> & { readonly children: ReactNode }): ReactNode {
  return (
    <section className={`gm-card ${className}`} {...properties}>
      {children}
    </section>
  );
}

export function Badge({
  children,
  tone = "neutral"
}: {
  readonly children: ReactNode;
  readonly tone?: "neutral" | "success" | "warning" | "danger" | "info";
}): ReactNode {
  return <span className={`gm-badge gm-badge--${tone}`}>{children}</span>;
}

export function Button({
  children,
  className = "",
  ...properties
}: ButtonHTMLAttributes<HTMLButtonElement>): ReactNode {
  return (
    <button className={`gm-button ${className}`} {...properties}>
      {children}
    </button>
  );
}

export function EmptyState({
  title,
  description
}: {
  readonly title: string;
  readonly description: string;
}): ReactNode {
  return (
    <div className="gm-empty">
      <div className="gm-empty__mark" aria-hidden="true">
        ✦
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}
