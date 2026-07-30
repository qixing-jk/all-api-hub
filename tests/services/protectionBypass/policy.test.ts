import { describe, expect, expectTypeOf, it } from "vitest"

import { TEMP_CONTEXT_MODES } from "~/constants/tempContextMode"
import {
  getTempContextTaskMetadata,
  NEW_API_SESSION_READ_ACTIONS,
  PROTECTION_BYPASS_AUTOMATIC_TRIGGERS,
  PROTECTION_BYPASS_CAPABILITY_KINDS,
  PROTECTION_BYPASS_DECISION_RESULTS,
  PROTECTION_BYPASS_DENIED_REASONS,
  PROTECTION_BYPASS_EXECUTION_KINDS,
  PROTECTION_BYPASS_EXECUTION_VERSION,
  PROTECTION_BYPASS_FEATURES,
  PROTECTION_BYPASS_OPERATIONS,
  PROTECTION_BYPASS_SURFACES,
  TEMP_CONTEXT_TASK_KINDS,
  type ProtectionBypassAutomaticTrigger,
  type ProtectionBypassCause,
  type ProtectionBypassExecutionKind,
  type ProtectionBypassFeature,
  type ProtectionBypassOperation,
  type ProtectionBypassSurface,
  type ProtectionBypassUserCommand,
  type ResolvedProtectionBypassExecution,
  type TempContextTask,
} from "~/services/protectionBypass/contracts"
import {
  evaluateProtectionBypassPolicy,
  type ProtectionBypassCapability,
  type ProtectionBypassPolicy,
  type ProtectionBypassPolicyDecision,
} from "~/services/protectionBypass/policy"
import {
  normalizeProtectionBypassPreferences,
  readProtectionBypassPolicy,
} from "~/services/protectionBypass/preferencePolicy"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"

const fetchParams = {
  originUrl: "https://example.invalid",
  fetchUrl: "https://example.invalid/api/account",
  requestId: "request-1",
  protectionBypassExecution: {
    version: PROTECTION_BYPASS_EXECUTION_VERSION,
    kind: PROTECTION_BYPASS_EXECUTION_KINDS.Automatic,
    feature: PROTECTION_BYPASS_FEATURES.SiteDetection,
    trigger: PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.BackgroundRecovery,
    surface: PROTECTION_BYPASS_SURFACES.Background,
  } as const,
}

const nativeParams = {
  originUrl: "https://example.invalid",
  pageUrl: "https://example.invalid/checkin",
  requestId: "request-1",
  siteType: "new-api" as const,
  expectedUserId: "example-user",
  protectionBypassExecution: {
    version: PROTECTION_BYPASS_EXECUTION_VERSION,
    kind: PROTECTION_BYPASS_EXECUTION_KINDS.Automatic,
    feature: PROTECTION_BYPASS_FEATURES.Checkin,
    trigger: PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.BackgroundRecovery,
    surface: PROTECTION_BYPASS_SURFACES.Background,
  } as const,
}

const availableCapability: ProtectionBypassCapability = {
  kind: PROTECTION_BYPASS_CAPABILITY_KINDS.Available,
  adapter: TEMP_CONTEXT_MODES.Tab,
}

function buildPolicy(
  overrides: Partial<ProtectionBypassPolicy> = {},
): ProtectionBypassPolicy {
  return {
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
    preferredMode: TEMP_CONTEXT_MODES.Tab,
    ...overrides,
  }
}

function automaticExecution(
  feature: ProtectionBypassFeature,
  trigger: ProtectionBypassAutomaticTrigger,
  surface: ProtectionBypassSurface,
): ResolvedProtectionBypassExecution {
  return {
    version: PROTECTION_BYPASS_EXECUTION_VERSION,
    kind: PROTECTION_BYPASS_EXECUTION_KINDS.Automatic,
    feature,
    trigger,
    surface,
  }
}

function resolvedUserCommandExecution({
  command,
  feature,
  surface,
}: {
  command: ProtectionBypassUserCommand
  feature: ProtectionBypassFeature
  surface: ProtectionBypassSurface
}): ResolvedProtectionBypassExecution {
  return {
    version: PROTECTION_BYPASS_EXECUTION_VERSION,
    kind: PROTECTION_BYPASS_EXECUTION_KINDS.UserCommand,
    command,
    feature,
    surface,
  }
}

