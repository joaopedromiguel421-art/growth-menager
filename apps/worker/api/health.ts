import type { VercelRequest, VercelResponse } from "@vercel/node";
import { parseConfig } from "@growth-manager/config";
import { createDatabaseClient, sql } from "@growth-manager/database";

export default async function handler(
  request: VercelRequest,
  response: VercelResponse
): Promise<void> {
  const config = parseConfig(process.env);
  if (request.headers.authorization !== `Bearer ${config.CRON_SECRET}`) {
    response.status(401).json({ error: "invalid_internal_secret" });
    return;
  }

  const database = createDatabaseClient(config.DATABASE_URL);
  try {
    await database.database.execute(sql`select 1 as ready`);
    response.status(200).json({
      status: "ready",
      service: "growth-manager-worker",
      database: "connected"
    });
  } catch {
    response.status(503).json({
      status: "unavailable",
      service: "growth-manager-worker"
    });
  } finally {
    await database.close();
  }
}
