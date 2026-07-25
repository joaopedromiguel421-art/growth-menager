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

  const session = authResponseSchema.parse(await response.json());
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
