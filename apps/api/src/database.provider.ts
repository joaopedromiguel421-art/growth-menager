import type { Provider } from "@nestjs/common";
import { createDatabaseClient, type DatabaseClient } from "@growth-manager/database";
import { parseConfig } from "@growth-manager/config";

export const DATABASE = Symbol("DATABASE");

export const databaseProvider: Provider<DatabaseClient> = {
  provide: DATABASE,
  useFactory: (): DatabaseClient => {
    const config = parseConfig(process.env);
    return createDatabaseClient(config.DATABASE_URL);
  }
};
