import { describe, expect, expectTypeOf, it } from "vitest"

import { TEMP_CONTEXT_MODES } from "~/constants/tempContextMode"
import { normalizeTempWindowFallbackPreferences } from "~/services/preferences/tempWindowFallbackPreferences"
import {
  getTempContextTaskMetadata,
  NEW_API_SESSION_READ_ACTIONS,
  PROTECTION_BYPASS_AUTOMATIC_TRIGGERS,
  PROTECTION_BYPASS_CAPABILITY_KINDS,
  PROTECTION_BYPASS_DECISION_RESULTS,
  PROTECTION_BYPASS_DENIED_REASONS,
  PROTECTION_BYPASS_EXECUTION_KINDS,
  PROTECTION_BYPASS_EXECUTION_VERSION,
  PROTECTION_BYPASS_FEATURE_TASK_KINDS,
  PROTECTION_BYPASS_FEATURES,
  PROTECTION_BYPASS_SURFACES,
  TEMP_CONTEXT_TASK_KINDS,
  type ProtectionBypassAutomaticFeature,
  type ProtectionBypassAutomaticTrigger,
  type ProtectionBypassCause,
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
}

const nativeParams = {
  originUrl: "https://example.invalid",
  pageUrl: "https://example.invalid/checkin",
  requestId: "request-1",
  siteType: "new-api" as const,
  expectedUserId: "example-user",
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
    automaticFeatureBypass: {
      account_refresh: true,
      balance_history: true,
      checkin: true,
      redemption_assist: true,
      ldoh_site_lookup: true,
      key_management: true,
      managed_site_channels: true,
      managed_site_model_sync: true,
    },
    preferredMode: TEMP_CONTEXT_MODES.Tab,
    ...overrides,
  }
}

