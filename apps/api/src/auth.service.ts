import { Inject, Injectable } from "@nestjs/common";
import type { Role } from "@growth-manager/contracts";
import { and, eq, isNull, or, schema, sql, type DatabaseClient } from "@growth-manager/database";
import { DomainError, permissionsForRole, type TenantContext } from "@growth-manager/domain";
import { DATABASE } from "./database.provider.js";

@Injectable()
export class AuthorizationService {
  public constructor(@Inject(DATABASE) private readonly client: DatabaseClient) {}

  public async resolveContext(input: {
    readonly authUserId: string;
    readonly tenantId: string;
    readonly requestId: string;
    readonly traceId: string;
  }): Promise<TenantContext> {
    return this.client.database.transaction(async (transaction) => {
      await transaction.execute(sql`
        select
          set_config('app.auth_user_id', ${input.authUserId}, true),
          set_config('app.tenant_id', ${input.tenantId}, true)
      `);

      const records = await transaction
        .select({
          userId: schema.users.id,
          organizationId: schema.memberships.organizationId,
          role: schema.memberships.role
        })
        .from(schema.users)
        .innerJoin(schema.memberships, eq(schema.memberships.userId, schema.users.id))
        .innerJoin(schema.tenants, eq(schema.tenants.id, input.tenantId))
        .where(
          and(
            eq(schema.users.authUserId, input.authUserId),
            eq(schema.memberships.status, "active"),
            or(
              eq(schema.memberships.tenantId, input.tenantId),
              and(
                isNull(schema.memberships.tenantId),
                eq(schema.memberships.organizationId, schema.tenants.organizationId)
              )
            )
          )
        )
        .limit(1);

      const record = records[0];
      if (record === undefined) {
        throw new DomainError("GM-AUTHZ-DENIED", "Tenant não encontrado.", false);
      }

      const role = record.role as Role;
      return {
        tenantId: input.tenantId,
        userId: record.userId,
        authUserId: input.authUserId,
        organizationId: record.organizationId,
        requestId: input.requestId,
        traceId: input.traceId,
        permissions: permissionsForRole(role),
        systemActor: false
      };
    });
  }
}
