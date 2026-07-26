import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import type { CurrentSession, SessionTenant } from "@growth-manager/contracts";
import { getCurrentSession, type ApiFailure } from "./api";

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

export function initials(value: string): string {
  const parts = value
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0);
  const first = parts[0]?.[0] ?? "?";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return `${first}${last}`.toUpperCase();
}

const roleLabels: Readonly<Record<SessionTenant["role"], string>> = {
  platform_admin: "Administrador da plataforma",
  agency_owner: "Dono da agência",
  agency_manager: "Gestor da agência",
  strategist: "Estrategista",
  content_editor: "Editor de conteúdo",
  analyst: "Analista",
  client_admin: "Administrador do cliente",
  client_approver: "Aprovador do cliente",
  client_viewer: "Visualizador do cliente",
  support: "Suporte"
};

export function roleLabel(role: SessionTenant["role"]): string {
  return roleLabels[role];
}
