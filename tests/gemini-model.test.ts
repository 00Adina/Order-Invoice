import { describe, expect, it } from "vitest";
import { rankChatModel, thinkingConfigFor } from "@/lib/ai/providers/gemini";

describe("rankChatModel", () => {
  const pick = (names: string[]) =>
    names
      .map((n) => ({ n, s: rankChatModel(n, ["generateContent"]) }))
      .filter((x) => x.s !== null)
      .sort((a, b) => b.s! - a.s!)[0]?.n;

  it("prefers the newest stable flash model", () => {
    expect(pick(["models/gemini-2.5-flash", "models/gemini-3.8-flash", "models/gemini-3.8-flash-lite", "models/gemini-4-flash-preview"])).toBe(
      "models/gemini-3.8-flash",
    );
    expect(pick(["models/gemini-2.5-flash", "models/gemini-3-flash-preview-0905"])).toBe("models/gemini-3-flash-preview-0905");
  });

  it("ignores models that can't chat", () => {
    expect(rankChatModel("models/gemini-3.8-flash-tts", ["generateContent"])).toBeNull();
    expect(rankChatModel("models/gemini-3.8-flash-image", ["generateContent"])).toBeNull();
    expect(rankChatModel("models/gemini-3.8-pro", ["generateContent"])).toBeNull();
    expect(rankChatModel("models/gemini-3.8-flash", ["embedContent"])).toBeNull();
    expect(rankChatModel("models/text-embedding-004", ["embedContent"])).toBeNull();
  });
});

describe("thinkingConfigFor", () => {
  it("uses thinking levels on Gemini 3+, budgets on 2.5, nothing on older models", () => {
    expect(thinkingConfigFor("gemini-3.8-flash", "low")).toEqual({ thinkingLevel: "LOW" });
    expect(thinkingConfigFor("models/gemini-4-flash", "minimal")).toEqual({ thinkingLevel: "MINIMAL" });
    expect(thinkingConfigFor("gemini-2.5-flash", "low")).toEqual({ thinkingBudget: 512 });
    expect(thinkingConfigFor("gemini-2.5-pro", "minimal")).toEqual({ thinkingBudget: 128 });
    expect(thinkingConfigFor("gemini-2.0-flash", "low")).toBeUndefined();
  });
});
