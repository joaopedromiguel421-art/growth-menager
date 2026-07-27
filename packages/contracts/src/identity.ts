import { z } from "zod";
import { isoDateTimeSchema, tenantIdSchema, uuidSchema } from "./common.js";

export const roleSchema = z.enum([
  "platform_admin",
  "agency_owner",
  "agency_manager",
  "strategist",
  "content_editor",
  "analyst",
  "client_admin",
  "client_approver",
  "client_viewer",
  "support"
]);

export const permissionSchema = z.enum([
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
]);

export const sessionSchema = z
  .object({
    user_id: uuidSchema,
    email: z.email(),
    name: z.string().min(1).max(160),
    aal: z.enum(["aal1", "aal2"]),
    active_tenant_id: tenantIdSchema.nullable(),
    expires_at: isoDateTimeSchema
  })
  .strict();

export const membershipSchema = z
  .object({
    id: uuidSchema,
    organization_id: uuidSchema,
    tenant_id: tenantIdSchema.nullable(),
    user_id: uuidSchema,
    role: roleSchema,
    status: z.enum(["active", "suspended", "revoked"]),
    expires_at: isoDateTimeSchema.nullable()
  })
  .strict();

export const sessionTenantSchema = z
  .object({
    id: tenantIdSchema,
    organization_id: uuidSchema,
    organization_name: z.string().min(1).max(160),
    name: z.string().min(1).max(160),
    slug: z.string().min(1).max(80),
    status: z.enum(["onboarding", "active", "suspended", "closing", "closed"]),
    timezone: z.string().min(1).max(64),
    role: roleSchema,
    permissions: z.array(permissionSchema)
  })
  .strict();

export const currentUserSchema = z
  .object({
    id: uuidSchema,
    auth_user_id: uuidSchema,
    email: z.email(),
    name: z.string().min(1).max(160),
    locale: z.string().min(2).max(16),
    aal: z.enum(["aal1", "aal2"])
  })
  .strict();

export const currentSessionSchema = z
  .object({
    user: currentUserSchema,
    tenants: z.array(sessionTenantSchema)
  })
  .strict();

export type Role = z.infer<typeof roleSchema>;
export type Permission = z.infer<typeof permissionSchema>;
export type Session = z.infer<typeof sessionSchema>;
export type Membership = z.infer<typeof membershipSchema>;
export type SessionTenant = z.infer<typeof sessionTenantSchema>;
export type CurrentUser = z.infer<typeof currentUserSchema>;
export type CurrentSession = z.infer<typeof currentSessionSchema>;
