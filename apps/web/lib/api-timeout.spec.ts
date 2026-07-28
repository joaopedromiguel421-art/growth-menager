import { describe, expect, it } from "vitest";
import { resolveApiTimeout } from "./api-timeout";

describe("resolveApiTimeout", () => {
  it("allows the documented 10 second visual timeout for reads", () => {
    expect(resolveApiTimeout("GET")).toBe(10_000);
  });

  it("keeps synchronous mutations within the documented 8 second boundary", () => {
    expect(resolveApiTimeout("POST")).toBe(8_000);
    expect(resolveApiTimeout("PATCH")).toBe(8_000);
    expect(resolveApiTimeout("PUT")).toBe(8_000);
    expect(resolveApiTimeout("DELETE")).toBe(8_000);
  });

  it("honors an explicit timeout for operations with a narrower budget", () => {
    expect(resolveApiTimeout("GET", 2_500)).toBe(2_500);
  });
});
