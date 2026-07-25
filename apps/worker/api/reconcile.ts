import type { VercelRequest, VercelResponse } from "@vercel/node";
import { parseConfig } from "@growth-manager/config";
import { createDatabaseClient } from "@growth-manager/database";
import { QueueWorker } from "../src/queue-worker.js";

export default async function handler(
  request: VercelRequest,
  response: VercelResponse
): Promise<void> {
  const config = parseConfig(process.env);
  if (request.headers.authorization !== `Bearer ${config.CRON_SECRET}`) {
    response.status(401).json({ error: "invalid_cron_secret" });
    return;
  }

  const database = createDatabaseClient(config.DATABASE_URL);
  try {
    const result = await new QueueWorker(database).pump(25);
    response.status(200).json(result);
  } finally {
    await database.close();
  }
}
