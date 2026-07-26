import { createHash, randomBytes } from "node:crypto";

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";

export type GoogleProvider = "google_business" | "search_console" | "ga4";

export const GOOGLE_SCOPES: Readonly<Record<GoogleProvider, readonly string[]>> = {
  google_business: ["https://www.googleapis.com/auth/business.manage"],
  search_console: ["https://www.googleapis.com/auth/webmasters.readonly"],
  ga4: ["https://www.googleapis.com/auth/analytics.readonly"]
};

export interface GoogleOAuthConfig {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly redirectUri: string;
}

export interface PkcePair {
  readonly verifier: string;
  readonly challenge: string;
}

export interface GoogleTokens {
  readonly accessToken: string;
  readonly refreshToken: string | null;
  readonly expiresAt: Date;
  readonly scopes: readonly string[];
}

export function createPkcePair(): PkcePair {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}

export function createStateToken(): string {
  return randomBytes(32).toString("base64url");
}

export function authorizationUrl(input: {
  readonly config: GoogleOAuthConfig;
  readonly provider: GoogleProvider;
  readonly state: string;
  readonly challenge: string;
}): string {
  const url = new URL(AUTH_ENDPOINT);
  url.searchParams.set("client_id", input.config.clientId);
  url.searchParams.set("redirect_uri", input.config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_SCOPES[input.provider].join(" "));
  url.searchParams.set("state", input.state);
  url.searchParams.set("code_challenge", input.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  // Google only returns a refresh token on the first consent unless prompt=consent
  // forces the dialog, and offline access is what makes unattended syncs possible.
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  return url.toString();
}

export async function exchangeCode(input: {
  readonly config: GoogleOAuthConfig;
  readonly code: string;
  readonly verifier: string;
}): Promise<GoogleTokens> {
  return tokenRequest({
    client_id: input.config.clientId,
    client_secret: input.config.clientSecret,
    redirect_uri: input.config.redirectUri,
    grant_type: "authorization_code",
    code: input.code,
    code_verifier: input.verifier
  });
}

export async function refreshAccessToken(input: {
  readonly config: GoogleOAuthConfig;
  readonly refreshToken: string;
}): Promise<GoogleTokens> {
  const tokens = await tokenRequest({
    client_id: input.config.clientId,
    client_secret: input.config.clientSecret,
    grant_type: "refresh_token",
    refresh_token: input.refreshToken
  });
  // A refresh response omits the refresh token; the caller must keep the stored one.
  return { ...tokens, refreshToken: tokens.refreshToken ?? input.refreshToken };
}

export async function revokeToken(token: string): Promise<void> {
  await fetch(REVOKE_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }).toString()
  });
}

async function tokenRequest(params: Readonly<Record<string, string>>): Promise<GoogleTokens> {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString()
  });

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`Google token request failed with status ${response.status.toString()}`);
  }
  if (!isTokenResponse(body)) {
    throw new Error("Google returned an unrecognised token response");
  }

  return {
    accessToken: body.access_token,
    refreshToken: typeof body.refresh_token === "string" ? body.refresh_token : null,
    expiresAt: new Date(Date.now() + body.expires_in * 1000),
    scopes: typeof body.scope === "string" ? body.scope.split(" ") : []
  };
}

interface TokenResponse {
  readonly access_token: string;
  readonly expires_in: number;
  readonly refresh_token?: unknown;
  readonly scope?: unknown;
}

function isTokenResponse(value: unknown): value is TokenResponse {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.access_token === "string" && typeof candidate.expires_in === "number";
}
