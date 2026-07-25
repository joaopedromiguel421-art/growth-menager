import type { VercelRequest, VercelResponse } from "@vercel/node";

let handlerPromise:
  | Promise<(request: VercelRequest, response: VercelResponse) => Promise<void>>
  | undefined;

export default async function handler(
  request: VercelRequest,
  response: VercelResponse
): Promise<void> {
  handlerPromise ??= import("../apps/worker/api/health.js").then((module) => module.default);
  return (await handlerPromise)(request, response);
}
