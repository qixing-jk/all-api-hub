import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  AXON_HUB_CHANNEL_STATUS,
  AXON_HUB_CHANNEL_TYPE,
} from "~/constants/axonHub"
import { isManagedSiteType, SITE_TYPES } from "~/constants/siteType"
import {
  MANAGED_RESOURCE_KINDS,
  MANAGED_RESOURCE_MODES,
} from "~/services/accountSiteDefinitions/contracts"
import {
  getAccountSiteDefinition,
  getAccountSiteDefinitions,
} from "~/services/accountSiteDefinitions/registry"
import {
  MANAGED_RESOURCE_FAILURE_CODES,
  ManagedResourceError,
  type EditableResourceProjection,
  type ManagedResourceRef,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import {
  AXON_HUB_EDITABLE_FIELD_IDS,
  axonHubManagedResourceRegistration,
  AxonHubNativeError,
  openAxonHubNativeResourceOperations,
  type AxonHubNativeFailure,
  type AxonHubNativeResourceOperations,
} from "~/services/apiAdapters/managedResources/axonHub"
import { getManagedResourceRegistration } from "~/services/apiAdapters/managedResources/registry"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import type { AxonHubChannel } from "~/types/axonHub"

const mocks = vi.hoisted(() => {
  class RequestError extends Error {
    constructor(
      readonly kind:
        | "authentication"
        | "permission"
        | "not-found"
        | "upstream-rejected"
        | "protocol"
        | "unavailable"
        | "aborted",
      readonly dispatch: "not-dispatched" | "dispatched",
    ) {
      super(kind)
      this.name = "AxonHubRequestError"
    }
  }

  return {
    RequestError,
    getPreferences: vi.fn(),
    resolveRuntimeConfig: vi.fn(),
    signIn: vi.fn(),
    listPage: vi.fn(),
    getChannel: vi.fn(),
    createChannel: vi.fn(),
    updateChannel: vi.fn(),
    updateStatus: vi.fn(),
    deleteChannel: vi.fn(),
  }
})

vi.mock("~/services/preferences/userPreferences", () => ({
  userPreferences: { getPreferences: mocks.getPreferences },
}))

vi.mock("~/services/managedSites/runtimeConfig", () => ({
  resolveManagedSiteRuntimeConfigForType: mocks.resolveRuntimeConfig,
}))

vi.mock("~/services/apiService/axonHub", () => ({
  AxonHubRequestError: mocks.RequestError,
  signIn: mocks.signIn,
  listAxonHubChannelPage: mocks.listPage,
  getAxonHubChannel: mocks.getChannel,
  createAxonHubChannel: mocks.createChannel,
  updateAxonHubChannel: mocks.updateChannel,
  updateAxonHubChannelStatus: mocks.updateStatus,
  deleteAxonHubChannel: mocks.deleteChannel,
}))

const config = {
  baseUrl: "https://api.example.invalid/",
  email: "admin@example.invalid",
  password: "saved-password",
}

const buildListChannel = (
  overrides: Partial<AxonHubChannel> = {},
): AxonHubChannel => ({
  id: "opaque-channel-1",
  name: "Example channel",
  type: AXON_HUB_CHANNEL_TYPE.OPENAI,
  status: AXON_HUB_CHANNEL_STATUS.ENABLED,
  baseURL: "https://gateway.example.invalid",
  supportedModels: ["model-a"],
  tags: ["primary"],
  ...overrides,
})

const pinnedSettings = {
  extraModelPrefix: "old-prefix",
  modelMappings: [{ from: "model-a", to: "model-b" }],
  autoTrimedModelPrefixes: ["vendor/"],
  hideOriginalModels: true,
  hideMappedModels: false,
  lowercaseModelId: true,
  proxy: {
    type: "http",
    url: "https://proxy.example.invalid",
    username: "proxy-user",
    password: "proxy-password",
  },
  transformOptions: {
    forceArrayInstructions: true,
    forceArrayInputs: false,
    replaceDeveloperRoleWithSystem: true,
    reasoningEffortMapping: [{ from: "high", to: "medium" }],
  },
  headerOverrideOperations: [
    { op: "set", path: "x-example", value: "header-value" },
  ],
  bodyOverrideOperations: [{ op: "set", path: "example", value: "body-value" }],
  passThroughUserAgent: true,
  passThroughBody: false,
  rateLimit: {
    rpm: 10,
    tpm: 20,
    maxConcurrent: 3,
    queueSize: 4,
    queueTimeoutMs: 500,
  },
  retryableStatusCodes: [429, 503],
  retryableErrorPatterns: [{ pattern: "retry", regex: false }],
  providerQuota: {
    opencodeGo: { workspaceId: "workspace-placeholder", authCookie: null },
  },
} satisfies NonNullable<AxonHubChannel["settings"]>

const buildDetailChannel = (
  overrides: Partial<AxonHubChannel> = {},
): AxonHubChannel => ({
  ...buildListChannel(),
  credentials: { apiKeys: ["sk-placeholder-value"] },
  manualModels: ["manual-model"],
  defaultTestModel: "model-a",
  autoSyncSupportedModels: true,
  autoSyncModelPattern: "model-*",
  orderingWeight: 7,
  remark: "Example remark",
  settings: structuredClone(pinnedSettings),
  ...overrides,
})

const refFor = (channel = buildDetailChannel()): ManagedResourceRef => ({
  siteType: SITE_TYPES.AXON_HUB,
  kind: MANAGED_RESOURCE_KINDS.Channel,
  scopeKey: "https://api.example.invalid",
  resourceId: channel.id,
})

const expectFailureCode = async (promise: Promise<unknown>, code: string) => {
  const error = await promise.catch((failure) => failure)
  expect(error).toBeInstanceOf(ManagedResourceError)
  expect((error as ManagedResourceError).failure).toEqual({ code })
}

const openWorkspace = () => axonHubManagedResourceRegistration.open()

describe("AxonHub native managed-resource Adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const preferences = { marker: "saved-preferences" }
    mocks.getPreferences.mockResolvedValue(preferences)
    mocks.resolveRuntimeConfig.mockReturnValue({
      siteType: SITE_TYPES.AXON_HUB,
      config,
    })
    mocks.signIn.mockResolvedValue("session-token")
    mocks.listPage.mockResolvedValue({
      items: [buildListChannel()],
      total: 1,
    })
    mocks.getChannel.mockResolvedValue(buildDetailChannel())
    mocks.createChannel.mockResolvedValue(
      buildDetailChannel({ status: AXON_HUB_CHANNEL_STATUS.DISABLED }),
    )
    mocks.updateChannel.mockImplementation(async (_config, _id, input) => ({
      ...buildDetailChannel(),
      ...input,
    }))
    mocks.updateStatus.mockResolvedValue({
      id: "opaque-channel-1",
      status: AXON_HUB_CHANNEL_STATUS.ENABLED,
    })
    mocks.deleteChannel.mockResolvedValue(true)
  })

  it("opens AxonHub with validated saved configuration", async () => {
    const controller = new AbortController()
    const workspace = await axonHubManagedResourceRegistration.open({
      signal: controller.signal,
    })

    expect(mocks.getPreferences).toHaveBeenCalledOnce()
    expect(mocks.resolveRuntimeConfig).toHaveBeenCalledWith(
      { marker: "saved-preferences" },
      SITE_TYPES.AXON_HUB,
    )
    expect(mocks.signIn).toHaveBeenCalledWith(config, {
      signal: controller.signal,
    })
    expect(workspace.supportsSearch).toBe(true)
    const operations: AxonHubNativeResourceOperations =
      await openAxonHubNativeResourceOperations()
    expect(operations).toMatchObject({
      scopeKey: "https://api.example.invalid",
    })
  })

  it("maps missing invalid authentication permission and aborted config failures safely", async () => {
    mocks.resolveRuntimeConfig.mockReturnValueOnce(null)
    await expectFailureCode(
      openWorkspace(),
      MANAGED_RESOURCE_FAILURE_CODES.ConfigurationRequired,
    )

    mocks.resolveRuntimeConfig.mockReturnValueOnce({
      siteType: SITE_TYPES.AXON_HUB,
      config: { ...config, baseUrl: "not-an-origin" },
    })
    await expectFailureCode(
      openWorkspace(),
      MANAGED_RESOURCE_FAILURE_CODES.InvalidConfiguration,
    )

    mocks.signIn.mockRejectedValueOnce(
      new mocks.RequestError("authentication", "not-dispatched"),
    )
    const nativeError = await openAxonHubNativeResourceOperations().catch(
      (error) => error,
    )
    const expectedNativeFailure = {
      code: "authentication_failed",
      dispatch: "before",
    } satisfies AxonHubNativeFailure
    expect(nativeError).toBeInstanceOf(AxonHubNativeError)
    expect((nativeError as AxonHubNativeError).failure).toEqual(
      expectedNativeFailure,
    )
    expect(Object.keys((nativeError as AxonHubNativeError).failure)).toEqual([
      "code",
      "dispatch",
    ])

    for (const [kind, code] of [
      ["authentication", MANAGED_RESOURCE_FAILURE_CODES.AuthenticationFailed],
      ["permission", MANAGED_RESOURCE_FAILURE_CODES.PermissionDenied],
      ["aborted", MANAGED_RESOURCE_FAILURE_CODES.Aborted],
    ] as const) {
      mocks.signIn.mockRejectedValueOnce(
        new mocks.RequestError(kind, "not-dispatched"),
      )
      await expectFailureCode(openWorkspace(), code)
    }

    mocks.getPreferences.mockRejectedValueOnce(new Error("storage details"))
    await expectFailureCode(
      openWorkspace(),
      MANAGED_RESOURCE_FAILURE_CODES.Unexpected,
    )

    for (const [kind, dispatch, code] of [
      [
        "authentication",
        "dispatched",
        MANAGED_RESOURCE_FAILURE_CODES.AuthenticationFailed,
      ],
      [
        "permission",
        "dispatched",
        MANAGED_RESOURCE_FAILURE_CODES.PermissionDenied,
      ],
      [
        "upstream-rejected",
        "not-dispatched",
        MANAGED_RESOURCE_FAILURE_CODES.UpstreamRejected,
      ],
      ["not-found", "dispatched", MANAGED_RESOURCE_FAILURE_CODES.NotFound],
      ["aborted", "not-dispatched", MANAGED_RESOURCE_FAILURE_CODES.Aborted],
    ] as const) {
      mocks.updateChannel.mockRejectedValueOnce(
        new mocks.RequestError(kind, dispatch),
      )
      const workspace = await openWorkspace()
      const editor = await workspace.openEditEditor(refFor())
      await expectFailureCode(
        editor.submit({ ...editor.initialValues, name: "Renamed" }),
        code,
      )
    }

    const workspace = await openWorkspace()
    const editor = await workspace.openCreateEditor()
    const spoofedValues = { ...editor.initialValues }
    Object.defineProperty(spoofedValues, "name", {
      get() {
        throw { code: "permission_denied", dispatch: "before" }
      },
    })
    let spoofedFailure: unknown
    try {
      editor.validate(spoofedValues)
    } catch (error) {
      spoofedFailure = error
    }
    expect(spoofedFailure).toBeInstanceOf(ManagedResourceError)
    expect((spoofedFailure as ManagedResourceError).failure).toEqual({
      code: MANAGED_RESOURCE_FAILURE_CODES.Unexpected,
    })
  })

  it("maps native list and detail responses to safe display facts", async () => {
    const workspace = await openWorkspace()
    const page = await workspace.list()
    const detail = await workspace.get(refFor())

    expect(page.items[0]).toMatchObject({
      displayName: "Example channel",
      status: "enabled",
      actions: { canUpdate: true, canDelete: true },
    })
    expect(page.items[0]?.fields).not.toContainEqual(
      expect.objectContaining({ fieldId: "key" }),
    )
    expect(detail.fields).toContainEqual({
      fieldId: "key",
      kind: "secret",
      state: "available",
    })
    expect(JSON.stringify([page, detail])).not.toContain("sk-placeholder-value")
    expect(JSON.stringify([page, detail])).not.toContain("proxy-password")
  })

  it("maps all fourteen approved fields to safe detail facts", async () => {
    const workspace = await openWorkspace()
    const detail = await workspace.get(refFor())

    expect(detail.fields.map((field) => field.fieldId)).toEqual(
      AXON_HUB_EDITABLE_FIELD_IDS,
    )
    expect(new Set(detail.fields.map((field) => field.fieldId)).size).toBe(14)
    expect(
      detail.fields.every((field) =>
        ["text", "number", "boolean", "list", "secret"].includes(field.kind),
      ),
    ).toBe(true)
  })

  it("returns only the definition-selected safe fact subset from list", async () => {
    const workspace = await openWorkspace()
    const page = await workspace.list()

    expect(page.items[0]?.fields.map((field) => field.fieldId)).toEqual([
      "name",
      "type",
      "baseURL",
      "status",
      "supportedModels",
      "tags",
    ])
  })

  it("searches across all AxonHub pages when supportsSearch is true", async () => {
    mocks.listPage.mockImplementation(async (_config, input) => {
      if (!input.cursor) {
        return {
          items: [buildListChannel({ id: "first", name: "First" })],
          nextCursor: "next-page",
        }
      }
      return {
        items: [buildListChannel({ id: "second", name: "Needle channel" })],
      }
    })
    const workspace = await openWorkspace()

    const page = await workspace.list({ search: "needle", limit: 1 })

    expect(page.items.map((item) => item.ref.resourceId)).toEqual(["second"])
    expect(mocks.listPage).toHaveBeenNthCalledWith(
      1,
      config,
      { limit: 100 },
      undefined,
    )
    expect(mocks.listPage).toHaveBeenNthCalledWith(
      2,
      config,
      { cursor: "next-page", limit: 100 },
      undefined,
    )

    mocks.listPage.mockClear()
    mocks.listPage.mockResolvedValue({ items: [], nextCursor: "repeated" })
    await expectFailureCode(
      workspace.list({ search: "absent" }),
      MANAGED_RESOURCE_FAILURE_CODES.Unexpected,
    )
    expect(mocks.listPage).toHaveBeenCalledTimes(2)
    expect(mocks.getChannel).not.toHaveBeenCalled()

    mocks.listPage.mockClear()
    let uniqueCursor = 0
    mocks.listPage.mockImplementation(async () => {
      const nextCursor =
        uniqueCursor < 150 ? `unique-${uniqueCursor++}` : "unique-149"
      return { items: [], nextCursor }
    })
    await expectFailureCode(
      workspace.list({ search: "absent" }),
      MANAGED_RESOURCE_FAILURE_CODES.Unexpected,
    )
    expect(mocks.listPage).toHaveBeenCalledTimes(100)

    mocks.listPage.mockClear()
    mocks.listPage.mockResolvedValue({
      items: Array.from({ length: 5_001 }, (_, index) =>
        buildListChannel({ id: `bounded-item-${index}` }),
      ),
    })
    await expectFailureCode(
      workspace.list({ search: "absent" }),
      MANAGED_RESOURCE_FAILURE_CODES.Unexpected,
    )
    expect(mocks.listPage).toHaveBeenCalledOnce()
    expect(mocks.getChannel).not.toHaveBeenCalled()
  })

  it("matches resource-wide search against opaque id and safe display facts", async () => {
    mocks.listPage.mockResolvedValue({
      items: [
        buildListChannel({
          id: "opaque-search-id",
          name: "Plain name",
          supportedModels: ["model-searchable"],
          tags: ["tag-searchable"],
        }),
      ],
    })
    const workspace = await openWorkspace()

    for (const term of [
      "opaque-search",
      "plain name",
      "model-searchable",
      "tag-searchable",
      "gateway.example.invalid",
    ]) {
      await expect(workspace.list({ search: term })).resolves.toMatchObject({
        items: [{ ref: { resourceId: "opaque-search-id" } }],
      })
    }
    await expect(
      workspace.list({ search: "proxy-password" }),
    ).resolves.toMatchObject({ items: [] })
    expect(mocks.getChannel).not.toHaveBeenCalled()
  })

  it("exposes only the approved first editable field set", async () => {
    const workspace = await openWorkspace()
    const editor = await workspace.openCreateEditor()

    expect(editor.fields.map((field) => field.fieldId)).toEqual(
      AXON_HUB_EDITABLE_FIELD_IDS,
    )
    expect(editor.initialValues.key).toEqual({ kind: "unchanged" })
    expect(JSON.stringify(editor.initialValues)).not.toContain("saved-password")
    const typeField = editor.fields.find((field) => field.fieldId === "type")
    expect(typeField).toMatchObject({ type: "select" })
    if (typeField?.type !== "select") throw new Error("expected select")
    expect(typeField.options.map((option) => option.value)).toEqual([
      AXON_HUB_CHANNEL_TYPE.OPENAI,
      AXON_HUB_CHANNEL_TYPE.OPENAI_RESPONSES,
      AXON_HUB_CHANNEL_TYPE.ANTHROPIC,
      AXON_HUB_CHANNEL_TYPE.GEMINI_OPENAI,
      AXON_HUB_CHANNEL_TYPE.GEMINI,
      AXON_HUB_CHANNEL_TYPE.GEMINI_VERTEX,
      AXON_HUB_CHANNEL_TYPE.DEEPSEEK,
      AXON_HUB_CHANNEL_TYPE.DEEPSEEK_ANTHROPIC,
      AXON_HUB_CHANNEL_TYPE.OPENROUTER,
      AXON_HUB_CHANNEL_TYPE.XAI,
      AXON_HUB_CHANNEL_TYPE.SILICONFLOW,
      AXON_HUB_CHANNEL_TYPE.VOLCENGINE,
      AXON_HUB_CHANNEL_TYPE.NANOGPT,
      AXON_HUB_CHANNEL_TYPE.OLLAMA,
    ])

    for (const type of [AXON_HUB_CHANNEL_TYPE.CLAUDECODE, "future_oauth"]) {
      const specialDetail = buildDetailChannel({ type })
      mocks.getChannel.mockResolvedValueOnce(specialDetail)
      const specialEditor = await workspace.openEditEditor(
        refFor(specialDetail),
      )
      const specialTypeField = specialEditor.fields.find(
        (field) => field.fieldId === "type",
      )
      expect(specialTypeField).toMatchObject({
        type: "select",
        options: [{ value: type }],
      })
      expect(
        specialEditor.validate({
          ...specialEditor.initialValues,
          name: "Safe rename",
        }),
      ).toEqual({ valid: true })
      expect(
        specialEditor.validate({
          ...specialEditor.initialValues,
          type: AXON_HUB_CHANNEL_TYPE.OPENAI,
          key: { kind: "replace", value: "replacement-secret" },
        }),
      ).toEqual({
        valid: false,
        issues: expect.arrayContaining([
          { fieldId: "type", code: "unsupported_option" },
          { fieldId: "key", code: "unsupported_option" },
        ]),
      })
    }
  })

  it("keeps archived distinct from disabled", async () => {
    mocks.listPage.mockResolvedValue({
      items: [
        buildListChannel({ id: "archived", status: "archived" }),
        buildListChannel({ id: "disabled", status: "disabled" }),
        buildListChannel({ id: "auto", status: "auto-disabled" }),
        buildListChannel({ id: "future", status: "future-status" }),
      ],
    })
    const workspace = await openWorkspace()
    const page = await workspace.list()

    expect(page.items.map((item) => item.status)).toEqual([
      "archived",
      "disabled",
      "auto-disabled",
      "unknown",
    ])
  })

  it("omits unchanged unavailable permission-hidden and masked credentials", async () => {
    const credentialShapes = [undefined, null, { apiKeys: ["sk-****masked"] }]

    for (const credentials of credentialShapes) {
      const detail = buildDetailChannel({ credentials })
      mocks.getChannel.mockResolvedValueOnce(detail)
      mocks.updateChannel.mockResolvedValueOnce({ ...detail, name: "Renamed" })
      const workspace = await openWorkspace()
      const editor = await workspace.openEditEditor(refFor(detail))
      await editor.submit({ ...editor.initialValues, name: "Renamed" })
    }

    for (const call of mocks.updateChannel.mock.calls.slice(-3)) {
      expect(call[2]).not.toHaveProperty("credentials")
    }
  })

  it("emits a replacement credential only for explicit replace intent", async () => {
    const detail = buildDetailChannel({ credentials: null })
    mocks.getChannel.mockResolvedValue(detail)
    mocks.updateChannel.mockResolvedValue({
      ...detail,
      credentials: { apiKeys: ["replacement-secret"] },
    })
    const workspace = await openWorkspace()
    const editor = await workspace.openEditEditor(refFor(detail))

    await editor.submit({
      ...editor.initialValues,
      key: { kind: "replace", value: "replacement-secret" },
    })

    expect(mocks.updateChannel).toHaveBeenCalledWith(
      config,
      detail.id,
      { credentials: { apiKeys: ["replacement-secret"] } },
      undefined,
    )
  })

  it("emits only changed top-level fields and verified clear flags", async () => {
    const detail = buildDetailChannel()
    mocks.getChannel.mockResolvedValue(detail)
    mocks.updateChannel.mockResolvedValue({ ...detail, name: "Renamed" })
    const workspace = await openWorkspace()
    const editor = await workspace.openEditEditor(refFor(detail))

    await editor.submit({
      ...editor.initialValues,
      name: "Renamed",
      baseURL: "",
      status: AXON_HUB_CHANNEL_STATUS.DISABLED,
      supportedModels: ["model-a", "model-b"],
      manualModels: [],
      autoSyncModelPattern: "",
      tags: [],
      orderingWeight: 9,
      remark: "",
    })

    expect(mocks.updateChannel).toHaveBeenCalledWith(
      config,
      detail.id,
      {
        name: "Renamed",
        clearBaseURL: true,
        status: AXON_HUB_CHANNEL_STATUS.DISABLED,
        supportedModels: ["model-a", "model-b"],
        clearManualModels: true,
        clearAutoSyncModelPattern: true,
        clearTags: true,
        orderingWeight: 9,
        clearRemark: true,
      },
      undefined,
    )
    expect(mocks.updateStatus).not.toHaveBeenCalled()

    const whitespaceDetail = buildDetailChannel({
      name: "  Padded channel  ",
      baseURL: "  https://gateway.example.invalid  ",
      supportedModels: ["  model-a  "],
      manualModels: ["  manual-model  "],
      defaultTestModel: "  model-a  ",
      autoSyncModelPattern: "  model-*  ",
      tags: ["  primary  "],
      remark: "  Example remark  ",
      settings: { ...pinnedSettings, extraModelPrefix: "  old-prefix  " },
    })
    mocks.getChannel.mockResolvedValue(whitespaceDetail)
    mocks.updateChannel.mockResolvedValue(whitespaceDetail)
    const whitespaceWorkspace = await openWorkspace()
    const whitespaceEditor = await whitespaceWorkspace.openEditEditor(
      refFor(whitespaceDetail),
    )

    await whitespaceEditor.submit(whitespaceEditor.initialValues)

    expect(mocks.updateChannel.mock.calls.at(-1)?.[2]).toEqual({})
  })

  it("preserves every selected pinned setting while updating extraModelPrefix", async () => {
    const detail = buildDetailChannel()
    const original = structuredClone(detail)
    mocks.getChannel.mockResolvedValue(detail)
    mocks.updateChannel.mockResolvedValue({
      ...detail,
      settings: { ...detail.settings, extraModelPrefix: "new-prefix" },
    })
    const workspace = await openWorkspace()
    const editor = await workspace.openEditEditor(refFor(detail))

    await editor.submit({
      ...editor.initialValues,
      extraModelPrefix: "new-prefix",
    })

    expect(mocks.updateChannel.mock.calls.at(-1)?.[2]).toEqual({
      settings: { ...pinnedSettings, extraModelPrefix: "new-prefix" },
    })
    expect(mocks.updateChannel.mock.calls.at(-1)?.[2]).not.toHaveProperty(
      "clearSettings",
    )
    expect(detail).toEqual(original)
  })

  it("validates supported manual and default-model invariants", async () => {
    const workspace = await openWorkspace()
    const editor = await workspace.openCreateEditor()
    const validBase: EditableResourceProjection = {
      ...editor.initialValues,
      name: "Created channel",
      type: AXON_HUB_CHANNEL_TYPE.OPENAI,
      baseURL: "https://gateway.example.invalid",
      key: { kind: "replace", value: "replacement-secret" },
      supportedModels: ["model-a"],
      manualModels: ["manual-model"],
      defaultTestModel: "model-a",
    }

    expect(editor.validate(validBase)).toEqual({ valid: true })
    expect(
      editor.validate({
        ...validBase,
        name: "",
        type: "",
        baseURL: "not-a-url",
        key: { kind: "clear" },
      }),
    ).toEqual({
      valid: false,
      issues: expect.arrayContaining([
        { fieldId: "name", code: "required" },
        { fieldId: "type", code: "required" },
        { fieldId: "baseURL", code: "invalid_value" },
        { fieldId: "key", code: "required" },
      ]),
    })
    expect(editor.validate({ ...validBase, orderingWeight: 1.5 })).toEqual({
      valid: false,
      issues: expect.arrayContaining([
        { fieldId: "orderingWeight", code: "invalid_value" },
      ]),
    })
    expect(mocks.createChannel).not.toHaveBeenCalled()
    expect(
      editor.validate({
        ...validBase,
        supportedModels: ["model-a", " model-a ", ""],
        manualModels: ["manual-model", "manual-model"],
        defaultTestModel: "missing-model",
      }),
    ).toEqual({
      valid: false,
      issues: expect.arrayContaining([
        { fieldId: "supportedModels", code: "invalid_value" },
        { fieldId: "manualModels", code: "invalid_value" },
        { fieldId: "defaultTestModel", code: "inconsistent_value" },
      ]),
    })

    const detail = buildDetailChannel()
    mocks.getChannel.mockResolvedValue(detail)
    const editEditor = await workspace.openEditEditor(refFor(detail))
    expect(
      editEditor.validate({
        ...editEditor.initialValues,
        orderingWeight: 2.25,
      }),
    ).toEqual({
      valid: false,
      issues: expect.arrayContaining([
        { fieldId: "orderingWeight", code: "invalid_value" },
      ]),
    })
    expect(mocks.updateChannel).not.toHaveBeenCalled()
    expect(
      editEditor.validate({
        ...editEditor.initialValues,
        supportedModels: [],
      }),
    ).toEqual({
      valid: false,
      issues: expect.arrayContaining([
        { fieldId: "supportedModels", code: "required" },
      ]),
    })
    expect(
      editEditor.validate({
        ...editEditor.initialValues,
        defaultTestModel: "",
      }),
    ).toEqual({
      valid: false,
      issues: expect.arrayContaining([
        { fieldId: "defaultTestModel", code: "required" },
      ]),
    })
    expect(
      editEditor.validate({
        ...editEditor.initialValues,
        manualModels: [],
      }),
    ).toEqual({ valid: true })
  })

  it("keeps baseURL optional for native creation", async () => {
    const created = buildDetailChannel({
      id: "created-without-base-url",
      baseURL: null,
      status: AXON_HUB_CHANNEL_STATUS.DISABLED,
    })
    mocks.createChannel.mockResolvedValue(created)
    const workspace = await openWorkspace()
    const editor = await workspace.openCreateEditor()
    const values: EditableResourceProjection = {
      ...editor.initialValues,
      name: "Created channel",
      baseURL: "   ",
      key: { kind: "replace", value: "replacement-secret" },
      supportedModels: ["model-a"],
      defaultTestModel: "model-a",
    }

    expect(
      editor.fields.find((field) => field.fieldId === "baseURL"),
    ).not.toMatchObject({ required: true })
    expect(editor.validate(values)).toEqual({ valid: true })

    await editor.submit(values)

    expect(mocks.createChannel).toHaveBeenCalledOnce()
    expect(mocks.createChannel.mock.calls[0]?.[1]).not.toHaveProperty("baseURL")
  })

  it("maps create plus failed status follow-up to mutation_state_uncertain without replay", async () => {
    const created = buildDetailChannel({
      id: "created-id",
      status: AXON_HUB_CHANNEL_STATUS.DISABLED,
    })
    mocks.createChannel.mockResolvedValue(created)
    mocks.updateStatus.mockRejectedValue(
      new mocks.RequestError("unavailable", "dispatched"),
    )
    const workspace = await openWorkspace()
    const editor = await workspace.openCreateEditor()

    await expectFailureCode(
      editor.submit({
        ...editor.initialValues,
        name: "Created channel",
        type: AXON_HUB_CHANNEL_TYPE.OPENAI,
        baseURL: "https://gateway.example.invalid",
        key: { kind: "replace", value: "replacement-secret" },
        supportedModels: ["model-a"],
        defaultTestModel: "model-a",
        status: AXON_HUB_CHANNEL_STATUS.ENABLED,
      }),
      MANAGED_RESOURCE_FAILURE_CODES.MutationStateUncertain,
    )
    expect(mocks.createChannel).toHaveBeenCalledOnce()
    expect(mocks.updateStatus).toHaveBeenCalledOnce()

    const detail = buildDetailChannel()
    mocks.getChannel.mockResolvedValue(detail)
    mocks.updateChannel.mockRejectedValue(
      new mocks.RequestError("unavailable", "dispatched"),
    )
    const updateWorkspace = await openWorkspace()
    const updateEditor = await updateWorkspace.openEditEditor(refFor(detail))
    const changedValues = {
      ...updateEditor.initialValues,
      name: "Uncertain rename",
    }

    await expectFailureCode(
      updateEditor.submit(changedValues),
      MANAGED_RESOURCE_FAILURE_CODES.MutationStateUncertain,
    )
    await expectFailureCode(
      updateEditor.submit(changedValues),
      MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed,
    )
    expect(mocks.updateChannel).toHaveBeenCalledOnce()
  })

  it("treats a generic dispatched GraphQL rejection as possibly applied", async () => {
    const detail = buildDetailChannel()
    mocks.getChannel.mockResolvedValue(detail)
    mocks.updateChannel.mockRejectedValue(
      new mocks.RequestError("upstream-rejected", "dispatched"),
    )
    const workspace = await openWorkspace()
    const editor = await workspace.openEditEditor(refFor(detail))

    await expectFailureCode(
      editor.submit({ ...editor.initialValues, name: "Uncertain rename" }),
      MANAGED_RESOURCE_FAILURE_CODES.MutationStateUncertain,
    )
    await expectFailureCode(
      editor.submit({ ...editor.initialValues, name: "Uncertain rename" }),
      MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed,
    )
    expect(mocks.updateChannel).toHaveBeenCalledOnce()
  })

  it("normalizes native delete outcomes without unsafe replay", async () => {
    const workspace = await openWorkspace()
    const ref = refFor()

    mocks.deleteChannel.mockResolvedValueOnce(true)
    await expect(workspace.delete(ref)).resolves.toBeUndefined()

    mocks.deleteChannel.mockResolvedValueOnce(false)
    await expectFailureCode(
      workspace.delete(ref),
      MANAGED_RESOURCE_FAILURE_CODES.UpstreamRejected,
    )

    mocks.deleteChannel.mockRejectedValueOnce(
      new mocks.RequestError("not-found", "dispatched"),
    )
    await expect(workspace.delete(ref)).resolves.toBeUndefined()

    mocks.deleteChannel.mockRejectedValueOnce(
      new mocks.RequestError("unavailable", "dispatched"),
    )
    await expectFailureCode(
      workspace.delete(ref),
      MANAGED_RESOURCE_FAILURE_CODES.MutationStateUncertain,
    )
    expect(mocks.deleteChannel).toHaveBeenCalledTimes(4)
  })

  it("registers AxonHub separately from legacy SiteTypeCapabilities", () => {
    const registration = getManagedResourceRegistration(
      SITE_TYPES.AXON_HUB,
      MANAGED_RESOURCE_KINDS.Channel,
    )
    const capabilities = getSiteTypeCapabilities(SITE_TYPES.AXON_HUB)

    expect(registration).toBe(axonHubManagedResourceRegistration)
    expect(registration).toMatchObject({
      siteType: SITE_TYPES.AXON_HUB,
      kind: MANAGED_RESOURCE_KINDS.Channel,
    })
    expect(capabilities.managedSites).not.toHaveProperty("nativeResources")
    expect(capabilities.managedSites).not.toHaveProperty("resourceRegistration")
    expect(
      getManagedResourceRegistration(
        SITE_TYPES.NEW_API,
        MANAGED_RESOURCE_KINDS.Channel,
      ),
    ).toBeNull()
  })

  it("does not treat registration presence as native rollout mode", () => {
    expect(
      getManagedResourceRegistration(
        SITE_TYPES.AXON_HUB,
        MANAGED_RESOURCE_KINDS.Channel,
      ),
    ).not.toBeNull()
    expect(
      getAccountSiteDefinition(SITE_TYPES.AXON_HUB)?.managedResource?.mode,
    ).toBe(MANAGED_RESOURCE_MODES.LegacyChannel)
  })

  it("has a registration for every definition currently marked native-resource", () => {
    const nativeDefinitions = getAccountSiteDefinitions().filter(
      (definition) =>
        definition.managedResource?.mode ===
        MANAGED_RESOURCE_MODES.NativeResource,
    )

    expect(
      nativeDefinitions.every((definition) => {
        const policy = definition.managedResource
        if (!policy || !isManagedSiteType(definition.siteType)) return false
        return Boolean(
          getManagedResourceRegistration(
            definition.siteType,
            policy.primaryKind,
          ),
        )
      }),
    ).toBe(true)
  })
})
