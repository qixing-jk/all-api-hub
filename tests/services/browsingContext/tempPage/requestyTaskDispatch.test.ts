import { beforeEach, describe, expect, it, vi } from "vitest"

import { executeAuthorizedTempContextTask } from "~/services/browsingContext/tempPage/taskDispatch"
import type { TempContextTask } from "~/services/protectionBypass/contracts"

const mocks = vi.hoisted(() => ({
  policy: vi.fn(),
  create: vi.fn(),
  inspect: vi.fn(),
}))
vi.mock("~/utils/browser/tempWindowRequestSource", () => ({
  resolveTempWindowRequestPolicy: mocks.policy,
}))
vi.mock(
  "~/services/browsingContext/tempPage/requestyManagementKeyAction",
  () => ({ handleTempWindowRequestyManagementKeyAction: mocks.create }),
)

const task = {
  kind: "requesty_management_key_action",
  params: { requestId: "create", operation: { kind: "create", name: "Hub" } },
} satisfies TempContextTask

beforeEach(() => vi.resetAllMocks())

describe("authorized Requesty task dispatch", () => {
  it("forwards the authorized presentation and acquisition guard once", async () => {
    mocks.policy.mockReturnValue({ suppressMinimize: true })
    const authorize = vi.fn()
    const reply = vi.fn()
    await executeAuthorizedTempContextTask(task, "options", authorize, reply)
    expect(mocks.create).toHaveBeenCalledExactlyOnceWith(
      task.params,
      true,
      reply,
      authorize,
    )
    expect(reply).not.toHaveBeenCalled()
  })

  it("returns a not-dispatched response when the presentation is blocked", async () => {
    mocks.policy.mockReturnValue({ blockedReason: "firefox_popup_unsupported" })
    const authorize = vi.fn()
    const reply = vi.fn()
    const report = vi.fn()
    await executeAuthorizedTempContextTask(
      task,
      "popup",
      authorize,
      reply,
      report,
    )
    expect(reply).toHaveBeenCalledExactlyOnceWith({
      requestId: "create",
      operation: "create",
      name: "Hub",
      state: "not_dispatched",
      reason: "session_unavailable",
    })
    expect(report).toHaveBeenCalledExactlyOnceWith({
      kind: "unavailable",
      reason: "firefox_popup_unsupported",
    })
    expect(mocks.create).not.toHaveBeenCalled()
    expect(authorize).not.toHaveBeenCalled()
  })
})

vi.mock("~/services/browsingContext/tempPage/sessionTasks", () => ({
  executeCredentialPageInspect: mocks.inspect,
}))
it("dispatches credential inspection with the authorized acquisition guard", async () => {
  mocks.policy.mockReturnValue({ suppressMinimize: true })
  const authorize = vi.fn()
  const reply = vi.fn()
  const params = {
    originUrl: "https://example.test/profile",
    requestId: "inspect",
  }
  await executeAuthorizedTempContextTask(
    { kind: "credential_page_inspect", params },
    "options",
    authorize,
    reply,
  )
  expect(mocks.inspect).toHaveBeenCalledExactlyOnceWith(
    params,
    true,
    reply,
    authorize,
  )
})
