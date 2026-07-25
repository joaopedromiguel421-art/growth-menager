import { parseConfig } from "@growth-manager/config";
import { createDatabaseClient } from "@growth-manager/database";
import { QueueWorker } from "./queue-worker.js";

const config = parseConfig(process.env);
const database = createDatabaseClient(config.DATABASE_URL);
const worker = new QueueWorker(database);

const result = await worker.pump(10);
console.info(JSON.stringify(result));
await database.close();