describe("getTempContextTaskMetadata", () => {
  it.each<[TempContextTask, ProtectionBypassOperation, string]>([
    [
      { kind: TEMP_CONTEXT_TASK_KINDS.ApiFallbackFetch, params: fetchParams },
      "fetch",
      "api_error_fallback",
    ],
    [
      {
        kind: TEMP_CONTEXT_TASK_KINDS.ProfileIsolatedFetch,
        params: fetchParams,
      },
      "fetch",
      "browser_profile_isolation",
    ],
    [
      {
        kind: TEMP_CONTEXT_TASK_KINDS.TurnstileFetch,
        params: { ...fetchParams, pageUrl: fetchParams.originUrl },
      },
      "turnstile_fetch",
      "verification_required",
    ],
    [
      { kind: TEMP_CONTEXT_TASK_KINDS.NativePageAction, params: nativeParams },
      "native_page_action",
      "verification_required",
    ],
    [
      {
        kind: TEMP_CONTEXT_TASK_KINDS.RenderedTitle,
        params: {
          originUrl: fetchParams.originUrl,
        },
      },
      "rendered_title",
      "rendered_page_required",
    ],
    [
      {
        kind: TEMP_CONTEXT_TASK_KINDS.SessionRead,
        params: {
          url: fetchParams.originUrl,
          requestId: "request-1",
          siteType: "new-api",
        },
      },
      "session_read",
      "session_required",
    ],
    [
      {
        kind: TEMP_CONTEXT_TASK_KINDS.NewApiSessionRead,
        params: {
          origin: fetchParams.originUrl,
          action: NEW_API_SESSION_READ_ACTIONS.ChannelKey,
          channelId: 12,
          userId: "example-user",
        },
      },
      "session_read",
      "session_required",
    ],
    [
      {
        kind: TEMP_CONTEXT_TASK_KINDS.OpenContext,
        params: {
          url: fetchParams.originUrl,
          requestId: "request-1",
        },
      },
      "open_context",
      "explicit_context",
    ],
  ])("derives metadata for %s", (task, operation, cause) => {
    expect(getTempContextTaskMetadata(task)).toEqual({ operation, cause })
  })
})

describe("canonical protection-bypass surfaces", () => {
  it("uses the temp-window request source object as its runtime source of truth", () => {
    expect(PROTECTION_BYPASS_SURFACES).toBe(TEMP_WINDOW_REQUEST_SOURCES)
  })
})

describe("normalizeProtectionBypassPreferences", () => {
  const source = {
    enabled: false,
    useForAutoRefresh: false,
    useForManualRefresh: true,
    useInPopup: false,
    useInOptions: true,
    useInSidePanel: false,
    tempContextMode: TEMP_CONTEXT_MODES.Composite,
  }

  it("maps persisted compatibility fields without inventing a content-script switch", () => {
    expect(normalizeProtectionBypassPreferences(source)).toEqual({
      automaticMasterEnabled: false,
      automaticAccountRefreshEnabled: false,
      manualAccountRefreshEnabled: true,
      allowedSurfaces: {
        popup: false,
        options: true,
        sidepanel: false,
        content_script: true,
        background: true,
      },
      preferredMode: TEMP_CONTEXT_MODES.Composite,
    })
  })

  it("reports preference read failures instead of falling back to defaults", async () => {
    const result = await readProtectionBypassPolicy(async () => {
      throw new Error("storage unavailable")
    })

    expect(result).toEqual({ kind: "unavailable" })
  })
})

