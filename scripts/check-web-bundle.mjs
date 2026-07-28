import { gzipSync } from "node:zlib";
import { readFile } from "node:fs/promises";
import path from "node:path";

const budgetBytes = 300 * 1024;
const webRoot = path.resolve("apps/web");
const statsPath = path.join(webRoot, ".next/diagnostics/route-bundle-stats.json");
const stats = JSON.parse(await readFile(statsPath, "utf8"));

if (!Array.isArray(stats)) {
  throw new Error("Next.js route bundle diagnostics are unavailable.");
}

const centralRoutes = stats.filter(
  (entry) =>
    typeof entry?.route === "string" &&
    (entry.route === "/login" || entry.route === "/app" || entry.route.startsWith("/app/"))
);

const results = [];
for (const entry of centralRoutes) {
  let gzipBytes = 0;
  for (const chunk of entry.firstLoadChunkPaths ?? []) {
    gzipBytes += gzipSync(await readFile(path.join(webRoot, chunk))).byteLength;
  }
  results.push({ route: entry.route, gzipBytes });
}

for (const result of results.sort((left, right) => right.gzipBytes - left.gzipBytes)) {
  console.log(`${result.route}: ${(result.gzipBytes / 1024).toFixed(1)} KiB gzip`);
}

const failures = results.filter((result) => result.gzipBytes > budgetBytes);
if (failures.length > 0) {
  throw new Error(
    `Initial JavaScript budget exceeded: ${failures.map((item) => item.route).join(", ")}`
  );
}
