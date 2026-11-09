// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://agentrouter.org/login"}
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { handleNewApiPasswordUi } from "~/services/apiService/newApiFamily/passwordUi"

const fetchMock = vi.fn<typeof fetch>()
const request = {
  origin: "https://agentrouter.org",
  requestId: "agentrouter-password",
  expectedIdentity: "17",
  sessionMode: "fresh",
  canResetSession: true,
}
const invoke = (details = {}) =>
  new Promise((resolve) =>
    handleNewApiPasswordUi(
      { ...request, phase: "prepare", ...details },
      resolve,
    ),
  )

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  document.body.innerHTML =
    '<form><input name="username"><input type="password"><button type="submit">Continue</button></form>'
  fetchMock.mockReset()
  vi.stubGlobal("fetch", fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

it("prepares an empty owned private login session without a redundant identity request", async () => {
  fetchMock.mockImplementation(async (url) =>
    url === "/api/status"
      ? Response.json({ success: true, data: { system_name: "Agent Router" } })
      : new Response('<meta name="aliyun_waf_aa" content="challenge">', {
          headers: { "Content-Type": "text/html" },
        }),
  )
  await expect(invoke()).resolves.toEqual({ kind: "ready" })
  expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(["/api/status"])
})

it("reports a WAF challenge before submission without treating it as an unknown login result", async () => {
  fetchMock.mockResolvedValue(
    new Response(
      '<!doctype html><meta name="aliyun_waf_aa" content="challenge">',
      { headers: { "Content-Type": "text/html" } },
    ),
  )
  await expect(invoke({ canResetSession: false })).resolves.toEqual({
    status: "interaction_required",
    reason: "verification_required",
  })
  expect(fetchMock).toHaveBeenCalledTimes(1)
})

it.each(["shared", "cached"])(
  "still verifies a %s session before allowing login",
  async (kind) => {
    if (kind === "cached")
      localStorage.setItem("user", JSON.stringify({ id: 18 }))
    fetchMock.mockResolvedValue(
      Response.json({ success: true, data: { id: 18 } }),
    )
    await expect(invoke({ canResetSession: false })).resolves.toEqual({
      kind: "manual",
      reason: "session",
    })
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(["/api/user/self"])
  },
)

it.each([200, 403])(
  "reports a challenge on public settings without sending login credentials (HTTP %s)",
  async (status) => {
    fetchMock.mockResolvedValue(
      new Response('<meta name="aliyun_waf_aa">', {
        status,
        headers: { "Content-Type": "text/html" },
      }),
    )
    await expect(invoke()).resolves.toEqual({
      status: "interaction_required",
      reason: "verification_required",
    })
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(["/api/status"])
  },
)

it("reports malformed upstream data separately from a verification challenge", async () => {
  fetchMock.mockResolvedValue(new Response("<html>Maintenance</html>"))
  await expect(invoke({ canResetSession: false })).resolves.toEqual({
    status: "failed",
    reason: "invalid_response",
  })
})

it("recognizes a WAF page even when the server rejects with HTTP 403", async () => {
  fetchMock.mockResolvedValue(
    new Response('<meta name="aliyun_waf_aa">', {
      status: 403,
      headers: { "Content-Type": "text/html" },
    }),
  )
  await expect(invoke({ canResetSession: false })).resolves.toEqual({
    status: "interaction_required",
    reason: "verification_required",
  })
})

it("retains uncertainty and the verification reason after native submission", async () => {
  sessionStorage.setItem(
    "all-api-hub:password-ui",
    JSON.stringify({
      requestId: request.requestId,
      expectedIdentity: "17",
      submitted: true,
    }),
  )
  localStorage.setItem("user", JSON.stringify({ id: 17, checked_in: true }))
  fetchMock.mockResolvedValue(new Response('<meta name="aliyun_waf_aa">'))
  await expect(invoke({ phase: "observe" })).resolves.toEqual({
    status: "uncertain",
    reason: "verification_required",
  })
  expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(["/api/user/self"])
})
