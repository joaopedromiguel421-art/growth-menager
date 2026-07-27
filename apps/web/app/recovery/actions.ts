"use server";

import { requestPasswordRecovery } from "../../lib/auth";

export interface RecoveryState {
  readonly submitted: boolean;
  readonly error: string | null;
}

export async function requestRecoveryAction(
  _previous: RecoveryState,
  formData: FormData
): Promise<RecoveryState> {
  const emailValue = formData.get("email");
  const email = typeof emailValue === "string" ? emailValue.trim() : "";
  if (email.length === 0) {
    return { submitted: false, error: "Informe o e-mail da sua conta." };
  }

  // The confirmation below never depends on whether the address is registered,
  // so this request cannot be used to enumerate accounts.
  await requestPasswordRecovery(email);
  return { submitted: true, error: null };
}
