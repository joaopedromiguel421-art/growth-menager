import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

const authResponseSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  expires_in: z.number(),
  user: z.object({
    id: z.string(),
    email: z.string().nullable()
  })
});

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/"
};

function supabaseConfiguration(): { url: string; key: string } {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (url === undefined || key === undefined) {
    throw new Error("Supabase auth is not configured.");
  }
  return { url, key };
}

async function applySession(session: z.infer<typeof authResponseSchema>): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set("gm-access", session.access_token, {
    ...cookieOptions,
    maxAge: session.expires_in
  });
  cookieStore.set("gm-refresh", session.refresh_token, {
    ...cookieOptions,
    maxAge: 30 * 24 * 60 * 60
  });
}

function publicAppUrl(): string {
  return process.env.PUBLIC_APP_URL ?? "http://localhost:3000";
}

export async function signInWithPassword(email: string, password: string): Promise<void> {
  const configuration = supabaseConfiguration();
  const response = await fetch(`${configuration.url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: configuration.key,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ email, password }),
    cache: "no-store"
  });
  if (!response.ok) {
    throw new Error("E-mail ou senha inválidos.");
  }

  await applySession(authResponseSchema.parse(await response.json()));
}

/**
 * Always resolves the same way whether or not the address has an account, so the
 * response itself can never be used to enumerate registered e-mails (RF-035).
 */
export async function requestPasswordRecovery(email: string): Promise<void> {
  const configuration = supabaseConfiguration();
  await fetch(`${configuration.url}/auth/v1/recover`, {
    method: "POST",
    headers: {
      apikey: configuration.key,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      email,
      options: { redirect_to: `${publicAppUrl()}/recovery/confirm` }
    }),
    cache: "no-store"
  }).catch(() => undefined);
}

const factorSchema = z.object({
  id: z.string(),
  factor_type: z.string(),
  status: z.string()
});

export interface MfaStatus {
  readonly factorId: string;
  readonly verified: boolean;
}

/**
 * Reads the caller's own TOTP factor, if any, straight from Supabase Auth. There
 * is no local mirror of MFA enrollment: the access token already proves identity,
 * and Supabase is the single source of truth for factor state.
 */
export async function getMfaStatus(accessToken: string): Promise<MfaStatus | null> {
  const configuration = supabaseConfiguration();
  const response = await fetch(`${configuration.url}/auth/v1/user`, {
    headers: { apikey: configuration.key, Authorization: `Bearer ${accessToken}` },
    cache: "no-store"
  });
  if (!response.ok) return null;

  const parsed = z.object({ factors: z.array(factorSchema).optional() }).safeParse(
    await response.json()
  );
  if (!parsed.success) return null;

  const totp = parsed.data.factors?.find((factor) => factor.factor_type === "totp");
  if (totp === undefined) return null;
  return { factorId: totp.id, verified: totp.status === "verified" };
}

export interface EnrolledFactor {
  readonly factorId: string;
  readonly secret: string;
  readonly uri: string;
}

export async function enrollTotpFactor(accessToken: string): Promise<EnrolledFactor> {
  const configuration = supabaseConfiguration();
  const response = await fetch(`${configuration.url}/auth/v1/factors`, {
    method: "POST",
    headers: {
      apikey: configuration.key,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ factor_type: "totp" }),
    cache: "no-store"
  });
  if (!response.ok) {
    throw new Error("Não foi possível iniciar a configuração do autenticador.");
  }

  const parsed = z
    .object({ id: z.string(), totp: z.object({ secret: z.string(), uri: z.string() }) })
    .parse(await response.json());
  return { factorId: parsed.id, secret: parsed.totp.secret, uri: parsed.totp.uri };
}

export async function challengeFactor(accessToken: string, factorId: string): Promise<string> {
  const configuration = supabaseConfiguration();
  const response = await fetch(`${configuration.url}/auth/v1/factors/${factorId}/challenge`, {
    method: "POST",
    headers: { apikey: configuration.key, Authorization: `Bearer ${accessToken}` },
    cache: "no-store"
  });
  if (!response.ok) {
    throw new Error("Não foi possível iniciar a confirmação do autenticador.");
  }
  return z.object({ id: z.string() }).parse(await response.json()).id;
}

/**
 * A successful verify returns a brand-new Supabase session already at AAL2, which
 * replaces the caller's cookies exactly like a fresh sign-in would.
 */
export async function verifyFactor(
  accessToken: string,
  factorId: string,
  challengeId: string,
  code: string
): Promise<void> {
  const configuration = supabaseConfiguration();
  const response = await fetch(`${configuration.url}/auth/v1/factors/${factorId}/verify`, {
    method: "POST",
    headers: {
      apikey: configuration.key,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ challenge_id: challengeId, code }),
    cache: "no-store"
  });
  if (!response.ok) {
    throw new Error("Código inválido ou expirado.");
  }
  await applySession(authResponseSchema.parse(await response.json()));
}

/**
 * Public signup is disabled, so an invitee has no Supabase account to sign in
 * with. The admin endpoint creates one on the strength of an unexpired,
 * single-use invitation token that the caller has already verified, and marks
 * the address confirmed because possession of the emailed link is the proof.
 */
export async function createInvitedAuthUser(email: string, password: string): Promise<void> {
  const configuration = supabaseConfiguration();
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (secret === undefined) {
    throw new Error("Supabase admin access is not configured.");
  }

  const response = await fetch(`${configuration.url}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: secret,
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ email, password, email_confirm: true }),
    cache: "no-store"
  });

  // A repeated submission finds the account already there; signing in afterwards
  // still succeeds, so this is not an error worth surfacing.
  if (response.status === 422 || response.status === 409) return;
  if (!response.ok) {
    throw new Error("Não foi possível criar seu acesso. Tente novamente.");
  }
}

export async function signOut(): Promise<void> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("gm-access")?.value;
  if (accessToken !== undefined) {
    const configuration = supabaseConfiguration();
    await fetch(`${configuration.url}/auth/v1/logout`, {
      method: "POST",
      headers: {
        apikey: configuration.key,
        Authorization: `Bearer ${accessToken}`
      },
      cache: "no-store"
    });
  }
  cookieStore.delete("gm-access");
  cookieStore.delete("gm-refresh");
}

export async function requireAccessToken(): Promise<string> {
  const accessToken = (await cookies()).get("gm-access")?.value;
  if (accessToken === undefined) {
    redirect("/login");
  }
  return accessToken;
}
