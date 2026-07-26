import { z } from "zod";
import { isoDateTimeSchema, tenantIdSchema, uuidSchema } from "./common.js";
import { roleSchema } from "./identity.js";

/**
 * platform_admin and support are operational roles granted out of band; letting
 * an invite hand them out would turn any org admin into a platform operator.
 */
export const invitableRoleSchema = z.enum([
  "agency_owner",
  "agency_manager",
  "strategist",
  "content_editor",
  "analyst",
  "client_admin",
  "client_approver",
  "client_viewer"
]);

export const teamMemberSchema = z
  .object({
    membership_id: uuidSchema,
    user_id: uuidSchema,
    email: z.email(),
    name: z.string().min(1).max(160),
    role: roleSchema,
    status: z.enum(["active", "suspended", "revoked"]),
    // Null means the membership is organization-wide rather than per client.
    tenant_id: tenantIdSchema.nullable(),
    expires_at: isoDateTimeSchema.nullable(),
    created_at: isoDateTimeSchema
  })
  .strict();

export const invitationSchema = z
  .object({
    id: uuidSchema,
    organization_id: uuidSchema,
    tenant_id: tenantIdSchema.nullable(),
    email: z.email(),
    role: invitableRoleSchema,
    expires_at: isoDateTimeSchema,
    accepted_at: isoDateTimeSchema.nullable(),
    revoked_at: isoDateTimeSchema.nullable(),
    created_at: isoDateTimeSchema
  })
  .strict();

export const invitationCreateSchema = z
  .object({
    email: z.email(),
    role: invitableRoleSchema,
    // "tenant" limits access to the active client; "organization" spans every client.
    scope: z.enum(["tenant", "organization"]).default("tenant"),
    expires_in_days: z.number().int().min(1).max(30).default(7)
  })
  .strict();

/**
 * The raw token is never stored: only its sha256 lives in app.invitations, and
 * it reaches the invitee through the emailed link alone.
 */
export const invitationCreateResultSchema = z
  .object({
    invitation: invitationSchema,
    accept_url: z.url(),
    email_sent: z.boolean()
  })
  .strict();

export const invitationAcceptSchema = z
  .object({
    token: z.string().trim().min(32).max(128)
  })
  .strict();

export const invitationAcceptResultSchema = z
  .object({
    tenant_id: tenantIdSchema.nullable(),
    organization_id: uuidSchema,
    role: roleSchema
  })
  .strict();

export const membershipUpdateSchema = z
  .object({
    role: invitableRoleSchema.optional(),
    status: z.enum(["active", "suspended", "revoked"]).optional()
  })
  .strict()
  .refine(
    (value) => value.role !== undefined || value.status !== undefined,
    "Informe ao menos um campo para atualizar."
  );

export const teamOverviewSchema = z
  .object({
    members: z.array(teamMemberSchema),
    invitations: z.array(invitationSchema)
  })
  .strict();

export type InvitableRole = z.infer<typeof invitableRoleSchema>;
export type TeamMember = z.infer<typeof teamMemberSchema>;
export type Invitation = z.infer<typeof invitationSchema>;
export type InvitationCreate = z.infer<typeof invitationCreateSchema>;
export type InvitationCreateResult = z.infer<typeof invitationCreateResultSchema>;
export type InvitationAccept = z.infer<typeof invitationAcceptSchema>;
export type InvitationAcceptResult = z.infer<typeof invitationAcceptResultSchema>;
export type MembershipUpdate = z.infer<typeof membershipUpdateSchema>;
export type TeamOverview = z.infer<typeof teamOverviewSchema>;
