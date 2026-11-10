import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createBrowserPasswordContext } from "~/services/accountLogin/browserPassword"
import { ProtectionPageTimeoutError } from "~/services/browsingContext/tempPage/tempContextProtectionGuards"

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
    authenticate: (input: unknown) =>
      flow.execute({
        ...session,
        input,
        sendSiteAction: async (action: string, details: unknown) =>
          session.send(
            action,
            typeof details === "function" ? await details() : details,
          ),
        observeSubmittedAction: session.send,
      }),
  }),
}))
const input = {
  origin: "https://gateway.example",
  expectedIdentity: "17",
  requestId: "native",
}
function authenticate(details = {}, overrides = {}) {
  return createBrowserPasswordContext({
    id: "password",
    concurrencyKey: "password",
    displayName: "Password",
    loginPath: "/login",
    uiAction: "ui",
    loginAction: "api",
    clearEvidenceAction: "clear",
    credentials: { username: "alice", password: "secret" },
    ...overrides,
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
  it.each(["pending", "settled during the final sleep"])(
    "verifies the session after an uncaptured response exhausts its wait (%s)",
    async (state) => {
      let release!: (value: null) => void
      const result = new Promise<null>((resolve) => {
        release = resolve
      })
      if (state !== "pending") setTimeout(() => release(null), 45_001)
      const dispose = vi.fn(async () => release(null))
      session.send.mockImplementation(async (_action, details) => {
        if (details.phase === "prepare") return { kind: "ready" }
        if (details.phase === "submit") return { kind: "submitted" }
        expect(dispose).toHaveBeenCalledOnce()
        return {
          status: "authenticated",
          identity: "17",
          evidence: { checkedIn: true },
        }
      })
      const login = authenticate(
        {},
        {
          observeNativeLogin: async () => ({ result, dispose }),
        },
      )
      await vi.runAllTimersAsync()
      await expect(login).resolves.toEqual({
        status: "authenticated",
        identity: "17",
        evidence: { checkedIn: true },
      })
      expect(
        session.send.mock.calls.map(([, details]) => details.phase),
      ).toEqual(["prepare", "submit", "observe"])
      expect(dispose).toHaveBeenCalledOnce()
    },
  )

  it("still verifies a usable session when a caller needs to capture its Cookie", async () => {
    const observeNativeLogin = vi.fn().mockResolvedValue({
      result: Promise.resolve({
        status: "authenticated",
        identity: "17",
        evidence: { checkedIn: true },
      }),
      dispose: async () => {},
    })
    session.send
      .mockResolvedValueOnce({ kind: "ready" })
      .mockResolvedValueOnce({ kind: "submitted" })
      .mockResolvedValueOnce({
        status: "uncertain",
        reason: "verification_required",
      })
    const login = authenticate(
      { captureCredential: true },
      { observeNativeLogin },
    )
    await vi.runAllTimersAsync()
    await expect(login).resolves.toEqual({
      status: "uncertain",
      reason: "verification_required",
    })
    expect(observeNativeLogin).not.toHaveBeenCalled()
  })
  it("rejects a captured login for another identity without borrowing page cache", async () => {
    session.send
      .mockResolvedValueOnce({ kind: "ready" })
      .mockResolvedValueOnce({ kind: "submitted" })
    const login = authenticate(
      {},
      {
        observeNativeLogin: async () => ({
          result: Promise.resolve({
            status: "authenticated",
            identity: "18",
            evidence: { checkedIn: true },
          }),
          dispose: async () => {},
        }),
      },
    )
    await vi.runAllTimersAsync()
    await expect(login).resolves.toEqual({ status: "identity_mismatch" })
    expect(session.send).toHaveBeenCalledTimes(2)
  })
  it("keeps the existing session verifier when the native response is unavailable", async () => {
    session.send
      .mockResolvedValueOnce({ kind: "ready" })
      .mockResolvedValueOnce({ kind: "submitted" })
      .mockResolvedValueOnce({
        status: "uncertain",
        reason: "verification_required",
      })
    const login = authenticate(
      {},
      {
        observeNativeLogin: async () => ({
          result: Promise.resolve(null),
          dispose: async () => {},
        }),
      },
    )
    await vi.runAllTimersAsync()
    await expect(login).resolves.toEqual({
      status: "uncertain",
      reason: "verification_required",
    })
    expect(session.send.mock.calls.map(([, details]) => details.phase)).toEqual(
      ["prepare", "submit", "observe"],
    )
  })
  it("uses this submission's observed login response without an extra session request", async () => {
    let confirm!: (result: unknown) => void
    const result = new Promise((resolve) => {
      confirm = resolve
    })
    const dispose = vi.fn().mockResolvedValue(undefined)
    const observeNativeLogin = vi.fn().mockResolvedValue({ result, dispose })
    session.send.mockImplementation(async (_action, details) => {
      if (details.phase === "prepare") return { kind: "ready" }
      if (details.phase === "submit") {
        expect(observeNativeLogin).toHaveBeenCalledOnce()
        confirm({
          status: "authenticated",
          identity: "17",
          evidence: { checkedIn: true },
        })
        return { kind: "submitted" }
      }
      return { status: "uncertain", reason: "verification_required" }
    })
    const login = authenticate({}, { observeNativeLogin })
    await vi.runAllTimersAsync()
    await expect(login).resolves.toEqual({
      status: "authenticated",
      identity: "17",
      evidence: { checkedIn: true },
    })
    expect(session.send.mock.calls.map(([, details]) => details.phase)).toEqual(
      ["prepare", "submit"],
    )
    expect(dispose).toHaveBeenCalledOnce()
  })
  it.each([false, true])(
    "reports a persistent page challenge before dispatch (recovery: %s)",
    async (recovery) => {
      if (recovery)
        session.send.mockResolvedValueOnce({
          status: "interaction_required",
          reason: "verification_required",
        })
      session.send.mockRejectedValue(new ProtectionPageTimeoutError())
      await expect(authenticate()).resolves.toEqual({
        status: "interaction_required",
        reason: "verification_required",
      })
      expect(
        session.send.mock.calls.every(([, data]) => data.phase === "prepare"),
      ).toBe(true)
    },
  )
  it("reports page recovery failure before login without claiming an uncertain submission", async () => {
    session.navigate.mockRejectedValueOnce(new Error("guard timeout"))
    session.send.mockResolvedValue({
      status: "interaction_required",
      reason: "verification_required",
    })
    await expect(authenticate()).resolves.toEqual({
      status: "failed",
      reason: "page_unavailable",
    })
    expect(session.send).toHaveBeenCalledTimes(1)
  })
  it("does not reload or resubmit when verification blocks a dispatched login", async () => {
    session.send
      .mockResolvedValueOnce({ kind: "ready" })
      .mockResolvedValueOnce({ kind: "submitted" })
      .mockResolvedValueOnce({
        status: "uncertain",
        reason: "verification_required",
      })
    const result = authenticate()
    await vi.runAllTimersAsync()
    await expect(result).resolves.toEqual({
      status: "uncertain",
      reason: "verification_required",
    })
    expect(session.navigate).not.toHaveBeenCalled()
    expect(
      session.send.mock.calls.filter(([, data]) => data.phase === "submit"),
    ).toHaveLength(1)
  })
  it("reloads a challenged preflight only once through protected site actions", async () => {
    session.send.mockImplementation(async () => {
      return { status: "interaction_required", reason: "verification_required" }
    })
    await expect(authenticate()).resolves.toEqual({
      status: "interaction_required",
      reason: "verification_required",
    })
    expect(session.navigate).toHaveBeenCalledExactlyOnceWith(
      input.origin + "/login",
    )
    expect(session.send).toHaveBeenCalledTimes(2)
    expect(
      session.send.mock.calls.every(([, data]) => data.phase === "prepare"),
    ).toBe(true)
  })
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

it("falls back to session verification after the native observer rejects", async () => {
  session.send
    .mockResolvedValueOnce({ kind: "ready" })
    .mockResolvedValueOnce({ kind: "submitted" })
    .mockResolvedValueOnce({ status: "authenticated", identity: "17" })
  const dispose = vi.fn().mockRejectedValue(new Error("document gone"))
  const login = authenticate(
    {},
    {
      observeNativeLogin: async () => ({
        result: Promise.reject(new Error("document gone")),
        dispose,
      }),
    },
  )
  await vi.runAllTimersAsync()
  await expect(login).resolves.toEqual({
    status: "authenticated",
    identity: "17",
    evidence: {},
  })
  expect(session.send.mock.calls.map(([, details]) => details.phase)).toEqual([
    "prepare",
    "submit",
    "observe",
  ])
  expect(dispose).toHaveBeenCalledOnce()
})

it("uses native evidence arriving during disposal without another session request", async () => {
  let release!: (value: any) => void
  const result = new Promise((resolve) => {
    release = resolve
  })
  session.send.mockImplementation(async (_action, details) =>
    details.phase === "prepare" ? { kind: "ready" } : { kind: "submitted" },
  )
  const dispose = vi.fn(async () =>
    release({
      status: "authenticated",
      identity: "17",
      evidence: { checkedIn: true },
    }),
  )
  const login = authenticate(
    {},
    { observeNativeLogin: async () => ({ result, dispose }) },
  )
  await vi.runAllTimersAsync()
  await expect(login).resolves.toEqual({
    status: "authenticated",
    identity: "17",
    evidence: { checkedIn: true },
  })
  expect(session.send).toHaveBeenCalledTimes(2)
})

it("preserves uncertainty when arming observation loses its document", async () => {
  session.send.mockResolvedValueOnce({ kind: "ready" })
  await expect(
    authenticate(
      {},
      {
        observeNativeLogin: async () => {
          throw new Error("document gone")
        },
      },
    ),
  ).resolves.toEqual({ status: "uncertain" })
  expect(session.send).toHaveBeenCalledTimes(1)
})

it("accepts native evidence arriving in the final wait interval", async () => {
  let release!: (value: any) => void
  const result = new Promise((resolve) => {
    release = resolve
  })
  setTimeout(
    () =>
      release({
        status: "authenticated",
        identity: "17",
        evidence: { checkedIn: true },
      }),
    45_001,
  )
  session.send.mockImplementation(async (_action, details) =>
    details.phase === "prepare" ? { kind: "ready" } : { kind: "submitted" },
  )
  const dispose = vi.fn().mockResolvedValue(undefined)
  const login = authenticate(
    {},
    { observeNativeLogin: async () => ({ result, dispose }) },
  )
  await vi.runAllTimersAsync()
  await expect(login).resolves.toEqual({
    status: "authenticated",
    identity: "17",
    evidence: { checkedIn: true },
  })
  expect(session.send).toHaveBeenCalledTimes(2)
  expect(dispose).toHaveBeenCalledOnce()
})

it("retains a protection timeout after submission as uncertain verification", async () => {
  session.send
    .mockResolvedValueOnce({ kind: "ready" })
    .mockResolvedValueOnce({ kind: "submitted" })
  session.assertOrigin
    .mockResolvedValueOnce(undefined)
    .mockRejectedValue(new ProtectionPageTimeoutError())
  const login = authenticate()
  await vi.runAllTimersAsync()
  await expect(login).resolves.toEqual({
    status: "uncertain",
    reason: "verification_required",
  })
})
