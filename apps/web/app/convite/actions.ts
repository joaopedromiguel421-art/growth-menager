"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { acceptInvitation } from "../../lib/api";
import { createInvitedAuthUser, signInWithPassword } from "../../lib/auth";
import { ACTIVE_TENANT_COOKIE } from "../../lib/session";

export interface AcceptState {
  readonly error: string | null;
}

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Runs the whole acceptance in one submission: create the Supabase account, sign
 * in so the API sees a verified identity, then redeem the token. The alternative
 * — Supabase's own invite email — returns the session in a URL fragment, which a
 * server component cannot read.
 */
export async function acceptInvitationAction(
  _previous: AcceptState,
  formData: FormData
): Promise<AcceptState> {
  const token = field(formData, "token");
  const email = field(formData, "email");
  const password = formData.get("password");
  const confirmation = formData.get("password_confirmation");

  if (token.length < 32) return { error: "Link de convite inválido ou incompleto." };
  if (email.length === 0) return { error: "Informe o e-mail que recebeu o convite." };
  if (typeof password !== "string" || password.length < 12) {
    return { error: "Escolha uma senha com pelo menos 12 caracteres." };
  }
  if (password !== confirmation) {
    return { error: "As senhas não conferem." };
  }

  try {
    await createInvitedAuthUser(email, password);
    await signInWithPassword(email, password);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível ativar o acesso." };
  }

  const result = await acceptInvitation(token);
  if (!result.ok) {
    // The account now exists but carries no membership, so the session is
    // cleared rather than dropping the person on a workspace they cannot see.
    const cookieStore = await cookies();
    cookieStore.delete("gm-access");
    cookieStore.delete("gm-refresh");
    return { error: result.message };
  }

  if (result.data.tenant_id !== null) {
    (await cookies()).set(ACTIVE_TENANT_COOKIE, result.data.tenant_id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 180 * 24 * 60 * 60
    });
  }
  redirect("/app");
}
