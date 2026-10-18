// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://gateway.example/login"}
import { afterEach, expect, it, vi } from "vitest"

import {
  passwordLoginRequest,
  runPasswordLoginContentAction,
  validatePasswordLoginRequest,
} from "~/services/accountLogin/passwordContent"

afterEach(() => vi.unstubAllGlobals())
it.each([
  { expectedIdentity: "" },
  { expectedIdentity: 17 },
  { credentials: {} },
  { credentials: { username: "alice", password: "" } },
])("rejects incomplete password submission %j", (fields) => {
  expect(() =>
    validatePasswordLoginRequest({
      origin: location.origin,
      requestId: "r",
      expectedIdentity: "17",
      credentials: { username: "alice", password: "secret" },
      ...fields,
    }),
  ).toThrow("Invalid login context")
})
it("redacts an unclassified action failure even without an established-session callback", async () => {
  const reply = vi.fn()
  expect(
    runPasswordLoginContentAction(reply, async () => {
      throw new Error("secret")
    }),
  ).toBe(true)
  await vi.waitFor(() =>
    expect(reply).toHaveBeenCalledExactlyOnceWith({ status: "failed" }),
  )
})
it.each([false, true])(
  "classifies failed/malformed HTTP responses according to mutation risk (%s)",
  async (mutation) => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    for (const response of [
      new Response(null, { status: 503 }),
      new Response("not json", { status: 200 }),
      Response.json([]),
    ]) {
      fetchMock.mockResolvedValueOnce(response)
      await expect(
        passwordLoginRequest("/api/status", mutation ? {} : undefined),
      ).rejects.toMatchObject({
        reason: mutation ? "uncertain" : "request_failed",
      })
    }
    expect(fetchMock).toHaveBeenCalledTimes(3)
  },
)
