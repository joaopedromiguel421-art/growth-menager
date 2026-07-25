"use server";

import { redirect } from "next/navigation";
import { signInWithPassword } from "../../lib/auth";

export interface LoginState {
  readonly error: string | null;
}

export async function loginAction(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const emailValue = formData.get("email");
  const passwordValue = formData.get("password");
  const email = typeof emailValue === "string" ? emailValue.trim() : "";
  const password = typeof passwordValue === "string" ? passwordValue : "";
  if (email.length === 0 || password.length === 0) {
    return { error: "Informe seu e-mail e sua senha." };
  }

  try {
    await signInWithPassword(email, password);
  } catch {
    return { error: "Não foi possível entrar. Verifique seus dados e tente novamente." };
  }
  redirect("/app");
}
