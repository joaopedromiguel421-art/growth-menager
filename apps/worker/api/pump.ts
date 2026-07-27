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
  // Vercel Cron cannot produce a custom HMAC header, only the standard bearer
  // token it signs every scheduled invocation with, so the scheduled trigger
  // added in vercel.json authenticates the same way api/reconcile.ts already does.
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