function automaticExecution(
  feature: ProtectionBypassAutomaticFeature,
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
    automaticFeatureBypass: {
      account_refresh: false,
      balance_history: true,
      checkin: true,
      redemption_assist: true,
      ldoh_site_lookup: true,
      key_management: true,
      managed_site_channels: true,
      managed_site_model_sync: true,
    },
    tempContextMode: TEMP_CONTEXT_MODES.Composite,
  }

  it("maps persisted automatic feature preferences", () => {
    expect(normalizeProtectionBypassPreferences(source)).toEqual({
      automaticMasterEnabled: false,
      automaticFeatureBypass: source.automaticFeatureBypass,
      preferredMode: TEMP_CONTEXT_MODES.Composite,
    })
  })

  it("reports preference read failures instead of falling back to defaults", async () => {
    const result = await readProtectionBypassPolicy(async () => {
      throw new Error("storage unavailable")
    })

    expect(result).toEqual({ kind: "unavailable" })
  })

  it.each([undefined, "unsupported-mode"])(
    "defaults a missing or invalid temporary-context mode (%s)",
    (tempContextMode) => {
      expect(
        normalizeTempWindowFallbackPreferences({ tempContextMode })
          .tempContextMode,
      ).toBe(TEMP_CONTEXT_MODES.Composite)
    },
  )
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
          PROTECTION_BYPASS_FEATURES.ManagedSiteModelSync,
          PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.UiLifecycle,
          PROTECTION_BYPASS_SURFACES.Options,
        ),
        task: newApiSessionReadTask,
        policy: buildPolicy({ automaticMasterEnabled: false }),
        capability: availableCapability,
      }),
    ).toMatchObject({ kind: "denied", reason: "automatic_disabled" })
  })

  it("allows the key-management session and fallback task kinds", () => {
    const execution = resolvedUserCommandExecution({
      command: "manage_api_keys",
      feature: PROTECTION_BYPASS_FEATURES.KeyManagement,
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
    ).toMatchObject({ kind: "allowed", operation: "fetch" })
  })

  it("denies an otherwise eligible operation when its current resource is stale", () => {
    expect(
      evaluateProtectionBypassPolicy({
        execution: resolvedUserCommandExecution({
          command: "manage_api_keys",
          feature: PROTECTION_BYPASS_FEATURES.KeyManagement,
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
      decision.reason === PROTECTION_BYPASS_DENIED_REASONS.TaskNotPermitted
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
      decision.reason === PROTECTION_BYPASS_DENIED_REASONS.MissingExecution
    ) {
      expectTypeOf(decision).toEqualTypeOf<{
        kind: "denied"
        reason: "missing_execution"
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

  it("allows explicit refresh commands when automatic bypass is disabled", () => {
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
        policy: buildPolicy({ automaticMasterEnabled: false }),
        capability: availableCapability,
      }),
    ).toMatchObject({ kind: "allowed" })
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
        policy: buildPolicy({
          automaticFeatureBypass: {
            ...buildPolicy().automaticFeatureBypass,
            account_refresh: false,
          },
        }),
        capability: availableCapability,
      }),
    ).toMatchObject({ kind: "denied", reason: "feature_disabled" })
  })

  it("keeps execution surface as context without using it as authorization", () => {
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
        policy: buildPolicy(),
        capability: availableCapability,
      }),
    ).toMatchObject({
      kind: "allowed",
      surface: PROTECTION_BYPASS_SURFACES.Popup,
    })
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
    expect(decision).toMatchObject({
      kind: "denied",
      reason: "missing_execution",
    })
  })

  it("denies a task outside the static feature-task matrix", () => {
    const execution = resolvedUserCommandExecution({
      command: "manage_api_keys",
      feature: PROTECTION_BYPASS_FEATURES.KeyManagement,
      surface: PROTECTION_BYPASS_SURFACES.Options,
    })

    const decision = evaluateProtectionBypassPolicy({
      execution,
      task: {
        kind: TEMP_CONTEXT_TASK_KINDS.RenderedTitle,
        params: { originUrl: fetchParams.originUrl },
      },
      policy: buildPolicy(),
      capability: availableCapability,
    })

    assertEvaluatedDenialContext(decision)
    expect(decision).toMatchObject({
      kind: "denied",
      reason: "task_not_permitted",
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

  it("enforces the approved product-feature by task-kind matrix", () => {
    const permitted: Record<
      ProtectionBypassFeature,
      readonly TempContextTask["kind"][]
    > = {
      account_refresh: ["api_fallback_fetch", "session_read"],
      balance_history: ["api_fallback_fetch", "session_read"],
      checkin: [
        "api_fallback_fetch",
        "turnstile_fetch",
        "native_page_action",
        "session_read",
      ],
      redemption_assist: ["api_fallback_fetch", "session_read"],
      ldoh_site_lookup: ["api_fallback_fetch"],
      key_management: [
        "api_fallback_fetch",
        "session_read",
        "new_api_session_read",
      ],
      managed_site_channels: ["new_api_session_read"],
      managed_site_model_sync: ["new_api_session_read"],
      account_onboarding: [
        "api_fallback_fetch",
        "profile_isolated_fetch",
        "session_read",
        "openrouter_management_key_action",
      ],
    }
    const taskForKind = (kind: TempContextTask["kind"]): TempContextTask => {
      switch (kind) {
        case "api_fallback_fetch":
        case "profile_isolated_fetch":
          return { kind, params: fetchParams }
        case "turnstile_fetch":
          return {
            kind,
            params: { ...fetchParams, pageUrl: fetchParams.originUrl },
          }
        case "native_page_action":
          return { kind, params: nativeParams }
        case "openrouter_management_key_action":
          return {
            kind,
            params: {
              requestId: "request-1",
              operation: { kind: "create", label: "Example" },
            },
          }
        case "rendered_title":
          return { kind, params: { originUrl: fetchParams.originUrl } }
        case "session_read":
          return {
            kind,
            params: {
              url: fetchParams.originUrl,
              requestId: "request-1",
              siteType: "new-api",
            },
          }
        case "new_api_session_read":
          return {
            kind,
            params: {
              origin: fetchParams.originUrl,
              action: "channel_key",
              channelId: 1,
              userId: "example-user",
            },
          }
        case "open_context":
          return {
            kind,
            params: { url: fetchParams.originUrl, requestId: "request-1" },
          }
      }
    }

    for (const feature of Object.values(PROTECTION_BYPASS_FEATURES)) {
      for (const kind of Object.values(TEMP_CONTEXT_TASK_KINDS)) {
        const decision = evaluateProtectionBypassPolicy({
          execution: resolvedUserCommandExecution({
            command: "manage_api_keys",
            feature,
            surface: PROTECTION_BYPASS_SURFACES.Background,
          }),
          task: taskForKind(kind),
          policy: buildPolicy(),
          capability: availableCapability,
        })
        expect(decision.kind).toBe(
          permitted[feature].includes(kind) ? "allowed" : "denied",
        )
        if (decision.kind === "denied" && !permitted[feature].includes(kind)) {
          expect(decision.reason).toBe("task_not_permitted")
        }
      }
    }

    expect(PROTECTION_BYPASS_FEATURE_TASK_KINDS).toMatchObject(permitted)
  })

  it("applies the static feature matrix to automatic execution", () => {
    expect(
      evaluateProtectionBypassPolicy({
        execution: automaticExecution(
          PROTECTION_BYPASS_FEATURES.AccountRefresh,
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

  it("denies rendered-title tasks for every product workflow", () => {
    expect(
      evaluateProtectionBypassPolicy({
        execution: automaticExecution(
          PROTECTION_BYPASS_FEATURES.LdohSiteLookup,
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
      kind: "denied",
      feature: "ldoh_site_lookup",
      reason: "task_not_permitted",
      operation: "rendered_title",
      surface: "content_script",
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
    ).toMatchObject({
      kind: "denied",
      reason:
        task.kind === TEMP_CONTEXT_TASK_KINDS.ProfileIsolatedFetch
          ? "task_not_permitted"
          : "automatic_disabled",
    })
  })
})
