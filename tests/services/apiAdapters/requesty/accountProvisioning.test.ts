import { describe, expect, it, vi } from "vitest"

const tempWindowAction = vi.fn()
const selfKeyInfo = vi.fn()

vi.mock(
  "~/services/apiAdapters/requesty/keys/managementKeyActionClient",
  () => ({
    tempWindowRequestyManagementKeyAction: (...args: unknown[]) =>
      tempWindowAction(...args),
  }),
)

vi.mock("~/services/apiService/requesty", () => ({
  fetchRequestySelfKeyInfo: (...args: unknown[]) => selfKeyInfo(...args),
}))

vi.mock("~/services/protectionBypass/client", () => ({
  withProtectionBypassUserCommand: async (
    _command: unknown,
    _surface: unknown,
    work: (execution: unknown) => Promise<unknown>,
  ) => await work({ kind: "test-execution" }),
}))

const { provisionRequestyManagementKey } = await import(
  "~/services/apiAdapters/requesty/account/accountProvisioning"
)

describe("provisionRequestyManagementKey", () => {
  it("gives each automatic create a distinguishable console label", async () => {
    tempWindowAction.mockResolvedValue({
      state: "not_dispatched",
      reason: "session_unavailable",
    })
    await provisionRequestyManagementKey({})
    await provisionRequestyManagementKey({})
    const names = tempWindowAction.mock.calls.map(([request]) => request.name)
    expect(new Set(names).size).toBe(2)
    // Requesty has no rename endpoint, so the label must match the format every
    // other bootstrap flow writes into a provider console.
    for (const name of names) {
      expect(name).toMatch(/^All API Hub - Account Connection \([0-9a-f]{8}\)$/)
    }
  })
  it("returns the created credential after validating it", async () => {
    tempWindowAction.mockResolvedValue({
      requestId: "request-1",
      operation: "create",
      state: "created",
      accessToken: "rqsty-sk-created",
      keyId: "key-1",
      name: "All API Hub",
    })
    selfKeyInfo.mockResolvedValue({
      keyId: "key-1",
      keyName: "All API Hub",
      orgName: "example-org",
    })

    const result = await provisionRequestyManagementKey({ name: "All API Hub" })

    expect(result).toMatchObject({
      status: "created",
      accessToken: "rqsty-sk-created",
      keyId: "key-1",
      username: "example-org",
    })
  })

  it("degrades with a reason when the console is signed out", async () => {
    tempWindowAction.mockResolvedValue({
      requestId: "request-2",
      operation: "create",
      state: "not_dispatched",
      reason: "session_unavailable",
      name: "All API Hub",
    })

    await expect(
      provisionRequestyManagementKey({ name: "All API Hub" }),
    ).resolves.toMatchObject({
      status: "unavailable",
      reason: "session_unavailable",
      possiblyCreated: false,
    })
    expect(selfKeyInfo).not.toHaveBeenCalled()
  })

  it("marks an unconfirmed create so the caller never claims nothing happened", async () => {
    tempWindowAction.mockResolvedValue({
      requestId: "request-3",
      operation: "create",
      state: "dispatched_unconfirmed",
      reason: "plaintext_missing",
      name: "All API Hub",
    })

    await expect(
      provisionRequestyManagementKey({ name: "All API Hub" }),
    ).resolves.toMatchObject({
      status: "unavailable",
      possiblyCreated: true,
    })
  })

  it("reports a create that produced an unusable credential", async () => {
    tempWindowAction.mockResolvedValue({
      requestId: "request-4",
      operation: "create",
      state: "created",
      accessToken: "rqsty-sk-broken",
      keyId: "key-4",
      name: "All API Hub",
    })
    selfKeyInfo.mockRejectedValue(new Error("invalid authorization token"))

    await expect(
      provisionRequestyManagementKey({ name: "All API Hub" }),
    ).resolves.toMatchObject({
      status: "unavailable",
      reason: "create_rejected",
      possiblyCreated: true,
    })
  })

  it("preserves uncertainty when the page action transport fails", async () => {
    tempWindowAction.mockRejectedValue(new Error("transport closed"))

    await expect(
      provisionRequestyManagementKey({ name: "All API Hub" }),
    ).resolves.toMatchObject({
      status: "unavailable",
      possiblyCreated: true,
    })
  })
})
