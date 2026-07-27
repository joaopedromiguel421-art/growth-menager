"use client";

import { useActionState } from "react";
import { Button } from "@growth-manager/ui";
import { confirmStepUpAction, type StepUpState } from "./actions";

const initialState: StepUpState = { error: null };

export function StepUpForm({
  actionLabel,
  factorId,
  returnTo
}: {
  readonly actionLabel: string;
  readonly factorId: string;
  readonly returnTo: string;
}): React.ReactNode {
  const [state, action, pending] = useActionState(confirmStepUpAction, initialState);

  return (
    <form action={action} className="login-form">
      <input name="factor_id" type="hidden" value={factorId} />
      <input name="return_to" type="hidden" value={returnTo} />
      <div className="field">
        <label htmlFor="code">Código de 6 dígitos</label>
        <input
          id="code"
          name="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          minLength={6}
          maxLength={8}
          required
        />
      </div>
      {state.error === null ? null : (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Confirmando…" : actionLabel}
      </Button>
    </form>
  );
}
