import { describe, expect, it } from "vitest"

import { extractHeuristicResponseErrorMessage } from "~/services/apiTransport/responseError"

describe("extractHeuristicResponseErrorMessage", () => {
  it.each([
    "message",
    "msg",
    "error_description",
    "detail",
    "error",
    "reason",
    "title",
  ])("prioritizes the %s field over an unrelated string", (key) => {
    expect(
      extractHeuristicResponseErrorMessage({
        [key]: "Preferred error",
        debug:
          "This unrelated diagnostic string is deliberately longer than the preferred error",
      }),
    ).toBe("Preferred error")
  })

  it("prefers higher-ranked and shallower message fields", () => {
    expect(
      extractHeuristicResponseErrorMessage({
        msg: "A much longer secondary message",
        message: "Primary message",
      }),
    ).toBe("Primary message")

    expect(
      extractHeuristicResponseErrorMessage({
        message: "Shallow message",
        nested: { message: "A much longer nested message" },
      }),
    ).toBe("Shallow message")
  })

  it("finds case-insensitive message fields through arrays", () => {
    expect(
      extractHeuristicResponseErrorMessage({
        problem: { contexts: [{ MESSAGE: "Nested deployment error" }] },
      }),
    ).toBe("Nested deployment error")
  })

  it("uses the longest reasonable string when no known field exists", () => {
    expect(
      extractHeuristicResponseErrorMessage({
        status: "failed",
        context: {
          hint: "Retry later",
          explanation:
            "The deployment rejected this request because its capacity is exhausted",
        },
      }),
    ).toBe(
      "The deployment rejected this request because its capacity is exhausted",
    )
  })

  it("may surface a safe code string without interpreting its semantics", () => {
    expect(
      extractHeuristicResponseErrorMessage({
        error: { code: "gateway_denied" },
      }),
    ).toBe("gateway_denied")
  })

  it("skips sensitive values while retaining non-sensitive messages", () => {
    expect(
      extractHeuristicResponseErrorMessage({
        hint: "Request blocked by the upstream gateway",
        secret:
          "credential-value-that-is-deliberately-longer-than-the-safe-error-hint",
      }),
    ).toBe("Request blocked by the upstream gateway")
  })

  it.each([
    "session",
    "token",
    "access_token",
    "refresh_token",
    "authorization",
    "cookie",
    "credential",
    "secret",
  ])("rejects a known message below the sensitive %s key", (sensitiveKey) => {
    expect(
      extractHeuristicResponseErrorMessage({
        [sensitiveKey]: {
          message: "credential-value-must-not-be-selected",
        },
      }),
    ).toBeUndefined()
  })

  it("rejects known messages nested anywhere below a sensitive key", () => {
    expect(
      extractHeuristicResponseErrorMessage({
        access_token: {
          metadata: {
            detail: "credential-detail-must-not-be-selected",
          },
        },
      }),
    ).toBeUndefined()
  })

  it("rejects obvious payload strings even under known fields", () => {
    expect(
      extractHeuristicResponseErrorMessage({
        message:
          "<html><body>Access verification page with a lot of markup</body></html>",
        redirect:
          "https://example.invalid/a/very/long/internal/error/redirect/path",
        session: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJleGFtcGxlIn0.signature-value",
        hint: "Gateway rejected the request",
      }),
    ).toBe("Gateway rejected the request")
  })

  it.each([
    {
      name: "a JWT-like value",
      message: "aaaaaaaa.bbbbbbbb.cccccccc",
    },
    { name: "an encoded payload", message: "A".repeat(80) },
    { name: "an oversized payload", message: "oversized payload ".repeat(120) },
  ])("rejects $name", ({ message }) => {
    expect(extractHeuristicResponseErrorMessage({ message })).toBeUndefined()
  })

  it.each([
    "Authorization: Bearer example-secret-value",
    "Cookie: sid=example-secret-value",
    "access_token=example-secret-value",
    "key=example-secret-value",
    "credential: example-secret-value",
    "session=example-secret-value",
  ])("rejects credential-shaped scalar candidates: %s", (candidate) => {
    expect(extractHeuristicResponseErrorMessage(candidate)).toBeUndefined()
    expect(
      extractHeuristicResponseErrorMessage({ message: candidate }),
    ).toBeUndefined()
  })

  it("retains ordinary authentication failure messages", () => {
    expect(
      extractHeuristicResponseErrorMessage({
        message: "Authorization failed because the session expired",
      }),
    ).toBe("Authorization failed because the session expired")
  })

  it("accepts a reasonable scalar body and rejects bodies without one", () => {
    expect(
      extractHeuristicResponseErrorMessage("Upstream capacity is exhausted"),
    ).toBe("Upstream capacity is exhausted")
    expect(
      extractHeuristicResponseErrorMessage({
        message: "<html><body>Access verification</body></html>",
        authorization: "Bearer credential-value",
        redirect: "https://example.invalid/error/details",
      }),
    ).toBeUndefined()
  })

  it("handles cycles without losing the best candidate", () => {
    const body: Record<string, unknown> = {
      hint: "Request failed safely",
    }
    body.self = body

    expect(extractHeuristicResponseErrorMessage(body)).toBe(
      "Request failed safely",
    )
  })

  it("accepts messages at the depth limit and rejects messages beyond it", () => {
    expect(
      extractHeuristicResponseErrorMessage({
        a: { b: { c: { d: { message: "At the depth limit" } } } },
      }),
    ).toBe("At the depth limit")

    expect(
      extractHeuristicResponseErrorMessage({
        a: { b: { c: { d: { e: { message: "Too deeply nested" } } } } },
      }),
    ).toBeUndefined()
  })

  it("stops at the work limit", () => {
    const wideBody = Object.fromEntries(
      Array.from({ length: 100 }, (_, index) => [`field${index}`, index]),
    )
    Object.assign(wideBody, { message: "Outside the work budget" })

    expect(extractHeuristicResponseErrorMessage(wideBody)).toBeUndefined()
  })
})
