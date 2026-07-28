import { describe, expect, it, vi } from "vitest";
import { createLocalPost } from "./api.js";

describe("createLocalPost", () => {
  it("sends an idempotent-sized standard post to the selected location", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ name: "accounts/1/locations/2/localPosts/3" }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );

    const result = await createLocalPost(
      {
        accessToken: "access-token",
        locationExternalId: "accounts/1/locations/2",
        summary: "Novidade da semana"
      },
      fetchImpl
    );

    expect(result.externalId).toBe("accounts/1/locations/2/localPosts/3");
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      "https://mybusiness.googleapis.com/v4/accounts/1/locations/2/localPosts"
    );
  });

  it("rejects text above the provider limit before making a request", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    await expect(
      createLocalPost(
        {
          accessToken: "access-token",
          locationExternalId: "accounts/1/locations/2",
          summary: "x".repeat(1501)
        },
        fetchImpl
      )
    ).rejects.toThrow("between 1 and 1500");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
