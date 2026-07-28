import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import type { TenantContext } from "@growth-manager/domain";
import * as schema from "./schema.js";

export { and, desc, eq, gte, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
export type { SQL } from "drizzle-orm";

export type Database = PostgresJsDatabase<typeof schema>;
export type TenantTransaction<T> = (database: Database) => Promise<T>;

export interface DatabaseClient {
  readonly database: Database;
  readonly close: () => Promise<void>;
  readonly withTenant: <T>(context: TenantContext, operation: TenantTransaction<T>) => Promise<T>;
}

export function createDatabaseClient(databaseUrl: string): DatabaseClient {
  const client = postgres(databaseUrl, {
    max: 8,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false
  });
  const database = drizzle(client, { schema });

  return {
    database,
    close: async () => client.end({ timeout: 5 }),
    withTenant: async <T>(context: TenantContext, operation: TenantTransaction<T>): Promise<T> =>
      database.transaction(async (transaction) => {
        await transaction.execute(sql`
          select
            set_config('app.tenant_id', ${context.tenantId}, true),
            set_config('app.user_id', ${context.userId}, true),
            set_config('app.auth_user_id', ${context.authUserId}, true),
            set_config('app.system_actor', ${String(context.systemActor)}, true)
        `);
        return operation(transaction);
      })
  };
}

export * as schema from "./schema.js";
