"use client";

import { useFormStatus } from "react-dom";

export function SubmitButton({
  children,
  pendingLabel,
  className = "gm-button"
}: {
  readonly children: React.ReactNode;
  readonly pendingLabel: string;
  readonly className?: string;
}): React.ReactNode {
  const { pending } = useFormStatus();

  return (
    <button aria-disabled={pending} className={className} disabled={pending} type="submit">
      {pending ? <span className="button-spinner" aria-hidden="true" /> : null}
      <span>{pending ? pendingLabel : children}</span>
      <span className="sr-only" aria-live="polite">
        {pending ? pendingLabel : ""}
      </span>
    </button>
  );
}
