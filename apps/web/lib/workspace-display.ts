import type { SessionTenant } from "@growth-manager/contracts";

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
