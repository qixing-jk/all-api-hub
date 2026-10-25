import { beforeEach, describe, expect, it, vi } from "vitest"

import { tempWindowRequestyManagementKeyAction } from "~/services/apiAdapters/requesty/keys/managementKeyActionClient"
import {
  REQUESTY_PROVISIONING_FAILURE_REASONS,
  REQUESTY_PROVISIONING_STATES,
} from "~/services/apiAdapters/requesty/keys/managementKeyPageContract"
import {
  PROTECTION_BYPASS_DENIED_REASONS,
  TEMP_CONTEXT_TASK_KINDS,
} from "~/services/protectionBypass/contracts"

const { executeProtectionBypassTaskMock } = vi.hoisted(() => ({
  executeProtectionBypassTaskMock: vi.fn(),
}))

vi.mock("~/utils/browser/tempWindowFetch", () => ({
  executeProtectionBypassTask: executeProtectionBypassTaskMock,
}))

const execution = {
  kind: "authorized",
  command: {
    feature: "add_account",
    surface: "options",
  },
} as never

/** Runs the client with the given page-action response. */
async function run(params?: { suppressMinimize?: boolean }) {
  return tempWindowRequestyManagementKeyAction({
    requestId: "request-1",
    name: "All API Hub",
    protectionBypassExecution: execution,
    ...params,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("Requesty management-key action client", () => {
  it("wraps the page action in the shared temp-context task envelope", async () => {
    executeProtectionBypassTaskMock.mockResolvedValue({
      requestId: "request-1",
      operation: "create",
      state: REQUESTY_PROVISIONING_STATES.Created,
      accessToken: "rqsty-created",
      keyId: "key-created",
      name: "All API Hub",
    })

    await expect(run()).resolves.toEqual(
      expect.objectContaining({ state: REQUESTY_PROVISIONING_STATES.Created }),
    )
    expect(executeProtectionBypassTaskMock).toHaveBeenCalledExactlyOnceWith({
      execution,
      task: {
        kind: TEMP_CONTEXT_TASK_KINDS.RequestyManagementKeyAction,
        params: {
          requestId: "request-1",
          operation: { kind: "create", name: "All API Hub" },
        },
      },
    })
  })

  it("forwards an explicit minimize preference only when it is set", async () => {
    executeProtectionBypassTaskMock.mockResolvedValue(null)

    await run({ suppressMinimize: true })
    expect(executeProtectionBypassTaskMock).toHaveBeenLastCalledWith({
      execution,
      task: {
        kind: TEMP_CONTEXT_TASK_KINDS.RequestyManagementKeyAction,
        params: {
          requestId: "request-1",
          operation: { kind: "create", name: "All API Hub" },
          suppressMinimize: true,
        },
      },
    })

    await run()
    expect(executeProtectionBypassTaskMock).toHaveBeenLastCalledWith({
      execution,
      task: {
        kind: TEMP_CONTEXT_TASK_KINDS.RequestyManagementKeyAction,
        params: {
          requestId: "request-1",
          operation: { kind: "create", name: "All API Hub" },
        },
      },
    })
  })

  it.each([
    REQUESTY_PROVISIONING_STATES.Created,
    REQUESTY_PROVISIONING_STATES.NotDispatched,
    REQUESTY_PROVISIONING_STATES.DispatchedUnconfirmed,
  ])("passes a well-formed %s result through untouched", async (state) => {
    const response = {
      requestId: "request-1",
      operation: "create",
      state,
      name: "All API Hub",
      ...(state === REQUESTY_PROVISIONING_STATES.Created
        ? { accessToken: "rqsty-created", keyId: "key-created" }
        : { reason: REQUESTY_PROVISIONING_FAILURE_REASONS.PlaintextMissing }),
    }
    executeProtectionBypassTaskMock.mockResolvedValue(response)

    await expect(run()).resolves.toBe(response)
  })

  it.each([
    ["no response at all", null],
    ["an undefined response", undefined],
    ["a response for another request", { requestId: "other" }],
    [
      "a response for another operation",
      {
        requestId: "request-1",
        operation: "delete",
        state: REQUESTY_PROVISIONING_STATES.Created,
      },
    ],
    [
      "a response with an unknown state",
      { requestId: "request-1", operation: "create", state: "exploded" },
    ],
  ])("treats %s as possibly dispatched", async (_label, response) => {
    executeProtectionBypassTaskMock.mockResolvedValue(response)

    // The task crossed the temp-context boundary, so the provider may already
    // hold a key even when the answer is unusable.
    await expect(run()).resolves.toEqual({
      requestId: "request-1",
      operation: "create",
      state: REQUESTY_PROVISIONING_STATES.DispatchedUnconfirmed,
      reason: REQUESTY_PROVISIONING_FAILURE_REASONS.PlaintextMissing,
      name: "All API Hub",
    })
  })

  it("propagates a denied bypass instead of minting a key", async () => {
    executeProtectionBypassTaskMock.mockRejectedValue(
      new Error(PROTECTION_BYPASS_DENIED_REASONS.MissingExecution),
    )

    await expect(run()).rejects.toThrow(
      PROTECTION_BYPASS_DENIED_REASONS.MissingExecution,
    )
  })
})
