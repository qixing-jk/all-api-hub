import { describe, expect, it, vi } from "vitest"

import {
  createProtectionBypassCoordinator,
  getProtectionBypassDecisionErrorCode,
  resolveProtectionBypassExecution,
} from "~/entrypoints/background/protectionBypassCoordinator"
import { API_ERROR_CODES } from "~/services/apiTransport/errors"
import {
  PROTECTION_BYPASS_AUTOMATIC_TRIGGERS,
  PROTECTION_BYPASS_DECISION_RESULTS,
  PROTECTION_BYPASS_DENIED_REASONS,
  PROTECTION_BYPASS_EXECUTION_KINDS,
  PROTECTION_BYPASS_FEATURES,
  PROTECTION_BYPASS_SURFACES,
  PROTECTION_BYPASS_USER_COMMANDS,
  TEMP_CONTEXT_TASK_KINDS,
  type ProtectionBypassAutomaticFeature,
  type ProtectionBypassExecution,
  type TempContextTask,
} from "~/services/protectionBypass/contracts"
import { userCommandExecution } from "~~/tests/services/protectionBypass/fixtures"

const allowedPolicy = {
  automaticMasterEnabled: true,
  automaticAccountRefreshEnabled: true,
  manualAccountRefreshEnabled: true,
  allowedSurfaces: {
    popup: true,
    options: true,
    sidepanel: true,
    content_script: true,
    background: true,
  },
  preferredMode: "tab" as const,
}

const automaticExecution = {
  version: 2,
  kind: PROTECTION_BYPASS_EXECUTION_KINDS.Automatic,
  feature: PROTECTION_BYPASS_FEATURES.LdohSiteLookup,
  trigger: PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.UiLifecycle,
  surface: PROTECTION_BYPASS_SURFACES.Options,
} as const

const verificationExecution = {
  ...automaticExecution,
  feature: PROTECTION_BYPASS_FEATURES.KeyManagement,
} as const

const taskParams = {
  originUrl: "https://example.invalid",
  fetchUrl: "https://example.invalid/api/test",
  pageUrl: "https://example.invalid/checkin",
  url: "https://example.invalid",
  requestId: "request-1",
  siteType: "new-api" as const,
  expectedUserId: "example-user",
}

const allTaskKinds: TempContextTask[] = [
  { kind: TEMP_CONTEXT_TASK_KINDS.ApiFallbackFetch, params: taskParams },
  { kind: TEMP_CONTEXT_TASK_KINDS.ProfileIsolatedFetch, params: taskParams },
  { kind: TEMP_CONTEXT_TASK_KINDS.TurnstileFetch, params: taskParams },
  { kind: TEMP_CONTEXT_TASK_KINDS.NativePageAction, params: taskParams },
  { kind: TEMP_CONTEXT_TASK_KINDS.RenderedTitle, params: taskParams },
  { kind: TEMP_CONTEXT_TASK_KINDS.SessionRead, params: taskParams },
  {
    kind: TEMP_CONTEXT_TASK_KINDS.NewApiSessionRead,
    params: {
      origin: taskParams.originUrl,
      action: "channel_key",
      channelId: 12,
      userId: "example-user",
    },
  },
  { kind: TEMP_CONTEXT_TASK_KINDS.OpenContext, params: taskParams },
  {
    kind: TEMP_CONTEXT_TASK_KINDS.OpenRouterManagementKeyAction,
    params: {
      requestId: "openrouter-request-1",
      operation: { kind: "create", label: "Example label" },
    },
  },
]

