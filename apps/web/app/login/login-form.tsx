"use client";

import { useActionState } from "react";
import Link from "next/link";
import { SubmitButton } from "../../components/submit-button";
import { loginAction, type LoginState } from "./actions";

const initialState: LoginState = { error: null };

export function LoginForm(): React.ReactNode {
  const [state, action] = useActionState(loginAction, initialState);

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
      <div className="field">
        <div className="field__label-row">
          <label htmlFor="password">Senha</label>
          <Link href="/recovery">Esqueci minha senha</Link>
        </div>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          minLength={8}
        />
      </div>
      {state.error === null ? null : (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      )}
      <SubmitButton pendingLabel="Entrando…">Entrar</SubmitButton>
      <button className="passkey-button" type="button" disabled title="Disponível em breve">
        Usar passkey
        <span>Em breve</span>
      </button>
    </form>
  );
}
