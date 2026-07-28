import { Inject, Injectable } from "@nestjs/common";
import type { Tenant, TenantCreate, TenantUpdate } from "@growth-manager/contracts";
import { sql, type DatabaseClient } from "@growth-manager/database";
import { DomainError, requirePermission, type TenantContext } from "@growth-manager/domain";
import { DATABASE } from "./database.provider.js";

interface TenantRow extends Record<string, unknown> {
  readonly id: string;
  readonly organization_id: string;
  readonly organization_name: string;
  readonly name: string;
  readonly legal_name: string | null;
  readonly slug: string;
  readonly status: string;
  readonly industry: string | null;
  readonly country_code: string;
  readonly timezone: string;
  readonly locale: string;
  readonly onboarding_step: number;
  readonly created_at: Date | string;
  readonly version: number;
}

/**
 * Turns a client's name into a URL-safe slug matching the check constraint on
 * app.tenants.slug. Accents are stripped rather than dropped so "São João"
 * becomes "sao-joao" instead of "s-o-jo-o".
 */
export function deriveSlug(value: string): string {
  const slug = value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 76)
    .replace(/-+$/g, "");
  // A name written entirely in a non-Latin script leaves nothing behind, and the
  // database would reject an empty slug.
  return slug.length >= 2 ? slug : "cliente";
}

// Codes the plpgsql provisioning functions raise, mapped to the message the
// operator sees. Anything else stays an unexpected error.
const provisioningErrors: Readonly<Record<string, { message: string; retryable: boolean }>> = {
  "GM-AUTHZ-NO-ACCOUNT": {
    message: "Sua conta de acesso ainda não está vinculada a um usuário do Growth Manager.",
    retryable: false
  },
  "GM-AUTHZ-DENIED": {
    message: "Você não tem permissão para criar clientes nesta organização.",
    retryable: false
  },
  "GM-TENANT-NAME-REQUIRED": { message: "Informe o nome do cliente.", retryable: false },
  "GM-ORGANIZATION-DETAILS-REQUIRED": {
    message: "Informe o nome e o e-mail de cobrança da nova organização.",
    retryable: false
  },
  "GM-TENANT-SLUG-CONFLICT": {
    message: "Já existem clientes demais com esse nome. Use um nome mais específico.",
    retryable: false
  },
  "GM-ORGANIZATION-SLUG-CONFLICT": {
    message: "Já existe uma organização com esse nome.",
    retryable: false
  }
};

@Injectable()
export class TenantsService {
  public constructor(@Inject(DATABASE) private readonly client: DatabaseClient) {}

  /**
   * Creation runs before any tenant exists, so it cannot use withTenant and the
   * usual app.idempotency_records table is unavailable — its tenant_id is NOT
   * NULL. The unique (organization_id, slug) constraint provides the practical
   * guarantee instead: a retried submission lands on the same slug and returns
   * the existing client rather than creating a second one.
   */
  public async create(input: TenantCreate, authUserId: string): Promise<Tenant> {
    const slug = input.slug ?? deriveSlug(input.name);
    const organizationSlug =
      input.organization_name === undefined ? null : deriveSlug(input.organization_name);

    try {
      return await this.client.database.transaction(async (transaction) => {
        await transaction.execute(sql`select set_config('app.auth_user_id', ${authUserId}, true)`);

        const rows = await transaction.execute<TenantRow>(sql`
          select * from app.create_tenant(
            ${input.organization_id}::uuid,
            ${input.organization_name ?? null},
            ${organizationSlug},
            ${input.billing_email ?? null},
            ${input.name},
            ${input.legal_name},
            ${slug},
            ${input.industry},
            ${input.country_code},
            ${input.timezone},
            ${input.locale}
          )
        `);

        const row = rows[0];
        if (row === undefined) {
          throw new DomainError("GM-TENANT-NOT-CREATED", "O cliente não foi criado.", true);
        }
        return toTenant(row);
      });
    } catch (error) {
      throw this.translate(error);
    }
  }

  public update(context: TenantContext, input: TenantUpdate): Promise<Tenant> {
    requirePermission(context, "tenant.update");
    return this.client.withTenant(context, async (database) => {
      const rows = await database.execute<TenantRow>(sql`
        update app.tenants t
        set name = coalesce(${input.name ?? null}, t.name),
            legal_name = ${input.legal_name === undefined ? sql`t.legal_name` : input.legal_name},
            industry = ${input.industry === undefined ? sql`t.industry` : input.industry},
            timezone = coalesce(${input.timezone ?? null}, t.timezone),
            locale = coalesce(${input.locale ?? null}, t.locale),
            status = coalesce(${input.status ?? null}, t.status),
            onboarding_step = coalesce(${input.onboarding_step ?? null}, t.onboarding_step),
            updated_at = now(),
            version = t.version + 1
        from app.organizations o
        where t.id = ${context.tenantId}
          and t.version = ${input.version}
          and o.id = t.organization_id
        returning t.id, t.organization_id, o.name as organization_name, t.name, t.legal_name,
                  t.slug, t.status, t.industry, t.country_code, t.timezone, t.locale,
                  t.onboarding_step, t.created_at, t.version
      `);

      const row = rows[0];
      if (row === undefined) {
        // Either the version moved under us or RLS hid the row; both mean the
        // caller's copy is stale and should be reloaded before retrying.
        throw new DomainError(
          "GM-TENANT-VERSION-CONFLICT",
          "O cliente foi alterado por outra pessoa. Recarregue e tente de novo.",
          false
        );
      }
      return toTenant(row);
    });
  }

  public get(context: TenantContext): Promise<Tenant> {
    requirePermission(context, "tenant.read");
    return this.client.withTenant(context, async (database) => {
      const rows = await database.execute<TenantRow>(sql`
        select t.id, t.organization_id, o.name as organization_name, t.name, t.legal_name,
               t.slug, t.status, t.industry, t.country_code, t.timezone, t.locale,
               t.onboarding_step, t.created_at, t.version
        from app.tenants t
        join app.organizations o on o.id = t.organization_id
        where t.id = ${context.tenantId}
        limit 1
      `);
      const row = rows[0];
      if (row === undefined) {
        throw new DomainError("GM-TENANT-NOT-FOUND", "Cliente não encontrado.", false);
      }
      return toTenant(row);
    });
  }

  private translate(error: unknown): unknown {
    if (error instanceof DomainError) return error;
    const message = error instanceof Error ? error.message : "";
    for (const [code, mapped] of Object.entries(provisioningErrors)) {
      if (message.includes(code)) {
        return new DomainError(code as `GM-${string}`, mapped.message, mapped.retryable);
      }
    }
    return error;
  }
}

function toTenant(row: TenantRow): Tenant {
  return {
    id: row.id,
    organization_id: row.organization_id,
    organization_name: row.organization_name,
    name: row.name,
    legal_name: row.legal_name,
    slug: row.slug,
    status: row.status as Tenant["status"],
    industry: row.industry,
    country_code: row.country_code,
    timezone: row.timezone,
    locale: row.locale,
    // postgres-js returns int2/int4 as numbers, which is what TenantRow declares.
    onboarding_step: row.onboarding_step,
    created_at: new Date(row.created_at).toISOString(),
    version: row.version
  };
}
