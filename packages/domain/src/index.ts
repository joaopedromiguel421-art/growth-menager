import type { Permission, Role } from "@growth-manager/contracts";

export * from "./scoring.js";
export * from "./reviews.js";
export * from "./seo.js";
export * from "./errors.js";
export * from "./costs.js";
import { DomainError } from "./errors.js";

export interface TenantContext {
  readonly tenantId: string;
  readonly userId: string;
  readonly authUserId: string;
  readonly organizationId: string;
  readonly requestId: string;
  readonly traceId: string;
  readonly permissions: ReadonlySet<Permission>;
  readonly systemActor: boolean;
}

const permissionsByRole: Readonly<Record<Role, readonly Permission[]>> = {
  platform_admin: [
    "tenant.read",
    "tenant.create",
    "tenant.update",
    "members.read",
    "members.manage",
    "connections.read",
    "connections.manage",
    "metrics.read",
    "seo.read",
    "seo.manage",
    "seo.run",
    "seo.findings.manage",
    "recommendations.read",
    "recommendations.decide",
    "tasks.read",
    "tasks.write",
    "reviews.read",
    "reviews.reply",
    "content.read",
    "content.write",
    "approvals.read",
    "approvals.decide",
    "reports.read",
    "reports.approve",
    "reports.deliver",
    "costs.read",
    "costs.manage",
    "audit.read",
    "support.grant",
    "tenant.delete"
  ],
  agency_owner: [
    "tenant.read",
    "tenant.create",
    "tenant.update",
    "members.read",
    "members.manage",
    "connections.read",
    "connections.manage",
    "metrics.read",
    "seo.read",
    "seo.manage",
    "seo.run",
    "seo.findings.manage",
    "recommendations.read",
    "recommendations.decide",
    "tasks.read",
    "tasks.write",
    "reviews.read",
    "reviews.reply",
    "content.read",
    "content.write",
    "approvals.read",
    "approvals.decide",
    "reports.read",
    "reports.approve",
    "reports.deliver",
    "costs.read",
    "costs.manage",
    "audit.read",
    "support.grant",
    "tenant.delete"
  ],
  agency_manager: [
    "tenant.read",
    "tenant.create",
    "tenant.update",
    "members.read",
    "members.manage",
    "connections.read",
    "connections.manage",
    "metrics.read",
    "seo.read",
    "seo.manage",
    "seo.run",
    "seo.findings.manage",
    "recommendations.read",
    "recommendations.decide",
    "tasks.read",
    "tasks.write",
    "reviews.read",
    "reviews.reply",
    "content.read",
    "content.write",
    "approvals.read",
    "approvals.decide",
    "reports.read",
    "reports.approve",
    "reports.deliver",
    "costs.read",
    "audit.read"
  ],
  strategist: [
    "tenant.read",
    "connections.read",
    "metrics.read",
    "seo.read",
    "seo.manage",
    "seo.run",
    "seo.findings.manage",
    "recommendations.read",
    "recommendations.decide",
    "tasks.read",
    "tasks.write",
    "reviews.read",
    "content.read",
    "content.write",
    "approvals.read",
    "reports.read",
    "costs.read"
  ],
  content_editor: [
    "tenant.read",
    "seo.read",
    "recommendations.read",
    "tasks.read",
    "tasks.write",
    "reviews.read",
    "reviews.reply",
    "content.read",
    "content.write",
    "approvals.read",
    "reports.read"
  ],
  analyst: [
    "tenant.read",
    "connections.read",
    "metrics.read",
    "seo.read",
    "seo.run",
    "recommendations.read",
    "tasks.read",
    "reviews.read",
    "content.read",
    "reports.read",
    "costs.read"
  ],
  client_admin: [
    "tenant.read",
    "tenant.update",
    "members.read",
    "members.manage",
    "connections.read",
    "metrics.read",
    "seo.read",
    "seo.manage",
    "seo.run",
    "seo.findings.manage",
    "recommendations.read",
    "recommendations.decide",
    "tasks.read",
    "tasks.write",
    "reviews.read",
    "content.read",
    "approvals.read",
    "approvals.decide",
    "reports.read",
    "reports.approve",
    "costs.read"
  ],
  client_approver: [
    "tenant.read",
    "metrics.read",
    "seo.read",
    "seo.findings.manage",
    "recommendations.read",
    "tasks.read",
    "reviews.read",
    "content.read",
    "approvals.read",
    "approvals.decide",
    "reports.read",
    "reports.approve"
  ],
  client_viewer: [
    "tenant.read",
    "metrics.read",
    "seo.read",
    "recommendations.read",
    "tasks.read",
    "reviews.read",
    "content.read",
    "approvals.read",
    "reports.read"
  ],
  support: ["tenant.read", "connections.read", "audit.read"]
};

export function permissionsForRole(role: Role): ReadonlySet<Permission> {
  return new Set(permissionsByRole[role]);
}

export function requirePermission(context: TenantContext, permission: Permission): void {
  if (!context.permissions.has(permission)) {
    throw new DomainError("GM-AUTHZ-DENIED", "Você não tem permissão para esta ação.", false);
  }
}

export function newId(now = Date.now()): string {
  const timestamp = now.toString(16).padStart(12, "0").slice(-12);
  const random = Array.from(crypto.getRandomValues(new Uint8Array(10)), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
  const variant = ((Number.parseInt(random[3] ?? "0", 16) & 0x3) | 0x8).toString(16);
  return `${timestamp.slice(0, 8)}-${timestamp.slice(8)}-7${random.slice(0, 3)}-${variant}${random.slice(4, 7)}-${random.slice(7, 19)}`;
}
