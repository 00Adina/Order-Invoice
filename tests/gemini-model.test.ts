import { describe, expect, it } from "vitest";
import { rankChatModel } from "@/lib/ai/providers/gemini";

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
