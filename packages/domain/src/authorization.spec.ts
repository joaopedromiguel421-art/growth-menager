import { describe, expect, it } from "vitest";
import {
  DomainError,
  newId,
  permissionsForRole,
  requirePermission,
  type TenantContext
} from "./index.js";

function contextFor(role: Parameters<typeof permissionsForRole>[0]): TenantContext {
  return {
    tenantId: "01954d2e-3b80-7000-8000-000000000001",
    userId: "01954d2e-3b80-7000-8000-000000000002",
    authUserId: "01954d2e-3b80-7000-8000-000000000003",
    organizationId: "01954d2e-3b80-7000-8000-000000000004",
    requestId: "request-0001",
    traceId: "trace-0001",
    permissions: permissionsForRole(role),
    systemActor: false
  };
}

describe("role permissions", () => {
  it("does not allow viewers to mutate content", () => {
    expect(permissionsForRole("client_viewer").has("content.write")).toBe(false);
  });

  it("allows agency owners to manage tenant deletion", () => {
    expect(permissionsForRole("agency_owner").has("tenant.delete")).toBe(true);
  });

  it("grants tenant.create only to the roles that may onboard a client", () => {
    for (const role of ["platform_admin", "agency_owner", "agency_manager"] as const) {
      expect(permissionsForRole(role).has("tenant.create")).toBe(true);
    }
    for (const role of [
      "strategist",
      "content_editor",
      "analyst",
      "client_admin",
      "client_approver",
      "client_viewer",
      "support"
    ] as const) {
      expect(permissionsForRole(role).has("tenant.create")).toBe(false);
    }
  });

  it("keeps invite power with admins only", () => {
    expect(permissionsForRole("client_admin").has("members.manage")).toBe(true);
    expect(permissionsForRole("analyst").has("members.manage")).toBe(false);
  });
});

describe("requirePermission", () => {
  it("passes when the role holds the permission", () => {
    expect(() => {
      requirePermission(contextFor("agency_owner"), "tenant.create");
    }).not.toThrow();
  });

  it("raises a denial the error filter can map", () => {
    try {
      requirePermission(contextFor("client_viewer"), "tenant.create");
      expect.unreachable("expected a DomainError");
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe("GM-AUTHZ-DENIED");
      expect((error as DomainError).retryable).toBe(false);
    }
  });
});

describe("newId", () => {
  it("creates a time-sortable UUIDv7", () => {
    const earlier = newId(1_700_000_000_000);
    const later = newId(1_700_000_000_001);

    expect(earlier).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
    expect(earlier < later).toBe(true);
  });
});
