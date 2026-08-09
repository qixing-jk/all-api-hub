import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  SUB2API_MANAGED_RESOURCE_DETAIL_FIELD_IDS,
  SUB2API_MANAGED_RESOURCE_FIELD_IDS,
  SUB2API_MANAGED_RESOURCE_TABLE_FIELD_IDS,
} from "~/constants/sub2api"
import {
  MANAGED_RESOURCE_KINDS,
  MANAGED_RESOURCE_MODES,
} from "~/services/accountSiteDefinitions/contracts"
import { getAccountSiteDefinition } from "~/services/accountSiteDefinitions/registry"
import {
  MANAGED_RESOURCE_FAILURE_CODES,
  ManagedResourceError,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import { getManagedResourceRegistration } from "~/services/apiAdapters/managedResources/registry"
import { sub2ApiManagedResourceRegistration } from "~/services/apiAdapters/managedResources/sub2api"
import { MANAGED_SITE_MUTATION_OUTCOMES } from "~/services/managedSites/mutations"
import {
  SUB2API_STEP_UP_ADMIN_KEY_FORBIDDEN_CODE,
  Sub2ApiAdminApiError,
} from "~/services/managedSites/providers/sub2api"

const mocks = vi.hoisted(() => ({
  getPreferences: vi.fn(),
  listAccounts: vi.fn(),
  searchAccounts: vi.fn(),
  getAccount: vi.fn(),
  revealKey: vi.fn(),
  createAccount: vi.fn(),
  updateAccount: vi.fn(),
  deleteAccount: vi.fn(),
}))

vi.mock("~/services/preferences/userPreferences", () => ({
  userPreferences: { getPreferences: mocks.getPreferences },
}))

vi.mock("~/services/managedSites/providers/sub2api", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("~/services/managedSites/providers/sub2api")
    >()
  return {
    ...actual,
    listSub2ApiApiKeyAccounts: mocks.listAccounts,
    searchSub2ApiApiKeyAccounts: mocks.searchAccounts,
    getSub2ApiApiKeyAccount: mocks.getAccount,
    revealSub2ApiApiKey: mocks.revealKey,
    createSub2ApiApiKeyAccount: mocks.createAccount,
    updateSub2ApiApiKeyAccount: mocks.updateAccount,
    deleteSub2ApiApiKeyAccount: mocks.deleteAccount,
  }
})

const config = {
  baseUrl: "https://sub2api.example.invalid/",
  adminToken: "admin-api-key",
}

const account = {
  id: 17,
  name: "Primary upstream",
  notes: "Read-only operator note",
  platform: "openai" as const,
  type: "apikey" as const,
  credentials: { base_url: "https://api.example.invalid/v1" },
  credentials_status: { has_api_key: true },
  concurrency: 3,
  priority: 8,
  status: "active" as const,
}

