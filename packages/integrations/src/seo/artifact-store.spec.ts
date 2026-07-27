import { describe, expect, it, vi } from "vitest";
import { SupabaseRawArtifactStore } from "./artifact-store.js";

describe("SupabaseRawArtifactStore", () => {
  it("stores canonical HTML in the private reports bucket without upsert", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 201 }));
    const store = new SupabaseRawArtifactStore({
      supabaseUrl: "https://example.supabase.co",
      secretKey: "service-secret",
      fetchImpl
    });
    const result = await store.putText({
      tenantId: "tenant-a",
      category: "seo",
      artifactId: "run-a",
      value: "<!doctype html><title>SEO</title>",
      bucket: "reports",
      contentType: "text/html"
    });
    expect(result.objectKey).toBe("tenant-a/seo/run-a.html");
    const call = fetchImpl.mock.calls[0];
    expect(call?.[0]).toBe(
      "https://example.supabase.co/storage/v1/object/reports/tenant-a/seo/run-a.html"
    );
    expect(call?.[1]?.method).toBe("POST");
    const headers = new Headers(call?.[1]?.headers);
    expect(headers.get("Content-Type")).toBe("text/html");
    expect(headers.get("x-upsert")).toBe("false");
  });
});
