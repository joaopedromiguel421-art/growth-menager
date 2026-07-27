import { describe, expect, it } from "vitest";
import { isPublicAddress, SafeFetchClient, UnsafeUrlError } from "./safe-fetch.js";

describe("SEO SafeFetch", () => {
  it("blocks private and reserved addresses", () => {
    for (const address of [
      "127.0.0.1",
      "10.0.0.1",
      "169.254.169.254",
      "192.168.1.1",
      "::1",
      "fd00::1",
      "2001:db8::1"
    ]) {
      expect(isPublicAddress(address), address).toBe(false);
    }
    expect(isPublicAddress("8.8.8.8")).toBe(true);
    expect(isPublicAddress("2606:4700:4700::1111")).toBe(true);
  });

  it("revalidates DNS after every redirect", async () => {
    const resolutions: string[] = [];
    const client = new SafeFetchClient(
      (url) =>
        Promise.resolve(
          typeof url === "string" && url.includes("first.example")
            ? new Response(null, { status: 302, headers: { Location: "https://second.example/" } })
            : new Response("ok", { status: 200, headers: { "Content-Type": "text/html" } })
        ),
      (hostname) => {
        resolutions.push(hostname);
        return Promise.resolve(["8.8.8.8"]);
      }
    );
    const result = await client.fetch("https://first.example/");
    expect(result.finalUrl).toBe("https://second.example/");
    expect(resolutions).toEqual(["first.example", "second.example"]);
  });

  it("blocks a redirect that resolves to metadata service", async () => {
    const client = new SafeFetchClient(
      () =>
        Promise.resolve(
          new Response(null, { status: 302, headers: { Location: "https://internal.example/" } })
        ),
      (hostname) =>
        Promise.resolve([hostname === "internal.example" ? "169.254.169.254" : "8.8.8.8"])
    );
    await expect(client.fetch("https://public.example/")).rejects.toBeInstanceOf(UnsafeUrlError);
  });

  it("stops reading a body above the configured limit", async () => {
    const client = new SafeFetchClient(
      () => Promise.resolve(new Response("123456", { headers: { "Content-Type": "text/html" } })),
      () => Promise.resolve(["8.8.8.8"])
    );
    await expect(client.fetch("https://example.com/", { maxBytes: 5 })).rejects.toThrow(
      "byte limit"
    );
  });
});