function withExecution(
  task: TempContextTask,
  _execution: ProtectionBypassExecution,
): TempContextTask {
  return task
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

function fetchTask(_execution: ProtectionBypassExecution) {
  return {
    kind: TEMP_CONTEXT_TASK_KINDS.ApiFallbackFetch,
    params: {
      originUrl: "https://example.invalid",
      fetchUrl: "https://example.invalid/api/account",
      requestId: "request-1",
    },
  } as const
}

function createDecisionCoordinator(overrides: Record<string, unknown> = {}) {
  return createProtectionBypassCoordinator({
    readPolicy: vi.fn().mockResolvedValue(allowedPolicy),
    resolveCapability: vi.fn().mockResolvedValue({
      kind: "available",
      adapter: "tab",
    }),
    validateNewApiSessionReadResource: vi.fn().mockResolvedValue(true),
    executeAuthorizedTask: vi.fn(
      async (
        _task,
        _source,
        authorizeAtAcquire,
        sendResponse,
        reportOutcome,
      ) => {
        const decision = await authorizeAtAcquire()
        if (decision.kind === PROTECTION_BYPASS_DECISION_RESULTS.Allowed) {
          reportOutcome({ kind: "allowed", adapter: decision.adapter })
          sendResponse({ success: true })
          return
        }
        reportOutcome({ kind: "denied" })
        sendResponse({
          success: false,
          code: getProtectionBypassDecisionErrorCode(decision),
        })
      },
    ),
    ...overrides,
  })
}

describe("resolveProtectionBypassExecution", () => {
  it.each([
    [
      PROTECTION_BYPASS_USER_COMMANDS.RefreshAccount,
      PROTECTION_BYPASS_FEATURES.AccountRefresh,
    ],
    [
      PROTECTION_BYPASS_USER_COMMANDS.RefreshAllAccounts,
      PROTECTION_BYPASS_FEATURES.AccountRefresh,
    ],
    [
      PROTECTION_BYPASS_USER_COMMANDS.RefreshDisabledAccounts,
      PROTECTION_BYPASS_FEATURES.AccountRefresh,
    ],
    [
      PROTECTION_BYPASS_USER_COMMANDS.ManualCheckin,
      PROTECTION_BYPASS_FEATURES.Checkin,
    ],
    [
      PROTECTION_BYPASS_USER_COMMANDS.RetryCheckinAccount,
      PROTECTION_BYPASS_FEATURES.Checkin,
    ],
    [
      PROTECTION_BYPASS_USER_COMMANDS.AddAccount,
      PROTECTION_BYPASS_FEATURES.AccountOnboarding,
    ],
    [
      PROTECTION_BYPASS_USER_COMMANDS.DetectAccount,
      PROTECTION_BYPASS_FEATURES.AccountOnboarding,
    ],
    [
      PROTECTION_BYPASS_USER_COMMANDS.ReauthenticateAccount,
      PROTECTION_BYPASS_FEATURES.AccountOnboarding,
    ],
    [
      PROTECTION_BYPASS_USER_COMMANDS.ManageApiKeys,
      PROTECTION_BYPASS_FEATURES.KeyManagement,
    ],
  ] as const)("maps %s to %s", (command, feature) => {
    expect(
      resolveProtectionBypassExecution(userCommandExecution(command)),
    ).toEqual({
      ...userCommandExecution(command),
      feature,
    })
  })

  it("returns missing intent for undefined and invalid intent for malformed input", () => {
    expect(resolveProtectionBypassExecution(undefined)).toEqual({
      kind: "invalid",
      reason: PROTECTION_BYPASS_DENIED_REASONS.MissingExecution,
    })
    expect(
      resolveProtectionBypassExecution({ version: 2, kind: "user_command" }),
    ).toEqual({
      kind: "invalid",
      reason: PROTECTION_BYPASS_DENIED_REASONS.InvalidExecution,
    })
  })

  it("returns an immutable snapshot of valid automatic intent", () => {
    const resolved = resolveProtectionBypassExecution(automaticExecution)

    expect(resolved).toEqual(automaticExecution)
    expect(resolved).not.toBe(automaticExecution)
    expect(Object.isFrozen(resolved)).toBe(true)
  })
})

describe("ProtectionBypassCoordinator", () => {
  it("submits permitted tasks and preflights prohibited task kinds", async () => {
    const executeAuthorizedTask = vi.fn(
      async (
        _task,
        _source,
        authorizeAtAcquire,
        sendResponse,
        _reportOutcome,
      ) => {
        const decision = await authorizeAtAcquire()
        sendResponse({
          success: decision.kind === PROTECTION_BYPASS_DECISION_RESULTS.Allowed,
        })
      },
    )
    const coordinator = createDecisionCoordinator({ executeAuthorizedTask })

    for (const task of allTaskKinds) {
      const execution =
        task.kind === TEMP_CONTEXT_TASK_KINDS.ApiFallbackFetch
          ? userCommandExecution(PROTECTION_BYPASS_USER_COMMANDS.RefreshAccount)
          : task.kind === TEMP_CONTEXT_TASK_KINDS.ProfileIsolatedFetch ||
              task.kind ===
                TEMP_CONTEXT_TASK_KINDS.OpenRouterManagementKeyAction
            ? userCommandExecution(PROTECTION_BYPASS_USER_COMMANDS.AddAccount)
            : task.kind === TEMP_CONTEXT_TASK_KINDS.TurnstileFetch ||
                task.kind === TEMP_CONTEXT_TASK_KINDS.NativePageAction
              ? userCommandExecution(
                  PROTECTION_BYPASS_USER_COMMANDS.ManualCheckin,
                )
              : task.kind === TEMP_CONTEXT_TASK_KINDS.NewApiSessionRead
                ? userCommandExecution(
                    PROTECTION_BYPASS_USER_COMMANDS.ManageApiKeys,
                  )
                : userCommandExecution(
                    PROTECTION_BYPASS_USER_COMMANDS.AddAccount,
                  )
      await expect(
        coordinator.execute({
          task: withExecution(task, execution),
          execution,
        }),
      ).resolves.toMatchObject({
        success:
          task.kind !== TEMP_CONTEXT_TASK_KINDS.RenderedTitle &&
          task.kind !== TEMP_CONTEXT_TASK_KINDS.OpenContext,
      })
    }

    expect(executeAuthorizedTask).toHaveBeenCalledTimes(allTaskKinds.length - 2)
  })

  it("executes plain user-command intent without consulting sender ownership", async () => {
    const execution = userCommandExecution(
      PROTECTION_BYPASS_USER_COMMANDS.RefreshAccount,
    )
    await expect(
      createDecisionCoordinator().execute({
        task: fetchTask(execution),
        execution,
      }),
    ).resolves.toEqual({ success: true })
  })

  it("uses execution.surface as the presentation source", async () => {
    const execution = userCommandExecution(
      PROTECTION_BYPASS_USER_COMMANDS.RefreshAccount,
      PROTECTION_BYPASS_SURFACES.Popup,
    )
    const executeAuthorizedTask = vi.fn(
      async (
        task,
        presentationSource,
        authorizeAtAcquire,
        sendResponse,
        _reportOutcome,
      ) => {
        expect(task.params).not.toHaveProperty("tempWindowRequestSource")
        expect(presentationSource).toBe(PROTECTION_BYPASS_SURFACES.Popup)
        expect(await authorizeAtAcquire()).toMatchObject({ kind: "allowed" })
        sendResponse({ success: true })
      },
    )
    await expect(
      createDecisionCoordinator({ executeAuthorizedTask }).execute({
        task: fetchTask(execution),
        execution,
      }),
    ).resolves.toEqual({ success: true })
  })

  it("resolves with only the first production-adapter response", async () => {
    const executeAuthorizedTask = vi.fn(
      async (
        _task,
        _source,
        _authorizeAtAcquire,
        sendResponse,
        _reportOutcome,
      ) => {
        sendResponse({ success: true, data: "first" })
        sendResponse({ success: true, data: "second" })
      },
    )

    await expect(
      createDecisionCoordinator({ executeAuthorizedTask }).execute({
        task: fetchTask(automaticExecution),
        execution: automaticExecution,
      }),
    ).resolves.toEqual({ success: true, data: "first" })
  })

  it("rejects when the production adapter responds with undefined", async () => {
    const executeAuthorizedTask = vi.fn(
      async (
        _task,
        _source,
        _authorizeAtAcquire,
        sendResponse,
        _reportOutcome,
      ) => {
        sendResponse(undefined)
      },
    )

    await expect(
      createDecisionCoordinator({ executeAuthorizedTask }).execute({
        task: fetchTask(automaticExecution),
        execution: automaticExecution,
      }),
    ).rejects.toThrow("Protected task handler returned no response")
  })

  it("rejects when the production adapter completes without a response", async () => {
    await expect(
      createDecisionCoordinator({
        executeAuthorizedTask: vi.fn(
          async (
            _task,
            _source,
            _authorizeAtAcquire,
            _sendResponse,
            _reportOutcome,
          ) => undefined,
        ),
      }).execute({
        task: fetchTask(automaticExecution),
        execution: automaticExecution,
      }),
    ).rejects.toThrow("Protected task handler completed without response")
  })

  it.each([
    [
      "throws",
      () => {
        throw new Error("synchronous adapter failure")
      },
      "synchronous adapter failure",
    ],
    [
      "rejects",
      async () => {
        throw new Error("asynchronous adapter failure")
      },
      "asynchronous adapter failure",
    ],
  ])("rejects when the production adapter %s", async (_case, run, message) => {
    await expect(
      createDecisionCoordinator({
        executeAuthorizedTask: vi.fn(
          (
            _task,
            _source,
            _authorizeAtAcquire,
            _sendResponse,
            _reportOutcome,
          ) => run(),
        ),
      }).execute({
        task: fetchTask(automaticExecution),
        execution: automaticExecution,
      }),
    ).rejects.toThrow(message)
  })

  it("rejects a runtime task whose params contain duplicate execution", async () => {
    const executeAuthorizedTask = vi.fn()
    const response = await createDecisionCoordinator({
      executeAuthorizedTask,
    }).execute({
      task: {
        kind: TEMP_CONTEXT_TASK_KINDS.OpenContext,
        params: {
          url: "https://example.invalid",
          requestId: "missing-param-execution",
          protectionBypassExecution: verificationExecution,
        },
      },
      execution: verificationExecution,
    })

    expect(executeAuthorizedTask).not.toHaveBeenCalled()
    expect(response).toEqual(
      expect.objectContaining({
        success: false,
        code: API_ERROR_CODES.TEMP_WINDOW_POLICY_CONTEXT_INVALID,
      }),
    )
  })

  it("returns missing and invalid execution without pool submission", async () => {
    const coordinator = createDecisionCoordinator()
    for (const execution of [undefined, { version: 2, kind: "user_command" }]) {
      await expect(
        coordinator.execute({
          task: fetchTask(automaticExecution),
          execution,
        } as any),
      ).resolves.toMatchObject({
        success: false,
        code: API_ERROR_CODES.TEMP_WINDOW_POLICY_CONTEXT_INVALID,
      })
    }
  })

  it("rejects v1 execution before policy, capability, resource, or pool work", async () => {
    const readPolicy = vi.fn()
    const resolveCapability = vi.fn()
    const validateNewApiSessionReadResource = vi.fn()
    const executeAuthorizedTask = vi.fn()
    const recordDecision = vi.fn()

    const v1Execution = {
      version: 1,
      kind: "automatic",
      feature: "account_refresh",
      trigger: "scheduled",
      surface: "background",
    }

    expect(resolveProtectionBypassExecution(v1Execution)).toEqual({
      kind: "invalid",
      reason: PROTECTION_BYPASS_DENIED_REASONS.InvalidExecution,
    })

    const response = await createDecisionCoordinator({
      readPolicy,
      resolveCapability,
      validateNewApiSessionReadResource,
      executeAuthorizedTask,
      recordDecision,
    }).execute({
      task: fetchTask(automaticExecution),
      execution: v1Execution,
    } as any)

    expect(response).toMatchObject({
      success: false,
      code: API_ERROR_CODES.TEMP_WINDOW_POLICY_CONTEXT_INVALID,
    })
    expect(readPolicy).not.toHaveBeenCalled()
    expect(resolveCapability).not.toHaveBeenCalled()
    expect(validateNewApiSessionReadResource).not.toHaveBeenCalled()
    expect(executeAuthorizedTask).not.toHaveBeenCalled()
    expect(recordDecision).not.toHaveBeenCalled()
  })

  it.each([
    ["missing", undefined, PROTECTION_BYPASS_DENIED_REASONS.MissingExecution],
    [
      "malformed",
      { version: 2, kind: "user_command" },
      PROTECTION_BYPASS_DENIED_REASONS.InvalidExecution,
    ],
  ])(
    "skips current-resource I/O for %s New API session-read intent",
    async (_case, execution, _reason) => {
      const validateNewApiSessionReadResource = vi.fn().mockResolvedValue(true)
      const recordDecision = vi.fn().mockResolvedValue(undefined)

      await expect(
        createDecisionCoordinator({
          validateNewApiSessionReadResource,
          recordDecision,
        }).execute({
          task: {
            kind: TEMP_CONTEXT_TASK_KINDS.NewApiSessionRead,
            params: {
              origin: "https://example.invalid",
              action: "channel_key",
              userId: "example-user",
              channelId: 12,
            },
          },
          execution,
        } as any),
      ).resolves.toMatchObject({
        success: false,
        code: API_ERROR_CODES.TEMP_WINDOW_POLICY_CONTEXT_INVALID,
      })
      expect(validateNewApiSessionReadResource).not.toHaveBeenCalled()
      expect(recordDecision).not.toHaveBeenCalled()
    },
  )

  it("preflights a task outside the command-derived feature matrix", async () => {
    const readPolicy = vi.fn().mockResolvedValue(allowedPolicy)
    const resolveCapability = vi.fn()
    const executeAuthorizedTask = vi.fn()
    const recordDecision = vi.fn().mockResolvedValue(undefined)
    const execution = userCommandExecution(
      PROTECTION_BYPASS_USER_COMMANDS.RefreshAccount,
    )
    await expect(
      createDecisionCoordinator({
        readPolicy,
        resolveCapability,
        executeAuthorizedTask,
        recordDecision,
      }).execute({
        task: {
          kind: TEMP_CONTEXT_TASK_KINDS.NewApiSessionRead,
          params: {
            origin: "https://example.invalid",
            action: "channel_key",
            userId: "example-user",
            channelId: 12,
          },
        },
        execution,
      }),
    ).resolves.toMatchObject({
      success: false,
      code: API_ERROR_CODES.TEMP_WINDOW_POLICY_CONTEXT_INVALID,
    })
    expect(readPolicy).not.toHaveBeenCalled()
    expect(resolveCapability).not.toHaveBeenCalled()
    expect(executeAuthorizedTask).not.toHaveBeenCalled()
    expect(recordDecision).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        decision: PROTECTION_BYPASS_DECISION_RESULTS.Denied,
        denialReason: PROTECTION_BYPASS_DENIED_REASONS.TaskNotPermitted,
      }),
    )
  })

  it("checks the exact New API origin, user, and channel at acquire time", async () => {
    const execution = userCommandExecution(
      PROTECTION_BYPASS_USER_COMMANDS.ManageApiKeys,
    )
    const validateNewApiSessionReadResource = vi.fn().mockResolvedValue(true)
    const response = await createDecisionCoordinator({
      validateNewApiSessionReadResource,
    }).execute({
      task: {
        kind: TEMP_CONTEXT_TASK_KINDS.NewApiSessionRead,
        params: {
          origin: "https://example.invalid",
          action: "channel_key",
          userId: "example-user",
          channelId: 12,
        },
      },
      execution,
    })

    expect(validateNewApiSessionReadResource).toHaveBeenCalledWith({
      origin: "https://example.invalid",
      userId: "example-user",
      channelId: 12,
    })
    expect(response).toEqual({ success: true })
  })

  it("fails closed when the current New API resource is stale", async () => {
    const execution = userCommandExecution(
      PROTECTION_BYPASS_USER_COMMANDS.ManageApiKeys,
    )
    const response = await createDecisionCoordinator({
      validateNewApiSessionReadResource: vi.fn().mockResolvedValue(false),
    }).execute({
      task: {
        kind: TEMP_CONTEXT_TASK_KINDS.NewApiSessionRead,
        params: {
          origin: "https://example.invalid",
          action: "channel_key",
          userId: "example-user",
          channelId: 12,
        },
      },
      execution,
    })

    expect(response).toEqual({
      success: false,
      code: API_ERROR_CODES.TEMP_WINDOW_POLICY_CONTEXT_INVALID,
    })
  })

  it("uses the current resource as the final acquire-time fact before pool use", async () => {
    const events: string[] = []
    const capabilityStarted = createDeferred<void>()
    const releaseCapability = createDeferred<void>()
    const reuseOrCreate = vi.fn()
    const recordDecision = vi.fn().mockResolvedValue(undefined)
    let resourceIsCurrent = true
    const execution = userCommandExecution(
      PROTECTION_BYPASS_USER_COMMANDS.ManageApiKeys,
    )

    const responsePromise = createProtectionBypassCoordinator({
      readPolicy: vi.fn(async () => {
        events.push("policy")
        return allowedPolicy
      }),
      resolveCapability: vi.fn(async () => {
        events.push("capability")
        capabilityStarted.resolve()
        await releaseCapability.promise
        return { kind: "available", adapter: "tab" } as const
      }),
      validateNewApiSessionReadResource: vi.fn(async () => {
        events.push("resource")
        return resourceIsCurrent
      }),
      executeAuthorizedTask: vi.fn(
        async (
          _task,
          _source,
          authorizeAtAcquire,
          sendResponse,
          reportOutcome,
        ) => {
          events.push("lock")
          const decisionPromise = authorizeAtAcquire()
          await capabilityStarted.promise
          resourceIsCurrent = false
          releaseCapability.resolve()
          const decision = await decisionPromise
          events.push("decision")
          if (decision.kind === PROTECTION_BYPASS_DECISION_RESULTS.Allowed) {
            reuseOrCreate()
            reportOutcome({ kind: "allowed", adapter: decision.adapter })
            sendResponse({ success: true })
            return
          }
          reportOutcome({ kind: "denied" })
          sendResponse({
            success: false,
            code: getProtectionBypassDecisionErrorCode(decision),
          })
        },
      ),
      recordDecision,
    }).execute({
      task: {
        kind: TEMP_CONTEXT_TASK_KINDS.NewApiSessionRead,
        params: {
          origin: "https://example.invalid",
          action: "channel_key",
          userId: "example-user",
          channelId: 12,
        },
      },
      execution,
    })

    await expect(responsePromise).resolves.toEqual({
      success: false,
      code: API_ERROR_CODES.TEMP_WINDOW_POLICY_CONTEXT_INVALID,
    })
    expect(events).toEqual([
      "lock",
      "policy",
      "capability",
      "resource",
      "decision",
    ])
    expect(reuseOrCreate).not.toHaveBeenCalled()
    expect(recordDecision).toHaveBeenCalledTimes(1)
    expect(recordDecision).toHaveBeenCalledWith(
      expect.objectContaining({
        decision: PROTECTION_BYPASS_DECISION_RESULTS.Denied,
        denialReason: PROTECTION_BYPASS_DENIED_REASONS.ResourceStale,
      }),
    )
  })

  it("normalizes resource-validator rejection to one controlled stale denial", async () => {
    const recordDecision = vi.fn().mockResolvedValue(undefined)
    const execution = userCommandExecution(
      PROTECTION_BYPASS_USER_COMMANDS.ManageApiKeys,
    )

    await expect(
      createDecisionCoordinator({
        validateNewApiSessionReadResource: vi
          .fn()
          .mockRejectedValue(new Error("resource lookup failed")),
        recordDecision,
      }).execute({
        task: {
          kind: TEMP_CONTEXT_TASK_KINDS.NewApiSessionRead,
          params: {
            origin: "https://example.invalid",
            action: "channel_key",
            userId: "example-user",
            channelId: 12,
          },
        },
        execution,
      }),
    ).resolves.toEqual({
      success: false,
      code: API_ERROR_CODES.TEMP_WINDOW_POLICY_CONTEXT_INVALID,
    })
    expect(recordDecision).toHaveBeenCalledTimes(1)
    expect(recordDecision).toHaveBeenCalledWith(
      expect.objectContaining({
        decision: PROTECTION_BYPASS_DECISION_RESULTS.Denied,
        denialReason: PROTECTION_BYPASS_DENIED_REASONS.ResourceStale,
      }),
    )
  })

  it("reads policy only after the admitted task authorizes inside the acquire lock", async () => {
    const events: string[] = []
    const readPolicy = vi.fn(async () => {
      events.push("policy")
      return allowedPolicy
    })
    const executeAuthorizedTask = vi.fn(
      async (
        _task,
        _source,
        authorizeAtAcquire,
        sendResponse,
        _reportOutcome,
      ) => {
        events.push("scheduler")
        events.push("origin-lock")
        expect(readPolicy).not.toHaveBeenCalled()
        const decision = await authorizeAtAcquire()
        events.push("reuse-or-create")
        sendResponse({
          success: decision.kind === PROTECTION_BYPASS_DECISION_RESULTS.Allowed,
        })
      },
    )

    await createDecisionCoordinator({
      readPolicy,
      executeAuthorizedTask,
    }).execute({
      task: fetchTask(automaticExecution),
      execution: automaticExecution,
    })

    expect(events).toEqual([
      "scheduler",
      "origin-lock",
      "policy",
      "reuse-or-create",
    ])
  })

  it("does not let summary recording failures alter the final decision", async () => {
    await expect(
      createDecisionCoordinator({
        recordDecision: vi.fn().mockRejectedValue(new Error("storage failed")),
      }).execute({
        task: fetchTask(automaticExecution),
        execution: automaticExecution,
      }),
    ).resolves.toEqual({ success: true })
  })

  it("does not let an unresolved summary write delay acquire or the response", async () => {
    const recordStarted = createDeferred<void>()
    const neverFinishes = new Promise<void>(() => undefined)
    const acquired = vi.fn()
    const task = withExecution(allTaskKinds[6], verificationExecution)
    const coordinator = createDecisionCoordinator({
      executeAuthorizedTask: vi.fn(
        async (
          _task,
          _source,
          authorizeAtAcquire,
          sendResponse,
          reportOutcome,
        ) => {
          const decision = await authorizeAtAcquire()
          acquired()
          if (decision.kind === PROTECTION_BYPASS_DECISION_RESULTS.Allowed) {
            reportOutcome({ kind: "allowed", adapter: "tab" })
          }
          sendResponse({ success: true })
        },
      ),
      recordDecision: vi.fn(async () => {
        recordStarted.resolve()
        await neverFinishes
      }),
    })

    const execution = coordinator.execute({
      task,
      execution: verificationExecution,
    })

    await recordStarted.promise
    await vi.waitFor(() => {
      expect(acquired).toHaveBeenCalledTimes(1)
    })
    await expect(execution).resolves.toEqual({ success: true })
  })

  it("records the actual acquired adapter instead of the policy preference", async () => {
    const recordDecision = vi.fn().mockResolvedValue(undefined)
    const task = withExecution(allTaskKinds[6], verificationExecution)

    await createDecisionCoordinator({
      resolveCapability: vi.fn().mockResolvedValue({
        kind: "available",
        adapter: "window",
      }),
      executeAuthorizedTask: vi.fn(
        async (
          _task,
          _source,
          authorizeAtAcquire,
          sendResponse,
          reportOutcome,
        ) => {
          expect(await authorizeAtAcquire()).toMatchObject({
            kind: "allowed",
            adapter: "window",
          })
          reportOutcome({ kind: "allowed", adapter: "tab" })
          sendResponse({ success: true })
        },
      ),
      recordDecision,
    }).execute({ task, execution: verificationExecution })

    expect(recordDecision).toHaveBeenCalledTimes(1)
    expect(recordDecision).toHaveBeenCalledWith(
      expect.objectContaining({ decision: "allowed", adapter: "tab" }),
    )
    expect(recordDecision).not.toHaveBeenCalledWith(
      expect.objectContaining({ adapter: "window" }),
    )
  })

  it("records acquisition failure as one unavailable outcome without an adapter", async () => {
    const recordDecision = vi.fn().mockResolvedValue(undefined)
    const task = withExecution(allTaskKinds[6], verificationExecution)

    await createDecisionCoordinator({
      resolveCapability: vi.fn().mockResolvedValue({
        kind: "available",
        adapter: "window",
      }),
      executeAuthorizedTask: vi.fn(
        async (
          _task,
          _source,
          authorizeAtAcquire,
          sendResponse,
          reportOutcome,
        ) => {
          expect(await authorizeAtAcquire()).toMatchObject({ kind: "allowed" })
          reportOutcome({ kind: "unavailable" })
          sendResponse({ success: false })
        },
      ),
      recordDecision,
    }).execute({ task, execution: verificationExecution })

    expect(recordDecision).toHaveBeenCalledTimes(1)
    expect(recordDecision).toHaveBeenCalledWith(
      expect.objectContaining({ decision: "unavailable" }),
    )
    expect(recordDecision).not.toHaveBeenCalledWith(
      expect.objectContaining({ adapter: expect.anything() }),
    )
  })

  it("maps a real preference storage read failure to unavailable policy", async () => {
    const getSpy = vi
      .spyOn(browser.storage.local, "get")
      .mockRejectedValueOnce(new Error("storage unavailable"))
    try {
      const response = await createProtectionBypassCoordinator({
        resolveCapability: vi.fn().mockResolvedValue({
          kind: "available",
          adapter: "tab",
        }),
        executeAuthorizedTask: vi.fn(
          async (
            _task,
            _source,
            authorizeAtAcquire,
            sendResponse,
            reportOutcome,
          ) => {
            const decision = await authorizeAtAcquire()
            reportOutcome(
              decision.kind === PROTECTION_BYPASS_DECISION_RESULTS.Allowed
                ? { kind: "allowed", adapter: decision.adapter }
                : { kind: "denied", decision },
            )
            sendResponse(
              decision.kind === PROTECTION_BYPASS_DECISION_RESULTS.Allowed
                ? { success: true }
                : {
                    success: false,
                    code: getProtectionBypassDecisionErrorCode(decision),
                  },
            )
          },
        ),
      }).execute({
        task: fetchTask(automaticExecution),
        execution: automaticExecution,
      })
      expect(response).toEqual({
        success: false,
        code: API_ERROR_CODES.TEMP_WINDOW_POLICY_CONTEXT_INVALID,
      })
    } finally {
      getSpy.mockRestore()
    }
  })

  it("maps an injected policy reader rejection to unavailable policy", async () => {
    const response = await createProtectionBypassCoordinator({
      readPolicy: vi.fn().mockRejectedValue(new Error("storage unavailable")),
      resolveCapability: vi.fn().mockResolvedValue({
        kind: "available",
        adapter: "tab",
      }),
      executeAuthorizedTask: vi.fn(
        async (
          _task,
          _source,
          authorizeAtAcquire,
          sendResponse,
          reportOutcome,
        ) => {
          const decision = await authorizeAtAcquire()
          reportOutcome({ kind: "denied" })
          sendResponse({
            success: false,
            code:
              decision.kind === PROTECTION_BYPASS_DECISION_RESULTS.Denied
                ? getProtectionBypassDecisionErrorCode(decision)
                : undefined,
          })
        },
      ),
    }).execute({
      task: fetchTask(automaticExecution),
      execution: automaticExecution,
    })

    expect(response).toEqual({
      success: false,
      code: API_ERROR_CODES.TEMP_WINDOW_POLICY_CONTEXT_INVALID,
    })
  })

  it("maps capability lookup rejection to unavailable policy context", async () => {
    const recordDecision = vi.fn().mockResolvedValue(undefined)

    await expect(
      createDecisionCoordinator({
        resolveCapability: vi
          .fn()
          .mockRejectedValue(new Error("lookup failed")),
        recordDecision,
      }).execute({
        task: fetchTask(automaticExecution),
        execution: automaticExecution,
      }),
    ).resolves.toEqual({
      success: false,
      code: API_ERROR_CODES.TEMP_WINDOW_POLICY_CONTEXT_INVALID,
    })
    expect(recordDecision).toHaveBeenCalledTimes(1)
    expect(recordDecision).toHaveBeenCalledWith(
      expect.objectContaining({
        decision: PROTECTION_BYPASS_DECISION_RESULTS.Unavailable,
        denialReason: PROTECTION_BYPASS_DENIED_REASONS.UnsupportedEnvironment,
      }),
    )
  })

  it("denies queued automatic work when the master is disabled before acquire", async () => {
    let automaticMasterEnabled = true
    const reuseOrCreate = vi.fn()
    const response = await createDecisionCoordinator({
      readPolicy: vi.fn(async () => ({
        ...allowedPolicy,
        automaticMasterEnabled,
      })),
      executeAuthorizedTask: vi.fn(
        async (
          _task,
          _source,
          authorizeAtAcquire,
          sendResponse,
          _reportOutcome,
        ) => {
          automaticMasterEnabled = false
          const decision = await authorizeAtAcquire()
          if (decision.kind === PROTECTION_BYPASS_DECISION_RESULTS.Allowed) {
            reuseOrCreate()
          }
          sendResponse({
            success: false,
            code: getProtectionBypassDecisionErrorCode(decision),
          })
        },
      ),
    }).execute({
      task: fetchTask(automaticExecution),
      execution: automaticExecution,
    })

    expect(reuseOrCreate).not.toHaveBeenCalled()
    expect(response).toEqual({
      success: false,
      code: API_ERROR_CODES.TEMP_WINDOW_DISABLED,
    })
  })

  it("binds queued policy, presentation, and telemetry to one intent snapshot", async () => {
    const mutableExecution = { ...automaticExecution } as {
      version: 2
      kind: typeof PROTECTION_BYPASS_EXECUTION_KINDS.Automatic
      feature: ProtectionBypassAutomaticFeature
      trigger: (typeof PROTECTION_BYPASS_AUTOMATIC_TRIGGERS)[keyof typeof PROTECTION_BYPASS_AUTOMATIC_TRIGGERS]
      surface: (typeof PROTECTION_BYPASS_SURFACES)[keyof typeof PROTECTION_BYPASS_SURFACES]
    }
    const recordDecision = vi.fn().mockResolvedValue(undefined)
    const observedSource: unknown[] = []
    const observedDecision: unknown[] = []

    const responsePromise = createProtectionBypassCoordinator({
      readPolicy: vi.fn().mockResolvedValue({
        ...allowedPolicy,
        automaticAccountRefreshEnabled: false,
        allowedSurfaces: {
          ...allowedPolicy.allowedSurfaces,
          popup: false,
        },
      }),
      recordDecision,
      executeAuthorizedTask: vi.fn(
        async (
          _task,
          source,
          authorizeAtAcquire,
          sendResponse,
          reportOutcome,
        ) => {
          observedSource.push(source)
          mutableExecution.feature = PROTECTION_BYPASS_FEATURES.AccountRefresh
          mutableExecution.trigger =
            PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.Scheduled
          mutableExecution.surface = PROTECTION_BYPASS_SURFACES.Popup

          const decision = await authorizeAtAcquire()
          observedDecision.push(decision)
          if (decision.kind === PROTECTION_BYPASS_DECISION_RESULTS.Allowed) {
            reportOutcome({ kind: "allowed", adapter: decision.adapter })
            sendResponse({ success: true })
            return
          }
          reportOutcome({ kind: "denied" })
          sendResponse({
            success: false,
            code: getProtectionBypassDecisionErrorCode(decision),
          })
        },
      ),
    }).execute({
      task: fetchTask(mutableExecution),
      execution: mutableExecution,
    })

    await expect(responsePromise).resolves.toEqual({ success: true })
    expect(observedSource).toEqual([PROTECTION_BYPASS_SURFACES.Options])
    expect(observedDecision).toEqual([
      expect.objectContaining({
        kind: PROTECTION_BYPASS_DECISION_RESULTS.Allowed,
        feature: PROTECTION_BYPASS_FEATURES.LdohSiteLookup,
        surface: PROTECTION_BYPASS_SURFACES.Options,
      }),
    ])
    expect(recordDecision).toHaveBeenCalledWith(
      expect.objectContaining({
        feature: PROTECTION_BYPASS_FEATURES.LdohSiteLookup,
        invocationKind: PROTECTION_BYPASS_EXECUTION_KINDS.Automatic,
        automaticTrigger: PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.UiLifecycle,
        decision: PROTECTION_BYPASS_DECISION_RESULTS.Allowed,
      }),
    )
  })

  it.each([
    [undefined, PROTECTION_BYPASS_DENIED_REASONS.MissingExecution],
    [
      { version: 2, kind: "user_command" },
      PROTECTION_BYPASS_DENIED_REASONS.InvalidExecution,
    ],
  ])(
    "does not fabricate telemetry for %s execution",
    async (execution, _reason) => {
      const recordDecision = vi.fn().mockResolvedValue(undefined)

      await createDecisionCoordinator({ recordDecision }).execute({
        task: fetchTask(automaticExecution),
        execution,
      } as any)

      expect(recordDecision).not.toHaveBeenCalled()
    },
  )

  it("rejects malformed task envelopes before execution", async () => {
    const executeAuthorizedTask = vi.fn()

    const response = await createDecisionCoordinator({
      executeAuthorizedTask,
    }).execute({
      task: { kind: "unknown" },
      execution: automaticExecution,
    } as any)

    expect(executeAuthorizedTask).not.toHaveBeenCalled()
    expect(response).toEqual(
      expect.objectContaining({
        success: false,
        code: API_ERROR_CODES.TEMP_WINDOW_POLICY_CONTEXT_INVALID,
      }),
    )
  })
})
