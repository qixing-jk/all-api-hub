import { describe, expect, it } from "vitest"

import {
  getTempContextTaskMetadata,
  isManualModelSyncProtectionBypassExecution,
  isProtectionBypassExecution,
  isRefreshAllAccountsProtectionBypassExecution,
  isTempContextTask,
  PROTECTION_BYPASS_AUTOMATIC_TRIGGERS,
  PROTECTION_BYPASS_CAPABILITY_KINDS,
  PROTECTION_BYPASS_DECISION_RESULTS,
  PROTECTION_BYPASS_DENIED_REASONS,
  PROTECTION_BYPASS_EXECUTION_KINDS,
  PROTECTION_BYPASS_EXECUTION_VERSION,
  PROTECTION_BYPASS_FEATURES,
  PROTECTION_BYPASS_SURFACES,
  PROTECTION_BYPASS_USER_COMMANDS,
  TEMP_CONTEXT_TASK_KINDS,
} from "~/services/protectionBypass/contracts"

const canonicalTasks = [
  {
    kind: TEMP_CONTEXT_TASK_KINDS.ApiFallbackFetch,
    params: {
      originUrl: "https://example.invalid",
      fetchUrl: "https://example.invalid/api/user/self",
    },
  },
  {
    kind: TEMP_CONTEXT_TASK_KINDS.ProfileIsolatedFetch,
    params: {
      originUrl: "https://example.invalid",
      fetchUrl: "https://example.invalid/api/user/self",
    },
  },
  {
    kind: TEMP_CONTEXT_TASK_KINDS.TurnstileFetch,
    params: {
      originUrl: "https://example.invalid",
      pageUrl: "https://example.invalid/checkin",
      fetchUrl: "https://example.invalid/api/checkin",
    },
  },
  {
    kind: TEMP_CONTEXT_TASK_KINDS.NativePageAction,
    params: {
      originUrl: "https://example.invalid",
      pageUrl: "https://example.invalid/console/personal",
      siteType: "new-api",
      expectedUserId: "example-user",
    },
  },
  {
    kind: TEMP_CONTEXT_TASK_KINDS.OpenRouterManagementKeyAction,
    params: {
      requestId: "request-openrouter",
      operation: { kind: "create", label: "Example label" },
    },
  },
  {
    kind: TEMP_CONTEXT_TASK_KINDS.RenderedTitle,
    params: { originUrl: "https://example.invalid" },
  },
  {
    kind: TEMP_CONTEXT_TASK_KINDS.SessionRead,
    params: {
      url: "https://example.invalid",
      requestId: "request-session",
      siteType: "new-api",
    },
  },
  {
    kind: TEMP_CONTEXT_TASK_KINDS.NewApiSessionRead,
    params: {
      origin: "https://example.invalid",
      action: "channel_key",
      channelId: 7,
      userId: "example-user",
    },
  },
  {
    kind: TEMP_CONTEXT_TASK_KINDS.OpenContext,
    params: {
      url: "https://example.invalid",
      requestId: "request-open-context",
    },
  },
] as const

