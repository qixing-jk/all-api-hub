import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  CLAUDE_CODE_HUB_MANAGED_RESOURCE_DETAIL_FIELD_IDS,
  CLAUDE_CODE_HUB_MANAGED_RESOURCE_TABLE_FIELD_IDS,
  CLAUDE_CODE_HUB_PROVIDER_TYPE,
  CLAUDE_CODE_HUB_MANAGED_RESOURCE_FIELD_IDS as fields,
} from "~/constants/claudeCodeHub"
import { SITE_TYPES } from "~/constants/siteType"
import {
  MANAGED_RESOURCE_KINDS,
  MANAGED_RESOURCE_MODES,
  MANAGED_RESOURCE_PRODUCT_ACTIONS,
} from "~/services/accountSiteDefinitions/contracts"
import { getAccountSiteDefinition } from "~/services/accountSiteDefinitions/registry"
import {
  MANAGED_RESOURCE_CREATE_SEED_KINDS,
  MANAGED_RESOURCE_FAILURE_CODES,
  MANAGED_RESOURCE_FIELD_ISSUE_CODES,
  MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS,
  MANAGED_RESOURCE_STATUSES,
  ManagedResourceError,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import {
  claudeCodeHubManagedResourceRegistration,
  ClaudeCodeHubNativeError,
} from "~/services/apiAdapters/managedResources/claudeCodeHub"
import { getManagedResourceRegistration } from "~/services/apiAdapters/managedResources/registry"
import { ClaudeCodeHubApiError } from "~/services/apiService/claudeCodeHub"
import { MANAGED_SITE_MUTATION_OUTCOMES } from "~/services/managedSites/mutations"
import type { ClaudeCodeHubProviderDisplay } from "~/types/claudeCodeHub"

const mocks = vi.hoisted(() => ({
  getPreferences: vi.fn(),
  listProviders: vi.fn(),
  searchProviders: vi.fn(),
  getProvider: vi.fn(),
  getUnmaskedProviderKey: vi.fn(),
  createProviderV1: vi.fn(),
  updateProviderV1: vi.fn(),
  deleteProviderV1: vi.fn(),
}))

vi.mock("~/services/preferences/userPreferences", () => ({
  userPreferences: { getPreferences: mocks.getPreferences },
}))

vi.mock("~/services/apiService/claudeCodeHub", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/services/apiService/claudeCodeHub")>()
  return {
    ...actual,
    listProviders: mocks.listProviders,
    searchProviders: mocks.searchProviders,
    getProvider: mocks.getProvider,
    getUnmaskedProviderKey: mocks.getUnmaskedProviderKey,
    createProviderV1: mocks.createProviderV1,
    updateProviderV1: mocks.updateProviderV1,
    deleteProviderV1: mocks.deleteProviderV1,
  }
})

const config = {
  baseUrl: "https://hub.example.invalid/admin/",
  adminToken: "admin-token-placeholder",
}

const provider: ClaudeCodeHubProviderDisplay = {
  id: 23,
  name: "Primary provider",
  url: "https://upstream.example.invalid",
  maskedKey: "sk-****",
  isEnabled: true,
  weight: 8,
  priority: 3,
  groupTag: "default",
  providerType: CLAUDE_CODE_HUB_PROVIDER_TYPE.CLAUDE,
  allowedModels: [
    { matchType: "prefix", pattern: "claude-" },
    { matchType: "exact", pattern: "claude-example" },
  ],
}

const expectFailureCode = async (promise: Promise<unknown>, code: string) => {
  const error = await promise.catch((failure) => failure)

  expect(error).toBeInstanceOf(ManagedResourceError)
  expect((error as ManagedResourceError).failure.code).toBe(code)
  return error as ManagedResourceError
}

