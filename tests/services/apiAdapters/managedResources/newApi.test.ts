import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  ChannelType,
  NEW_API_MANAGED_RESOURCE_DETAIL_FIELD_IDS,
  NEW_API_MANAGED_RESOURCE_FIELD_IDS,
  NEW_API_MANAGED_RESOURCE_TABLE_FIELD_IDS,
} from "~/constants/newApi"
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
  MANAGED_RESOURCE_FAILURE_RECOVERY_HINTS,
  ManagedResourceError,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import { RESOURCE_FIELD_OPTION_LOAD_TRIGGERS } from "~/services/apiAdapters/contracts/resourceNative"
import { openNativeManagedChannelImportEditor } from "~/services/apiAdapters/managedResources/channelImport"
import {
  newApiManagedResourceRegistration,
  openNewApiNativeResourceOperations,
} from "~/services/apiAdapters/managedResources/newApi"
import { newApiManagedSiteMigrationCapability } from "~/services/apiAdapters/managedResources/newApiMigration"
import { getManagedResourceRegistration } from "~/services/apiAdapters/managedResources/registry"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import {
  MANAGED_SITE_MUTATION_COMPLETIONS,
  MANAGED_SITE_MUTATION_EFFECT_KINDS,
  MANAGED_SITE_MUTATION_OUTCOMES,
} from "~/services/managedSites/mutations"
import { NewApiChannelKeyRequirementError } from "~/services/managedSites/providers/newApiSession"
import { CHANNEL_STATUS } from "~/types/managedSite"
import { buildManagedSiteChannel } from "~~/tests/test-utils/factories"

const mocks = vi.hoisted(() => ({
  getPreferences: vi.fn(),
  list: vi.fn(),
  get: vi.fn(),
  search: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  fetchSecretKey: vi.fn(),
  fetchModels: vi.fn(),
  fetchDraftModels: vi.fn(),
  fetchSiteUserGroups: vi.fn(),
  fetchAccountAvailableModels: vi.fn(),
  buildPayload: vi.fn(),
  withProtectionBypass: vi.fn(),
}))

vi.mock("~/services/preferences/userPreferences", () => ({
  userPreferences: { getPreferences: mocks.getPreferences },
}))

vi.mock("~/services/apiAdapters/managedSites/newApi", () => ({
  newApiManagedSiteCapabilities: {
    channels: {
      list: mocks.list,
      get: mocks.get,
      search: mocks.search,
      create: mocks.create,
      update: mocks.update,
      delete: mocks.remove,
      fetchSecretKey: mocks.fetchSecretKey,
      fetchModels: mocks.fetchModels,
      fetchDraftModels: mocks.fetchDraftModels,
    },
    channelDrafts: { buildPayload: mocks.buildPayload },
    queries: {
      fetchSiteUserGroups: mocks.fetchSiteUserGroups,
      fetchAccountAvailableModels: mocks.fetchAccountAvailableModels,
    },
  },
}))

vi.mock("~/services/protectionBypass/client", () => ({
  withProtectionBypassUserCommand: mocks.withProtectionBypass,
}))

const config = {
  baseUrl: "https://new-api.example.invalid/",
  adminToken: "admin-token",
  userId: "42",
  username: "admin",
  password: "password",
  totpSecret: "",
}

const channel = buildManagedSiteChannel({
  id: 17,
  name: "Primary channel",
  key: "",
  models: "model-a,model-b",
  group: "default,vip",
  priority: 3,
  weight: 8,
})

const createdChannel = buildManagedSiteChannel({
  id: 18,
  name: "Imported channel",
  models: "model-a",
})

const createDraft = (name: string) => ({
  name,
  type: ChannelType.OpenAI,
  key: "sk-example",
  base_url: "https://upstream.example.invalid",
  models: ["model-a"],
  groups: ["default"],
  priority: 0,
  weight: 0,
  status: CHANNEL_STATUS.Enable,
})

const success = (data: unknown = undefined) => ({
  outcome: MANAGED_SITE_MUTATION_OUTCOMES.Succeeded,
  data,
  confirmedEffects: [
    {
      kind: MANAGED_SITE_MUTATION_EFFECT_KINDS.ResourceCreated,
      resourceKind: "channel" as const,
    },
  ],
})

const expectFailureCode = async (promise: Promise<unknown>, code: string) => {
  const error = await promise.catch((failure) => failure)
  expect(error).toBeInstanceOf(ManagedResourceError)
  expect((error as ManagedResourceError).failure.code).toBe(code)
}

