import { Inject, Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";
import type { CurrentSession, Role } from "@growth-manager/contracts";
import type { DatabaseClient } from "@growth-manager/database";
import { DomainError, permissionsForRole } from "@growth-manager/domain";
import { DATABASE } from "./database.provider.js";

// Extending Record<string, unknown> satisfies the row constraint that drizzle's
// execute<T>() imposes without loosening the named columns.
interface SessionRow extends Record<string, unknown> {
  readonly id: string;
  readonly auth_user_id: string;
  readonly email: string;
  readonly name: string;
  readonly locale: string;
  readonly tenants: readonly {
    readonly id: string;
    readonly organization_id: string;
    readonly organization_name: string;
    readonly name: string;
    readonly slug: string;
    readonly status: string;
    readonly timezone: string;
    readonly role: string;
  }[];
}

@Injectable()
export class IdentityService {
  public constructor(@Inject(DATABASE) private readonly client: DatabaseClient) {}

  public async currentSession(input: {
    readonly authUserId: string;
    readonly aal: "aal1" | "aal2";
  }): Promise<CurrentSession> {
    return this.client.database.transaction(async (transaction) => {
      await transaction.execute(
        sql`select set_config('app.auth_user_id', ${input.authUserId}, true)`
      );

      const rows = await transaction.execute<SessionRow>(sql`
        with current_user as (
          select id, auth_user_id, email, name, locale
          from app.users
          where auth_user_id = ${input.authUserId}::uuid and status = 'active'
          limit 1
        )
        select current_user.id,
               current_user.auth_user_id,
               current_user.email,
               current_user.name,
               current_user.locale,
               coalesce((
                 select jsonb_agg(to_jsonb(tenant_row) order by tenant_row.name)
                 from (
                   select distinct on (t.id)
                          t.id,
                          t.organization_id,
                          o.name as organization_name,
                          t.name,
                          t.slug,
                          t.status,
                          t.timezone,
                          m.role
                   from app.tenants t
                   join app.organizations o on o.id = t.organization_id
                   join app.memberships m
                     on m.user_id = current_user.id
                    and m.status = 'active'
                    and (m.expires_at is null or m.expires_at > now())
                    and (m.tenant_id = t.id or (m.tenant_id is null and m.organization_id = t.organization_id))
                   order by t.id, m.tenant_id nulls last, t.name
                 ) tenant_row
               ), '[]'::jsonb) as tenants
        from current_user
      `);
      const session = rows[0];
      if (session === undefined) {
        throw new DomainError(
          "GM-AUTHZ-NO-ACCOUNT",
          "Sua conta de acesso ainda não está vinculada a um usuário do Growth Manager.",
          false
        );
      }

      return {
        user: {
          id: session.id,
          auth_user_id: session.auth_user_id,
          email: session.email,
          name: session.name,
          locale: session.locale,
          aal: input.aal
        },
        tenants: session.tenants
          .map((tenant) => ({
            id: tenant.id,
            organization_id: tenant.organization_id,
            organization_name: tenant.organization_name,
            name: tenant.name,
            slug: tenant.slug,
            status: tenant.status as CurrentSession["tenants"][number]["status"],
            timezone: tenant.timezone,
            role: tenant.role as Role,
            permissions: [...permissionsForRole(tenant.role as Role)]
          }))
          .sort((left, right) => left.name.localeCompare(right.name, "pt-BR"))
      };
    });
  }
}
