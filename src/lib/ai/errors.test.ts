import { describe, expect, it } from "vitest";

import { classifyAiError, sanitizeDetail } from "@/lib/ai/errors";

/** An error shaped like the AI SDK's Gateway errors: a name, a Gateway `type` and an HTTP status. */
function gatewayError(name: string, type: string, statusCode: number, message = "Request failed") {
  return Object.assign(new Error(message), { name, type, statusCode });
}

describe("classifyAiError", () => {
  it("reads the Gateway's own error types", () => {
    expect(classifyAiError(gatewayError("GatewayAuthenticationError", "authentication_error", 401)).code).toBe("auth");
    expect(classifyAiError(gatewayError("GatewayForbiddenError", "forbidden", 403)).code).toBe("auth");
    expect(classifyAiError(gatewayError("GatewayRateLimitError", "rate_limit_exceeded", 429)).code).toBe("rate-limited");
    expect(classifyAiError(gatewayError("GatewayModelNotFoundError", "model_not_found", 404)).code).toBe("model-unavailable");
    expect(classifyAiError(gatewayError("GatewayTimeoutError", "timeout_error", 408)).code).toBe("timeout");
    expect(classifyAiError(gatewayError("GatewayResponseError", "response_error", 502)).code).toBe("invalid-response");
    expect(classifyAiError(gatewayError("GatewayInternalServerError", "internal_server_error", 500)).code).toBe("provider");
  });

  it("calls a spent budget a budget, even when it arrives as an internal server error", () => {
    const spent = gatewayError(
      "GatewayInternalServerError",
      "internal_server_error",
      402,
      "Project budget exceeded. Current spend: $10.00, limit: $10.00. Please contact your administrator to increase the budget.",
    );
    expect(classifyAiError(spent).code).toBe("budget");
    // Recognized by its wording alone, should the status be lost on the way.
    const reworded = gatewayError("GatewayInternalServerError", "internal_server_error", 500, 'Quota limit exceeded for "key".');
    expect(classifyAiError(reworded).code).toBe("budget");
  });

  it("recognizes a refused key as the AI SDK rewrites it, with no status or type", () => {
    const production = Object.assign(new Error("Unauthenticated. Configure AI_GATEWAY_API_KEY or use a provider module."), {
      name: "GatewayError",
    });
    expect(classifyAiError(production).code).toBe("auth");
    const development = classifyAiError(new Error("\u001b[1m\u001b[31mUnauthenticated request to AI Gateway.\u001b[0m"));
    expect(development).toEqual({ code: "auth", detail: "Error: Unauthenticated request to AI Gateway.", generationId: null });
  });

  it("looks inside a retry's last error and an error's cause", () => {
    const limited = gatewayError("GatewayRateLimitError", "rate_limit_exceeded", 429);
    const retried = Object.assign(new Error("Failed after 2 attempts."), { name: "AI_RetryError", lastError: limited });
    expect(classifyAiError(retried).code).toBe("rate-limited");
    expect(classifyAiError(new Error("wrapped", { cause: limited })).code).toBe("rate-limited");
  });

  it("treats an aborted or timed-out request as a timeout", () => {
    expect(classifyAiError(Object.assign(new Error("This operation was aborted"), { name: "AbortError" })).code).toBe("timeout");
    expect(classifyAiError(Object.assign(new Error("The operation timed out"), { name: "TimeoutError" })).code).toBe("timeout");
  });

  it("treats an answer that cannot be parsed as an invalid response", () => {
    const unparsed = Object.assign(new Error("No object generated"), { name: "AI_NoObjectGeneratedError" });
    expect(classifyAiError(unparsed).code).toBe("invalid-response");
  });

  it("falls back to unknown for anything else, without throwing", () => {
    expect(classifyAiError(new Error("boom")).code).toBe("unknown");
    expect(classifyAiError("boom")).toEqual({ code: "unknown", detail: "Error: boom", generationId: null });
    expect(classifyAiError(null).code).toBe("unknown");
    expect(classifyAiError(undefined).code).toBe("unknown");
  });

  it("keeps the Gateway's generation ID and a short detail with the status", () => {
    const failed = classifyAiError(
      Object.assign(gatewayError("GatewayInternalServerError", "internal_server_error", 500, "Upstream failed"), {
        generationId: "gen_01ARZ3NDEKTSV4RRFFQ69G5FAV",
      }),
    );
    expect(failed.generationId).toBe("gen_01ARZ3NDEKTSV4RRFFQ69G5FAV");
    expect(failed.detail).toBe("GatewayInternalServerError (500): Upstream failed");
  });

  it("survives an error that is its own cause", () => {
    const loop: Error & { cause?: unknown } = new Error("loop");
    loop.cause = loop;
    expect(classifyAiError(loop).code).toBe("unknown");
  });
});

describe("sanitizeDetail", () => {
  it("removes anything that looks like a credential", () => {
    const detail = sanitizeDetail(
      'Invalid key vck_3xAmPle0fAK3yV4lu3ThatIsLong99 sent as Bearer abc.def.ghi for "api_key_id_k9Jd82hQmZ7pLw4Tn1Vx6Bc3"',
    );
    expect(detail).not.toContain("vck_3xAmPle0fAK3yV4lu3ThatIsLong99");
    expect(detail).not.toContain("abc.def.ghi");
    expect(detail).not.toContain("k9Jd82hQmZ7pLw4Tn1Vx6Bc3");
    expect(detail).toContain("[redacted]");
  });

  it("leaves ordinary words alone, and keeps the detail short", () => {
    expect(sanitizeDetail("GatewayInternalServerError  (500):\n Upstream   failed")).toBe(
      "GatewayInternalServerError (500): Upstream failed",
    );
    expect(sanitizeDetail("x".repeat(1000))).toHaveLength(300);
  });
});
