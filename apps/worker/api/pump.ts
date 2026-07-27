import type { VercelRequest, VercelResponse } from "@vercel/node";
import { parseConfig } from "@growth-manager/config";
import { createDatabaseClient } from "@growth-manager/database";
import { verifyWorkerSignature } from "../src/authenticate.js";
import { QueueWorker } from "../src/queue-worker.js";

export default async function handler(
  request: VercelRequest,
  response: VercelResponse
): Promise<void> {
  const config = parseConfig(process.env);
  const body = JSON.stringify(request.body ?? {});
  const signedByWorker = verifyWorkerSignature({
    body,
    timestamp: request.headers["x-worker-timestamp"] as string | undefined,
    signature: request.headers["x-worker-signature"] as string | undefined,
    secret: config.INTERNAL_WORKER_SECRET
  });
  // Hobby-plan Vercel Cron can't run this more often than once a day, so there is
  // no crons entry for this route in vercel.json — /api/reconcile's daily cron
  // covers unattended draining. This bearer path exists so an external scheduler
  // (or a Pro-plan cron, if the account is upgraded later) can call this route
  // more often the same simple way api/reconcile.ts already authenticates.
  const signedByCron = request.headers.authorization === `Bearer ${config.CRON_SECRET}`;
  if (!signedByWorker && !signedByCron) {
    response.status(401).json({ error: "invalid_signature" });
    return;
  }

  const database = createDatabaseClient(config.DATABASE_URL);
  try {
    const result = await new QueueWorker(database).pump(10);
    response.status(200).json(result);
  } finally {
    await database.close();
  }
}
