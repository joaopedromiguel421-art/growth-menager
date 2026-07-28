import { Injectable } from "@nestjs/common";
import type { Dashboard } from "@growth-manager/contracts";

const DASHBOARD_TTL_MS = 60_000;

interface CacheEntry {
  readonly expiresAt: number;
  readonly value: Dashboard;
}

@Injectable()
export class DashboardCacheService {
  private readonly entries = new Map<string, CacheEntry>();

  public get(tenantId: string, now = Date.now()): Dashboard | undefined {
    const entry = this.entries.get(tenantId);
    if (entry === undefined) return undefined;
    if (entry.expiresAt <= now) {
      this.entries.delete(tenantId);
      return undefined;
    }
    return entry.value;
  }

  public set(tenantId: string, value: Dashboard, now = Date.now()): void {
    this.entries.set(tenantId, { value, expiresAt: now + DASHBOARD_TTL_MS });
  }

  public invalidate(tenantId: string): void {
    this.entries.delete(tenantId);
  }
}
