import { describe, expect, it } from "vitest";
import { deriveSlug } from "./tenants.service.js";

describe("deriveSlug", () => {
  it("strips Portuguese accents instead of dropping the letters", () => {
    expect(deriveSlug("Padaria São João")).toBe("padaria-sao-joao");
    expect(deriveSlug("Clínica Coração")).toBe("clinica-coracao");
    expect(deriveSlug("Açaí & Cia")).toBe("acai-cia");
  });

  it("produces a slug the database check constraint accepts", () => {
    for (const name of ["Padaria São João", "  Espaços  ", "UPPER CASE", "a/b\\c"]) {
      expect(deriveSlug(name)).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it("never emits a leading or trailing hyphen", () => {
    expect(deriveSlug("  Padaria  ")).toBe("padaria");
    expect(deriveSlug("!!!Aurora!!!")).toBe("aurora");
  });

  it("stays within the column length with room for a collision suffix", () => {
    expect(deriveSlug("a".repeat(200)).length).toBe(76);
  });

  it("falls back when the name leaves nothing usable", () => {
    // An empty slug would violate the check constraint, and "1" is under the
    // two-character minimum the contract enforces.
    expect(deriveSlug("日本語")).toBe("cliente");
    expect(deriveSlug("!!!")).toBe("cliente");
    expect(deriveSlug("x")).toBe("cliente");
  });
});
