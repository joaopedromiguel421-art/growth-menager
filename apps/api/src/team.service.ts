import { createHash, randomBytes } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { parseConfig, type AppConfig } from "@growth-manager/config";
import type {
  Invitation,
  InvitationAcceptResult,
  InvitationCreate,
  InvitationCreateResult,
  MembershipUpdate,
  TeamMember,
  TeamOverview
} from "@growth-manager/contracts";
import { sql, type DatabaseClient } from "@growth-manager/database";
import { DomainError, newId, requirePermission, type TenantContext } from "@growth-manager/domain";
import { ResendEmailAdapter } from "@growth-manager/integrations";
import { DATABASE } from "./database.provider.js";

interface MemberRow extends Record<string, unknown> {
  readonly membership_id: string;
  readonly user_id: string;
  readonly email: string;
  readonly name: string;
  readonly role: string;
  readonly status: string;
  readonly tenant_id: string | null;
  readonly expires_at: Date | string | null;
  readonly created_at: Date | string;
}

interface InvitationRow extends Record<string, unknown> {
  readonly id: string;
  readonly organization_id: string;
  readonly tenant_id: string | null;
  readonly email: string;
  readonly role: string;
  readonly expires_at: Date | string;
  readonly accepted_at: Date | string | null;
  readonly revoked_at: Date | string | null;
  readonly created_at: Date | string;
}

@Injectable()
export class TeamService {
  private readonly config: AppConfig = parseConfig(process.env);

  public constructor(@Inject(DATABASE) private readonly client: DatabaseClient) {}

  public overview(context: TenantContext): Promise<TeamOverview> {
    requirePermission(context, "members.read");
    return this.client.withTenant(context, async (database) => {
      // Organization-wide memberships (tenant_id is null) grant access to this
      // client too, so they belong on the list even though they name no tenant.
      const members = await database.execute<MemberRow>(sql`
        select m.id as membership_id, u.id as user_id, u.email::text as email, u.name,
               m.role, m.status, m.tenant_id, m.expires_at, m.created_at
        from app.memberships m
        join app.users u on u.id = m.user_id
        where m.organization_id = ${context.organizationId}
          and (m.tenant_id is null or m.tenant_id = ${context.tenantId})
          and m.status <> 'revoked'
        order by u.name
      `);

      const invitations = await database.execute<InvitationRow>(sql`
        select id, organization_id, tenant_id, email::text as email, role,
               expires_at, accepted_at, revoked_at, created_at
        from app.invitations
        where organization_id = ${context.organizationId}
          and (tenant_id is null or tenant_id = ${context.tenantId})
          and accepted_at is null
          and revoked_at is null
          and expires_at > now()
        order by created_at desc
      `);

      return {
        members: members.map(toMember),
        invitations: invitations.map(toInvitation)
      };
    });
  }

  public invite(
    context: TenantContext,
    idempotencyKey: string,
    input: InvitationCreate
  ): Promise<InvitationCreateResult> {
    requirePermission(context, "members.manage");

    // Only the sha256 is stored; the raw token exists solely inside the link.
    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const scopedTenantId = input.scope === "tenant" ? context.tenantId : null;

    return this.client.withTenant(context, async (database) => {
      const existing = await database.execute<InvitationRow>(sql`
        select id from app.invitations
        where organization_id = ${context.organizationId}
          and tenant_id is not distinct from ${scopedTenantId}
          and email = ${input.email}
          and accepted_at is null
          and revoked_at is null
        limit 1
      `);

      // Re-inviting the same address rotates the token instead of piling up
      // rows, so an operator can resend without inventing a cleanup step.
      const rows =
        existing[0] === undefined
          ? await database.execute<InvitationRow>(sql`
              insert into app.invitations (
                id, organization_id, tenant_id, email, role, token_hash,
                expires_at, invited_by
              ) values (
                ${newId()}, ${context.organizationId}, ${scopedTenantId}, ${input.email},
                ${input.role}, decode(${tokenHash}, 'hex'),
                now() + ${`${String(input.expires_in_days)} days`}::interval, ${context.userId}
              )
              returning id, organization_id, tenant_id, email::text as email, role,
                        expires_at, accepted_at, revoked_at, created_at
            `)
          : await database.execute<InvitationRow>(sql`
              update app.invitations
              set token_hash = decode(${tokenHash}, 'hex'),
                  role = ${input.role},
                  expires_at = now() + ${`${String(input.expires_in_days)} days`}::interval,
                  updated_at = now(),
                  version = version + 1
              where id = ${existing[0].id}
              returning id, organization_id, tenant_id, email::text as email, role,
                        expires_at, accepted_at, revoked_at, created_at
            `);

      const row = rows[0];
      if (row === undefined) {
        throw new DomainError("GM-INVITATION-NOT-CREATED", "O convite não foi criado.", true);
      }

      const acceptUrl = `${this.config.PUBLIC_APP_URL.replace(/\/$/, "")}/convite?token=${token}`;
      const emailSent = await this.sendInvite(input.email, acceptUrl, idempotencyKey);

      return { invitation: toInvitation(row), accept_url: acceptUrl, email_sent: emailSent };
    });
  }

