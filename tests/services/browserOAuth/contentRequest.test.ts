import { afterEach, expect, it, vi } from "vitest"

import {
  fetchBrowserOAuthRequest,
  runBrowserOAuthContentAction,
} from "~/services/browserOAuth/contentRequest"

afterEach(() => vi.unstubAllGlobals())

it.each([
  [undefined, undefined, "request_failed"],
  ["HEAD", undefined, "request_failed"],
  ["get", undefined, "request_failed"],
  ["OPTIONS", undefined, "uncertain"],
  ["GET", true, "uncertain"],
  ["POST", false, "request_failed"],
] as const)(
  "preserves request failure classification for method=%s and explicit risk=%s",
  async (method, mutationRisk, reason) => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("private failure"))
    vi.stubGlobal("fetch", fetchMock)
    const reply = await new Promise((resolve) =>
      runBrowserOAuthContentAction(resolve, async () => {
        await fetchBrowserOAuthRequest(
          "/api/test",
          { method },
          { mutationRisk },
        )
        return { success: true }
      }),
    )
    expect(reply).toEqual({ success: false, reason })
    expect(fetchMock).toHaveBeenCalledOnce()
  },
)

it.each([
  ["GET", false],
  ["POST", true],
  ["DELETE", true],
] as const)(
  "classifies a challenge for %s without replay or body disclosure",
  async (method, mutationRisk) => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("private challenge body", {
        status: 401,
        headers: { "cf-mitigated": "challenge" },
      }),
    )
    vi.stubGlobal("fetch", fetchMock)
    const result = await new Promise((resolve) =>
      runBrowserOAuthContentAction(resolve, async () => {
        await fetchBrowserOAuthRequest("/api/test", { method })
        return { success: true }
      }),
    )
    expect(result).toEqual({
      success: false,
      reason: "verification_required",
      ...(mutationRisk ? { mutationRisk: true } : {}),
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  },
)

it("returns the original response with its JSON body still readable", async () => {
  const original = Response.json({ success: true, data: { id: 17 } })
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(original))
  const response = await fetchBrowserOAuthRequest("/api/test")
  expect(response).toBe(original)
  expect(response.bodyUsed).toBe(false)
  await expect(response.json()).resolves.toEqual({
    success: true,
    data: { id: 17 },
  })
})

it("does not classify a normal JSON response mentioning WAF as a challenge", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        Response.json({ message: '<meta name="aliyun_waf_aa">' }),
      ),
  )
  await expect(fetchBrowserOAuthRequest("/api/test")).resolves.toBeInstanceOf(
    Response,
  )
})

it("preserves implicit POST uncertainty when the network response is lost", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue(new Error("private-network-error")),
  )
  await expect(
    fetchBrowserOAuthRequest("/api/test", { method: "POST" }),
  ).rejects.toMatchObject({ reason: "uncertain" })
})

it("preserves mutation uncertainty if protection inspection loses the body stream", async () => {
  const response = new Response()
  vi.spyOn(response, "clone").mockImplementation(() => {
    throw new Error("private-stream-error")
  })
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response))
  await expect(
    fetchBrowserOAuthRequest("/api/test", { method: "POST" }),
  ).rejects.toMatchObject({ reason: "uncertain" })
})
