"use client";

import { useActionState } from "react";
import { acceptInvitationAction, type AcceptState } from "./actions";

const initialState: AcceptState = { error: null };

export function AcceptForm({ token }: { readonly token: string }): React.ReactNode {
  const [state, action, pending] = useActionState(acceptInvitationAction, initialState);

  return (
    <form action={action} className="task-form">
      <input name="token" type="hidden" value={token} />

      <div className="field">
        <label htmlFor="accept-email">E-mail que recebeu o convite</label>
        <input autoComplete="username" id="accept-email" name="email" required type="email" />
      </div>

      <div className="field">
        <label htmlFor="accept-password">Crie uma senha</label>
        <input
          autoComplete="new-password"
          id="accept-password"
          minLength={12}
          name="password"
          required
          type="password"
        />
      </div>

      <div className="field">
        <label htmlFor="accept-password-confirmation">Repita a senha</label>
        <input
          autoComplete="new-password"
          id="accept-password-confirmation"
          minLength={12}
          name="password_confirmation"
          required
          type="password"
        />
      </div>

      {state.error === null ? null : (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      )}

      <button className="primary-button" disabled={pending} type="submit">
        {pending ? "Ativando…" : "Ativar meu acesso"}
      </button>
    </form>
  );
}