  public revokeInvitation(context: TenantContext, invitationId: string): Promise<void> {
    requirePermission(context, "members.manage");
    return this.client.withTenant(context, async (database) => {
      const rows = await database.execute(sql`
        update app.invitations
        set revoked_at = now(), updated_at = now(), version = version + 1
        where id = ${invitationId}
          and organization_id = ${context.organizationId}
          and accepted_at is null
          and revoked_at is null
        returning id
      `);
      if (rows[0] === undefined) {
        throw new DomainError("GM-INVITATION-NOT-FOUND", "Convite não encontrado.", false);
      }
    });
  }

  public updateMembership(
    context: TenantContext,
    membershipId: string,
    input: MembershipUpdate
  ): Promise<TeamMember> {
    requirePermission(context, "members.manage");
    return this.client.withTenant(context, async (database) => {
      const targets = await database.execute<MemberRow>(sql`
        select m.id as membership_id, m.user_id, m.role, m.status, m.organization_id
        from app.memberships m
        where m.id = ${membershipId} and m.organization_id = ${context.organizationId}
      `);
      const target = targets[0];
      if (target === undefined) {
        throw new DomainError("GM-MEMBERSHIP-NOT-FOUND", "Acesso não encontrado.", false);
      }

      // Losing your own access mid-session would lock you out of the screen you
      // are standing on, so it has to be another admin's decision.
      if (target.user_id === context.userId) {
        throw new DomainError(
          "GM-MEMBERSHIP-SELF-CHANGE",
          "Você não pode alterar o próprio acesso. Peça a outro administrador.",
          false
        );
      }

      const losesAdmin = input.status === "revoked" || input.status === "suspended";
      if (losesAdmin && (await this.isLastActiveAdmin(database, context, target.user_id))) {
        throw new DomainError(
          "GM-MEMBERSHIP-LAST-ADMIN",
          "Esta é a última pessoa com administração ativa na organização.",
          false
        );
      }

      const rows = await database.execute<MemberRow>(sql`
        update app.memberships m
        set role = coalesce(${input.role ?? null}, m.role),
            status = coalesce(${input.status ?? null}, m.status),
            updated_at = now(),
            version = m.version + 1
        from app.users u
        where m.id = ${membershipId}
          and m.organization_id = ${context.organizationId}
          and u.id = m.user_id
        returning m.id as membership_id, u.id as user_id, u.email::text as email, u.name,
                  m.role, m.status, m.tenant_id, m.expires_at, m.created_at
      `);
      const row = rows[0];
      if (row === undefined) {
        throw new DomainError("GM-MEMBERSHIP-NOT-FOUND", "Acesso não encontrado.", false);
      }
      return toMember(row);
    });
  }

