import { describe, expect, it } from "vitest";
import { dashboardFixture } from "@growth-manager/test-kit";
import { DashboardCacheService } from "./dashboard-cache.service.js";

describe("DashboardCacheService", () => {
  it("isolates entries by tenant and expires them after 60 seconds", () => {
    const cache = new DashboardCacheService();
    const first = dashboardFixture({ alerts_open: 1 });
    const second = dashboardFixture({ alerts_open: 2 });

    cache.set("tenant-a", first, 1_000);
    cache.set("tenant-b", second, 1_000);

    expect(cache.get("tenant-a", 60_999)?.alerts_open).toBe(1);
    expect(cache.get("tenant-b", 60_999)?.alerts_open).toBe(2);
    expect(cache.get("tenant-a", 61_000)).toBeUndefined();
  });

  it("invalidates a tenant without touching another tenant", () => {
    const cache = new DashboardCacheService();
    cache.set("tenant-a", dashboardFixture({ alerts_open: 1 }), 1_000);
    cache.set("tenant-b", dashboardFixture({ alerts_open: 2 }), 1_000);

    cache.invalidate("tenant-a");

    expect(cache.get("tenant-a", 1_001)).toBeUndefined();
    expect(cache.get("tenant-b", 1_001)?.alerts_open).toBe(2);
  });
});
