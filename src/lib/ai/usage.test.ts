import { describe, expect, it } from "vitest";

import { AI_FEATURES, aiFeatureLabel, isAiFeature } from "@/lib/ai/features";
import { formatDuration, formatShare, formatTokens, formatUsd } from "@/lib/ai/format";
import { DEFAULT_AI_MODEL, DEFAULT_MONTHLY_BUDGET_USD, parseModelId, parseMonthlyBudget } from "@/lib/ai/settings";
import { averageCostUsd, budgetStatus, monthWindow, parseCost, readGatewayMetadata, readTokenUsage } from "@/lib/ai/usage";

describe("readTokenUsage", () => {
  it("reads the AI SDK's usage, reasoning and cached tokens included", () => {
    expect(
      readTokenUsage({
        inputTokens: 120,
        outputTokens: 480,
        totalTokens: 600,
        inputTokenDetails: { noCacheTokens: 20, cacheReadTokens: 100 },
        outputTokenDetails: { textTokens: 80, reasoningTokens: 400 },
      }),
    ).toEqual({ inputTokens: 120, outputTokens: 480, reasoningTokens: 400, cachedInputTokens: 100, totalTokens: 600 });
  });

  it("leaves what the provider did not report empty, and adds up a missing total", () => {
    expect(readTokenUsage({ inputTokens: 10, outputTokens: 5 })).toEqual({
      inputTokens: 10,
      outputTokens: 5,
      reasoningTokens: null,
      cachedInputTokens: null,
      totalTokens: 15,
    });
    expect(readTokenUsage(undefined).totalTokens).toBeNull();
    expect(readTokenUsage({ inputTokens: "12", outputTokens: -4, totalTokens: Number.NaN })).toEqual({
      inputTokens: null,
      outputTokens: null,
      reasoningTokens: null,
      cachedInputTokens: null,
      totalTokens: null,
    });
  });
});

describe("cost", () => {
  it("reads a cost given as a number or a string, and nothing else", () => {
    expect(parseCost(0.0042)).toBe(0.0042);
    expect(parseCost("0.0042")).toBe(0.0042);
    expect(parseCost(0)).toBe(0);
    expect(parseCost("")).toBeNull();
    expect(parseCost("free")).toBeNull();
    expect(parseCost(-1)).toBeNull();
    expect(parseCost(null)).toBeNull();
  });

  it("reads the Gateway's generation ID and cost from the provider metadata", () => {
    expect(readGatewayMetadata({ gateway: { generationId: "gen_123", cost: "0.00031" } })).toEqual({
      generationId: "gen_123",
      costUsd: 0.00031,
    });
    expect(readGatewayMetadata({ gateway: { generationId: "gen_123" } })).toEqual({ generationId: "gen_123", costUsd: null });
    expect(readGatewayMetadata(undefined)).toEqual({ generationId: null, costUsd: null });
    expect(readGatewayMetadata({ openai: {} })).toEqual({ generationId: null, costUsd: null });
  });

  it("averages over the requests whose cost is known", () => {
    expect(averageCostUsd({ costUsd: 0.06, costedRequests: 3 })).toBeCloseTo(0.02);
    expect(averageCostUsd({ costUsd: 0, costedRequests: 0 })).toBeNull();
  });
});

describe("budgetStatus", () => {
  it("reports what is spent and left of the budget", () => {
    expect(budgetStatus(2.5, 10)).toEqual({ budgetUsd: 10, spentUsd: 2.5, remainingUsd: 7.5, used: 0.25, over: false });
  });

  it("never shows a negative remainder when overspent", () => {
    const status = budgetStatus(10.4, 10)!;
    expect(status.over).toBe(true);
    expect(status.remainingUsd).toBe(0);
    expect(status.used).toBeCloseTo(1.04);
  });

  it("is absent when no budget is shown", () => {
    expect(budgetStatus(3, null)).toBeNull();
    expect(budgetStatus(3, 0)).toBeNull();
  });
});

describe("monthWindow", () => {
  it("is the UTC calendar month, the clock the Gateway's budget resets on", () => {
    // 5 PM on September 30 in Arizona is already October 1 in UTC.
    expect(monthWindow(Date.parse("2026-09-30T17:00:00-07:00"))).toEqual({
      key: "2026-10",
      label: "October 2026",
      start: "2026-10-01T00:00:00.000Z",
      end: "2026-11-01T00:00:00.000Z",
    });
    expect(monthWindow(Date.parse("2026-12-15T12:00:00Z")).end).toBe("2027-01-01T00:00:00.000Z");
  });
});

describe("settings", () => {
  it("uses the default model unless AI_MODEL is a provider/model ID", () => {
    expect(parseModelId(undefined)).toBe(DEFAULT_AI_MODEL);
    expect(parseModelId("  ")).toBe(DEFAULT_AI_MODEL);
    expect(parseModelId("gpt-5")).toBe(DEFAULT_AI_MODEL);
    expect(parseModelId("openai/gpt 5")).toBe(DEFAULT_AI_MODEL);
    expect(parseModelId(" openai/gpt-5.6-luna ")).toBe("openai/gpt-5.6-luna");
    expect(parseModelId("anthropic/claude-sonnet-5.5")).toBe("anthropic/claude-sonnet-5.5");
  });

  it("reads the display budget, with 0 meaning none", () => {
    expect(parseMonthlyBudget(undefined)).toBe(DEFAULT_MONTHLY_BUDGET_USD);
    expect(parseMonthlyBudget("")).toBe(DEFAULT_MONTHLY_BUDGET_USD);
    expect(parseMonthlyBudget("25")).toBe(25);
    expect(parseMonthlyBudget("$7.50")).toBe(7.5);
    expect(parseMonthlyBudget("0")).toBeNull();
    expect(parseMonthlyBudget("lots")).toBe(DEFAULT_MONTHLY_BUDGET_USD);
    expect(parseMonthlyBudget("-5")).toBe(DEFAULT_MONTHLY_BUDGET_USD);
  });
});

describe("features", () => {
  it("names every feature, and shows an unknown key as it was logged", () => {
    expect(isAiFeature("connection_test")).toBe(true);
    expect(isAiFeature("toString")).toBe(false);
    expect(aiFeatureLabel("generate_service_plan")).toBe(AI_FEATURES.generate_service_plan.label);
    expect(aiFeatureLabel("retired_feature")).toBe("retired_feature");
  });
});

describe("format", () => {
  it("keeps fractions of a cent readable", () => {
    expect(formatUsd(0)).toBe("$0.00");
    expect(formatUsd(0.0042)).toBe("$0.0042");
    expect(formatUsd(2.5)).toBe("$2.50");
    expect(formatUsd(1234.5)).toBe("$1,234.50");
  });

  it("writes tokens, durations and shares", () => {
    expect(formatTokens(12345)).toBe("12,345");
    expect(formatDuration(850)).toBe("850 ms");
    expect(formatDuration(2400)).toBe("2.4 s");
    expect(formatDuration(65_000)).toBe("1 min 5 s");
    expect(formatShare(0.126)).toBe("13%");
    expect(formatShare(0.001)).toBe("<1%");
    expect(formatShare(0)).toBe("0%");
    expect(formatShare(1.04)).toBe("104%");
  });
});