describe("New API native managed resource", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.getPreferences.mockResolvedValue({ newApi: config })
    mocks.list.mockResolvedValue({ items: [channel], total: 1 })
    mocks.get.mockResolvedValue(channel)
    mocks.search.mockResolvedValue({ items: [channel], total: 1 })
    mocks.create.mockResolvedValue(success())
    mocks.update.mockResolvedValue({
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Succeeded,
      data: { id: channel.id },
      confirmedEffects: [
        {
          kind: MANAGED_SITE_MUTATION_EFFECT_KINDS.ResourceUpdated,
          resourceKind: "channel",
          resourceId: channel.id,
        },
        {
          kind: MANAGED_SITE_MUTATION_EFFECT_KINDS.StatusUpdated,
          resourceKind: "channel",
          resourceId: channel.id,
        },
      ],
    })
    mocks.remove.mockResolvedValue({
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Succeeded,
      data: undefined,
      confirmedEffects: [
        {
          kind: MANAGED_SITE_MUTATION_EFFECT_KINDS.ResourceDeleted,
          resourceKind: "channel",
          resourceId: channel.id,
        },
      ],
    })
    mocks.fetchSecretKey.mockResolvedValue("saved-secret")
    mocks.fetchModels.mockResolvedValue(["channel-model-a", "channel-model-b"])
    mocks.fetchDraftModels.mockResolvedValue(["draft-model-a", "draft-model-b"])
    mocks.fetchSiteUserGroups.mockResolvedValue(["default", "vip"])
    mocks.fetchAccountAvailableModels.mockResolvedValue(["model-a", "model-b"])
    mocks.buildPayload.mockImplementation((draft) => ({
      mode: "single",
      channel: draft,
    }))
    mocks.withProtectionBypass.mockImplementation(
      async (_command, _surface, operation) =>
        await operation({ commandId: "command-1" }),
    )
  })

  it("registers New API with native channel policy and every preserved action", () => {
    expect(
      getAccountSiteDefinition(SITE_TYPES.NEW_API)?.managedResource,
    ).toEqual(
      expect.objectContaining({
        mode: MANAGED_RESOURCE_MODES.NativeResource,
        primaryKind: MANAGED_RESOURCE_KINDS.Channel,
        tableFieldIds: NEW_API_MANAGED_RESOURCE_TABLE_FIELD_IDS,
        detailFieldIds: NEW_API_MANAGED_RESOURCE_DETAIL_FIELD_IDS,
        actions: expect.arrayContaining([
          MANAGED_RESOURCE_PRODUCT_ACTIONS.Create,
          MANAGED_RESOURCE_PRODUCT_ACTIONS.DeleteSelected,
          MANAGED_RESOURCE_PRODUCT_ACTIONS.Migrate,
          MANAGED_RESOURCE_PRODUCT_ACTIONS.SyncModels,
          MANAGED_RESOURCE_PRODUCT_ACTIONS.ConfigureModelSync,
          MANAGED_RESOURCE_PRODUCT_ACTIONS.ConfigureModelFilters,
        ]),
      }),
    )
    expect(
      getManagedResourceRegistration(
        SITE_TYPES.NEW_API,
        MANAGED_RESOURCE_KINDS.Channel,
      ),
    ).toBe(newApiManagedResourceRegistration)
  })

  it("projects channel identity and actions without exposing the hidden key", async () => {
    const workspace = await newApiManagedResourceRegistration.open()
    const page = await workspace.list()

    expect(page.items).toHaveLength(1)
    expect(page.items[0]).toEqual(
      expect.objectContaining({
        displayName: "Primary channel",
        actions: {
          canUpdate: true,
          canDelete: true,
          channel: {
            channelId: 17,
            channelType: channel.type,
            canSyncModels: true,
            canOpenModelSync: true,
            canConfigureModelFilters: true,
          },
        },
      }),
    )
    expect(page.items[0].fields).toEqual(
      expect.arrayContaining([
        {
          fieldId: NEW_API_MANAGED_RESOURCE_FIELD_IDS.ModelCount,
          kind: "number",
          value: 2,
        },
        {
          fieldId: NEW_API_MANAGED_RESOURCE_FIELD_IDS.Key,
          kind: "secret",
          state: "unavailable",
        },
      ]),
    )
    expect(JSON.stringify(page.items[0])).not.toContain("saved-secret")
  })

  it("only offers create types representable by the common native editor", async () => {
    const workspace = await newApiManagedResourceRegistration.open()
    const editor = await workspace.openCreateEditor()
    const typeField = editor.fields.find(
      (field) => field.fieldId === NEW_API_MANAGED_RESOURCE_FIELD_IDS.Type,
    )

    expect(typeField).toMatchObject({
      type: "select",
      options: expect.arrayContaining([
        { value: String(ChannelType.Replicate), displayLabel: "Replicate" },
        {
          value: String(ChannelType.Codex),
          displayLabel: "ChatGPT Subscription (Codex)",
        },
        { value: String(ChannelType.Sub2API), displayLabel: "Sub2API" },
        { value: String(ChannelType.NewAPI), displayLabel: "New API" },
      ]),
    })
    expect(typeField?.type).toBe("select")
    if (typeField?.type !== "select") throw new Error("Expected type select")
    expect(typeField.options.map(({ value }) => value)).not.toContain(
      String(ChannelType.VertexAi),
    )
    expect(typeField.options.map(({ value }) => value)).not.toContain(
      String(ChannelType.AdvancedCustom),
    )
    expect(
      editor.validate({
        ...editor.initialValues,
        [NEW_API_MANAGED_RESOURCE_FIELD_IDS.Type]: String(
          ChannelType.AdvancedCustom,
        ),
      }),
    ).toMatchObject({ valid: false })
  })

  it.each([ChannelType.VolcEngine, ChannelType.SunoAPI, ChannelType.NewAPI])(
    "requires a Base URL for channel type %s before dispatch",
    async (type) => {
      const workspace = await newApiManagedResourceRegistration.open()
      const editor = await workspace.openCreateEditor()
      const result = editor.validate({
        ...editor.initialValues,
        [NEW_API_MANAGED_RESOURCE_FIELD_IDS.Name]: "Example channel",
        [NEW_API_MANAGED_RESOURCE_FIELD_IDS.Type]: String(type),
        [NEW_API_MANAGED_RESOURCE_FIELD_IDS.Key]: {
          kind: "replace",
          value: "credential-placeholder",
        },
        [NEW_API_MANAGED_RESOURCE_FIELD_IDS.Models]: ["model-example"],
      })

      expect(result).toMatchObject({
        valid: false,
        issues: expect.arrayContaining([
          {
            fieldId: NEW_API_MANAGED_RESOURCE_FIELD_IDS.BaseUrl,
            code: "required",
          },
        ]),
      })
    },
  )

  it("keeps the Base URL optional for channel types that do not require it", async () => {
    const workspace = await newApiManagedResourceRegistration.open()
    const editor = await workspace.openCreateEditor()
    const result = editor.validate({
      ...editor.initialValues,
      [NEW_API_MANAGED_RESOURCE_FIELD_IDS.Name]: "Example channel",
      [NEW_API_MANAGED_RESOURCE_FIELD_IDS.Type]: String(ChannelType.OpenAI),
      [NEW_API_MANAGED_RESOURCE_FIELD_IDS.Key]: {
        kind: "replace",
        value: "credential-placeholder",
      },
      [NEW_API_MANAGED_RESOURCE_FIELD_IDS.Models]: ["model-example"],
    })

    expect(result).toEqual({ valid: true })
  })

  it("rejects negative priority and weight through both descriptors and validation", async () => {
    const workspace = await newApiManagedResourceRegistration.open()
    const editor = await workspace.openCreateEditor()

    expect(
      editor.fields.find(
        ({ fieldId }) =>
          fieldId === NEW_API_MANAGED_RESOURCE_FIELD_IDS.Priority,
      ),
    ).toMatchObject({ type: "number", min: 0 })
    expect(
      editor.fields.find(
        ({ fieldId }) => fieldId === NEW_API_MANAGED_RESOURCE_FIELD_IDS.Weight,
      ),
    ).toMatchObject({ type: "number", min: 0 })

    const result = editor.validate({
      ...editor.initialValues,
      [NEW_API_MANAGED_RESOURCE_FIELD_IDS.Name]: "Example channel",
      [NEW_API_MANAGED_RESOURCE_FIELD_IDS.Key]: {
        kind: "replace",
        value: "credential-placeholder",
      },
      [NEW_API_MANAGED_RESOURCE_FIELD_IDS.Models]: ["model-example"],
      [NEW_API_MANAGED_RESOURCE_FIELD_IDS.Priority]: -1,
      [NEW_API_MANAGED_RESOURCE_FIELD_IDS.Weight]: -2,
    })

    expect(result).toMatchObject({
      valid: false,
      issues: expect.arrayContaining([
        {
          fieldId: NEW_API_MANAGED_RESOURCE_FIELD_IDS.Priority,
          code: "out_of_range",
        },
        {
          fieldId: NEW_API_MANAGED_RESOURCE_FIELD_IDS.Weight,
          code: "out_of_range",
        },
      ]),
    })
  })

  it("searches the complete inventory across provider facts instead of the narrow upstream endpoint", async () => {
    const inventory = Array.from({ length: 25 }, (_, index) =>
      buildManagedSiteChannel({
        id: index + 1,
        name: `Channel ${index + 1}`,
        group: "example-group",
      }),
    )
    mocks.list.mockResolvedValue({ items: inventory, total: inventory.length })
    const workspace = await newApiManagedResourceRegistration.open()

    const page = await workspace.list({ search: "example-group" })

    expect(page.items).toHaveLength(25)
    expect(page.total).toBe(25)
    expect(mocks.list).toHaveBeenCalledOnce()
    expect(mocks.search).not.toHaveBeenCalled()
  })

  it("opens the edit editor through the direct channel detail capability", async () => {
    const workspace = await newApiManagedResourceRegistration.open()
    const ref = (await workspace.list()).items[0]!.ref
    mocks.list.mockClear()

    await workspace.openEditEditor(ref)

    expect(mocks.get).toHaveBeenCalledWith(config, channel.id, undefined)
    expect(mocks.list).not.toHaveBeenCalled()
  })

  it("offers managed-site group suggestions while editing", async () => {
    mocks.fetchSiteUserGroups.mockResolvedValue(["default", "vip", "research"])
    const workspace = await newApiManagedResourceRegistration.open()
    const ref = (await workspace.list()).items[0]!.ref

    const editor = await workspace.openEditEditor(ref)

    expect(
      editor.fields.find(
        (field) => field.fieldId === NEW_API_MANAGED_RESOURCE_FIELD_IDS.Groups,
      ),
    ).toMatchObject({
      options: [{ value: "default" }, { value: "vip" }, { value: "research" }],
    })
  })

  it("preserves an unknown future channel type while editing other fields", async () => {
    const futureChannel = { ...channel, type: 61 }
    mocks.list.mockResolvedValue({ items: [futureChannel], total: 1 })
    mocks.get.mockResolvedValue(futureChannel)
    const workspace = await newApiManagedResourceRegistration.open()
    const ref = (await workspace.list()).items[0]!.ref
    const editor = await workspace.openEditEditor(ref)

    expect(editor.validate(editor.initialValues)).toEqual({ valid: true })
    await editor.submit({
      ...editor.initialValues,
      [NEW_API_MANAGED_RESOURCE_FIELD_IDS.Name]: "Renamed channel",
    })

    expect(mocks.update).toHaveBeenCalledWith(
      config,
      expect.objectContaining({ type: 61, name: "Renamed channel" }),
      undefined,
    )
  })

  it("supports upstream type edits without dropping latest provider fields", async () => {
    const openedDetail = {
      ...channel,
      other: '{"region":"opened"}',
      settings: '{"advanced_custom":{"endpoint":"opened"}}',
      setting: '{"proxy":"opened"}',
    }
    const latestDetail = {
      ...openedDetail,
      other: '{"region":"latest"}',
      settings: '{"advanced_custom":{"endpoint":"latest"}}',
      setting: '{"proxy":"latest"}',
    }
    mocks.list.mockResolvedValue({ items: [openedDetail], total: 1 })
    mocks.get
      .mockResolvedValueOnce(openedDetail)
      .mockResolvedValueOnce(latestDetail)
    const workspace = await newApiManagedResourceRegistration.open()
    const ref = (await workspace.list()).items[0]!.ref
    const editor = await workspace.openEditEditor(ref)

    await editor.submit({
      ...editor.initialValues,
      [NEW_API_MANAGED_RESOURCE_FIELD_IDS.Name]: "Renamed channel",
      [NEW_API_MANAGED_RESOURCE_FIELD_IDS.Type]: String(ChannelType.Anthropic),
    })

    expect(mocks.update).toHaveBeenCalledWith(
      config,
      expect.objectContaining({
        id: channel.id,
        name: "Renamed channel",
        type: ChannelType.Anthropic,
        other: '{"region":"latest"}',
        settings: '{"advanced_custom":{"endpoint":"latest"}}',
        setting: '{"proxy":"latest"}',
      }),
      undefined,
    )
    expect(mocks.update.mock.calls.at(-1)?.[1]).not.toHaveProperty("key")
  })

  it("omits an unchanged status from the provider update command", async () => {
    const workspace = await newApiManagedResourceRegistration.open()
    const ref = (await workspace.list()).items[0]!.ref
    const editor = await workspace.openEditEditor(ref)

    await editor.submit({
      ...editor.initialValues,
      [NEW_API_MANAGED_RESOURCE_FIELD_IDS.Name]: "Renamed channel",
    })

    expect(mocks.update).toHaveBeenCalledWith(
      config,
      expect.objectContaining({
        id: channel.id,
        name: "Renamed channel",
      }),
      undefined,
    )
    expect(mocks.update.mock.calls.at(-1)?.[1]).not.toHaveProperty("status")
  })

  it("keeps a changed status in the provider update command", async () => {
    const workspace = await newApiManagedResourceRegistration.open()
    const ref = (await workspace.list()).items[0]!.ref
    const editor = await workspace.openEditEditor(ref)

    await editor.submit({
      ...editor.initialValues,
      [NEW_API_MANAGED_RESOURCE_FIELD_IDS.Status]: "2",
    })

    expect(mocks.update.mock.calls.at(-1)?.[1]).toEqual(
      expect.objectContaining({ status: 2 }),
    )
  })

  it("projects only confirmed fields when a status update is partial", async () => {
    mocks.update.mockResolvedValueOnce({
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Partial,
      data: { id: channel.id },
      confirmedEffects: [
        {
          kind: MANAGED_SITE_MUTATION_EFFECT_KINDS.ResourceUpdated,
          resourceKind: "channel",
          resourceId: channel.id,
        },
      ],
      completion: MANAGED_SITE_MUTATION_COMPLETIONS.Rejected,
      diagnostic: { message: "provider rejected status" },
    })
    const workspace = await newApiManagedResourceRegistration.open()
    const ref = (await workspace.list()).items[0]!.ref
    const editor = await workspace.openEditEditor(ref)

    const result = await editor.submit({
      ...editor.initialValues,
      [NEW_API_MANAGED_RESOURCE_FIELD_IDS.Name]: "Renamed channel",
      [NEW_API_MANAGED_RESOURCE_FIELD_IDS.Status]: "2",
    })

    expect(result).toEqual(
      expect.objectContaining({
        outcome: MANAGED_SITE_MUTATION_OUTCOMES.Partial,
        data: expect.objectContaining({
          displayName: "Renamed channel",
          status: "enabled",
        }),
      }),
    )
  })

  it("derives list and edit secret states while retaining reveal capability", async () => {
    const channels = [
      { ...channel, id: 17, key: "sk-usable-example" },
      { ...channel, id: 18, key: "sk-****-masked" },
      { ...channel, id: 19, key: "" },
    ]
    mocks.list.mockResolvedValue({ items: channels, total: channels.length })
    mocks.get.mockImplementation(
      async (_config, channelId) =>
        channels.find((candidate) => candidate.id === channelId)!,
    )
    const workspace = await newApiManagedResourceRegistration.open()
    const page = await workspace.list()
    const expectedStates = ["available", "masked", "unavailable"]

    for (const [index, item] of page.items.entries()) {
      expect(
        item.fields.find(
          (field) => field.fieldId === NEW_API_MANAGED_RESOURCE_FIELD_IDS.Key,
        ),
      ).toEqual({
        fieldId: NEW_API_MANAGED_RESOURCE_FIELD_IDS.Key,
        kind: "secret",
        state: expectedStates[index],
      })

      const editor = await workspace.openEditEditor(item.ref)
      expect(
        editor.fields.find(
          (field) => field.fieldId === NEW_API_MANAGED_RESOURCE_FIELD_IDS.Key,
        ),
      ).toMatchObject({
        secretState: expectedStates[index],
        canLoadSecret: true,
      })
    }
  })

  it("loads an edit secret only through the protected native editor", async () => {
    const signal = new AbortController().signal
    const workspace = await newApiManagedResourceRegistration.open()
    const ref = (await workspace.list()).items[0].ref
    const editor = await workspace.openEditEditor(ref)

    await expect(
      editor.loadSecret?.(NEW_API_MANAGED_RESOURCE_FIELD_IDS.Key, { signal }),
    ).resolves.toBe("saved-secret")
    expect(mocks.fetchSecretKey).toHaveBeenCalledWith(config, channel.id, {
      protectionBypassExecution: { commandId: "command-1" },
      signal,
    })
  })

  it("rejects a pre-aborted protected secret read before opening the bypass", async () => {
    const controller = new AbortController()
    controller.abort(new DOMException("Cancelled secret read", "AbortError"))
    const workspace = await newApiManagedResourceRegistration.open()
    const ref = (await workspace.list()).items[0].ref
    const editor = await workspace.openEditEditor(ref)

    await expectFailureCode(
      editor.loadSecret!(NEW_API_MANAGED_RESOURCE_FIELD_IDS.Key, {
        signal: controller.signal,
      }),
      MANAGED_RESOURCE_FAILURE_CODES.Aborted,
    )
    expect(mocks.withProtectionBypass).not.toHaveBeenCalled()
    expect(mocks.fetchSecretKey).not.toHaveBeenCalled()
  })

  it("discards a protected secret result that arrives after cancellation", async () => {
    const controller = new AbortController()
    const abortError = new DOMException("Cancelled secret read", "AbortError")
    mocks.fetchSecretKey.mockImplementationOnce(async () => {
      controller.abort(abortError)
      return "late-secret"
    })
    const workspace = await newApiManagedResourceRegistration.open()
    const ref = (await workspace.list()).items[0].ref
    const editor = await workspace.openEditEditor(ref)

    await expectFailureCode(
      editor.loadSecret!(NEW_API_MANAGED_RESOURCE_FIELD_IDS.Key, {
        signal: controller.signal,
      }),
      MANAGED_RESOURCE_FAILURE_CODES.Aborted,
    )
    expect(mocks.fetchSecretKey).toHaveBeenCalledWith(config, channel.id, {
      protectionBypassExecution: { commandId: "command-1" },
      signal: controller.signal,
    })
  })

  it("marks only provider verification requirements with a controlled recovery hint", async () => {
    mocks.fetchSecretKey.mockRejectedValue(
      new NewApiChannelKeyRequirementError("secure-verification-required"),
    )
    const workspace = await newApiManagedResourceRegistration.open()
    const ref = (await workspace.list()).items[0].ref
    const editor = await workspace.openEditEditor(ref)

    const error = await editor
      .loadSecret?.(NEW_API_MANAGED_RESOURCE_FIELD_IDS.Key)
      .catch((failure) => failure)

    expect(error).toBeInstanceOf(ManagedResourceError)
    expect((error as ManagedResourceError).failure).toEqual({
      code: MANAGED_RESOURCE_FAILURE_CODES.PermissionDenied,
      recoveryHint:
        MANAGED_RESOURCE_FAILURE_RECOVERY_HINTS.InteractiveVerification,
    })
  })

  it("keeps an upstream 403 as ordinary permission denial", async () => {
    mocks.fetchSecretKey.mockRejectedValue(
      new ApiError(
        "forbidden",
        403,
        undefined,
        undefined,
        "provider-forbidden",
      ),
    )
    const workspace = await newApiManagedResourceRegistration.open()
    const ref = (await workspace.list()).items[0].ref
    const editor = await workspace.openEditEditor(ref)

    const error = await editor
      .loadSecret?.(NEW_API_MANAGED_RESOURCE_FIELD_IDS.Key)
      .catch((failure) => failure)

    expect(error).toBeInstanceOf(ManagedResourceError)
    expect((error as ManagedResourceError).failure).toEqual({
      code: MANAGED_RESOURCE_FAILURE_CODES.PermissionDenied,
      message: "forbidden",
      upstreamCode: "provider-forbidden",
    })
  })

  it.each([
    {
      name: "authentication failures",
      error: () => new ApiError("sign in again", 401),
      code: MANAGED_RESOURCE_FAILURE_CODES.AuthenticationFailed,
    },
    {
      name: "missing resources",
      error: () => new ApiError("missing channel", 404),
      code: MANAGED_RESOURCE_FAILURE_CODES.NotFound,
    },
    {
      name: "network failures",
      error: () =>
        new ApiError(
          "network unavailable",
          undefined,
          undefined,
          API_ERROR_CODES.NETWORK_ERROR,
        ),
      code: MANAGED_RESOURCE_FAILURE_CODES.Unavailable,
    },
    {
      name: "aborted operations",
      error: () => new DOMException("Cancelled", "AbortError"),
      code: MANAGED_RESOURCE_FAILURE_CODES.Aborted,
    },
    {
      name: "unexpected failures",
      error: () => new Error("unexpected failure"),
      code: MANAGED_RESOURCE_FAILURE_CODES.Unexpected,
    },
  ])(
    "maps $name through the native failure boundary",
    async ({ error, code }) => {
      mocks.fetchDraftModels.mockRejectedValueOnce(error())
      const editor = await (
        await newApiManagedResourceRegistration.open()
      ).openCreateEditor()

      await expectFailureCode(
        editor.loadOptions!(NEW_API_MANAGED_RESOURCE_FIELD_IDS.Models, {
          ...editor.initialValues,
          [NEW_API_MANAGED_RESOURCE_FIELD_IDS.Key]: {
            kind: "replace",
            value: "credential-placeholder",
          },
        }),
        code,
      )
    },
  )

  it("forwards public native operation signals to every channel mutation", async () => {
    const signal = new AbortController().signal
    const workspace = await newApiManagedResourceRegistration.open()
    const ref = (await workspace.list()).items[0].ref

    await workspace.list({ search: "Primary" }, { signal })

    const createEditor = await workspace.openCreateEditor({
      seed: {
        kind: MANAGED_RESOURCE_CREATE_SEED_KINDS.ManagedChannelImport,
        name: "Imported channel",
        channelType: "1",
        credential: "sk-example",
        baseUrl: "https://upstream.example.invalid",
        enabled: true,
        models: ["model-a"],
        orderingWeight: 0,
        priority: 0,
        notes: "",
      },
    })
    await createEditor.submit(createEditor.initialValues, { signal })

    const editEditor = await workspace.openEditEditor(ref)
    await editEditor.submit(editEditor.initialValues, { signal })
    await workspace.delete(ref, { signal })

    expect(mocks.list).toHaveBeenCalledWith(config, { signal })
    expect(mocks.search).not.toHaveBeenCalled()
    expect(mocks.create).toHaveBeenCalledWith(config, expect.any(Object), {
      signal,
    })
    expect(mocks.update).toHaveBeenCalledWith(config, expect.any(Object), {
      signal,
    })
    expect(mocks.remove).toHaveBeenCalledWith(config, channel.id, { signal })
  })

  it("loads groups without using account-level models as channel suggestions", async () => {
    const signal = new AbortController().signal
    const workspace = await newApiManagedResourceRegistration.open()
    const editor = await workspace.openCreateEditor({ signal })

    expect(
      editor.fields.find(
        (field) => field.fieldId === NEW_API_MANAGED_RESOURCE_FIELD_IDS.Models,
      ),
    ).toMatchObject({
      options: [],
      optionLoader: {
        dependsOn: [
          NEW_API_MANAGED_RESOURCE_FIELD_IDS.Type,
          NEW_API_MANAGED_RESOURCE_FIELD_IDS.BaseUrl,
          NEW_API_MANAGED_RESOURCE_FIELD_IDS.Key,
        ],
        trigger: RESOURCE_FIELD_OPTION_LOAD_TRIGGERS.Manual,
      },
    })
    expect(
      editor.fields.find(
        (field) => field.fieldId === NEW_API_MANAGED_RESOURCE_FIELD_IDS.Groups,
      ),
    ).toMatchObject({
      options: [{ value: "default" }, { value: "vip" }],
    })
    expect(mocks.fetchAccountAvailableModels).not.toHaveBeenCalled()
    expect(mocks.fetchSiteUserGroups).toHaveBeenCalledWith(config, { signal })
  })

  it("keeps optional group suggestions empty when their provider query fails", async () => {
    mocks.fetchSiteUserGroups.mockRejectedValueOnce(
      new ApiError("group inventory unavailable", 503),
    )

    const editor = await (
      await newApiManagedResourceRegistration.open()
    ).openCreateEditor()
    const groupsField = editor.fields.find(
      (field) => field.fieldId === NEW_API_MANAGED_RESOURCE_FIELD_IDS.Groups,
    )

    expect(groupsField).toMatchObject({ options: [] })
  })

  it("discards group suggestions that arrive after cancellation", async () => {
    const controller = new AbortController()
    const abortError = new DOMException("Cancelled group loading", "AbortError")
    mocks.fetchSiteUserGroups.mockImplementationOnce(async () => {
      controller.abort(abortError)
      return ["late-group"]
    })

    const workspace = await newApiManagedResourceRegistration.open()
    await expectFailureCode(
      workspace.openCreateEditor({ signal: controller.signal }),
      MANAGED_RESOURCE_FAILURE_CODES.Aborted,
    )
    expect(mocks.fetchSiteUserGroups).toHaveBeenCalledWith(config, {
      signal: controller.signal,
    })
  })

  it("rejects pre-aborted group loading before querying the provider", async () => {
    const controller = new AbortController()
    controller.abort(new DOMException("Cancelled group loading", "AbortError"))
    const workspace = await newApiManagedResourceRegistration.open()

    await expectFailureCode(
      workspace.openCreateEditor({ signal: controller.signal }),
      MANAGED_RESOURCE_FAILURE_CODES.Aborted,
    )
    expect(mocks.fetchSiteUserGroups).not.toHaveBeenCalled()
  })

  it("probes draft model options from the entered channel credential", async () => {
    const signal = new AbortController().signal
    const editor = await (
      await newApiManagedResourceRegistration.open()
    ).openCreateEditor()
    const values = {
      ...editor.initialValues,
      [NEW_API_MANAGED_RESOURCE_FIELD_IDS.Type]: String(ChannelType.OpenAI),
      [NEW_API_MANAGED_RESOURCE_FIELD_IDS.BaseUrl]:
        "https://upstream.example.invalid",
      [NEW_API_MANAGED_RESOURCE_FIELD_IDS.Key]: {
        kind: "replace" as const,
        value: "credential-placeholder",
      },
    }

    await expect(
      editor.loadOptions?.(NEW_API_MANAGED_RESOURCE_FIELD_IDS.Models, values, {
        signal,
      }),
    ).resolves.toEqual([{ value: "draft-model-a" }, { value: "draft-model-b" }])
    expect(mocks.fetchDraftModels).toHaveBeenCalledWith(
      config,
      {
        channelType: ChannelType.OpenAI,
        baseUrl: "https://upstream.example.invalid",
        credential: "credential-placeholder",
      },
      { signal },
    )
  })

  it("exposes the adapter-normalized model lookup message to shared consumers", async () => {
    mocks.fetchDraftModels.mockRejectedValueOnce(
      new ApiError("The example upstream rejected the model lookup", 502),
    )
    const editor = await (
      await newApiManagedResourceRegistration.open()
    ).openCreateEditor()
    const values = {
      ...editor.initialValues,
      [NEW_API_MANAGED_RESOURCE_FIELD_IDS.Type]: String(ChannelType.OpenAI),
      [NEW_API_MANAGED_RESOURCE_FIELD_IDS.Key]: {
        kind: "replace" as const,
        value: "credential-placeholder",
      },
    }

    const error = await editor
      .loadOptions?.(NEW_API_MANAGED_RESOURCE_FIELD_IDS.Models, values)
      .catch((failure) => failure)

    expect(error).toBeInstanceOf(ManagedResourceError)
    expect(error).toMatchObject({
      message: "The example upstream rejected the model lookup",
      failure: {
        code: MANAGED_RESOURCE_FAILURE_CODES.UpstreamRejected,
        message: "The example upstream rejected the model lookup",
      },
    })
  })

  it("probes the saved channel directly when its connection fields are unchanged", async () => {
    const workspace = await newApiManagedResourceRegistration.open()
    const ref = (await workspace.list()).items[0]!.ref
    const editor = await workspace.openEditEditor(ref)

    await editor.loadOptions?.(
      NEW_API_MANAGED_RESOURCE_FIELD_IDS.Models,
      editor.initialValues,
    )

    expect(mocks.fetchModels).toHaveBeenCalledWith(
      config,
      channel.id,
      undefined,
    )
    expect(mocks.fetchDraftModels).not.toHaveBeenCalled()
  })

  it("probes replacement edit credentials instead of the saved channel", async () => {
    const workspace = await newApiManagedResourceRegistration.open()
    const ref = (await workspace.list()).items[0]!.ref
    const editor = await workspace.openEditEditor(ref)

    await editor.loadOptions?.(NEW_API_MANAGED_RESOURCE_FIELD_IDS.Models, {
      ...editor.initialValues,
      [NEW_API_MANAGED_RESOURCE_FIELD_IDS.Key]: {
        kind: "replace",
        value: "replacement-placeholder",
      },
    })

    expect(mocks.fetchDraftModels).toHaveBeenCalledWith(
      config,
      expect.objectContaining({ credential: "replacement-placeholder" }),
      undefined,
    )
    expect(mocks.fetchModels).not.toHaveBeenCalled()
  })

  it("uses the protected saved credential when probing changed edit connection fields", async () => {
    const workspace = await newApiManagedResourceRegistration.open()
    const ref = (await workspace.list()).items[0]!.ref
    const editor = await workspace.openEditEditor(ref)

    await editor.loadOptions?.(NEW_API_MANAGED_RESOURCE_FIELD_IDS.Models, {
      ...editor.initialValues,
      [NEW_API_MANAGED_RESOURCE_FIELD_IDS.BaseUrl]:
        "https://changed-upstream.example.invalid",
    })

    expect(mocks.fetchSecretKey).toHaveBeenCalledWith(config, channel.id, {
      protectionBypassExecution: { commandId: "command-1" },
    })
    expect(mocks.fetchDraftModels).toHaveBeenCalledWith(
      config,
      expect.objectContaining({
        baseUrl: "https://changed-upstream.example.invalid",
        credential: "saved-secret",
      }),
      undefined,
    )
  })

  it("binds account import drafts and confirms the created identity by inventory diff", async () => {
    mocks.list
      .mockResolvedValueOnce({ items: [channel], total: 1 })
      .mockResolvedValueOnce({ items: [channel, createdChannel], total: 2 })
    const opened = await openNativeManagedChannelImportEditor(
      SITE_TYPES.NEW_API,
      {
        name: "Imported channel",
        type: 1,
        key: "sk-example",
        base_url: "https://upstream.example.invalid",
        models: ["model-a"],
        groups: ["default"],
        priority: 2,
        weight: 4,
        status: 1,
      },
    )

    expect(opened?.editor.initialValues).toEqual(
      expect.objectContaining({
        [NEW_API_MANAGED_RESOURCE_FIELD_IDS.Name]: "Imported channel",
        [NEW_API_MANAGED_RESOURCE_FIELD_IDS.Key]: {
          kind: "replace",
          value: "sk-example",
        },
      }),
    )
    const result = await opened!.editor.submit(opened!.editor.initialValues)
    expect(result).toEqual(
      expect.objectContaining({
        outcome: MANAGED_SITE_MUTATION_OUTCOMES.Succeeded,
        data: expect.objectContaining({
          ref: expect.objectContaining({ resourceId: "18" }),
        }),
      }),
    )
  })

  it("attributes two concurrent creates to their own provider identities", async () => {
    const firstCreatedChannel = buildManagedSiteChannel({
      id: 18,
      name: "Concurrent first",
      models: "model-a",
    })
    const secondCreatedChannel = buildManagedSiteChannel({
      id: 19,
      name: "Concurrent second",
      models: "model-b",
    })
    const inventory = [channel]
    mocks.list.mockImplementation(async () => ({
      items: [...inventory],
      total: inventory.length,
    }))
    mocks.create.mockImplementation(async (_config, payload) => {
      inventory.push(
        payload.channel.name === firstCreatedChannel.name
          ? firstCreatedChannel
          : secondCreatedChannel,
      )
      await Promise.resolve()
      return success()
    })
    const operations = await openNewApiNativeResourceOperations()

    const [first, second] = await Promise.all([
      operations.create(createDraft(firstCreatedChannel.name)),
      operations.create(createDraft(secondCreatedChannel.name)),
    ])

    expect(first).toMatchObject({
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Succeeded,
      data: { id: firstCreatedChannel.id },
    })
    expect(second).toMatchObject({
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Succeeded,
      data: { id: secondCreatedChannel.id },
    })
    expect(mocks.list).toHaveBeenCalledTimes(4)
    for (const [, options] of mocks.list.mock.calls) {
      expect(options).toEqual({ requireCompleteInventory: true })
    }
  })

  it("does not dispatch create when the complete baseline inventory fails", async () => {
    const inventoryError = new Error("complete inventory unavailable")
    mocks.list.mockRejectedValueOnce(inventoryError)
    const operations = await openNewApiNativeResourceOperations()

    await expect(
      operations.create(createDraft("Baseline failure")),
    ).rejects.toBe(inventoryError)
    expect(mocks.create).not.toHaveBeenCalled()
    expect(mocks.list).toHaveBeenCalledWith(config, {
      requireCompleteInventory: true,
    })
  })

  it("keeps a confirmed write non-replayable when the complete follow-up inventory fails", async () => {
    mocks.list
      .mockResolvedValueOnce({ items: [channel], total: 1 })
      .mockRejectedValueOnce(new Error("follow-up inventory unavailable"))
    const operations = await openNewApiNativeResourceOperations()

    await expect(
      operations.create(createDraft("Follow-up failure")),
    ).resolves.toMatchObject({
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Partial,
      completion: MANAGED_SITE_MUTATION_COMPLETIONS.Uncertain,
      diagnostic: {
        code: MANAGED_RESOURCE_FAILURE_CODES.MutationStateUncertain,
      },
    })
    expect(mocks.create).toHaveBeenCalledOnce()
  })

  it("does not dispatch a create that is aborted while waiting for attribution", async () => {
    const firstCreatedChannel = buildManagedSiteChannel({
      id: 18,
      name: "Blocking create",
    })
    const inventory = [channel]
    let markFirstDispatched!: () => void
    let releaseFirstCreate!: () => void
    const firstDispatched = new Promise<void>((resolve) => {
      markFirstDispatched = resolve
    })
    const firstCreateReleased = new Promise<void>((resolve) => {
      releaseFirstCreate = resolve
    })
    mocks.list.mockImplementation(async () => ({
      items: [...inventory],
      total: inventory.length,
    }))
    mocks.create.mockImplementationOnce(async () => {
      inventory.push(firstCreatedChannel)
      markFirstDispatched()
      await firstCreateReleased
      return success()
    })
    const operations = await openNewApiNativeResourceOperations()
    const first = operations.create(createDraft(firstCreatedChannel.name))
    await firstDispatched
    const controller = new AbortController()
    const abortError = new DOMException("Cancelled queued create", "AbortError")
    const queued = operations.create(createDraft("Cancelled create"), {
      signal: controller.signal,
    })

    controller.abort(abortError)
    releaseFirstCreate()

    await expect(first).resolves.toMatchObject({
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Succeeded,
      data: { id: firstCreatedChannel.id },
    })
    await expect(queued).rejects.toBe(abortError)
    expect(mocks.create).toHaveBeenCalledOnce()
  })

  it("preserves provider uncertainty without a follow-up read or replay", async () => {
    mocks.list.mockResolvedValueOnce({ items: [channel], total: 1 })
    mocks.create.mockResolvedValueOnce({
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Uncertain,
      diagnostic: { message: "provider response was lost" },
    })
    const operations = await openNewApiNativeResourceOperations()

    await expect(
      operations.create(createDraft("Uncertain create")),
    ).resolves.toEqual({
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Uncertain,
      diagnostic: { message: "provider response was lost" },
    })
    expect(mocks.list).toHaveBeenCalledOnce()
    expect(mocks.create).toHaveBeenCalledOnce()
  })

  it("keeps identity ambiguous when an external create changes the same inventory", async () => {
    const matchingCreatedChannel = buildManagedSiteChannel({
      id: 18,
      name: "Requested create",
    })
    const externalCreatedChannel = buildManagedSiteChannel({
      id: 19,
      name: "External create",
    })
    mocks.list
      .mockResolvedValueOnce({ items: [channel], total: 1 })
      .mockResolvedValueOnce({
        items: [channel, matchingCreatedChannel, externalCreatedChannel],
        total: 3,
      })
    const operations = await openNewApiNativeResourceOperations()

    await expect(
      operations.create(createDraft(matchingCreatedChannel.name)),
    ).resolves.toMatchObject({
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Partial,
      completion: MANAGED_SITE_MUTATION_COMPLETIONS.Uncertain,
      diagnostic: {
        code: MANAGED_RESOURCE_FAILURE_CODES.MutationStateUncertain,
      },
    })
    expect(mocks.create).toHaveBeenCalledOnce()
  })

  it("returns a non-replayable partial result when create identity stays ambiguous", async () => {
    mocks.list
      .mockResolvedValueOnce({ items: [channel], total: 1 })
      .mockResolvedValueOnce({ items: [channel], total: 1 })
    const workspace = await newApiManagedResourceRegistration.open()
    const editor = await workspace.openCreateEditor({
      seed: {
        kind: MANAGED_RESOURCE_CREATE_SEED_KINDS.ManagedChannelImport,
        name: "Imported channel",
        channelType: "1",
        credential: "sk-example",
        baseUrl: "https://upstream.example.invalid",
        enabled: true,
        models: ["model-a"],
        orderingWeight: 0,
        priority: 0,
        notes: "",
      },
    })

    await expect(editor.submit(editor.initialValues)).resolves.toEqual(
      expect.objectContaining({
        outcome: MANAGED_SITE_MUTATION_OUTCOMES.Partial,
        diagnostic: expect.objectContaining({
          code: MANAGED_RESOURCE_FAILURE_CODES.MutationStateUncertain,
        }),
      }),
    )
  })

  it("projects canonical migration data without treating empty JSON defaults as loss", async () => {
    const workspace = await newApiManagedResourceRegistration.open()
    const item = (await workspace.list()).items[0]
    const selection = {
      selectionId: "selection-17",
      displayName: item.displayName,
      ref: item.ref,
    }

    const prepared =
      await newApiManagedSiteMigrationCapability.source!.prepare(selection)
    const credential =
      await newApiManagedSiteMigrationCapability.source!.resolveCredential(
        selection,
      )

    expect(prepared).toEqual({
      status: "ready",
      source: expect.objectContaining({
        sourceSiteType: SITE_TYPES.NEW_API,
        models: ["model-a", "model-b"],
        groups: ["default", "vip"],
        priority: 3,
        weight: 8,
        lossSignals: {
          hasModelMapping: false,
          hasStatusCodeMapping: false,
          hasAdvancedSettings: false,
          hasMultiKeyState: false,
        },
      }),
    })
    expect(credential).toEqual({
      status: "ready",
      credential: "saved-secret",
    })
  })

  it("reports populated provider-only mappings before migration", async () => {
    const channelWithProviderMappings = {
      ...channel,
      model_mapping: '{"model-a":"model-b"}',
      setting: '{"region":"example"}',
    }
    mocks.list.mockResolvedValue({
      items: [channelWithProviderMappings],
      total: 1,
    })
    mocks.get.mockResolvedValue(channelWithProviderMappings)
    const workspace = await newApiManagedResourceRegistration.open()
    const item = (await workspace.list()).items[0]

    await expect(
      newApiManagedSiteMigrationCapability.source!.prepare({
        selectionId: "selection-17",
        displayName: item.displayName,
        ref: item.ref,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        status: "ready",
        source: expect.objectContaining({
          lossSignals: expect.objectContaining({
            hasModelMapping: true,
            hasAdvancedSettings: true,
          }),
        }),
      }),
    )
  })

  it("preserves migration credential cancellation instead of blocking it", async () => {
    const abortError = new DOMException("Cancelled", "AbortError")
    mocks.fetchSecretKey.mockRejectedValue(abortError)
    const workspace = await newApiManagedResourceRegistration.open()
    const item = (await workspace.list()).items[0]

    await expect(
      newApiManagedSiteMigrationCapability.source!.resolveCredential({
        selectionId: "selection-17",
        displayName: item.displayName,
        ref: item.ref,
      }),
    ).rejects.toBe(abortError)
  })

  it("rejects missing and invalid saved configuration", async () => {
    mocks.getPreferences.mockResolvedValueOnce({})
    await expectFailureCode(
      newApiManagedResourceRegistration.open(),
      MANAGED_RESOURCE_FAILURE_CODES.ConfigurationRequired,
    )

    mocks.getPreferences.mockResolvedValueOnce({
      newApi: { ...config, baseUrl: "not-an-origin" },
    })
    await expectFailureCode(
      newApiManagedResourceRegistration.open(),
      MANAGED_RESOURCE_FAILURE_CODES.InvalidConfiguration,
    )
  })
})
