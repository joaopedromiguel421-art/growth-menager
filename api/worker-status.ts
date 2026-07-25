import type { VercelRequest, VercelResponse } from "@vercel/node";

export default function handler(_request: VercelRequest, response: VercelResponse): void {
  response.status(200).setHeader("Cache-Control", "no-store").json({
    status: "ok",
    service: "growth-manager-worker",
    health: "/api/health",
    web: "https://growth-menager-web.vercel.app"
  });
}