describe("Claude Code Hub native managed resource", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.getPreferences.mockResolvedValue({ claudeCodeHub: config })
    mocks.listProviders.mockResolvedValue([provider])
    mocks.searchProviders.mockResolvedValue([provider])
    mocks.getProvider.mockResolvedValue(provider)
    mocks.getUnmaskedProviderKey.mockResolvedValue("secret-placeholder")
    mocks.createProviderV1.mockImplementation(async (_config, payload) => ({
      ...provider,
      id: 24,
      name: payload.name,
      url: payload.url,
      providerType: payload.provider_type,
      allowedModels: payload.allowed_models,
    }))
    mocks.updateProviderV1.mockImplementation(
      async (_config, _providerId, payload) => ({
        ...provider,
        name: payload.name ?? provider.name,
        url: payload.url ?? provider.url,
      }),
    )
    mocks.deleteProviderV1.mockResolvedValue(undefined)
  })

  it("registers the native channel surface and preserved product actions", () => {
    expect(
      getAccountSiteDefinition(SITE_TYPES.CLAUDE_CODE_HUB)?.managedResource,
    ).toEqual(
      expect.objectContaining({
        mode: MANAGED_RESOURCE_MODES.NativeResource,
        primaryKind: MANAGED_RESOURCE_KINDS.Channel,
        tableFieldIds: CLAUDE_CODE_HUB_MANAGED_RESOURCE_TABLE_FIELD_IDS,
        detailFieldIds: CLAUDE_CODE_HUB_MANAGED_RESOURCE_DETAIL_FIELD_IDS,
        actions: [
          MANAGED_RESOURCE_PRODUCT_ACTIONS.Create,
          MANAGED_RESOURCE_PRODUCT_ACTIONS.DeleteSelected,
          MANAGED_RESOURCE_PRODUCT_ACTIONS.Migrate,
        ],
      }),
    )
    expect(
      getManagedResourceRegistration(
        SITE_TYPES.CLAUDE_CODE_HUB,
        MANAGED_RESOURCE_KINDS.Channel,
      ),
    ).toBe(claudeCodeHubManagedResourceRegistration)
  })

  it("projects safe list facts, local search, and normalized scope identity", async () => {
    const workspace = await claudeCodeHubManagedResourceRegistration.open()
    const page = await workspace.list()
    const searchPage = await workspace.list({ search: "primary" })

    expect(page.items[0]).toEqual(
      expect.objectContaining({
        displayName: "Primary provider",
        status: MANAGED_RESOURCE_STATUSES.Enabled,
        ref: {
          siteType: SITE_TYPES.CLAUDE_CODE_HUB,
          kind: MANAGED_RESOURCE_KINDS.Channel,
          scopeKey: "https://hub.example.invalid",
          resourceId: "23",
        },
      }),
    )
    expect(page.items[0].fields).toEqual(
      expect.arrayContaining([
        { fieldId: fields.Type, kind: "text", value: "claude" },
        {
          fieldId: fields.Key,
          kind: "secret",
          state: "masked",
        },
        {
          fieldId: fields.Models,
          kind: "list",
          value: ["claude-example"],
        },
      ]),
    )
    expect(mocks.searchProviders).toHaveBeenCalledWith(
      config,
      "primary",
      expect.any(Object),
    )
    expect(searchPage.items).toHaveLength(1)
    expect(JSON.stringify(page)).not.toContain("secret-placeholder")
  })

  it("projects provider defaults, disabled state, and safe secret availability", async () => {
    const customProvider: ClaudeCodeHubProviderDisplay = {
      id: 31,
      name: "",
      url: "",
      key: "usable-secret-placeholder",
      isEnabled: false,
      weight: Number.NaN,
      providerType: "deployment-specific",
      allowedModels: [
        " model-a ",
        { pattern: "model-b" },
        { matchType: "prefix", pattern: "ignored-" },
      ],
    }
    const emptySecretProvider: ClaudeCodeHubProviderDisplay = {
      ...customProvider,
      id: 32,
      key: "",
      maskedKey: "",
    }
    mocks.listProviders.mockResolvedValueOnce([
      customProvider,
      emptySecretProvider,
    ])

    const page = await (
      await claudeCodeHubManagedResourceRegistration.open()
    ).list({ search: "   " })
    const [customFacts, emptySecretFacts] = page.items
    const field = (fieldId: string) =>
      customFacts.fields.find((fact) => fact.fieldId === fieldId)

    expect(page.total).toBe(2)
    expect(customFacts).toMatchObject({
      displayName: "Provider 31",
      status: MANAGED_RESOURCE_STATUSES.Disabled,
      searchValues: expect.arrayContaining(["deployment-specific", "model-a"]),
    })
    expect(field(fields.Name)).toMatchObject({ value: "Provider 31" })
    expect(field(fields.Key)).toMatchObject({ state: "available" })
    expect(field(fields.Models)).toMatchObject({
      value: ["model-a", "model-b"],
    })
    expect(field(fields.GroupTag)).toMatchObject({ value: "default" })
    expect(field(fields.Priority)).toMatchObject({ value: 0 })
    expect(field(fields.Weight)).toMatchObject({ value: 1 })
    expect(
      emptySecretFacts.fields.find((fact) => fact.fieldId === fields.Key),
    ).toMatchObject({ state: "unavailable" })
    expect(mocks.listProviders).toHaveBeenCalledOnce()
    expect(mocks.searchProviders).not.toHaveBeenCalled()
  })

  it.each([
    [401, MANAGED_RESOURCE_FAILURE_CODES.AuthenticationFailed],
    [403, MANAGED_RESOURCE_FAILURE_CODES.PermissionDenied],
    [404, MANAGED_RESOURCE_FAILURE_CODES.NotFound],
    [418, MANAGED_RESOURCE_FAILURE_CODES.UpstreamRejected],
    [503, MANAGED_RESOURCE_FAILURE_CODES.Unavailable],
  ])("maps a %s list failure to %s", async (status, code) => {
    mocks.listProviders.mockRejectedValueOnce(
      new ClaudeCodeHubApiError("provider request failed", status, {
        dispatch: "dispatched",
        responseReceived: true,
        confirmedNonApplication: true,
        code: `UPSTREAM_${status}`,
      }),
    )
    const workspace = await claudeCodeHubManagedResourceRegistration.open()

    const error = await expectFailureCode(workspace.list(), code)

    expect(error.failure).toMatchObject({
      message: "provider request failed",
      upstreamCode: `UPSTREAM_${status}`,
    })
  })

  it("maps provider and plain abort shapes without dispatching late work", async () => {
    mocks.listProviders.mockRejectedValueOnce(
      new ClaudeCodeHubApiError("cancelled", undefined, {
        dispatch: "not-dispatched",
        responseReceived: false,
        confirmedNonApplication: true,
        raw: { code: "ABORT_ERR" },
      }),
    )
    const workspace = await claudeCodeHubManagedResourceRegistration.open()
    await expectFailureCode(
      workspace.list(),
      MANAGED_RESOURCE_FAILURE_CODES.Aborted,
    )

    const controller = new AbortController()
    const abortReason = new DOMException("cancel after response", "AbortError")
    mocks.listProviders.mockImplementationOnce(async () => {
      controller.abort(abortReason)
      return [provider]
    })
    await expectFailureCode(
      workspace.list(undefined, { signal: controller.signal }),
      MANAGED_RESOURCE_FAILURE_CODES.Aborted,
    )

    const preAborted = new AbortController()
    preAborted.abort(new DOMException("cancel before request", "AbortError"))
    await expectFailureCode(
      workspace.list(undefined, { signal: preAborted.signal }),
      MANAGED_RESOURCE_FAILURE_CODES.Aborted,
    )
    expect(mocks.listProviders).toHaveBeenCalledTimes(2)
  })

  it("preserves an already-normalized native read failure", async () => {
    mocks.listProviders.mockRejectedValueOnce(
      new ClaudeCodeHubNativeError({
        code: MANAGED_RESOURCE_FAILURE_CODES.PermissionDenied,
        message: "provider access is restricted",
      }),
    )
    const workspace = await claudeCodeHubManagedResourceRegistration.open()

    const error = await expectFailureCode(
      workspace.list(),
      MANAGED_RESOURCE_FAILURE_CODES.PermissionDenied,
    )

    expect(error.failure.message).toBe("provider access is restricted")
  })

  it("rejects missing, malformed, and credential-bearing saved origins", async () => {
    mocks.getPreferences.mockResolvedValueOnce({})
    await expectFailureCode(
      claudeCodeHubManagedResourceRegistration.open(),
      MANAGED_RESOURCE_FAILURE_CODES.ConfigurationRequired,
    )

    for (const baseUrl of [
      "not-an-origin",
      "https://user:password@hub.example.invalid",
    ]) {
      mocks.getPreferences.mockResolvedValueOnce({
        claudeCodeHub: { ...config, baseUrl },
      })
      await expectFailureCode(
        claudeCodeHubManagedResourceRegistration.open(),
        MANAGED_RESOURCE_FAILURE_CODES.InvalidConfiguration,
      )
    }

    mocks.getPreferences.mockRejectedValueOnce(
      new Error("preference storage unavailable"),
    )
    await expectFailureCode(
      claudeCodeHubManagedResourceRegistration.open(),
      MANAGED_RESOURCE_FAILURE_CODES.Unexpected,
    )
  })

  it("creates a provider with the strict v1 payload", async () => {
    const workspace = await claudeCodeHubManagedResourceRegistration.open()
    const editor = await workspace.openCreateEditor()
    const values = {
      ...editor.initialValues,
      [fields.Name]: "Imported provider",
      [fields.Type]: CLAUDE_CODE_HUB_PROVIDER_TYPE.CODEX,
      [fields.Status]: MANAGED_RESOURCE_STATUSES.Disabled,
      [fields.BaseUrl]: "https://codex.example.invalid",
      [fields.Key]: {
        kind: MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Replace,
        value: "credential-placeholder",
      },
      [fields.Models]: ["model-example"],
      [fields.GroupTag]: "team",
      [fields.Priority]: 2,
      [fields.Weight]: 7,
    }

    expect(editor.validate(values)).toEqual({ valid: true })
    expect(
      editor.validate({
        ...values,
        [fields.Models]: [],
      }),
    ).toEqual({ valid: true })
    expect(
      editor.fields.find(({ fieldId }) => fieldId === fields.Models),
    ).not.toHaveProperty("required", true)
    expect(
      editor.validate({
        ...values,
        [fields.Priority]: -1,
        [fields.Weight]: 101,
      }),
    ).toEqual({
      valid: false,
      issues: [
        { fieldId: fields.Priority, code: "out_of_range" },
        { fieldId: fields.Weight, code: "out_of_range" },
      ],
    })
    const result = await editor.submit(values)

    expect(result.outcome).toBe(MANAGED_SITE_MUTATION_OUTCOMES.Succeeded)
    expect(mocks.createProviderV1).toHaveBeenCalledWith(
      config,
      {
        name: "Imported provider",
        url: "https://codex.example.invalid",
        key: "credential-placeholder",
        provider_type: CLAUDE_CODE_HUB_PROVIDER_TYPE.CODEX,
        allowed_models: [{ matchType: "exact", pattern: "model-example" }],
        is_enabled: false,
        weight: 7,
        priority: 2,
        group_tag: "team",
      },
      expect.any(Object),
    )
  })

  it("reports all invalid create inputs through field-level product issues", async () => {
    const editor = await (
      await claudeCodeHubManagedResourceRegistration.open()
    ).openCreateEditor()

    expect(
      editor.validate({
        ...editor.initialValues,
        [fields.Name]: 17,
        [fields.Type]: "unsupported-type",
        [fields.Status]: "paused",
        [fields.BaseUrl]: ":not-a-url",
        [fields.Key]: "not-an-edit-intent",
        [fields.Priority]: 1.5,
        [fields.Weight]: 0,
      }),
    ).toEqual({
      valid: false,
      issues: [
        {
          fieldId: fields.Name,
          code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.Required,
        },
        {
          fieldId: fields.Type,
          code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.UnsupportedOption,
        },
        {
          fieldId: fields.Status,
          code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.UnsupportedOption,
        },
        {
          fieldId: fields.BaseUrl,
          code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.InvalidValue,
        },
        {
          fieldId: fields.Key,
          code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.Required,
        },
        {
          fieldId: fields.Priority,
          code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.OutOfRange,
        },
        {
          fieldId: fields.Weight,
          code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.OutOfRange,
        },
      ],
    })
    expect(editor.validate(editor.initialValues)).toEqual({
      valid: false,
      issues: [
        {
          fieldId: fields.Name,
          code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.Required,
        },
        {
          fieldId: fields.BaseUrl,
          code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.Required,
        },
        {
          fieldId: fields.Key,
          code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.Required,
        },
      ],
    })
  })

  it("owns native import defaults and normalization at the create seam", async () => {
    const workspace = await claudeCodeHubManagedResourceRegistration.open()
    const knownTypeEditor = await workspace.openCreateEditor({
      seed: {
        kind: MANAGED_RESOURCE_CREATE_SEED_KINDS.ManagedChannelImport,
        name: "Imported Claude provider",
        channelType: CLAUDE_CODE_HUB_PROVIDER_TYPE.CLAUDE,
        credential: "import-secret-placeholder",
        baseUrl: "https://import.example.invalid",
        enabled: true,
        models: [" model-a ", "model-a", "model-b"],
        orderingWeight: 7.9,
        priority: 4,
        notes: "not part of the editable projection",
      },
    })
    const fallbackTypeEditor = await workspace.openCreateEditor({
      seed: {
        kind: MANAGED_RESOURCE_CREATE_SEED_KINDS.ManagedChannelImport,
        name: "Imported fallback provider",
        channelType: "deployment-specific",
        credential: "fallback-secret-placeholder",
        baseUrl: "https://fallback.example.invalid",
        enabled: false,
        models: [],
        orderingWeight: 0,
        priority: 0,
        notes: "",
      },
    })

    expect(claudeCodeHubManagedResourceRegistration.createSeedKinds).toContain(
      MANAGED_RESOURCE_CREATE_SEED_KINDS.ManagedChannelImport,
    )
    expect(knownTypeEditor.initialValues).toMatchObject({
      [fields.Name]: "Imported Claude provider",
      [fields.Type]: CLAUDE_CODE_HUB_PROVIDER_TYPE.CLAUDE,
      [fields.Status]: MANAGED_RESOURCE_STATUSES.Enabled,
      [fields.BaseUrl]: "https://import.example.invalid",
      [fields.Key]: {
        kind: MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Replace,
        value: "import-secret-placeholder",
      },
      [fields.Models]: ["model-a", "model-b"],
      [fields.Priority]: 4,
      [fields.Weight]: 7,
    })
    expect(fallbackTypeEditor.initialValues).toMatchObject({
      [fields.Type]: CLAUDE_CODE_HUB_PROVIDER_TYPE.OPENAI_COMPATIBLE,
      [fields.Status]: MANAGED_RESOURCE_STATUSES.Disabled,
      [fields.Weight]: 1,
    })
  })

  it("loads the secret and updates only strict editable fields", async () => {
    const workspace = await claudeCodeHubManagedResourceRegistration.open()
    const ref = (await workspace.list()).items[0].ref
    const editor = await workspace.openEditEditor(ref)

    await expect(editor.loadSecret?.(fields.Key)).resolves.toBe(
      "secret-placeholder",
    )
    const result = await editor.submit({
      ...editor.initialValues,
      [fields.Name]: "Updated provider",
      [fields.Models]: ["claude-next"],
    })

    expect(result.outcome).toBe(MANAGED_SITE_MUTATION_OUTCOMES.Succeeded)
    expect(mocks.updateProviderV1).toHaveBeenCalledWith(
      config,
      23,
      {
        name: "Updated provider",
        allowed_models: [
          { matchType: "prefix", pattern: "claude-" },
          { matchType: "exact", pattern: "claude-next" },
        ],
      },
      expect.any(Object),
    )
    const sentPayload = mocks.updateProviderV1.mock.calls[0][2]
    expect(sentPayload).not.toHaveProperty("id")
    expect(sentPayload).not.toHaveProperty("maskedKey")
    expect(sentPayload).not.toHaveProperty("providerType")
    expect(sentPayload).not.toHaveProperty("key")
  })

  it("hydrates disabled status when opening an existing disabled provider", async () => {
    const disabledProvider = { ...provider, isEnabled: false }
    mocks.listProviders.mockResolvedValueOnce([disabledProvider])
    mocks.getProvider.mockResolvedValue(disabledProvider)
    const workspace = await claudeCodeHubManagedResourceRegistration.open()
    const ref = (await workspace.list()).items[0].ref
    const editor = await workspace.openEditEditor(ref)

    expect(editor.initialValues[fields.Status]).toBe(
      MANAGED_RESOURCE_STATUSES.Disabled,
    )
  })

  it("validates edit-only secret rules and preserves an upstream custom type", async () => {
    const customProvider: ClaudeCodeHubProviderDisplay = {
      ...provider,
      providerType: "deployment-specific",
    }
    mocks.listProviders.mockResolvedValueOnce([customProvider])
    mocks.getProvider.mockResolvedValue(customProvider)
    const workspace = await claudeCodeHubManagedResourceRegistration.open()
    const ref = (await workspace.list()).items[0].ref
    const editor = await workspace.openEditEditor(ref)

    const typeField = editor.fields.find(
      ({ fieldId }) => fieldId === fields.Type,
    )
    expect(
      typeField && "options" in typeField
        ? typeField.options.map(({ value }) => value)
        : [],
    ).toContain("deployment-specific")
    expect(editor.validate(editor.initialValues)).toEqual({ valid: true })
    expect(
      editor.validate({
        ...editor.initialValues,
        [fields.Key]: {
          kind: MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Clear,
        },
      }),
    ).toEqual({
      valid: false,
      issues: [
        {
          fieldId: fields.Key,
          code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.InvalidValue,
        },
      ],
    })
    expect(
      editor.validate({
        ...editor.initialValues,
        [fields.Key]: {
          kind: MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Replace,
          value: " ",
        },
      }),
    ).toEqual({
      valid: false,
      issues: [
        {
          fieldId: fields.Key,
          code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.InvalidValue,
        },
      ],
    })
    await expectFailureCode(
      editor.loadSecret?.(fields.Name) as Promise<unknown>,
      MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed,
    )
  })

  it("sends every changed editable field in one strict PATCH", async () => {
    const workspace = await claudeCodeHubManagedResourceRegistration.open()
    const ref = (await workspace.list()).items[0].ref
    const editor = await workspace.openEditEditor(ref)

    await editor.submit({
      ...editor.initialValues,
      [fields.Name]: " Fully updated provider ",
      [fields.Type]: CLAUDE_CODE_HUB_PROVIDER_TYPE.CODEX,
      [fields.Status]: MANAGED_RESOURCE_STATUSES.Disabled,
      [fields.BaseUrl]: " https://updated.example.invalid ",
      [fields.Key]: {
        kind: MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Replace,
        value: " replacement-secret-placeholder ",
      },
      [fields.Models]: ["codex-example"],
      [fields.GroupTag]: " ",
      [fields.Priority]: 9,
      [fields.Weight]: 12,
    })

    expect(mocks.updateProviderV1).toHaveBeenCalledWith(
      config,
      23,
      {
        name: "Fully updated provider",
        url: "https://updated.example.invalid",
        provider_type: CLAUDE_CODE_HUB_PROVIDER_TYPE.CODEX,
        allowed_models: [
          { matchType: "prefix", pattern: "claude-" },
          { matchType: "exact", pattern: "codex-example" },
        ],
        is_enabled: false,
        weight: 12,
        priority: 9,
        group_tag: null,
        key: "replacement-secret-placeholder",
      },
      expect.any(Object),
    )
  })

  it("omits unchanged nullable and string-rule fields from PATCH payloads", async () => {
    const nullableProvider: ClaudeCodeHubProviderDisplay = {
      ...provider,
      groupTag: null,
      allowedModels: ["model-example"],
    }
    mocks.listProviders.mockResolvedValue([nullableProvider])
    mocks.getProvider.mockResolvedValue(nullableProvider)
    const workspace = await claudeCodeHubManagedResourceRegistration.open()
    const ref = (await workspace.list()).items[0].ref
    const editor = await workspace.openEditEditor(ref)

    await editor.submit({
      ...editor.initialValues,
      [fields.Name]: "Renamed provider",
    })

    expect(mocks.updateProviderV1).toHaveBeenCalledWith(
      config,
      23,
      { name: "Renamed provider" },
      expect.any(Object),
    )
  })

  it("omits an unchanged null allowed-model contract from PATCH payloads", async () => {
    const unrestrictedProvider: ClaudeCodeHubProviderDisplay = {
      ...provider,
      allowedModels: null,
    }
    mocks.listProviders.mockResolvedValue([unrestrictedProvider])
    mocks.getProvider.mockResolvedValue(unrestrictedProvider)
    const workspace = await claudeCodeHubManagedResourceRegistration.open()
    const ref = (await workspace.list()).items[0].ref
    const editor = await workspace.openEditEditor(ref)

    await editor.submit({
      ...editor.initialValues,
      [fields.Name]: "Renamed unrestricted provider",
    })

    expect(mocks.updateProviderV1).toHaveBeenCalledWith(
      config,
      23,
      { name: "Renamed unrestricted provider" },
      expect.any(Object),
    )
  })

  it("keeps a native create outcome uncertain after a 5xx response", async () => {
    mocks.createProviderV1.mockRejectedValue(
      new ClaudeCodeHubApiError("temporary upstream failure", 503, {
        dispatch: "dispatched",
        responseReceived: true,
        confirmedNonApplication: false,
      }),
    )
    const workspace = await claudeCodeHubManagedResourceRegistration.open()
    const editor = await workspace.openCreateEditor()
    const result = await editor.submit({
      ...editor.initialValues,
      [fields.Name]: "Uncertain provider",
      [fields.BaseUrl]: "https://upstream.example.invalid",
      [fields.Key]: {
        kind: MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Replace,
        value: "credential-placeholder",
      },
    })

    expect(result.outcome).toBe(MANAGED_SITE_MUTATION_OUTCOMES.Uncertain)
  })

  it("marks a successful create without provider detail as uncertain", async () => {
    mocks.createProviderV1.mockResolvedValueOnce(undefined)
    const editor = await (
      await claudeCodeHubManagedResourceRegistration.open()
    ).openCreateEditor()

    await expect(
      editor.submit({
        ...editor.initialValues,
        [fields.Name]: "Missing response detail",
        [fields.BaseUrl]: "https://upstream.example.invalid",
        [fields.Key]: {
          kind: MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Replace,
          value: "credential-placeholder",
        },
      }),
    ).resolves.toMatchObject({
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Uncertain,
      diagnostic: {
        code: MANAGED_RESOURCE_FAILURE_CODES.MutationStateUncertain,
      },
    })
  })

  it("refetches provider detail when a successful PATCH omits its body", async () => {
    mocks.updateProviderV1.mockResolvedValueOnce(undefined)
    const workspace = await claudeCodeHubManagedResourceRegistration.open()
    const ref = (await workspace.list()).items[0].ref
    const editor = await workspace.openEditEditor(ref)

    const result = await editor.submit({
      ...editor.initialValues,
      [fields.Name]: "Refetched provider",
    })

    expect(result).toMatchObject({
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Succeeded,
      data: { displayName: "Primary provider" },
    })
  })

  it("marks a bodyless PATCH uncertain when authoritative refetch fails", async () => {
    mocks.updateProviderV1.mockResolvedValueOnce(undefined)
    mocks.getProvider
      .mockResolvedValueOnce(provider)
      .mockResolvedValueOnce(provider)
      .mockRejectedValueOnce(new Error("refetch unavailable"))
    const workspace = await claudeCodeHubManagedResourceRegistration.open()
    const ref = (await workspace.list()).items[0].ref
    const editor = await workspace.openEditEditor(ref)

    await expect(
      editor.submit({
        ...editor.initialValues,
        [fields.Name]: "Uncertain refetch",
      }),
    ).resolves.toMatchObject({
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Uncertain,
      diagnostic: {
        code: MANAGED_RESOURCE_FAILURE_CODES.MutationStateUncertain,
      },
    })
  })

  it("maps unexpected mutation failures and rejects invalid resource locators", async () => {
    mocks.createProviderV1.mockRejectedValueOnce(
      new Error("unexpected transport failure"),
    )
    const workspace = await claudeCodeHubManagedResourceRegistration.open()
    const createEditor = await workspace.openCreateEditor()
    await expect(
      createEditor.submit({
        ...createEditor.initialValues,
        [fields.Name]: "Transport failure",
        [fields.BaseUrl]: "https://upstream.example.invalid",
        [fields.Key]: {
          kind: MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Replace,
          value: "credential-placeholder",
        },
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        name: "ClaudeCodeHubNativeError",
        failure: { code: MANAGED_RESOURCE_FAILURE_CODES.Unexpected },
      }) satisfies Partial<ClaudeCodeHubNativeError>,
    )

    const ref = (await workspace.list()).items[0].ref
    await expectFailureCode(
      workspace.openEditEditor({ ...ref, resourceId: "not-a-provider-id" }),
      MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed,
    )
    expect(mocks.getProvider).not.toHaveBeenCalled()
  })

  it("deletes through the native v1 resource operation", async () => {
    const workspace = await claudeCodeHubManagedResourceRegistration.open()
    const ref = (await workspace.list()).items[0].ref

    await expect(workspace.delete(ref)).resolves.toMatchObject({
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Succeeded,
    })
    expect(mocks.deleteProviderV1).toHaveBeenCalledWith(
      config,
      23,
      expect.any(Object),
    )
  })

  it("maps an in-flight read cancellation to the native aborted failure", async () => {
    const raw = new DOMException("cancelled", "AbortError")
    mocks.listProviders.mockRejectedValue(
      new ClaudeCodeHubApiError("cancelled", undefined, {
        dispatch: "dispatched",
        responseReceived: false,
        confirmedNonApplication: false,
        raw,
        code: raw.code,
      }),
    )
    const workspace = await claudeCodeHubManagedResourceRegistration.open()
    const error = await workspace.list().catch((failure) => failure)

    expect(error).toBeInstanceOf(ManagedResourceError)
    expect((error as ManagedResourceError).failure.code).toBe(
      MANAGED_RESOURCE_FAILURE_CODES.Aborted,
    )
  })
})