  /**
   * Runs outside withTenant: the invitee has no membership yet, so there is no
   * tenant context to establish. app.accept_invitation is security definer and
   * performs its own checks against the hashed token and the verified email.
   */
  public async accept(input: {
    readonly token: string;
    readonly authUserId: string;
    readonly email: string;
    readonly name: string;
  }): Promise<InvitationAcceptResult> {
    const tokenHash = createHash("sha256").update(input.token).digest("hex");

    try {
      const rows = await this.client.database.execute<{
        organization_id: string;
        tenant_id: string | null;
        role: string;
      }>(sql`
        select * from app.accept_invitation(
          decode(${tokenHash}, 'hex'),
          ${input.authUserId}::uuid,
          ${input.email},
          ${input.name}
        )
      `);
      const row = rows[0];
      if (row === undefined) {
        throw new DomainError("GM-INVITATION-INVALID", "Convite inválido ou expirado.", false);
      }
      return {
        organization_id: row.organization_id,
        tenant_id: row.tenant_id,
        role: row.role as InvitationAcceptResult["role"]
      };
    } catch (error) {
      if (error instanceof DomainError) throw error;
      const message = error instanceof Error ? error.message : "";
      if (message.includes("GM-INVITATION-EMAIL-MISMATCH")) {
        throw new DomainError(
          "GM-INVITATION-EMAIL-MISMATCH",
          "Este convite foi enviado para outro endereço de e-mail.",
          false
        );
      }
      if (message.includes("GM-INVITATION-INVALID")) {
        throw new DomainError("GM-INVITATION-INVALID", "Convite inválido ou expirado.", false);
      }
      throw error;
    }
  }

  private async isLastActiveAdmin(
    database: Parameters<Parameters<DatabaseClient["withTenant"]>[1]>[0],
    context: TenantContext,
    userId: string
  ): Promise<boolean> {
    const rows = await database.execute<{ remaining: string }>(sql`
      select count(*)::text as remaining
      from app.memberships m
      where m.organization_id = ${context.organizationId}
        and m.status = 'active'
        and m.user_id <> ${userId}
        and m.role in ('platform_admin', 'agency_owner', 'agency_manager', 'client_admin')
    `);
    return Number(rows[0]?.remaining ?? "0") === 0;
  }

  /**
   * A bounced invite must not lose the invitation: the caller falls back to
   * copying accept_url by hand. The raw token is never logged.
   */
  private async sendInvite(
    email: string,
    acceptUrl: string,
    idempotencyKey: string
  ): Promise<boolean> {
    try {
      const adapter = new ResendEmailAdapter(this.config.RESEND_API_KEY);
      await adapter.send({
        from: this.config.RESEND_FROM_EMAIL,
        to: [email],
        subject: "Seu acesso ao Growth Manager",
        html: `<p>Você foi convidado para o Growth Manager.</p><p><a href="${acceptUrl}">Ativar meu acesso</a></p><p>O link expira em alguns dias e só pode ser usado uma vez.</p>`,
        text: `Você foi convidado para o Growth Manager. Ative seu acesso: ${acceptUrl}`,
        idempotencyKey
      });
      return true;
    } catch {
      return false;
    }
  }
}

function toMember(row: MemberRow): TeamMember {
  return {
    membership_id: row.membership_id,
    user_id: row.user_id,
    email: row.email,
    name: row.name,
    role: row.role as TeamMember["role"],
    status: row.status as TeamMember["status"],
    tenant_id: row.tenant_id,
    expires_at: row.expires_at === null ? null : new Date(row.expires_at).toISOString(),
    created_at: new Date(row.created_at).toISOString()
  };
}

function toInvitation(row: InvitationRow): Invitation {
  return {
    id: row.id,
    organization_id: row.organization_id,
    tenant_id: row.tenant_id,
    email: row.email,
    role: row.role as Invitation["role"],
    expires_at: new Date(row.expires_at).toISOString(),
    accepted_at: row.accepted_at === null ? null : new Date(row.accepted_at).toISOString(),
    revoked_at: row.revoked_at === null ? null : new Date(row.revoked_at).toISOString(),
    created_at: new Date(row.created_at).toISOString()
  };
}
