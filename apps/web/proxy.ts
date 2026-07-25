import { NextResponse, type NextRequest } from "next/server";

interface RefreshedSession {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresIn: number;
}

const sessionCookie = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/"
};

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const accessToken = request.cookies.get("gm-access")?.value;
  const refreshToken = request.cookies.get("gm-refresh")?.value;
  const protectedRoute = request.nextUrl.pathname.startsWith("/app");

  if (mustAuthenticate(protectedRoute, accessToken, refreshToken)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (mustLeaveLogin(request.nextUrl.pathname, accessToken, refreshToken)) {
    return NextResponse.redirect(new URL("/app", request.url));
  }

  if (mustRefresh(protectedRoute, accessToken, refreshToken)) {
    const refreshed = await refreshSession(refreshToken);
    if (refreshed === null) {
      const redirectResponse = NextResponse.redirect(new URL("/login", request.url));
      redirectResponse.cookies.delete("gm-access");
      redirectResponse.cookies.delete("gm-refresh");
      return redirectResponse;
    }

    request.cookies.set("gm-access", refreshed.accessToken);
    request.cookies.set("gm-refresh", refreshed.refreshToken);
    const refreshedResponse = NextResponse.next({ request });
    refreshedResponse.cookies.set("gm-access", refreshed.accessToken, {
      ...sessionCookie,
      maxAge: refreshed.expiresIn
    });
    refreshedResponse.cookies.set("gm-refresh", refreshed.refreshToken, {
      ...sessionCookie,
      maxAge: 30 * 24 * 60 * 60
    });
    refreshedResponse.headers.set("Cache-Control", "private, no-store");
    return refreshedResponse;
  }

  const response = NextResponse.next();
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

function mustAuthenticate(
  protectedRoute: boolean,
  accessToken: string | undefined,
  refreshToken: string | undefined
): boolean {
  return protectedRoute && accessToken === undefined && refreshToken === undefined;
}

function mustLeaveLogin(
  pathname: string,
  accessToken: string | undefined,
  refreshToken: string | undefined
): boolean {
  return pathname === "/login" && (accessToken !== undefined || refreshToken !== undefined);
}

function mustRefresh(
  protectedRoute: boolean,
  accessToken: string | undefined,
  refreshToken: string | undefined
): refreshToken is string {
  return protectedRoute && accessToken === undefined && refreshToken !== undefined;
}

async function refreshSession(refreshToken: string): Promise<RefreshedSession | null> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (url === undefined || key === undefined) return null;

  const response = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: {
      apikey: key,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ refresh_token: refreshToken }),
    cache: "no-store"
  });
  if (!response.ok) return null;

  const body: unknown = await response.json();
  if (!isRefreshedSession(body)) return null;
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresIn: body.expires_in
  };
}

function isRefreshedSession(body: unknown): body is {
  readonly access_token: string;
  readonly refresh_token: string;
  readonly expires_in: number;
} {
  if (typeof body !== "object" || body === null) return false;
  const record = body as Record<string, unknown>;
  return (
    typeof record.access_token === "string" &&
    typeof record.refresh_token === "string" &&
    typeof record.expires_in === "number"
  );
}

export const config = {
  matcher: ["/app/:path*", "/login"]
};
