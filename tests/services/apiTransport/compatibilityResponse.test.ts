import { describe, expect, it } from "vitest"

import { mapCompatibilityResponse } from "~/services/apiTransport/compatibilityResponse"
import { ApiError } from "~/services/apiTransport/errors"

describe("mapCompatibilityResponse", () => {
  it("does not inspect the heuristic body after a provider message is found", () => {
    const body = new Proxy<Record<string, unknown>>(
      {},
      {
        ownKeys: () => {
          throw new Error("heuristic body must not be inspected")
        },
      },
    )

    expect(() =>
      mapCompatibilityResponse(
        { ok: false, status: 400, headers: {}, body },
        {
          endpoint: "/api/example",
          responseType: "json",
          onlyData: true,
          decodeApplicationError: true,
          errorResponseDecoder: () => ({
            kind: "http",
            message: "Provider message",
          }),
        },
      ),
    ).toThrow("Provider message")
  })

  it.each([
    ["a plain-text body", { "content-type": "text/plain" }, "Forbidden"],
    ["a body with no content type", {}, "Forbidden"],
    [
      "a JSON-looking body behind a non-JSON content type",
      { "content-type": "text/html" },
      '{"message":"Forbidden"}',
    ],
  ])(
    "marks the message of %s as not the site's own",
    (_name, headers, body) => {
      // An interceptor page or a proxy refusal must not make the site look like
      // it refused the request, whatever wording the page happens to use. The
      // text stays displayable, but callers that decide from it are told.
      let error: unknown

      try {
        mapCompatibilityResponse(
          { ok: false, status: 403, headers, body },
          {
            endpoint: "/api/example",
            responseType: "json",
            onlyData: true,
            decodeApplicationError: true,
          },
        )
      } catch (caught) {
        error = caught
      }

      expect(error).toBeInstanceOf(ApiError)
      expect((error as Error).message).toBe(body)
      expect((error as ApiError).unattributedMessage).toBe(true)
    },
  )

  it("marks a heuristic message recovered from an unrecognized JSON body", () => {
    // A proxy or CDN can answer with its own JSON (`{"error": ...}`) and a JSON
    // content type. Nothing there is the site's envelope, so the text is not the
    // site's claim either: attribution follows where the message came from, not
    // what the response called itself.
    let error: unknown

    try {
      mapCompatibilityResponse(
        {
          ok: false,
          status: 403,
          headers: { "content-type": "application/json" },
          body: { error: "Forbidden", detail: "permission denied by proxy" },
        },
        {
          endpoint: "/api/example",
          responseType: "json",
          onlyData: true,
          decodeApplicationError: true,
        },
      )
    } catch (caught) {
      error = caught
    }

    expect(error).toBeInstanceOf(ApiError)
    expect((error as Error).message).toBe("permission denied by proxy")
    expect((error as ApiError).unattributedMessage).toBe(true)
  })

  it("keeps a message the provider decoder recognized attributed to the site", () => {
    let error: unknown

    try {
      mapCompatibilityResponse(
        {
          ok: false,
          status: 403,
          headers: { "content-type": "application/json" },
          body: { message: "Forbidden" },
        },
        {
          endpoint: "/api/example",
          responseType: "json",
          onlyData: true,
          decodeApplicationError: true,
          errorResponseDecoder: (response) => {
            const body = response.body as { message?: unknown }
            return typeof body?.message === "string"
              ? { kind: "business", message: body.message }
              : null
          },
        },
      )
    } catch (caught) {
      error = caught
    }

    expect(error).toBeInstanceOf(ApiError)
    expect((error as Error).message).toBe("Forbidden")
    expect((error as ApiError).unattributedMessage).toBeFalsy()
  })

  it("uses the fixed fallback instead of a message below a sensitive key", () => {
    const sensitiveMessage = "credential-value-must-not-be-selected"
    let error: unknown

    try {
      mapCompatibilityResponse(
        {
          ok: false,
          status: 400,
          headers: {},
          body: { token: { message: sensitiveMessage } },
        },
        {
          endpoint: "/api/example",
          responseType: "json",
          onlyData: true,
          decodeApplicationError: true,
        },
      )
    } catch (caught) {
      error = caught
    }

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({
      message: "请求失败: 400",
      endpoint: "/api/example",
    })
    expect((error as Error).message).not.toContain(sensitiveMessage)
  })
})
