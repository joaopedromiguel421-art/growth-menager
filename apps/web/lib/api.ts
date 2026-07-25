import "server-only";
import { dashboardSchema, type Dashboard } from "@growth-manager/contracts";
import { requireAccessToken } from "./auth";

export async function getDashboard(tenantId: string): Promise<Dashboard | null> {
  const apiBaseUrl = process.env.API_BASE_URL;
  if (apiBaseUrl === undefined) return null;

  const accessToken = await requireAccessToken();
  const response = await fetch(`${apiBaseUrl}/v1/tenants/${tenantId}/dashboard`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "x-tenant-id": tenantId,
      "x-request-id": crypto.randomUUID()
    },
    cache: "no-store"
  });
  if (!response.ok) return null;
  return dashboardSchema.parse(await response.json());
}
