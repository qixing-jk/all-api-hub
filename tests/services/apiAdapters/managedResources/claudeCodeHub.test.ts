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
  MANAGED_RESOURCE_FAILURE_CODES,
  MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS,
  MANAGED_RESOURCE_STATUSES,
  ManagedResourceError,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import { claudeCodeHubManagedResourceRegistration } from "~/services/apiAdapters/managedResources/claudeCodeHub"
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
