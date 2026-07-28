"use client";

import { useActionState } from "react";
import { SubmitButton } from "../../components/submit-button";
import { requestRecoveryAction, type RecoveryState } from "./actions";

const initialState: RecoveryState = { submitted: false, error: null };

export function RecoveryForm(): React.ReactNode {
  const [state, action] = useActionState(requestRecoveryAction, initialState);

  if (state.submitted) {
    return (
      <p className="muted" role="status">
        Se esse e-mail tiver uma conta, enviamos um link para redefinir a senha. Verifique sua caixa
        de entrada.
      </p>
    );
  }

  return (
    <form action={action} className="login-form">
      <div className="field">
        <label htmlFor="email">E-mail</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="voce@empresa.com.br"
        />
      </div>
      {state.error === null ? null : (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      )}
      <SubmitButton pendingLabel="Enviando…">Enviar link de recuperação</SubmitButton>
    </form>
  );
}