describe("Sub2API native managed resource", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getPreferences.mockResolvedValue({ sub2apiManagedSite: config })
    mocks.listAccounts.mockResolvedValue({ items: [account], total: 1 })
    mocks.searchAccounts.mockResolvedValue({ items: [account], total: 1 })
    mocks.getAccount.mockResolvedValue(account)
    mocks.revealKey.mockResolvedValue("saved-secret")
    mocks.createAccount.mockImplementation(async (_config, _input, options) => {
      options?.observer?.onDispatch()
      options?.observer?.onResponse()
      return account
    })
    mocks.updateAccount.mockImplementation(
      async (_config, _accountId, _input, options) => {
        options?.observer?.onDispatch()
        options?.observer?.onResponse()
        return account
      },
    )
    mocks.deleteAccount.mockImplementation(
      async (_config, _accountId, options) => {
        options?.observer?.onDispatch()
        options?.observer?.onResponse()
      },
    )
  })

  it("registers Sub2API as a native channel resource with the verified projection", () => {
    expect(
      getAccountSiteDefinition(SITE_TYPES.SUB2API)?.managedResource,
    ).toEqual(
      expect.objectContaining({
        mode: MANAGED_RESOURCE_MODES.NativeResource,
        primaryKind: MANAGED_RESOURCE_KINDS.Channel,
        tableFieldIds: SUB2API_MANAGED_RESOURCE_TABLE_FIELD_IDS,
        detailFieldIds: SUB2API_MANAGED_RESOURCE_DETAIL_FIELD_IDS,
      }),
    )
    expect(
      getManagedResourceRegistration(
        SITE_TYPES.SUB2API,
        MANAGED_RESOURCE_KINDS.Channel,
      ),
    ).toBe(sub2ApiManagedResourceRegistration)
    expect(SUB2API_MANAGED_RESOURCE_TABLE_FIELD_IDS).not.toContain(
      SUB2API_MANAGED_RESOURCE_FIELD_IDS.Key,
    )
    expect(SUB2API_MANAGED_RESOURCE_DETAIL_FIELD_IDS).toContain(
      SUB2API_MANAGED_RESOURCE_FIELD_IDS.Key,
    )
  })

  it("searches the full safe projection and shows routing plus secret availability facts", async () => {
    const workspace = await sub2ApiManagedResourceRegistration.open()
    const page = await workspace.list({ search: "api.example.invalid" })

    expect(mocks.listAccounts).toHaveBeenCalledWith(config, expect.any(Object))
    expect(mocks.searchAccounts).not.toHaveBeenCalled()
    expect(page.items).toHaveLength(1)
    expect(page.items[0]).toMatchObject({
      displayName: "Primary upstream",
      status: "enabled",
      actions: { canUpdate: true, canDelete: true },
      fields: expect.arrayContaining([
        { fieldId: "platform", kind: "text", value: "OpenAI" },
        {
          fieldId: "baseURL",
          kind: "text",
          value: "https://api.example.invalid/v1",
        },
        { fieldId: "concurrency", kind: "number", value: 3 },
        { fieldId: "priority", kind: "number", value: 8 },
        { fieldId: "key", kind: "secret", state: "available" },
      ]),
    })
  })

  it("exposes the full create projection and creates through the shared mutation seam", async () => {
    const workspace = await sub2ApiManagedResourceRegistration.open()
    const editor = await workspace.openCreateEditor()

    expect(editor.fields.map(({ fieldId }) => fieldId)).toEqual([
      SUB2API_MANAGED_RESOURCE_FIELD_IDS.Name,
      SUB2API_MANAGED_RESOURCE_FIELD_IDS.Platform,
      SUB2API_MANAGED_RESOURCE_FIELD_IDS.Status,
      SUB2API_MANAGED_RESOURCE_FIELD_IDS.BaseUrl,
      SUB2API_MANAGED_RESOURCE_FIELD_IDS.Key,
      SUB2API_MANAGED_RESOURCE_FIELD_IDS.Concurrency,
      SUB2API_MANAGED_RESOURCE_FIELD_IDS.Priority,
      SUB2API_MANAGED_RESOURCE_FIELD_IDS.Notes,
    ])
    expect(editor.validate(editor.initialValues)).toMatchObject({
      valid: false,
    })

    const result = await editor.submit({
      ...editor.initialValues,
      name: "Primary upstream",
      platform: "openai",
      status: "active",
      baseURL: "https://api.example.invalid/v1",
      key: { kind: "replace", value: "create-secret" },
      concurrency: 3,
      priority: 8,
      notes: "Created from native editor",
    })

    expect(result.outcome).toBe(MANAGED_SITE_MUTATION_OUTCOMES.Succeeded)
    expect(mocks.createAccount).toHaveBeenCalledWith(
      config,
      {
        name: "Primary upstream",
        platform: "openai",
        baseUrl: "https://api.example.invalid/v1",
        apiKey: "create-secret",
        concurrency: 3,
        priority: 8,
        notes: "Created from native editor",
      },
      expect.any(Object),
    )
  })

  it("keeps platform read-only while editing notes, key, and routing fields", async () => {
    const workspace = await sub2ApiManagedResourceRegistration.open()
    const [facts] = (await workspace.list()).items
    const editor = await workspace.openEditEditor(facts.ref)

    expect(editor.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fieldId: "platform", readOnly: true }),
        expect.objectContaining({ fieldId: "notes", readOnly: false }),
        expect.objectContaining({
          fieldId: "key",
          secretState: "available",
          canReplace: true,
        }),
      ]),
    )
    expect(mocks.revealKey).not.toHaveBeenCalled()
    await expect(editor.loadSecret?.("key")).resolves.toBe("saved-secret")
    expect(mocks.revealKey).toHaveBeenCalledWith(config, 17, undefined)

    const result = await editor.submit({
      ...editor.initialValues,
      name: "Renamed upstream",
      baseURL: "https://next.example.invalid/v1",
      key: { kind: "replace", value: "replacement-secret" },
      concurrency: 5,
      priority: 2,
      status: "inactive",
      notes: "Updated operator note",
    })

    expect(result.outcome).toBe(MANAGED_SITE_MUTATION_OUTCOMES.Succeeded)
    expect(mocks.updateAccount).toHaveBeenCalledWith(
      config,
      17,
      {
        name: "Renamed upstream",
        baseUrl: "https://next.example.invalid/v1",
        apiKey: "replacement-secret",
        concurrency: 5,
        priority: 2,
        status: "inactive",
        notes: "Updated operator note",
      },
      expect.any(Object),
    )
    expect(mocks.updateAccount.mock.calls[0]?.[2]).not.toHaveProperty(
      "platform",
    )
  })

  it("accepts upstream-supported zero concurrency and priority values", async () => {
    const workspace = await sub2ApiManagedResourceRegistration.open()
    const [facts] = (await workspace.list()).items
    const editor = await workspace.openEditEditor(facts.ref)
    const values = {
      ...editor.initialValues,
      concurrency: 0,
      priority: 0,
    }

    expect(editor.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fieldId: "concurrency", min: 0 }),
        expect.objectContaining({ fieldId: "priority", min: 0 }),
      ]),
    )
    expect(editor.validate(values)).toEqual({ valid: true })

    const result = await editor.submit(values)

    expect(result.outcome).toBe(MANAGED_SITE_MUTATION_OUTCOMES.Succeeded)
    expect(mocks.updateAccount).toHaveBeenCalledWith(
      config,
      17,
      expect.objectContaining({ concurrency: 0, priority: 0 }),
      expect.any(Object),
    )
  })

  it("maps step-up key reveal rejection to a controlled permission failure", async () => {
    mocks.revealKey.mockRejectedValueOnce(
      new Sub2ApiAdminApiError(
        "step-up required",
        403,
        SUB2API_STEP_UP_ADMIN_KEY_FORBIDDEN_CODE,
        {
          dispatch: "dispatched",
          responseReceived: true,
          confirmedNonApplication: true,
        },
      ),
    )
    const workspace = await sub2ApiManagedResourceRegistration.open()
    const [facts] = (await workspace.list()).items
    const editor = await workspace.openEditEditor(facts.ref)

    try {
      await editor.loadSecret?.("key")
      throw new Error("expected reveal to fail")
    } catch (error) {
      expect(error).toBeInstanceOf(ManagedResourceError)
      expect((error as ManagedResourceError).failure).toEqual({
        code: MANAGED_RESOURCE_FAILURE_CODES.PermissionDenied,
        message: "step-up required",
        upstreamCode: SUB2API_STEP_UP_ADMIN_KEY_FORBIDDEN_CODE,
      })
    }
  })

  it("deletes through the native resource workspace", async () => {
    const workspace = await sub2ApiManagedResourceRegistration.open()
    const [facts] = (await workspace.list()).items

    const result = await workspace.delete(facts.ref)

    expect(result.outcome).toBe(MANAGED_SITE_MUTATION_OUTCOMES.Succeeded)
    expect(mocks.deleteAccount).toHaveBeenCalledWith(
      config,
      17,
      expect.any(Object),
    )
  })
})
