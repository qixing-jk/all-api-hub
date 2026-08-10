import { beforeEach, describe, expect, it, vi } from "vitest"

import { ChannelType } from "~/constants/managedSite"
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
  MANAGED_RESOURCE_CREATE_SEED_KINDS,
  MANAGED_RESOURCE_FAILURE_CODES,
  MANAGED_RESOURCE_FIELD_ISSUE_CODES,
  ManagedResourceError,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import { openNativeManagedChannelImportEditor } from "~/services/apiAdapters/managedResources/channelImport"
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
  credentials: {
    base_url: "https://api.example.invalid/v1",
    model_mapping: {
      "model-example": "model-example",
      "model-aliased": "provider-model",
    },
  },
  credentials_status: { has_api_key: true },
  concurrency: 3,
  priority: 8,
  status: "active" as const,
}

const expectFailureCode = async (promise: Promise<unknown>, code: string) => {
  const error = await promise.catch((failure) => failure)
  expect(error).toBeInstanceOf(ManagedResourceError)
  expect((error as ManagedResourceError).failure.code).toBe(code)
}

describe("Sub2API native managed resource", () => {
  beforeEach(() => {
    vi.resetAllMocks()
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

  it("rejects missing and invalid saved configuration before opening", async () => {
    mocks.getPreferences.mockResolvedValueOnce({})
    await expectFailureCode(
      sub2ApiManagedResourceRegistration.open(),
      MANAGED_RESOURCE_FAILURE_CODES.ConfigurationRequired,
    )

    mocks.getPreferences.mockResolvedValueOnce({
      sub2apiManagedSite: { ...config, baseUrl: "not-an-origin" },
    })
    await expectFailureCode(
      sub2ApiManagedResourceRegistration.open(),
      MANAGED_RESOURCE_FAILURE_CODES.InvalidConfiguration,
    )
  })

  it.each([
    [
      new Sub2ApiAdminApiError("unauthorized", 401, "AUTH", {
        dispatch: "dispatched",
        responseReceived: true,
        confirmedNonApplication: true,
      }),
      MANAGED_RESOURCE_FAILURE_CODES.AuthenticationFailed,
    ],
    [
      new Sub2ApiAdminApiError("missing", 404, undefined, {
        dispatch: "dispatched",
        responseReceived: true,
        confirmedNonApplication: true,
      }),
      MANAGED_RESOURCE_FAILURE_CODES.NotFound,
    ],
    [
      new Sub2ApiAdminApiError("offline", undefined, undefined, {
        dispatch: "not-dispatched",
        responseReceived: false,
        confirmedNonApplication: true,
      }),
      MANAGED_RESOURCE_FAILURE_CODES.Unavailable,
    ],
    [
      new Sub2ApiAdminApiError("rejected", 500, "UPSTREAM", {
        dispatch: "dispatched",
        responseReceived: true,
        confirmedNonApplication: true,
      }),
      MANAGED_RESOURCE_FAILURE_CODES.UpstreamRejected,
    ],
    [
      Object.assign(new Error("cancelled"), { name: "AbortError" }),
      MANAGED_RESOURCE_FAILURE_CODES.Aborted,
    ],
    [
      Object.assign(new Error("timed out"), { name: "TimeoutError" }),
      MANAGED_RESOURCE_FAILURE_CODES.Unavailable,
    ],
    [new Error("unexpected"), MANAGED_RESOURCE_FAILURE_CODES.Unexpected],
  ])("maps provider failures to %s", async (error, expectedCode) => {
    mocks.listAccounts.mockRejectedValueOnce(error)
    const workspace = await sub2ApiManagedResourceRegistration.open()

    await expectFailureCode(workspace.list(), expectedCode)
  })

  it("uses native account search for non-empty display queries and shows safe facts", async () => {
    const workspace = await sub2ApiManagedResourceRegistration.open()
    const page = await workspace.list({ search: "Primary upstream" })

    expect(mocks.searchAccounts).toHaveBeenCalledWith(
      config,
      "Primary upstream",
      expect.any(Object),
    )
    expect(mocks.listAccounts).not.toHaveBeenCalled()
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

    await expect(workspace.list({ search: " " })).resolves.toMatchObject({
      items: [expect.objectContaining({ displayName: "Primary upstream" })],
    })
    expect(mocks.listAccounts).toHaveBeenCalledWith(config, expect.any(Object))
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
      SUB2API_MANAGED_RESOURCE_FIELD_IDS.Models,
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
      supportedModels: [],
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

  it("validates provider-native create fields and builds an inactive model mapping", async () => {
    const workspace = await sub2ApiManagedResourceRegistration.open()
    const editor = await workspace.openCreateEditor()
    const invalidValues = {
      ...editor.initialValues,
      name: "Invalid account",
      platform: "unsupported-platform",
      status: "error",
      baseURL: "not a URL",
      key: { unexpected: true },
      concurrency: 1.5,
      priority: -1,
    } as unknown as typeof editor.initialValues

    expect(editor.validate(invalidValues)).toEqual({
      valid: false,
      issues: expect.arrayContaining([
        {
          fieldId: SUB2API_MANAGED_RESOURCE_FIELD_IDS.Platform,
          code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.UnsupportedOption,
        },
        {
          fieldId: SUB2API_MANAGED_RESOURCE_FIELD_IDS.Status,
          code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.UnsupportedOption,
        },
        {
          fieldId: SUB2API_MANAGED_RESOURCE_FIELD_IDS.BaseUrl,
          code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.InvalidValue,
        },
        {
          fieldId: SUB2API_MANAGED_RESOURCE_FIELD_IDS.Key,
          code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.Required,
        },
        {
          fieldId: SUB2API_MANAGED_RESOURCE_FIELD_IDS.Concurrency,
          code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.InvalidValue,
        },
        {
          fieldId: SUB2API_MANAGED_RESOURCE_FIELD_IDS.Priority,
          code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.OutOfRange,
        },
      ]),
    })

    const result = await editor.submit({
      ...editor.initialValues,
      name: "Inactive upstream",
      platform: "anthropic",
      status: "inactive",
      baseURL: "https://api.example.invalid/v1",
      key: { kind: "replace", value: "create-secret" },
      supportedModels: ["model-b", " model-a ", "model-b"],
    })

    expect(result.outcome).toBe(MANAGED_SITE_MUTATION_OUTCOMES.Succeeded)
    expect(mocks.createAccount).toHaveBeenCalledWith(
      config,
      expect.objectContaining({
        modelMapping: { "model-b": "model-b", "model-a": "model-a" },
      }),
      expect.any(Object),
    )
    expect(mocks.updateAccount).toHaveBeenCalledWith(
      config,
      17,
      { status: "inactive" },
      expect.any(Object),
    )
  })

  it("opens imported credentials through the shared native create seed", async () => {
    expect(sub2ApiManagedResourceRegistration.createSeedKinds).toContain(
      MANAGED_RESOURCE_CREATE_SEED_KINDS.ManagedChannelImport,
    )

    const opened = await openNativeManagedChannelImportEditor(
      SITE_TYPES.SUB2API,
      {
        name: "Imported account",
        type: ChannelType.Anthropic,
        key: "import-secret",
        base_url: "https://api.example.invalid/v1",
        models: [],
        groups: [],
        priority: 8,
        weight: 3,
        status: 1,
        notes: "Imported note",
      },
    )
    const editor = opened?.editor

    expect(editor).toBeDefined()
    expect(editor?.validate(editor.initialValues)).toEqual({ valid: true })
    expect(editor?.initialValues).toMatchObject({
      name: "Imported account",
      platform: "anthropic",
      status: "active",
      baseURL: "https://api.example.invalid/v1",
      key: { kind: "replace", value: "import-secret" },
      supportedModels: [],
      concurrency: 1,
      priority: 8,
      notes: "Imported note",
    })

    const disabled = await openNativeManagedChannelImportEditor(
      SITE_TYPES.SUB2API,
      {
        name: "Disabled import",
        type: ChannelType.OpenAI,
        key: "disabled-secret",
        base_url: "https://disabled.example.invalid/v1",
        models: [],
        groups: [],
        priority: 2,
        weight: 1,
        status: 0,
      },
    )
    expect(disabled?.editor.initialValues.status).toBe("inactive")
  })

  it("keeps masked imported credentials unavailable for native create validation", async () => {
    const opened = await openNativeManagedChannelImportEditor(
      SITE_TYPES.SUB2API,
      {
        name: "Masked import",
        type: ChannelType.OpenAI,
        key: "sk-********",
        base_url: "https://api.example.invalid/v1",
        models: [],
        groups: [],
        priority: 1,
        weight: 9,
        status: 1,
      },
    )
    const editor = opened!.editor

    expect(editor.initialValues.key).toEqual({ kind: "unchanged" })
    expect(editor.validate(editor.initialValues)).toEqual({
      valid: false,
      issues: expect.arrayContaining([
        {
          fieldId: SUB2API_MANAGED_RESOURCE_FIELD_IDS.Key,
          code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.Required,
        },
      ]),
    })
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
    expect(
      editor.validate({
        ...editor.initialValues,
        key: { kind: "clear" },
      }),
    ).toEqual({
      valid: false,
      issues: [
        {
          fieldId: SUB2API_MANAGED_RESOURCE_FIELD_IDS.Key,
          code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.InvalidValue,
        },
      ],
    })
    await expect(editor.loadSecret?.("name")).rejects.toMatchObject({
      failure: { code: MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed },
    })
    await expect(editor.loadSecret?.("key")).resolves.toBe("saved-secret")
    expect(mocks.revealKey).toHaveBeenCalledWith(config, 17, undefined)

    const result = await editor.submit({
      ...editor.initialValues,
      name: "Renamed upstream",
      baseURL: "https://next.example.invalid/v1",
      key: { kind: "replace", value: "replacement-secret" },
      supportedModels: ["model-aliased", "model-added"],
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
        modelMapping: {
          "model-aliased": "provider-model",
          "model-added": "model-added",
        },
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

  it("shows fail-closed facts for an auto-disabled account without a saved key", async () => {
    const edgeAccount = {
      ...account,
      id: 18,
      name: "",
      notes: "",
      credentials: {
        model_mapping: {
          " model-example ": " provider-model ",
          " ": "ignored",
          "model-without-target": " ",
        },
      },
      credentials_status: { has_api_key: false },
      concurrency: undefined,
      priority: undefined,
      status: "error" as const,
    }
    mocks.listAccounts.mockResolvedValueOnce({ items: [edgeAccount], total: 1 })
    mocks.getAccount.mockResolvedValue(edgeAccount)
    const workspace = await sub2ApiManagedResourceRegistration.open()
    const [facts] = (await workspace.list()).items

    expect(facts).toMatchObject({
      displayName: "Sub2API account 18",
      status: "auto-disabled",
      fields: expect.arrayContaining([
        { fieldId: "key", kind: "secret", state: "unavailable" },
        {
          fieldId: "supportedModels",
          kind: "list",
          value: ["model-example"],
        },
      ]),
    })
    for (const fieldId of [
      SUB2API_MANAGED_RESOURCE_FIELD_IDS.BaseUrl,
      SUB2API_MANAGED_RESOURCE_FIELD_IDS.Concurrency,
      SUB2API_MANAGED_RESOURCE_FIELD_IDS.Priority,
    ]) {
      expect(facts.fields).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ fieldId })]),
      )
    }

    const editor = await workspace.openEditEditor(facts.ref)
    expect(editor.loadSecret).toBeUndefined()
    expect(editor.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fieldId: "status",
          options: expect.arrayContaining([{ value: "error" }]),
        }),
        expect.objectContaining({ fieldId: "key", secretState: "unavailable" }),
      ]),
    )
    const validValues = {
      ...editor.initialValues,
      name: "Recovered account",
      baseURL: "https://recovered.example.invalid/v1",
    }
    expect(editor.validate(validValues)).toEqual({ valid: true })
    expect(editor.validate({ ...validValues, status: "paused" })).toEqual({
      valid: false,
      issues: [
        {
          fieldId: SUB2API_MANAGED_RESOURCE_FIELD_IDS.Status,
          code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.UnsupportedOption,
        },
      ],
    })
  })

  it("skips the provider update when editable values are unchanged", async () => {
    const workspace = await sub2ApiManagedResourceRegistration.open()
    const [facts] = (await workspace.list()).items
    const editor = await workspace.openEditEditor(facts.ref)

    const result = await editor.submit(editor.initialValues)

    expect(result).toMatchObject({
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Succeeded,
      confirmedEffects: [],
    })
    expect(mocks.updateAccount).not.toHaveBeenCalled()
  })

  it("rejects malformed resource references before provider dispatch", async () => {
    const workspace = await sub2ApiManagedResourceRegistration.open()
    const [facts] = (await workspace.list()).items

    await expectFailureCode(
      workspace.openEditEditor({ ...facts.ref, resourceId: "not-a-number" }),
      MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed,
    )
    expect(mocks.getAccount).not.toHaveBeenCalled()
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

  it("filters non-api-key wire records and preserves unknown status without writing it back", async () => {
    const unknownStatusAccount = {
      ...account,
      id: 18,
      status: "paused-by-upstream",
    }
    mocks.listAccounts.mockResolvedValueOnce({
      items: [{ ...account, id: 19, type: "oauth" }, unknownStatusAccount],
      total: 2,
    })
    mocks.getAccount.mockResolvedValue(unknownStatusAccount)
    const workspace = await sub2ApiManagedResourceRegistration.open()
    const page = await workspace.list()

    expect(page.items).toHaveLength(1)
    expect(page.items[0]).toMatchObject({
      displayName: "Primary upstream",
      status: "unknown",
      fields: expect.arrayContaining([
        { fieldId: "status", kind: "text", value: "unknown" },
      ]),
    })

    const editor = await workspace.openEditEditor(page.items[0].ref)
    const values = { ...editor.initialValues, name: "Renamed unknown status" }
    expect(editor.validate(values)).toEqual({ valid: true })
    mocks.updateAccount.mockImplementationOnce(
      async (_config, _accountId, _input, options) => {
        options?.observer?.onDispatch()
        options?.observer?.onResponse()
        return { ...unknownStatusAccount, name: "Renamed unknown status" }
      },
    )

    await editor.submit(values)

    expect(mocks.updateAccount.mock.calls.at(-1)?.[2]).toEqual({
      name: "Renamed unknown status",
    })
  })

  it("forwards operation abort signals through native create, update, and delete", async () => {
    const controller = new AbortController()
    const createWorkspace = await sub2ApiManagedResourceRegistration.open()
    const createEditor = await createWorkspace.openCreateEditor()

    await createEditor.submit(
      {
        ...createEditor.initialValues,
        name: "Signal create",
        baseURL: "https://api.example.invalid/v1",
        key: { kind: "replace", value: "signal-secret" },
      },
      { signal: controller.signal },
    )
    expect(mocks.createAccount.mock.calls.at(-1)?.[2]).toMatchObject({
      signal: controller.signal,
    })

    const updateWorkspace = await sub2ApiManagedResourceRegistration.open()
    const [facts] = (await updateWorkspace.list()).items
    const updateEditor = await updateWorkspace.openEditEditor(facts.ref)
    await updateEditor.submit(
      { ...updateEditor.initialValues, name: "Signal update" },
      { signal: controller.signal },
    )
    expect(mocks.updateAccount.mock.calls.at(-1)?.[3]).toMatchObject({
      signal: controller.signal,
    })

    const deleteWorkspace = await sub2ApiManagedResourceRegistration.open()
    const [deleteFacts] = (await deleteWorkspace.list()).items
    await deleteWorkspace.delete(deleteFacts.ref, { signal: controller.signal })
    expect(mocks.deleteAccount.mock.calls.at(-1)?.[2]).toMatchObject({
      signal: controller.signal,
    })
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

    await expect(editor.loadSecret?.("key")).rejects.toMatchObject({
      name: "ManagedResourceError",
      failure: {
        code: MANAGED_RESOURCE_FAILURE_CODES.PermissionDenied,
        message: "step-up required",
        upstreamCode: SUB2API_STEP_UP_ADMIN_KEY_FORBIDDEN_CODE,
      },
    } satisfies Partial<ManagedResourceError>)
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
