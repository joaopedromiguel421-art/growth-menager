import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import type { CurrentSession, SessionTenant } from "@growth-manager/contracts";
import { getCurrentSession, type ApiFailure } from "./api";
export { initials, roleLabel } from "./workspace-display";

export const ACTIVE_TENANT_COOKIE = "gm-tenant";

export interface Workspace {
  readonly session: CurrentSession;
  readonly activeTenant: SessionTenant | null;
}

export type WorkspaceResult =
  | { readonly ok: true; readonly workspace: Workspace }
  | { readonly ok: false; readonly failure: ApiFailure };

/**
 * Resolves who is signed in and which tenant they are looking at. Cached per
 * request so the layout, navigation and page share a single API round trip.
 */
export const loadWorkspace = cache(async (): Promise<WorkspaceResult> => {
  const result = await getCurrentSession();
  if (!result.ok) return { ok: false, failure: result };

  const selectedId = (await cookies()).get(ACTIVE_TENANT_COOKIE)?.value;
  const selected = result.data.tenants.find((tenant) => tenant.id === selectedId);
  return {
    ok: true,
    workspace: {
      session: result.data,
      activeTenant: selected ?? result.data.tenants[0] ?? null
    }
  };
});
