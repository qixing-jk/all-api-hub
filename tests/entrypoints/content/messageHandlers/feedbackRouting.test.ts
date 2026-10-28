import { beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { setupContentMessageHandlers } from "~/entrypoints/content/messageHandlers"
import { atIndex } from "~~/tests/test-utils/indexedAccess"

const mocks = vi.hoisted(() => ({
  register: vi.fn(),
  inspectCredential: vi.fn(),
  requesty: vi.fn(),
  newApiPasswordUi: vi.fn(),
  sub2ApiPasswordUi: vi.fn(),
  newApiPasswordLogin: vi.fn(),
  clearNewApiPassword: vi.fn(),
  sub2ApiPasswordLogin: vi.fn(),
  clearSub2ApiPassword: vi.fn(),
  scan: vi.fn(),
  prepareSub2Api: vi.fn(),
  completeSub2Api: vi.fn(),
  clearSub2Api: vi.fn(),
  prepareNewApi: vi.fn(),
  completeNewApi: vi.fn(),
  clearNewApi: vi.fn(),
  ensureRedemptionToastUi: vi.fn(),
  showTurnstileAssistPageNotice: vi.fn(),
}))
vi.mock("~/services/apiService/newApiFamily/passwordUi", () => ({
  handleNewApiPasswordUi: mocks.newApiPasswordUi,
}))
vi.mock("~/services/apiService/sub2api/auth/passwordUi", () => ({
  handleSub2ApiPasswordUi: mocks.sub2ApiPasswordUi,
}))
vi.mock("~/services/apiService/newApiFamily/passwordLogin", () => ({
  handleNewApiPasswordLogin: mocks.newApiPasswordLogin,
  handleClearNewApiPasswordLogin: mocks.clearNewApiPassword,
}))
vi.mock("~/services/apiService/sub2api/auth/passwordLogin", () => ({
  handleSub2ApiPasswordLogin: mocks.sub2ApiPasswordLogin,
  handleClearSub2ApiPasswordLogin: mocks.clearSub2ApiPassword,
}))
vi.mock("~/utils/browser/runtimeMessages", () => ({
  onRuntimeMessage: mocks.register,
}))
vi.mock("~/entrypoints/content/messageHandlers/handlers", () => ({
  handleRequestyManagementKeyAction: mocks.requesty,
}))
vi.mock("~/services/apiService/sub2api/oauth/content", () => ({
  handlePrepareSub2ApiOAuth: mocks.prepareSub2Api,
  handleCompleteSub2ApiOAuth: mocks.completeSub2Api,
  handleClearSub2ApiOAuthEvidence: mocks.clearSub2Api,
}))
vi.mock("~/services/apiService/newApiFamily/oauth/newApiContent", () => ({
  handlePrepareNewApiOAuth: mocks.prepareNewApi,
  handleCompleteNewApiOAuth: mocks.completeNewApi,
  handleClearNewApiOAuthEvidence: mocks.clearNewApi,
}))
vi.mock("~/services/checkin/feedback/pageScan", () => ({
  handlePageFeedbackScan: mocks.scan,
}))
vi.mock("~/entrypoints/content/shared/uiRoot", () => ({
  ensureRedemptionToastUi: mocks.ensureRedemptionToastUi,
}))
vi.mock("~/services/checkin/turnstile/assistPageNotice", () => ({
  showTurnstileAssistPageNotice: mocks.showTurnstileAssistPageNotice,
}))
vi.mock("~/lib/notify/content", () => ({
  default: { info: vi.fn(), dismiss: vi.fn() },
}))
vi.mock(
  "~/entrypoints/content/messageHandlers/handlers/credentialPage",
  () => ({ handleInspectCredentialPage: mocks.inspectCredential }),
)
beforeEach(() => vi.resetAllMocks())

it("routes Requesty creation to its content handler and preserves the asynchronous reply contract", () => {
  mocks.requesty.mockReturnValue(true)
  setupContentMessageHandlers()
  const request = {
    action: RuntimeActionIds.ContentRequestyManagementKeyAction,
    requestId: "create",
  }
  const reply = vi.fn()
  expect(mocks.register.mock.calls[0]![0](request, {}, reply)).toBe(true)
  expect(mocks.requesty).toHaveBeenCalledExactlyOnceWith(request, reply)
})

describe("feedback content routing", () => {
  it.each([
    [RuntimeActionIds.ContentNewApiPasswordUi, "newApiPasswordUi"],
    [RuntimeActionIds.ContentSub2ApiPasswordUi, "sub2ApiPasswordUi"],
    [RuntimeActionIds.ContentNewApiPasswordLogin, "newApiPasswordLogin"],
    [RuntimeActionIds.ContentClearNewApiPasswordLogin, "clearNewApiPassword"],
    [RuntimeActionIds.ContentSub2ApiPasswordLogin, "sub2ApiPasswordLogin"],
    [RuntimeActionIds.ContentClearSub2ApiPasswordLogin, "clearSub2ApiPassword"],
    [RuntimeActionIds.ContentPrepareSub2ApiOAuth, "prepareSub2Api"],
    [RuntimeActionIds.ContentCompleteSub2ApiOAuth, "completeSub2Api"],
    [RuntimeActionIds.ContentClearSub2ApiOAuthEvidence, "clearSub2Api"],
    [RuntimeActionIds.ContentPrepareNewApiOAuth, "prepareNewApi"],
    [RuntimeActionIds.ContentCompleteNewApiOAuth, "completeNewApi"],
    [RuntimeActionIds.ContentClearNewApiOAuthEvidence, "clearNewApi"],
  ] as const)(
    "routes login action %s to its content handler",
    (action, key) => {
      mocks[key].mockReturnValue(true)
      setupContentMessageHandlers()
      const request = { action, requestId: "oauth-flow" }
      const reply = vi.fn()
      const listener = atIndex(mocks.register.mock.calls, 0)[0]
      expect(listener(request, {}, reply)).toBe(true)
      expect(mocks[key]).toHaveBeenCalledExactlyOnceWith(request, reply)
    },
  )

  it.each([
    RuntimeActionIds.ContentCheckinFeedbackScan,
    RuntimeActionIds.ContentCancelCheckinFeedbackScan,
  ])("keeps the reply port open for %s", async (action) => {
    mocks.scan.mockImplementation((_request, reply) => reply({ success: true }))
    setupContentMessageHandlers()
    const listener = atIndex(mocks.register.mock.calls, 0)[0]
    const request = { action, requestId: "scan" }
    const reply = vi.fn()
    expect(listener(request, {}, reply)).toBe(true)
    await vi.waitFor(() =>
      expect(reply).toHaveBeenCalledWith({ success: true }),
    )
    expect(mocks.scan).toHaveBeenCalledWith(request, reply)
  })

  it("reports a handler failure through the reply port", async () => {
    mocks.scan.mockImplementation(() => {
      throw new Error("unavailable")
    })
    setupContentMessageHandlers()
    const reply = vi.fn()
    atIndex(mocks.register.mock.calls, 0)[0](
      { action: RuntimeActionIds.ContentCheckinFeedbackScan },
      {},
      reply,
    )
    await vi.waitFor(() =>
      expect(reply).toHaveBeenCalledWith({ success: false }),
    )
  })

  it("handles TurnstileAssistPageNotice action by showing page notice", async () => {
    mocks.ensureRedemptionToastUi.mockResolvedValueOnce(undefined)
    mocks.showTurnstileAssistPageNotice.mockReturnValueOnce(true)

    setupContentMessageHandlers()
    const reply = vi.fn()
    const request = {
      action: RuntimeActionIds.TurnstileAssistPageNotice,
      requestId: "req-notice-1",
    }
    const listener = atIndex(mocks.register.mock.calls, 0)[0]
    expect(listener(request, {}, reply)).toBe(true)

    await vi.waitFor(() =>
      expect(reply).toHaveBeenCalledWith({ presented: true }),
    )
    expect(mocks.ensureRedemptionToastUi).toHaveBeenCalledOnce()
    expect(mocks.showTurnstileAssistPageNotice).toHaveBeenCalledWith(
      request,
      expect.any(Object),
    )
  })

  it("handles TurnstileAssistPageNotice action when loading UI rejects", async () => {
    mocks.ensureRedemptionToastUi.mockRejectedValueOnce(
      new Error("UI container missing"),
    )

    setupContentMessageHandlers()
    const reply = vi.fn()
    const request = {
      action: RuntimeActionIds.TurnstileAssistPageNotice,
      requestId: "req-notice-err",
    }
    const listener = atIndex(mocks.register.mock.calls, 0)[0]
    expect(listener(request, {}, reply)).toBe(true)

    await vi.waitFor(() =>
      expect(reply).toHaveBeenCalledWith({ presented: false }),
    )
  })
})

it("keeps the credential inspection reply port open and forwards its response", async () => {
  mocks.inspectCredential.mockImplementation(async (_request, reply) =>
    reply({ success: true, state: "credential" }),
  )
  setupContentMessageHandlers()
  const request = { action: RuntimeActionIds.ContentInspectCredentialPage }
  const reply = vi.fn()
  expect(atIndex(mocks.register.mock.calls, 0)[0](request, {}, reply)).toBe(
    true,
  )
  await vi.waitFor(() =>
    expect(reply).toHaveBeenCalledWith({ success: true, state: "credential" }),
  )
})