describe("protection bypass runtime contracts", () => {
  it("keeps the execution wire contract stable", () => {
    expect(PROTECTION_BYPASS_EXECUTION_VERSION).toBe(1)
    expect(PROTECTION_BYPASS_EXECUTION_KINDS).toEqual({
      UserCommand: "user_command",
      Automatic: "automatic",
    })
  })

  it("accepts a serialized plain user-command execution", () => {
    const serializedClone = JSON.parse(
      JSON.stringify({
        version: PROTECTION_BYPASS_EXECUTION_VERSION,
        kind: PROTECTION_BYPASS_EXECUTION_KINDS.UserCommand,
        command: PROTECTION_BYPASS_USER_COMMANDS.RefreshAccount,
        surface: PROTECTION_BYPASS_SURFACES.Options,
      }),
    )

    expect(isProtectionBypassExecution(serializedClone)).toBe(true)
  })

  it("rejects the legacy opaque grant shape", () => {
    expect(
      isProtectionBypassExecution({
        version: 1,
        kind: "user_command",
        grantId: "legacy",
      }),
    ).toBe(false)
  })

  it("rejects extra fields on automatic execution metadata", () => {
    expect(
      isProtectionBypassExecution({
        version: PROTECTION_BYPASS_EXECUTION_VERSION,
        kind: PROTECTION_BYPASS_EXECUTION_KINDS.Automatic,
        feature: PROTECTION_BYPASS_FEATURES.AccountRefresh,
        trigger: PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.Scheduled,
        surface: PROTECTION_BYPASS_SURFACES.Background,
        grantId: "legacy",
      }),
    ).toBe(false)
  })

  it("classifies refresh-all user and automatic account-refresh intent", () => {
    expect(
      isRefreshAllAccountsProtectionBypassExecution({
        version: 1,
        kind: PROTECTION_BYPASS_EXECUTION_KINDS.UserCommand,
        command: PROTECTION_BYPASS_USER_COMMANDS.RefreshAllAccounts,
        surface: PROTECTION_BYPASS_SURFACES.Options,
      }),
    ).toBe(true)
    expect(
      isRefreshAllAccountsProtectionBypassExecution({
        version: 1,
        kind: PROTECTION_BYPASS_EXECUTION_KINDS.Automatic,
        feature: PROTECTION_BYPASS_FEATURES.AccountRefresh,
        trigger: PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.Scheduled,
        surface: PROTECTION_BYPASS_SURFACES.Background,
      }),
    ).toBe(true)
    expect(
      isRefreshAllAccountsProtectionBypassExecution({
        version: 1,
        kind: PROTECTION_BYPASS_EXECUTION_KINDS.UserCommand,
        command: PROTECTION_BYPASS_USER_COMMANDS.ManualCheckin,
        surface: PROTECTION_BYPASS_SURFACES.Options,
      }),
    ).toBe(false)
  })

  it("classifies only verify-protection as manual model-sync intent", () => {
    expect(
      isManualModelSyncProtectionBypassExecution({
        version: 1,
        kind: PROTECTION_BYPASS_EXECUTION_KINDS.UserCommand,
        command: PROTECTION_BYPASS_USER_COMMANDS.VerifyProtection,
        surface: PROTECTION_BYPASS_SURFACES.Options,
      }),
    ).toBe(true)
    expect(
      isManualModelSyncProtectionBypassExecution({
        version: 1,
        kind: PROTECTION_BYPASS_EXECUTION_KINDS.UserCommand,
        command: PROTECTION_BYPASS_USER_COMMANDS.AddAccount,
        surface: PROTECTION_BYPASS_SURFACES.Options,
      }),
    ).toBe(false)
  })

  it("keeps the temporary-context task wire contract stable", () => {
    expect(Object.values(TEMP_CONTEXT_TASK_KINDS)).toEqual([
      "api_fallback_fetch",
      "profile_isolated_fetch",
      "turnstile_fetch",
      "native_page_action",
      "openrouter_management_key_action",
      "rendered_title",
      "session_read",
      "new_api_session_read",
      "open_context",
    ])
  })

  it("defines policy metadata for every temporary-context task kind", () => {
    for (const kind of Object.values(TEMP_CONTEXT_TASK_KINDS)) {
      expect(getTempContextTaskMetadata({ kind })).toEqual({
        operation: expect.any(String),
        cause: expect.any(String),
      })
    }
  })

  it.each(canonicalTasks)("accepts canonical $kind params", (task) => {
    expect(isTempContextTask(task)).toBe(true)
  })

  it.each([
    ["array params", { kind: "rendered_title", params: [] }],
    [
      "fetch without fetchUrl",
      {
        kind: "api_fallback_fetch",
        params: { originUrl: "https://example.invalid" },
      },
    ],
    [
      "profile fetch without originUrl",
      {
        kind: "profile_isolated_fetch",
        params: { fetchUrl: "https://example.invalid/api/user/self" },
      },
    ],
    [
      "turnstile fetch without pageUrl",
      {
        kind: "turnstile_fetch",
        params: {
          originUrl: "https://example.invalid",
          fetchUrl: "https://example.invalid/api/checkin",
        },
      },
    ],
    [
      "native page action without identity",
      {
        kind: "native_page_action",
        params: {
          originUrl: "https://example.invalid",
          pageUrl: "https://example.invalid/console/personal",
          siteType: "new-api",
        },
      },
    ],
    [
      "rendered title without originUrl",
      { kind: "rendered_title", params: {} },
    ],
    [
      "session read without requestId",
      {
        kind: "session_read",
        params: { url: "https://example.invalid", siteType: "new-api" },
      },
    ],
    [
      "New API session read with extra authority",
      {
        kind: "new_api_session_read",
        params: {
          origin: "https://example.invalid",
          action: "channel_key",
          channelId: 7,
          userId: "example-user",
          tempWindowRequestSource: "background",
        },
      },
    ],
    [
      "open context without requestId",
      { kind: "open_context", params: { url: "https://example.invalid" } },
    ],
    [
      "OpenRouter action without operation",
      {
        kind: "openrouter_management_key_action",
        params: { requestId: "request-openrouter" },
      },
    ],
  ])("rejects %s", (_case, task) => {
    expect(isTempContextTask(task)).toBe(false)
  })

  it.each([
    {},
    { requestId: "request-openrouter" },
    {
      requestId: "request-openrouter",
      operation: [],
    },
    {
      requestId: "request-openrouter",
      operation: { kind: "delete", label: "Example label" },
    },
    {
      requestId: "request-openrouter",
      operation: { kind: "create" },
    },
    {
      requestId: "request-openrouter",
      operation: { kind: "create", label: "   " },
    },
    {
      requestId: "request-openrouter",
      operation: { kind: "create", label: "x".repeat(97) },
    },
    {
      requestId: "request-openrouter",
      operation: { kind: "create", label: 42 },
    },
    {
      requestId: 42,
      operation: { kind: "create", label: "Example label" },
    },
    {
      requestId: "request-openrouter",
      operation: { kind: "create", label: "Example label" },
      suppressMinimize: "yes",
    },
  ])("rejects malformed OpenRouter params %#", (params) => {
    expect(
      isTempContextTask({
        kind: TEMP_CONTEXT_TASK_KINDS.OpenRouterManagementKeyAction,
        params,
      }),
    ).toBe(false)
  })

  it.each([
    {},
    { url: "https://example.invalid" },
    { url: 42, requestId: "request-open-context" },
    { url: "https://example.invalid", requestId: 42 },
    {
      url: "https://example.invalid",
      requestId: "request-open-context",
      suppressMinimize: "yes",
    },
  ])("rejects malformed open-context params %#", (params) => {
    expect(
      isTempContextTask({
        kind: TEMP_CONTEXT_TASK_KINDS.OpenContext,
        params,
      }),
    ).toBe(false)
  })

  it.each([
    {
      kind: "api_fallback_fetch",
      params: {
        originUrl: "https://example.invalid",
        fetchUrl: "https://example.invalid/api/user/self",
        responseType: "yaml",
      },
    },
    {
      kind: "turnstile_fetch",
      params: {
        originUrl: "https://example.invalid",
        pageUrl: "https://example.invalid/checkin",
        fetchUrl: "https://example.invalid/api/checkin",
        turnstileTimeoutMs: "soon",
      },
    },
    {
      kind: "native_page_action",
      params: {
        originUrl: "https://example.invalid",
        pageUrl: "https://example.invalid/console/personal",
        siteType: "new-api",
        expectedUserId: "example-user",
        suppressMinimize: "yes",
      },
    },
    {
      kind: "rendered_title",
      params: { originUrl: "https://example.invalid", requestId: 42 },
    },
    {
      kind: "session_read",
      params: {
        url: "https://example.invalid",
        requestId: "request-session",
        siteType: "new-api",
        useIncognito: "yes",
      },
    },
  ])("rejects invalid optional task primitives %#", (task) => {
    expect(isTempContextTask(task)).toBe(false)
  })

  it("keeps decision, capability, and denial wire values stable", () => {
    expect(PROTECTION_BYPASS_DECISION_RESULTS).toEqual({
      Allowed: "allowed",
      Denied: "denied",
      Unavailable: "unavailable",
    })
    expect(PROTECTION_BYPASS_CAPABILITY_KINDS.PermissionRequired).toBe(
      "permission_required",
    )
    expect(PROTECTION_BYPASS_DENIED_REASONS.OperationNotPermitted).toBe(
      "operation_not_permitted",
    )
  })
})
