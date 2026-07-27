"use server";

import { redirect } from "next/navigation";
import { challengeFactor, requireAccessToken, verifyFactor } from "../../../lib/auth";

export interface StepUpState {
  readonly error: string | null;
}

function safeReturnTo(value: FormDataEntryValue | null): string {
  if (typeof value !== "string" || !value.startsWith("/app")) return "/app";
  return value;
}

export async function confirmStepUpAction(
  _previous: StepUpState,
  formData: FormData
): Promise<StepUpState> {
  const factorId = formData.get("factor_id");
  const codeValue = formData.get("code");
  const returnTo = safeReturnTo(formData.get("return_to"));
  const code = typeof codeValue === "string" ? codeValue.trim() : "";
  if (typeof factorId !== "string" || code.length === 0) {
    return { error: "Informe o código gerado pelo autenticador." };
  }

  const accessToken = await requireAccessToken();
  let verified = false;
  try {
    const challengeId = await challengeFactor(accessToken, factorId);
    await verifyFactor(accessToken, factorId, challengeId, code);
    verified = true;
  } catch {
    verified = false;
  }
  if (!verified) {
    return { error: "Código inválido ou expirado. Tente novamente." };
  }
  // The target is always a same-app path validated by safeReturnTo above, not an
  // externally supplied URL, so this mirrors the cast already used for redirects
  // Next's typed-routes plugin cannot statically know about.
  redirect(returnTo as Parameters<typeof redirect>[0]);
}
