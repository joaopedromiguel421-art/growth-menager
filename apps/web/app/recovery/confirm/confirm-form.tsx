"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { Button } from "@growth-manager/ui";

type Status = "checking" | "ready" | "invalid" | "saving" | "done";

/**
 * Supabase delivers the recovery grant as a URL hash fragment, which never
 * reaches the server, so this one screen talks to Supabase directly from the
 * browser instead of going through a server action. The client never persists
 * this session: this app's only session storage is the httpOnly cookie pair set
 * by the normal sign-in flow, and the user signs in through that flow right after.
 */
export function ConfirmForm({
  supabaseUrl,
  supabaseKey
}: {
  readonly supabaseUrl: string;
  readonly supabaseKey: string;
}): React.ReactNode {
  const [status, setStatus] = useState<Status>("checking");
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState("");

  useEffect(() => {
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, detectSessionInUrl: true }
    });

    async function checkSession(): Promise<void> {
      const { data } = await supabase.auth.getSession();
      setStatus(data.session === null ? "invalid" : "ready");
    }

    void checkSession();
  }, [supabaseUrl, supabaseKey]);

  async function handleSubmit(event: React.SyntheticEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (password.length < 8) {
      setError("A senha precisa ter pelo menos 8 caracteres.");
      return;
    }
    setStatus("saving");
    setError(null);

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, detectSessionInUrl: true }
    });
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError !== null) {
      setError("Não foi possível salvar a nova senha. Tente novamente.");
      setStatus("ready");
      return;
    }
    await supabase.auth.signOut();
    setStatus("done");
    window.setTimeout(() => {
      window.location.href = "/login";
    }, 1500);
  }

  if (status === "checking") {
    return <p className="muted">Confirmando o link…</p>;
  }
  if (status === "invalid") {
    return (
      <p className="form-error" role="alert">
        Link expirado ou inválido. <a href="/recovery">Solicite um novo link</a>.
      </p>
    );
  }
  if (status === "done") {
    return (
      <p className="muted" role="status">
        Senha atualizada. Redirecionando para o login…
      </p>
    );
  }

  return (
    <form
      className="login-form"
      onSubmit={(event) => {
        void handleSubmit(event);
      }}
    >
      <div className="field">
        <label htmlFor="password">Nova senha</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
          }}
        />
      </div>
      {error === null ? null : (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" disabled={status === "saving"}>
        {status === "saving" ? "Salvando…" : "Salvar nova senha"}
      </Button>
    </form>
  );
}