describe("evaluateProtectionBypassPolicy", () => {
  const newApiSessionReadTask: TempContextTask = {
    kind: TEMP_CONTEXT_TASK_KINDS.NewApiSessionRead,
    params: {
      origin: fetchParams.originUrl,
      action: NEW_API_SESSION_READ_ACTIONS.ChannelKey,
      channelId: 12,
      userId: "example-user",
    },
  }

  it("keeps automatic New API session reads behind the automatic master", () => {
    expect(
      evaluateProtectionBypassPolicy({
        execution: automaticExecution(
          PROTECTION_BYPASS_FEATURES.SessionResync,
          PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.UiLifecycle,
          PROTECTION_BYPASS_SURFACES.Options,
        ),
        task: newApiSessionReadTask,
        policy: buildPolicy({ automaticMasterEnabled: false }),
        capability: availableCapability,
      }),
    ).toMatchObject({ kind: "denied", reason: "automatic_disabled" })
  })

  it("allows verify-protection session reads without expanding the feature to generic fetch", () => {
    const execution = resolvedUserCommandExecution({
      command: "verify_protection",
      feature: PROTECTION_BYPASS_FEATURES.Verification,
      surface: PROTECTION_BYPASS_SURFACES.Options,
    })

    expect(
      evaluateProtectionBypassPolicy({
        execution,
        task: newApiSessionReadTask,
        policy: buildPolicy(),
        capability: availableCapability,
      }),
    ).toMatchObject({ kind: "allowed", operation: "session_read" })
    expect(
      evaluateProtectionBypassPolicy({
        execution,
        task: {
          kind: TEMP_CONTEXT_TASK_KINDS.ApiFallbackFetch,
          params: fetchParams,
        },
        policy: buildPolicy(),
        capability: availableCapability,
      }),
    ).toMatchObject({ kind: "denied", reason: "operation_not_permitted" })
  })

  it("denies an otherwise eligible operation when its current resource is stale", () => {
    expect(
      evaluateProtectionBypassPolicy({
        execution: resolvedUserCommandExecution({
          command: "verify_protection",
          feature: PROTECTION_BYPASS_FEATURES.Verification,
          surface: PROTECTION_BYPASS_SURFACES.Options,
        }),
        task: newApiSessionReadTask,
        policy: buildPolicy(),
        capability: availableCapability,
        resourceIsCurrent: false,
      }),
    ).toMatchObject({
      kind: "denied",
      reason: PROTECTION_BYPASS_DENIED_REASONS.ResourceStale,
    })
  })

  it("keeps resource currentness optional for non-resource operations", () => {
    expect(
      evaluateProtectionBypassPolicy({
        execution: resolvedUserCommandExecution({
          command: "add_account",
          feature: PROTECTION_BYPASS_FEATURES.AccountOnboarding,
          surface: PROTECTION_BYPASS_SURFACES.Options,
        }),
        task: {
          kind: TEMP_CONTEXT_TASK_KINDS.ApiFallbackFetch,
          params: fetchParams,
        },
        policy: buildPolicy(),
        capability: availableCapability,
      }),
    ).toMatchObject({ kind: "allowed" })
  })
  function assertEvaluatedDenialContext(
    decision: ProtectionBypassPolicyDecision,
  ) {
    if (
      decision.kind === PROTECTION_BYPASS_DECISION_RESULTS.Denied &&
      decision.reason === PROTECTION_BYPASS_DENIED_REASONS.OperationNotPermitted
    ) {
      expectTypeOf(decision.feature).toEqualTypeOf<ProtectionBypassFeature>()
      expectTypeOf(
        decision.operation,
      ).toEqualTypeOf<ProtectionBypassOperation>()
      expectTypeOf(decision.cause).toEqualTypeOf<ProtectionBypassCause>()
      expectTypeOf(decision.surface).toEqualTypeOf<ProtectionBypassSurface>()
    }
  }

  function assertContextlessDenial(decision: ProtectionBypassPolicyDecision) {
    if (
      decision.kind === PROTECTION_BYPASS_DECISION_RESULTS.Denied &&
      decision.reason === PROTECTION_BYPASS_DENIED_REASONS.MissingIntent
    ) {
      expectTypeOf(decision).toEqualTypeOf<{
        kind: "denied"
        reason: "missing_intent"
      }>()
    }
  }

  it.each(Object.values(PROTECTION_BYPASS_AUTOMATIC_TRIGGERS))(
    "denies automatic %s work when the automatic master is disabled",
    (trigger) => {
      expect(
        evaluateProtectionBypassPolicy({
          execution: automaticExecution(
            PROTECTION_BYPASS_FEATURES.Checkin,
            trigger,
            PROTECTION_BYPASS_SURFACES.Background,
          ),
          task: {
            kind: TEMP_CONTEXT_TASK_KINDS.NativePageAction,
            params: nativeParams,
          },
          policy: buildPolicy({ automaticMasterEnabled: false }),
          capability: availableCapability,
        }),
      ).toMatchObject({ kind: "denied", reason: "automatic_disabled" })
    },
  )

  it("keeps the manual refresh policy narrower than an eligible refresh command", () => {
    const execution = resolvedUserCommandExecution({
      command: "refresh_account",
      feature: PROTECTION_BYPASS_FEATURES.AccountRefresh,
      surface: PROTECTION_BYPASS_SURFACES.Options,
    })

    expect(
      evaluateProtectionBypassPolicy({
        execution,
        task: {
          kind: TEMP_CONTEXT_TASK_KINDS.ApiFallbackFetch,
          params: fetchParams,
        },
        policy: buildPolicy({ manualAccountRefreshEnabled: false }),
        capability: availableCapability,
      }),
    ).toMatchObject({ kind: "denied", reason: "manual_feature_disabled" })
  })

  it("denies an automatic account refresh when its feature policy is disabled", () => {
    expect(
      evaluateProtectionBypassPolicy({
        execution: automaticExecution(
          PROTECTION_BYPASS_FEATURES.AccountRefresh,
          PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.Scheduled,
          PROTECTION_BYPASS_SURFACES.Background,
        ),
        task: {
          kind: TEMP_CONTEXT_TASK_KINDS.ApiFallbackFetch,
          params: fetchParams,
        },
        policy: buildPolicy({ automaticAccountRefreshEnabled: false }),
        capability: availableCapability,
      }),
    ).toMatchObject({ kind: "denied", reason: "feature_disabled" })
  })

  it("denies a disabled originating surface", () => {
    const execution = resolvedUserCommandExecution({
      command: "add_account",
      feature: PROTECTION_BYPASS_FEATURES.AccountOnboarding,
      surface: PROTECTION_BYPASS_SURFACES.Popup,
    })

    expect(
      evaluateProtectionBypassPolicy({
        execution,
        task: {
          kind: TEMP_CONTEXT_TASK_KINDS.ApiFallbackFetch,
          params: fetchParams,
        },
        policy: buildPolicy({
          allowedSurfaces: {
            ...buildPolicy().allowedSurfaces,
            popup: false,
          },
        }),
        capability: availableCapability,
      }),
    ).toMatchObject({ kind: "denied", reason: "surface_disabled" })
  })

  it("denies missing execution without inferring intent from request metadata", () => {
    const decision = evaluateProtectionBypassPolicy({
      execution: undefined,
      task: {
        kind: TEMP_CONTEXT_TASK_KINDS.ApiFallbackFetch,
        params: fetchParams,
      },
      policy: buildPolicy(),
      capability: availableCapability,
    })

    assertContextlessDenial(decision)
    expect(decision).toMatchObject({ kind: "denied", reason: "missing_intent" })
  })

  it("denies an operation outside the static feature-operation matrix", () => {
    const execution = resolvedUserCommandExecution({
      command: "verify_protection",
      feature: PROTECTION_BYPASS_FEATURES.Verification,
      surface: PROTECTION_BYPASS_SURFACES.Options,
    })

    const decision = evaluateProtectionBypassPolicy({
      execution,
      task: {
        kind: TEMP_CONTEXT_TASK_KINDS.ApiFallbackFetch,
        params: fetchParams,
      },
      policy: buildPolicy(),
      capability: availableCapability,
    })

    assertEvaluatedDenialContext(decision)
    expect(decision).toMatchObject({
      kind: "denied",
      reason: "operation_not_permitted",
    })
  })

  it("allows an eligible user command and returns its evaluated context", () => {
    const decision = evaluateProtectionBypassPolicy({
      execution: resolvedUserCommandExecution({
        command: "add_account",
        feature: PROTECTION_BYPASS_FEATURES.AccountOnboarding,
        surface: PROTECTION_BYPASS_SURFACES.Options,
      }),
      task: {
        kind: TEMP_CONTEXT_TASK_KINDS.ApiFallbackFetch,
        params: fetchParams,
      },
      policy: buildPolicy(),
      capability: availableCapability,
    })

    expect(decision).toEqual({
      kind: "allowed",
      feature: "account_onboarding",
      operation: "fetch",
      cause: "api_error_fallback",
      surface: "options",
      adapter: "tab",
    })
  })

  const allOperations = Object.values(PROTECTION_BYPASS_OPERATIONS)
  const taskForOperation = (
    operation: ProtectionBypassOperation,
  ): TempContextTask => {
    switch (operation) {
      case PROTECTION_BYPASS_OPERATIONS.Fetch:
        return {
          kind: TEMP_CONTEXT_TASK_KINDS.ApiFallbackFetch,
          params: fetchParams,
        }
      case PROTECTION_BYPASS_OPERATIONS.TurnstileFetch:
        return {
          kind: TEMP_CONTEXT_TASK_KINDS.TurnstileFetch,
          params: { ...fetchParams, pageUrl: fetchParams.originUrl },
        }
      case PROTECTION_BYPASS_OPERATIONS.NativePageAction:
        return {
          kind: TEMP_CONTEXT_TASK_KINDS.NativePageAction,
          params: nativeParams,
        }
      case PROTECTION_BYPASS_OPERATIONS.RenderedTitle:
        return {
          kind: TEMP_CONTEXT_TASK_KINDS.RenderedTitle,
          params: {
            originUrl: fetchParams.originUrl,
          },
        }
      case PROTECTION_BYPASS_OPERATIONS.SessionRead:
        return {
          kind: TEMP_CONTEXT_TASK_KINDS.SessionRead,
          params: {
            url: fetchParams.originUrl,
            requestId: "request-1",
            siteType: "new-api",
          },
        }
      case PROTECTION_BYPASS_OPERATIONS.OpenContext:
        return {
          kind: TEMP_CONTEXT_TASK_KINDS.OpenContext,
          params: {
            url: fetchParams.originUrl,
            requestId: "request-1",
          },
        }
    }
  }

  const registrationMatrix: readonly {
    kind: ProtectionBypassExecutionKind
    feature: ProtectionBypassFeature
    operations: readonly ProtectionBypassOperation[]
  }[] = [
    {
      kind: PROTECTION_BYPASS_EXECUTION_KINDS.UserCommand,
      feature: PROTECTION_BYPASS_FEATURES.AccountRefresh,
      operations: [PROTECTION_BYPASS_OPERATIONS.Fetch],
    },
    {
      kind: PROTECTION_BYPASS_EXECUTION_KINDS.UserCommand,
      feature: PROTECTION_BYPASS_FEATURES.AccountOnboarding,
      operations: [
        PROTECTION_BYPASS_OPERATIONS.Fetch,
        PROTECTION_BYPASS_OPERATIONS.RenderedTitle,
        PROTECTION_BYPASS_OPERATIONS.SessionRead,
        PROTECTION_BYPASS_OPERATIONS.OpenContext,
        PROTECTION_BYPASS_OPERATIONS.NativePageAction,
      ],
    },
    {
      kind: PROTECTION_BYPASS_EXECUTION_KINDS.UserCommand,
      feature: PROTECTION_BYPASS_FEATURES.Checkin,
      operations: [
        PROTECTION_BYPASS_OPERATIONS.Fetch,
        PROTECTION_BYPASS_OPERATIONS.TurnstileFetch,
        PROTECTION_BYPASS_OPERATIONS.NativePageAction,
      ],
    },
    {
      kind: PROTECTION_BYPASS_EXECUTION_KINDS.UserCommand,
      feature: PROTECTION_BYPASS_FEATURES.SiteDetection,
      operations: [
        PROTECTION_BYPASS_OPERATIONS.Fetch,
        PROTECTION_BYPASS_OPERATIONS.RenderedTitle,
        PROTECTION_BYPASS_OPERATIONS.SessionRead,
      ],
    },
    {
      kind: PROTECTION_BYPASS_EXECUTION_KINDS.UserCommand,
      feature: PROTECTION_BYPASS_FEATURES.SessionResync,
      operations: [
        PROTECTION_BYPASS_OPERATIONS.Fetch,
        PROTECTION_BYPASS_OPERATIONS.SessionRead,
      ],
    },
    {
      kind: PROTECTION_BYPASS_EXECUTION_KINDS.UserCommand,
      feature: PROTECTION_BYPASS_FEATURES.Verification,
      operations: [
        PROTECTION_BYPASS_OPERATIONS.TurnstileFetch,
        PROTECTION_BYPASS_OPERATIONS.RenderedTitle,
        PROTECTION_BYPASS_OPERATIONS.SessionRead,
        PROTECTION_BYPASS_OPERATIONS.OpenContext,
      ],
    },
    {
      kind: PROTECTION_BYPASS_EXECUTION_KINDS.Automatic,
      feature: PROTECTION_BYPASS_FEATURES.AccountRefresh,
      operations: [PROTECTION_BYPASS_OPERATIONS.Fetch],
    },
    {
      kind: PROTECTION_BYPASS_EXECUTION_KINDS.Automatic,
      feature: PROTECTION_BYPASS_FEATURES.AccountOnboarding,
      operations: [
        PROTECTION_BYPASS_OPERATIONS.Fetch,
        PROTECTION_BYPASS_OPERATIONS.RenderedTitle,
        PROTECTION_BYPASS_OPERATIONS.SessionRead,
        PROTECTION_BYPASS_OPERATIONS.OpenContext,
        PROTECTION_BYPASS_OPERATIONS.NativePageAction,
      ],
    },
    {
      kind: PROTECTION_BYPASS_EXECUTION_KINDS.Automatic,
      feature: PROTECTION_BYPASS_FEATURES.Checkin,
      operations: [
        PROTECTION_BYPASS_OPERATIONS.Fetch,
        PROTECTION_BYPASS_OPERATIONS.TurnstileFetch,
        PROTECTION_BYPASS_OPERATIONS.NativePageAction,
      ],
    },
    {
      kind: PROTECTION_BYPASS_EXECUTION_KINDS.Automatic,
      feature: PROTECTION_BYPASS_FEATURES.SiteDetection,
      operations: [
        PROTECTION_BYPASS_OPERATIONS.Fetch,
        PROTECTION_BYPASS_OPERATIONS.RenderedTitle,
        PROTECTION_BYPASS_OPERATIONS.SessionRead,
      ],
    },
    {
      kind: PROTECTION_BYPASS_EXECUTION_KINDS.Automatic,
      feature: PROTECTION_BYPASS_FEATURES.SessionResync,
      operations: [
        PROTECTION_BYPASS_OPERATIONS.Fetch,
        PROTECTION_BYPASS_OPERATIONS.SessionRead,
      ],
    },
    {
      kind: PROTECTION_BYPASS_EXECUTION_KINDS.Automatic,
      feature: PROTECTION_BYPASS_FEATURES.Verification,
      operations: [
        PROTECTION_BYPASS_OPERATIONS.TurnstileFetch,
        PROTECTION_BYPASS_OPERATIONS.RenderedTitle,
        PROTECTION_BYPASS_OPERATIONS.SessionRead,
        PROTECTION_BYPASS_OPERATIONS.OpenContext,
      ],
    },
  ]

  it.each(registrationMatrix)(
    "enforces the closed $kind registration for $feature",
    ({ kind, feature, operations }) => {
      for (const operation of allOperations) {
        const execution =
          kind === PROTECTION_BYPASS_EXECUTION_KINDS.Automatic
            ? automaticExecution(
                feature,
                PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.Scheduled,
                PROTECTION_BYPASS_SURFACES.Background,
              )
            : resolvedUserCommandExecution({
                command: "verify_protection",
                feature,
                surface: PROTECTION_BYPASS_SURFACES.Background,
              })
        const decision = evaluateProtectionBypassPolicy({
          execution,
          task: taskForOperation(operation),
          policy: buildPolicy(),
          capability: availableCapability,
        })

        if (operations.includes(operation)) {
          expect(decision).toMatchObject({
            kind: "allowed",
            feature,
            operation,
          })
        } else {
          expect(decision).toMatchObject({
            kind: "denied",
            reason: "operation_not_permitted",
          })
        }
      }
    },
  )

  it("applies the static feature matrix to automatic execution", () => {
    expect(
      evaluateProtectionBypassPolicy({
        execution: automaticExecution(
          PROTECTION_BYPASS_FEATURES.AccountOnboarding,
          PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.UiLifecycle,
          PROTECTION_BYPASS_SURFACES.Background,
        ),
        task: {
          kind: TEMP_CONTEXT_TASK_KINDS.ApiFallbackFetch,
          params: fetchParams,
        },
        policy: buildPolicy(),
        capability: availableCapability,
      }),
    ).toMatchObject({ kind: "allowed" })
  })

  it("denies explicitly unavailable policy state", () => {
    expect(
      evaluateProtectionBypassPolicy({
        execution: automaticExecution(
          PROTECTION_BYPASS_FEATURES.Checkin,
          PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.Retry,
          PROTECTION_BYPASS_SURFACES.Background,
        ),
        task: {
          kind: TEMP_CONTEXT_TASK_KINDS.NativePageAction,
          params: nativeParams,
        },
        policy: { kind: PROTECTION_BYPASS_DECISION_RESULTS.Unavailable },
        capability: availableCapability,
      }),
    ).toMatchObject({ kind: "denied", reason: "policy_unavailable" })
  })

  it.each([
    [
      { kind: PROTECTION_BYPASS_CAPABILITY_KINDS.PermissionRequired } as const,
      "permission_required",
    ],
    [
      {
        kind: PROTECTION_BYPASS_CAPABILITY_KINDS.UnsupportedEnvironment,
      } as const,
      "unsupported_environment",
    ],
    [
      { kind: PROTECTION_BYPASS_CAPABILITY_KINDS.AdapterUnavailable } as const,
      "unsupported_environment",
    ],
  ])("maps capability %s to %s", (capability, reason) => {
    expect(
      evaluateProtectionBypassPolicy({
        execution: automaticExecution(
          PROTECTION_BYPASS_FEATURES.Checkin,
          PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.Retry,
          PROTECTION_BYPASS_SURFACES.Background,
        ),
        task: {
          kind: TEMP_CONTEXT_TASK_KINDS.NativePageAction,
          params: nativeParams,
        },
        policy: buildPolicy(),
        capability,
      }),
    ).toMatchObject({ kind: "denied", reason })
  })

  it("allows content-script work only after all non-surface policies pass", () => {
    expect(
      evaluateProtectionBypassPolicy({
        execution: automaticExecution(
          PROTECTION_BYPASS_FEATURES.SiteDetection,
          PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.UiLifecycle,
          PROTECTION_BYPASS_SURFACES.ContentScript,
        ),
        task: {
          kind: TEMP_CONTEXT_TASK_KINDS.RenderedTitle,
          params: {
            originUrl: fetchParams.originUrl,
          },
        },
        policy: buildPolicy(),
        capability: availableCapability,
      }),
    ).toMatchObject({
      kind: "allowed",
      feature: "site_detection",
      operation: "rendered_title",
      surface: "content_script",
      adapter: "tab",
    })
  })

  it.each([
    {
      kind: TEMP_CONTEXT_TASK_KINDS.ProfileIsolatedFetch,
      params: fetchParams,
    },
    {
      kind: TEMP_CONTEXT_TASK_KINDS.ApiFallbackFetch,
      params: { ...fetchParams, forceTempWindow: true },
    },
  ])("does not let $kind elevate an automatic denial", (task) => {
    expect(
      evaluateProtectionBypassPolicy({
        execution: automaticExecution(
          PROTECTION_BYPASS_FEATURES.AccountRefresh,
          PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.Retry,
          PROTECTION_BYPASS_SURFACES.Background,
        ),
        task,
        policy: buildPolicy({ automaticMasterEnabled: false }),
        capability: availableCapability,
      }),
    ).toMatchObject({ kind: "denied", reason: "automatic_disabled" })
  })
})
