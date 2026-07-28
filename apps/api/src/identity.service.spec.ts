import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import type { DatabaseClient } from "@growth-manager/database";
import { IdentityService } from "./identity.service.js";

describe("IdentityService", () => {
  it("does not use a PostgreSQL reserved word as the session CTE name", async () => {
    const statements: SQL[] = [];
    const transaction = {
      execute: <T extends Record<string, unknown>>(statement: SQL): Promise<T[]> => {
        statements.push(statement);
        if (statements.length === 1) return Promise.resolve([]);
        return Promise.resolve([
          {
            id: "0198a8f0-1111-7000-8000-000000000001",
            auth_user_id: "0198a8f0-1111-7000-8000-000000000002",
            email: "user@example.com",
            name: "User",
            locale: "pt-BR",
            tenants: []
          }
        ] as unknown as T[]);
      }
    };
    const client = {
      database: {
        transaction: async <T>(
          operation: (database: typeof transaction) => Promise<T>
        ): Promise<T> => operation(transaction)
      }
    } as unknown as DatabaseClient;

    await new IdentityService(client).currentSession({
      authUserId: "0198a8f0-1111-7000-8000-000000000002",
      aal: "aal1"
    });

    expect(statements).toHaveLength(2);
    const sessionStatement = statements[1];
    expect(sessionStatement).toBeDefined();
    if (sessionStatement === undefined) throw new Error("Session query was not executed.");

    const rendered = new PgDialect().sqlToQuery(sessionStatement).sql.replace(/\s+/g, " ");
    expect(rendered).toContain("with session_user_row as (");
    expect(rendered).not.toContain("with current_user as (");
  });
});
