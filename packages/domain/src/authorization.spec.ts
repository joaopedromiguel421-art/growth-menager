import { describe, expect, it } from "vitest";
import { newId, permissionsForRole } from "./index.js";

describe("role permissions", () => {
  it("does not allow viewers to mutate content", () => {
    expect(permissionsForRole("client_viewer").has("content.write")).toBe(false);
  });

  it("allows agency owners to manage tenant deletion", () => {
    expect(permissionsForRole("agency_owner").has("tenant.delete")).toBe(true);
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
