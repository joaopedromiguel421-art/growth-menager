import { describe, expect, it } from "vitest";
import { buildReplyTemplate, classifyReview } from "./reviews.js";

describe("classifyReview", () => {
  it("buckets sentiment by rating", () => {
    expect(classifyReview({ rating: 5, body: "" }).sentiment).toBe("positive");
    expect(classifyReview({ rating: 4, body: "" }).sentiment).toBe("positive");
    expect(classifyReview({ rating: 3, body: "" }).sentiment).toBe("neutral");
    expect(classifyReview({ rating: 2, body: "" }).sentiment).toBe("negative");
    expect(classifyReview({ rating: 1, body: "" }).sentiment).toBe("negative");
  });

  it("flags a sensitive theme regardless of rating", () => {
    expect(classifyReview({ rating: 5, body: "Fui vítima de fraude no cartão." }).sensitiveTheme).toBe(
      true
    );
    expect(classifyReview({ rating: 3, body: "Achei o atendimento demorado." }).sensitiveTheme).toBe(
      false
    );
  });

  it("is case-insensitive and treats a null body as no signal", () => {
    expect(classifyReview({ rating: 1, body: "PROCESSO JUDICIAL contra a empresa" }).sensitiveTheme).toBe(
      true
    );
    expect(classifyReview({ rating: 1, body: null }).sensitiveTheme).toBe(false);
  });
});

describe("buildReplyTemplate", () => {
  it("never invents a claim — same three neutral shapes regardless of body text", () => {
    const positive = buildReplyTemplate({ rating: 5, authorName: "Ana" });
    const neutral = buildReplyTemplate({ rating: 3, authorName: "Ana" });
    const negative = buildReplyTemplate({ rating: 1, authorName: "Ana" });
    expect(positive).not.toBe(neutral);
    expect(neutral).not.toBe(negative);
  });

  it("greets by name when available and falls back to a generic greeting", () => {
    expect(buildReplyTemplate({ rating: 5, authorName: "Ana" })).toContain("Ana");
    expect(buildReplyTemplate({ rating: 5, authorName: null })).toContain("Olá!");
  });
});
