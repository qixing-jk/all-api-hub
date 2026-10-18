import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createBrowserPasswordContext } from "~/services/accountLogin/browserPassword"

const session = vi.hoisted(() => ({
  send: vi.fn(),
  navigate: vi.fn(),
  waitForTab: vi.fn(),
  assertOrigin: vi.fn(),
  canResetSession: vi.fn(),
  requestAssist: vi.fn(),
  interactionDeadline: vi.fn(),
}))
vi.mock("~/services/browserLogin/browserLogin", () => ({
  createBrowserLoginContext: (flow: {
    execute: (value: unknown) => unknown
  }) => ({
    authenticate: (input: unknown) => flow.execute({ ...session, input }),
  }),
}))
const input = {
  origin: "https://gateway.example",
  expectedIdentity: "17",
  requestId: "native",
}
function authenticate(details = {}) {
  return createBrowserPasswordContext({
    id: "password",
    concurrencyKey: "password",
    displayName: "Password",
    loginPath: "/login",
    uiAction: "ui",
    loginAction: "api",
    clearEvidenceAction: "clear",
    credentials: { username: "alice", password: "secret" },
  }).authenticate({ ...input, ...details })
}
beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers()
  session.canResetSession.mockResolvedValue(true)
  session.interactionDeadline.mockReturnValue(0)
})
afterEach(() => vi.useRealTimers())

describe("native password browser orchestration", () => {
  it("rejects missing identity without opening the content protocol", async () => {
    await expect(
      authenticate({ expectedIdentity: undefined }),
    ).resolves.toEqual({ status: "failed" })
    expect(session.send).not.toHaveBeenCalled()
  })
  it("prepares again after owned-session logout reload without another reset", async () => {
    session.send
      .mockResolvedValueOnce({ kind: "reload" })
      .mockResolvedValueOnce({
        status: "authenticated",
        identity: "17",
        evidence: { checkedIn: true, token: "private" },
      })
    session.waitForTab.mockImplementation(async (predicate) => {
      expect(
        predicate({ status: "loading", url: input.origin + "/login" }),
      ).toBe(false)
      expect(
        predicate({ status: "complete", url: "https://other.example/login" }),
      ).toBe(false)
      expect(
        predicate({ status: "complete", url: input.origin + "/login" }),
      ).toBe(true)
    })
    await expect(authenticate()).resolves.toEqual({
      status: "authenticated",
      identity: "17",
      evidence: { checkedIn: true },
    })
    expect(session.navigate).toHaveBeenCalledExactlyOnceWith(
      input.origin + "/login",
    )
    expect(session.send).toHaveBeenNthCalledWith(
      2,
      "ui",
      expect.objectContaining({ phase: "prepare", canResetSession: false }),
    )
  })
  it.each(["ready", "manual"])(
    "continues native preparation after manual sign-out (%s)",
    async (next) => {
      session.send
        .mockResolvedValueOnce({ kind: "manual", reason: "session" })
        .mockResolvedValueOnce({ kind: next })
        .mockResolvedValueOnce({ status: "authenticated", identity: "17" })
      const result = authenticate()
      await vi.runAllTimersAsync()
      await expect(result).resolves.toMatchObject({ status: "authenticated" })
      expect(session.send.mock.calls.some(([action]) => action === "api")).toBe(
        false,
      )
      expect(
        session.send.mock.calls.some(([, data]) => data.phase === "submit"),
      ).toBe(next === "ready")
    },
  )
  it("waits through a lost observation response without resubmitting", async () => {
    session.send
      .mockResolvedValueOnce({ kind: "manual" })
      .mockRejectedValueOnce(new Error("port closed"))
      .mockResolvedValueOnce({ status: "authenticated", identity: "17" })
    const result = authenticate()
    await vi.runAllTimersAsync()
    await expect(result).resolves.toMatchObject({ status: "authenticated" })
    expect(
      session.send.mock.calls.some(([, data]) => data.phase === "submit"),
    ).toBe(false)
  })
  it("requests login assistance once and reports uncertainty after a submitted login expires", async () => {
    session.send.mockImplementation(async (_action, data) =>
      data.phase === "prepare" ? { kind: "ready" } : { kind: "pending" },
    )
    const result = authenticate()
    await vi.runAllTimersAsync()
    await expect(result).resolves.toEqual({ status: "uncertain" })
    expect(session.requestAssist).toHaveBeenCalledExactlyOnceWith("login")
    expect(
      session.send.mock.calls.filter(([, data]) => data.phase === "submit"),
    ).toHaveLength(1)
  })
})
