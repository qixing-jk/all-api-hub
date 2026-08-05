import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  AXON_HUB_CHANNEL_FIELD_IDS,
  AXON_HUB_CHANNEL_STATUS,
  AXON_HUB_CHANNEL_TYPE,
  AXON_HUB_EDITABLE_FIELD_IDS,
  AXON_HUB_TABLE_FIELD_IDS,
} from "~/constants/axonHub"
import { ChannelType } from "~/constants/managedSite"
import { isManagedSiteType, SITE_TYPES } from "~/constants/siteType"
import {
  getManagedResourceFieldPolicy,
  resolveManagedResourceFieldPolicy,
  type ManagedResourceEditorMode,
} from "~/features/ManagedSiteChannels/presentation/managedResourceFieldPolicy"
import { createManagedResourcePresentationMapper } from "~/features/ManagedSiteChannels/presentation/managedResourcePresentation"
import {
  MANAGED_RESOURCE_KINDS,
  MANAGED_RESOURCE_MODES,
} from "~/services/accountSiteDefinitions/contracts"
import * as accountSiteDefinitionRegistry from "~/services/accountSiteDefinitions/registry"
import {
  MANAGED_RESOURCE_FAILURE_CODES,
  ManagedResourceError,
  type EditableResourceProjection,
  type ManagedResourceRef,
  type ResourceEditor,
  type ResourceSecretState,
  type SecretEditIntent,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import { RESOURCE_FIELD_TYPES } from "~/services/apiAdapters/contracts/resourceNative"
import {
  axonHubManagedResourceRegistration,
  AxonHubNativeError,
  openAxonHubNativeResourceOperations,
  type AxonHubNativeFailure,
  type AxonHubNativeResourceOperations,
} from "~/services/apiAdapters/managedResources/axonHub"
import * as axonHubNativeResources from "~/services/apiAdapters/managedResources/axonHub"
import { axonHubManagedSiteMigrationCapability } from "~/services/apiAdapters/managedResources/axonHubMigration"
import { getManagedResourceRegistration } from "~/services/apiAdapters/managedResources/registry"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import {
  MANAGED_SITE_MUTATION_OUTCOMES,
  type ManagedSiteMutationOutcome,
  type ManagedSiteMutationResult,
} from "~/services/managedSites/mutations"
import type {
  AxonHubChannel,
  AxonHubCreateChannelInput,
  AxonHubUpdateChannelInput,
} from "~/types/axonHub"
import { MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES } from "~/types/managedSiteMigration"
import {
  MANAGED_SITE_MIGRATION_EXECUTION_FAILURE_CODES,
  type ManagedSiteMigrationSource,
} from "~/types/managedSiteMigrationCapability"

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
    mutationSequenceStepCounts: [] as number[],
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

vi.mock("~/services/managedSites/mutations", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/services/managedSites/mutations")>()

  return {
    ...actual,
    createManagedSiteMutationSequence: (
      ...args: Parameters<typeof actual.createManagedSiteMutationSequence>
    ) => {
      const sequence = actual.createManagedSiteMutationSequence(...args)
      const sequenceIndex = mocks.mutationSequenceStepCounts.push(0) - 1
      return {
        ...sequence,
        beginStep() {
          mocks.mutationSequenceStepCounts[sequenceIndex] += 1
          return sequence.beginStep()
        },
      }
    },
  }
})

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

const updateFieldCases: readonly {
  fieldId: (typeof AXON_HUB_EDITABLE_FIELD_IDS)[number]
  detailOverrides?: Partial<AxonHubChannel>
  value: EditableResourceProjection[string]
  expectedInput: AxonHubUpdateChannelInput
}[] = [
  {
    fieldId: AXON_HUB_CHANNEL_FIELD_IDS.NAME,
    value: "Renamed channel",
    expectedInput: { name: "Renamed channel" },
  },
  {
    fieldId: AXON_HUB_CHANNEL_FIELD_IDS.TYPE,
    value: AXON_HUB_CHANNEL_TYPE.ANTHROPIC,
    expectedInput: { type: AXON_HUB_CHANNEL_TYPE.ANTHROPIC },
  },
  {
    fieldId: AXON_HUB_CHANNEL_FIELD_IDS.BASE_URL,
    value: " https://updated.example.invalid ",
    expectedInput: { baseURL: "https://updated.example.invalid" },
  },
  {
    fieldId: AXON_HUB_CHANNEL_FIELD_IDS.KEY,
    value: { kind: "replace", value: " replacement-secret " },
    expectedInput: { credentials: { apiKeys: ["replacement-secret"] } },
  },
  {
    fieldId: AXON_HUB_CHANNEL_FIELD_IDS.SUPPORTED_MODELS,
    detailOverrides: { manualModels: [] },
    value: [" model-a ", "model-b"],
    expectedInput: { supportedModels: ["model-a", "model-b"] },
  },
  {
    fieldId: AXON_HUB_CHANNEL_FIELD_IDS.MANUAL_MODELS,
    detailOverrides: {
      supportedModels: ["model-a", "manual-model", "manual-two"],
    },
    value: [" manual-model ", "manual-two"],
    expectedInput: { manualModels: ["manual-model", "manual-two"] },
  },
  {
    fieldId: AXON_HUB_CHANNEL_FIELD_IDS.DEFAULT_TEST_MODEL,
    detailOverrides: {
      supportedModels: ["model-a", "model-b"],
      manualModels: [],
    },
    value: "model-b",
    expectedInput: { defaultTestModel: "model-b" },
  },
  {
    fieldId: AXON_HUB_CHANNEL_FIELD_IDS.AUTO_SYNC_SUPPORTED_MODELS,
    value: false,
    expectedInput: { autoSyncSupportedModels: false },
  },
  {
    fieldId: AXON_HUB_CHANNEL_FIELD_IDS.AUTO_SYNC_MODEL_PATTERN,
    value: " updated-* ",
    expectedInput: { autoSyncModelPattern: "updated-*" },
  },
  {
    fieldId: AXON_HUB_CHANNEL_FIELD_IDS.TAGS,
    value: [" secondary ", "fallback"],
    expectedInput: { tags: ["secondary", "fallback"] },
  },
  {
    fieldId: AXON_HUB_CHANNEL_FIELD_IDS.ORDERING_WEIGHT,
    value: 9,
    expectedInput: { orderingWeight: 9 },
  },
  {
    fieldId: AXON_HUB_CHANNEL_FIELD_IDS.REMARK,
    value: " Updated remark ",
    expectedInput: { remark: "Updated remark" },
  },
  {
    fieldId: AXON_HUB_CHANNEL_FIELD_IDS.EXTRA_MODEL_PREFIX,
    value: "",
    expectedInput: {
      settings: { ...pinnedSettings, extraModelPrefix: "" },
    },
  },
]

const emptyFieldCases: readonly {
  fieldId: (typeof AXON_HUB_EDITABLE_FIELD_IDS)[number]
  value: EditableResourceProjection[string]
  expectedInput: AxonHubUpdateChannelInput
}[] = [
  {
    fieldId: AXON_HUB_CHANNEL_FIELD_IDS.BASE_URL,
    value: "",
    expectedInput: { clearBaseURL: true },
  },
  {
    fieldId: AXON_HUB_CHANNEL_FIELD_IDS.MANUAL_MODELS,
    value: [],
    expectedInput: { clearManualModels: true },
  },
  {
    fieldId: AXON_HUB_CHANNEL_FIELD_IDS.AUTO_SYNC_MODEL_PATTERN,
    value: "",
    expectedInput: { clearAutoSyncModelPattern: true },
  },
  {
    fieldId: AXON_HUB_CHANNEL_FIELD_IDS.TAGS,
    value: [],
    expectedInput: { tags: [] },
  },
  {
    fieldId: AXON_HUB_CHANNEL_FIELD_IDS.REMARK,
    value: "",
    expectedInput: { clearRemark: true },
  },
]

const refFor = (channel = buildDetailChannel()): ManagedResourceRef => ({
  siteType: SITE_TYPES.AXON_HUB,
  kind: MANAGED_RESOURCE_KINDS.Channel,
  scopeKey: "https://api.example.invalid",
  resourceId: channel.id,
})

const buildMigrationSource = (
  overrides: Partial<ManagedSiteMigrationSource> = {},
): ManagedSiteMigrationSource => ({
  sourceSiteType: SITE_TYPES.NEW_API,
  resourceType: ChannelType.OpenAI,
  baseUrl: "https://source.example.invalid",
  models: ["model-one"],
  groups: ["default"],
  priority: 0,
  weight: 0,
  status: "disabled",
  lossSignals: {
    hasModelMapping: false,
    hasStatusCodeMapping: false,
    hasAdvancedSettings: false,
    hasMultiKeyState: false,
  },
  ...overrides,
})

const expectFailureCode = async (promise: Promise<unknown>, code: string) => {
  const error = await promise.catch((failure) => failure)
  expect(error).toBeInstanceOf(ManagedResourceError)
  expect((error as ManagedResourceError).failure).toEqual({ code })
}

const expectMutationOutcome = async <T>(
  promise: Promise<ManagedSiteMutationResult<T>>,
  outcome: ManagedSiteMutationOutcome,
) => {
  const result = await promise
  expect(result.outcome).toBe(outcome)
  return result
}

const expectRejectedMutationCode = async <T>(
  promise: Promise<ManagedSiteMutationResult<T>>,
  code: string,
) => {
  const result = await expectMutationOutcome(
    promise,
    MANAGED_SITE_MUTATION_OUTCOMES.Rejected,
  )
  if (result.outcome !== MANAGED_SITE_MUTATION_OUTCOMES.Rejected) {
    throw new Error("Expected a rejected mutation result")
  }
  expect(result.diagnostic.code).toBe(code)
  return result
}

const expectGenericValidationRejection = async <T>(
  promise: Promise<ManagedSiteMutationResult<T>>,
) => {
  const result = await expectMutationOutcome(
    promise,
    MANAGED_SITE_MUTATION_OUTCOMES.Rejected,
  )
  expect(result).toEqual({
    outcome: MANAGED_SITE_MUTATION_OUTCOMES.Rejected,
    diagnostic: { message: MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed },
  })
}

const openWorkspace = () => axonHubManagedResourceRegistration.open()

const expectEditorMatchesFieldPolicy = (
  editor: ResourceEditor,
  mode: ManagedResourceEditorMode,
) => {
  const policy = getManagedResourceFieldPolicy(
    SITE_TYPES.AXON_HUB,
    MANAGED_RESOURCE_KINDS.Channel,
    mode,
  )
  expect(policy).toBeDefined()
  const resolved = resolveManagedResourceFieldPolicy(editor.fields, policy!)
  expect(
    new Set(resolved.fields.map(({ presentation }) => presentation.fieldId)),
  ).toEqual(
    new Set(
      AXON_HUB_EDITABLE_FIELD_IDS.filter(
        (fieldId) => fieldId !== AXON_HUB_CHANNEL_FIELD_IDS.MANUAL_MODELS,
      ),
    ),
  )
  for (const { descriptor, presentation } of resolved.fields) {
    expect(presentation.renderer).toBe(descriptor.type)
  }
}

const buildMigrationCreateCommand = async (source = buildMigrationSource()) => {
  const preparation =
    await axonHubManagedSiteMigrationCapability.target!.prepare(source)
  return {
    source,
    targetSiteType: SITE_TYPES.AXON_HUB,
    projection: { ...preparation.projection, name: "Migration target" },
    credential: "sk-migration-placeholder",
  }
}

describe("AxonHub native managed-resource Adapter", () => {
  it("keeps existing AxonHub editor descriptors compatible with neutral field types", async () => {
    const workspace = await axonHubManagedResourceRegistration.open()
    const editor = await workspace.openCreateEditor()

    expect(
      editor.fields.every((field) =>
        Object.values(RESOURCE_FIELD_TYPES).includes(field.type),
      ),
    ).toBe(true)
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mutationSequenceStepCounts.length = 0
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
    expect(workspace.capabilities.canSearch).toBe(true)
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

    mocks.resolveRuntimeConfig.mockReturnValueOnce({
      siteType: SITE_TYPES.AXON_HUB,
      config: { ...config, baseUrl: "https://api.example.invalid/?unsafe=1" },
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
        "not-dispatched",
        MANAGED_RESOURCE_FAILURE_CODES.AuthenticationFailed,
      ],
      [
        "permission",
        "not-dispatched",
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
      await expectRejectedMutationCode(
        editor.submit({ ...editor.initialValues, name: "Renamed" }),
        code,
      )
    }

    const workspace = await openWorkspace()
    const editor = await workspace.openCreateEditor()
    expectEditorMatchesFieldPolicy(editor, "create")
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

  it("counts unique supported and manual models in the native table facts", async () => {
    const listChannel = buildListChannel({
      supportedModels: [" model-a ", "model-a", ""],
      manualModels: ["manual-model", " model-a ", " manual-model "],
    })
    mocks.listPage.mockResolvedValueOnce({ items: [listChannel], total: 1 })
    const workspace = await openWorkspace()

    const page = await workspace.list()

    expect(page.items[0]?.fields).toContainEqual({
      fieldId: AXON_HUB_CHANNEL_FIELD_IDS.SUPPORTED_MODELS,
      kind: "number",
      value: 2,
    })

    const row = createManagedResourcePresentationMapper().map(page.items[0]!)
    expect(row.searchText).toContain("manual-model")
    expect(row.cells.supportedModels).toEqual({
      kind: "text",
      value: "2",
      sortValue: 2,
    })
  })

  it("maps all fourteen approved fields to exact safe detail facts", async () => {
    const workspace = await openWorkspace()
    const detail = await workspace.get(refFor())

    expect(detail.fields).toEqual([
      {
        fieldId: AXON_HUB_CHANNEL_FIELD_IDS.NAME,
        kind: "text",
        value: "Example channel",
      },
      {
        fieldId: AXON_HUB_CHANNEL_FIELD_IDS.TYPE,
        kind: "text",
        value: AXON_HUB_CHANNEL_TYPE.OPENAI,
      },
      {
        fieldId: AXON_HUB_CHANNEL_FIELD_IDS.BASE_URL,
        kind: "text",
        value: "https://gateway.example.invalid",
      },
      {
        fieldId: AXON_HUB_CHANNEL_FIELD_IDS.STATUS,
        kind: "text",
        value: AXON_HUB_CHANNEL_STATUS.ENABLED,
      },
      {
        fieldId: AXON_HUB_CHANNEL_FIELD_IDS.KEY,
        kind: "secret",
        state: "available",
      },
      {
        fieldId: AXON_HUB_CHANNEL_FIELD_IDS.SUPPORTED_MODELS,
        kind: "list",
        value: ["model-a"],
      },
      {
        fieldId: AXON_HUB_CHANNEL_FIELD_IDS.MANUAL_MODELS,
        kind: "list",
        value: ["manual-model"],
      },
      {
        fieldId: AXON_HUB_CHANNEL_FIELD_IDS.DEFAULT_TEST_MODEL,
        kind: "text",
        value: "model-a",
      },
      {
        fieldId: AXON_HUB_CHANNEL_FIELD_IDS.AUTO_SYNC_SUPPORTED_MODELS,
        kind: "boolean",
        value: true,
      },
      {
        fieldId: AXON_HUB_CHANNEL_FIELD_IDS.AUTO_SYNC_MODEL_PATTERN,
        kind: "text",
        value: "model-*",
      },
      {
        fieldId: AXON_HUB_CHANNEL_FIELD_IDS.TAGS,
        kind: "list",
        value: ["primary"],
      },
      {
        fieldId: AXON_HUB_CHANNEL_FIELD_IDS.ORDERING_WEIGHT,
        kind: "number",
        value: 7,
      },
      {
        fieldId: AXON_HUB_CHANNEL_FIELD_IDS.REMARK,
        kind: "text",
        value: "Example remark",
      },
      {
        fieldId: AXON_HUB_CHANNEL_FIELD_IDS.EXTRA_MODEL_PREFIX,
        kind: "text",
        value: "old-prefix",
      },
    ])
    expect(detail.fields.map((field) => field.fieldId)).toEqual(
      AXON_HUB_EDITABLE_FIELD_IDS,
    )
  })

  it("normalizes nullable AxonHub detail values to safe display defaults", async () => {
    const nullableDetail = buildDetailChannel({
      baseURL: null,
      credentials: null,
      supportedModels: null,
      manualModels: null,
      defaultTestModel: null,
      autoSyncSupportedModels: null,
      autoSyncModelPattern: null,
      tags: null,
      orderingWeight: null,
      remark: null,
      settings: null,
    })
    mocks.getChannel.mockResolvedValue(nullableDetail)
    const workspace = await openWorkspace()
    const detail = await workspace.get(refFor(nullableDetail))

    expect(detail.fields).toEqual([
      {
        fieldId: AXON_HUB_CHANNEL_FIELD_IDS.NAME,
        kind: "text",
        value: "Example channel",
      },
      {
        fieldId: AXON_HUB_CHANNEL_FIELD_IDS.TYPE,
        kind: "text",
        value: AXON_HUB_CHANNEL_TYPE.OPENAI,
      },
      {
        fieldId: AXON_HUB_CHANNEL_FIELD_IDS.BASE_URL,
        kind: "text",
        value: "",
      },
      {
        fieldId: AXON_HUB_CHANNEL_FIELD_IDS.STATUS,
        kind: "text",
        value: AXON_HUB_CHANNEL_STATUS.ENABLED,
      },
      {
        fieldId: AXON_HUB_CHANNEL_FIELD_IDS.KEY,
        kind: "secret",
        state: "permission-hidden",
      },
      {
        fieldId: AXON_HUB_CHANNEL_FIELD_IDS.SUPPORTED_MODELS,
        kind: "list",
        value: [],
      },
      {
        fieldId: AXON_HUB_CHANNEL_FIELD_IDS.MANUAL_MODELS,
        kind: "list",
        value: [],
      },
      {
        fieldId: AXON_HUB_CHANNEL_FIELD_IDS.DEFAULT_TEST_MODEL,
        kind: "text",
        value: "",
      },
      {
        fieldId: AXON_HUB_CHANNEL_FIELD_IDS.AUTO_SYNC_SUPPORTED_MODELS,
        kind: "boolean",
        value: false,
      },
      {
        fieldId: AXON_HUB_CHANNEL_FIELD_IDS.AUTO_SYNC_MODEL_PATTERN,
        kind: "text",
        value: "",
      },
      {
        fieldId: AXON_HUB_CHANNEL_FIELD_IDS.TAGS,
        kind: "list",
        value: [],
      },
      {
        fieldId: AXON_HUB_CHANNEL_FIELD_IDS.ORDERING_WEIGHT,
        kind: "number",
        value: 0,
      },
      {
        fieldId: AXON_HUB_CHANNEL_FIELD_IDS.REMARK,
        kind: "text",
        value: "",
      },
      {
        fieldId: AXON_HUB_CHANNEL_FIELD_IDS.EXTRA_MODEL_PREFIX,
        kind: "text",
        value: "",
      },
    ])
  })

  it("returns only the definition-selected safe fact subset from list", async () => {
    const workspace = await openWorkspace()
    const page = await workspace.list()

    expect(page.items[0]?.fields.map((field) => field.fieldId)).toEqual(
      AXON_HUB_TABLE_FIELD_IDS,
    )
  })

  it("falls back to no list fields when the site definition is unavailable", async () => {
    const definitionSpy = vi
      .spyOn(accountSiteDefinitionRegistry, "getAccountSiteDefinition")
      .mockReturnValueOnce(undefined)

    try {
      const workspace = await openWorkspace()
      const page = await workspace.list()

      expect(page.items[0]?.fields).toEqual([])
    } finally {
      definitionSpy.mockRestore()
    }
  })

  it("searches across all AxonHub pages when canSearch is true", async () => {
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

  it("forwards the abort signal to resource-wide search and rejects invalid refs", async () => {
    const controller = new AbortController()
    const workspace = await openWorkspace()

    await workspace.list({ search: "example" }, { signal: controller.signal })

    expect(mocks.listPage).toHaveBeenCalledWith(
      config,
      { limit: 100 },
      { signal: controller.signal },
    )
    const operations = await openAxonHubNativeResourceOperations()
    let invalidRefFailure: unknown
    try {
      operations.get({ ...refFor(), resourceId: "" })
    } catch (error) {
      invalidRefFailure = error
    }
    expect(invalidRefFailure).toBeInstanceOf(AxonHubNativeError)
    expect((invalidRefFailure as AxonHubNativeError).failure).toEqual({
      code: "unexpected",
      dispatch: "before",
    })
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
    const keyField = editor.fields.find((field) => field.fieldId === "key")
    expect(keyField).toMatchObject({
      type: "secret",
      secretState: "unavailable",
      canReplace: true,
      allowClear: false,
    })
    const remarkField = editor.fields.find(
      (field) => field.fieldId === "remark",
    )
    expect(remarkField).toMatchObject({ type: "textarea" })
    expect(remarkField).not.toHaveProperty("rows")
    for (const field of editor.fields) {
      expect(field).not.toHaveProperty("section")
      expect(field).not.toHaveProperty("order")
      expect(field).not.toHaveProperty("label")
      expect(field).not.toHaveProperty("labelKey")
      expect(field).not.toHaveProperty("renderer")
    }

    const regularDetail = buildDetailChannel()
    mocks.getChannel.mockResolvedValueOnce(regularDetail)
    const regularEditor = await workspace.openEditEditor(refFor(regularDetail))
    expectEditorMatchesFieldPolicy(regularEditor, "edit")

    for (const type of [
      AXON_HUB_CHANNEL_TYPE.CLAUDECODE,
      AXON_HUB_CHANNEL_TYPE.GITHUB_COPILOT,
      AXON_HUB_CHANNEL_TYPE.ANTHROPIC_AWS,
      AXON_HUB_CHANNEL_TYPE.ANTHROPIC_GCP,
      "future_oauth",
    ]) {
      const specialDetail = buildDetailChannel({ type })
      mocks.getChannel.mockResolvedValueOnce(specialDetail)
      const specialEditor = await workspace.openEditEditor(
        refFor(specialDetail),
      )
      expectEditorMatchesFieldPolicy(specialEditor, "edit")
      const specialTypeField = specialEditor.fields.find(
        (field) => field.fieldId === "type",
      )
      expect(specialTypeField).toMatchObject({
        type: "select",
        options: [{ value: type }],
      })
      expect(
        specialEditor.fields.find((field) => field.fieldId === "key"),
      ).toMatchObject({
        type: "secret",
        canReplace: false,
        allowClear: false,
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
      await expectGenericValidationRejection(
        specialEditor.submit({
          ...specialEditor.initialValues,
          type: AXON_HUB_CHANNEL_TYPE.OPENAI,
          key: { kind: "replace", value: "replacement-secret" },
        }),
      )
      await expectGenericValidationRejection(
        specialEditor.submit({
          ...specialEditor.initialValues,
          key: { kind: "clear" },
        }),
      )
    }
    expect(mocks.updateChannel).not.toHaveBeenCalled()
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
    const credentialShapes: Array<{
      credentials: AxonHubChannel["credentials"]
      secretState: ResourceSecretState
    }> = [
      {
        credentials: { apiKeys: ["saved-secret-value"] },
        secretState: "available",
      },
      { credentials: undefined, secretState: "unavailable" },
      { credentials: null, secretState: "permission-hidden" },
      {
        credentials: { apiKeys: ["sk-****masked"] },
        secretState: "masked",
      },
    ]

    for (const { credentials, secretState } of credentialShapes) {
      const detail = buildDetailChannel({ credentials })
      mocks.getChannel.mockResolvedValueOnce(detail)
      mocks.updateChannel.mockResolvedValueOnce({ ...detail, name: "Renamed" })
      const workspace = await openWorkspace()
      const editor = await workspace.openEditEditor(refFor(detail))
      expect(
        editor.fields.find((field) => field.fieldId === "key"),
      ).toMatchObject({
        type: "secret",
        secretState,
        canReplace: secretState !== "permission-hidden",
        allowClear: false,
      })
      await editor.submit({ ...editor.initialValues, name: "Renamed" })
    }

    for (const call of mocks.updateChannel.mock.calls.slice(-4)) {
      expect(call[2]).not.toHaveProperty("credentials")
    }
  })

  it("fails closed for regular channels with multiple API keys", async () => {
    const detail = buildDetailChannel({
      credentials: {
        apiKeys: [" first-secret ", "", "second-secret"],
        apiKey: " legacy-secret ",
      },
    })
    mocks.getChannel.mockResolvedValue(detail)
    mocks.updateChannel.mockResolvedValue({ ...detail, name: "Renamed" })
    const workspace = await openWorkspace()
    const editor = await workspace.openEditEditor(refFor(detail))
    const keyField = editor.fields.find(
      (field) => field.fieldId === AXON_HUB_CHANNEL_FIELD_IDS.KEY,
    )

    expect(keyField).toMatchObject({
      type: "secret",
      canReplace: false,
      replacementBlockReason: "multiple_credentials",
    })
    expect(editor.loadSecret).toBeUndefined()

    for (const intent of [
      { kind: "replace", value: "replacement-secret" },
      { kind: "clear" },
    ] satisfies SecretEditIntent[]) {
      expect(editor.validate({ ...editor.initialValues, key: intent })).toEqual(
        {
          valid: false,
          issues: [
            {
              fieldId: AXON_HUB_CHANNEL_FIELD_IDS.KEY,
              code: "unsupported_option",
            },
          ],
        },
      )
      await expectGenericValidationRejection(
        editor.submit({ ...editor.initialValues, key: intent }),
      )
    }

    await editor.submit({ ...editor.initialValues, name: "Renamed" })
    expect(mocks.updateChannel.mock.calls.at(-1)?.[2]).toEqual({
      name: "Renamed",
    })
    expect(mocks.updateChannel).toHaveBeenCalledOnce()
  })

  it("blocks a credential replacement when latest detail becomes multi-key", async () => {
    const openingDetail = buildDetailChannel({
      credentials: { apiKeys: ["single-secret"] },
    })
    const latestDetail = buildDetailChannel({
      credentials: { apiKeys: ["first-secret", "second-secret"] },
    })
    mocks.getChannel
      .mockResolvedValueOnce(openingDetail)
      .mockResolvedValueOnce(latestDetail)
    const workspace = await openWorkspace()
    const editor = await workspace.openEditEditor(refFor(openingDetail))

    await expect(
      editor.submit({
        ...editor.initialValues,
        key: { kind: "replace", value: "replacement-secret" },
      }),
    ).rejects.toMatchObject({
      failure: {
        code: MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed,
        fieldIssues: [
          {
            fieldId: AXON_HUB_CHANNEL_FIELD_IDS.KEY,
            code: "unsupported_option",
          },
        ],
      },
    })
    expect(mocks.updateChannel).not.toHaveBeenCalled()
  })

  it("keeps required descriptor metadata aligned with create and edit validation", async () => {
    const workspace = await openWorkspace()
    const createEditor = await workspace.openCreateEditor()
    const detail = buildDetailChannel()
    mocks.getChannel.mockResolvedValueOnce(detail)
    const editEditor = await workspace.openEditEditor(refFor(detail))

    const descriptor = (editor: ResourceEditor, fieldId: string) =>
      editor.fields.find((field) => field.fieldId === fieldId)

    expect(
      descriptor(createEditor, AXON_HUB_CHANNEL_FIELD_IDS.KEY),
    ).toMatchObject({ type: "secret", required: true })
    expect(
      descriptor(editEditor, AXON_HUB_CHANNEL_FIELD_IDS.KEY),
    ).toMatchObject({ type: "secret", required: false })
    expect(
      descriptor(createEditor, AXON_HUB_CHANNEL_FIELD_IDS.SUPPORTED_MODELS),
    ).toMatchObject({ type: "multi-select", required: true })
    expect(
      descriptor(editEditor, AXON_HUB_CHANNEL_FIELD_IDS.SUPPORTED_MODELS),
    ).toMatchObject({ type: "multi-select", required: true })
  })

  it.each([
    { label: "OAuth", type: "codex" },
    { label: "AWS", type: AXON_HUB_CHANNEL_TYPE.ANTHROPIC_AWS },
    { label: "GCP", type: AXON_HUB_CHANNEL_TYPE.ANTHROPIC_GCP },
    { label: "unknown", type: "future_credential_type" },
  ])(
    "rejects crafted type and permission-hidden credential mutations for $label channels",
    async ({ type }) => {
      const detail = buildDetailChannel({ credentials: null, type })
      mocks.getChannel.mockResolvedValue(detail)
      const workspace = await openWorkspace()
      const editor = await workspace.openEditEditor(refFor(detail))

      expect(
        editor.fields.find((field) => field.fieldId === "key"),
      ).toMatchObject({
        type: "secret",
        secretState: "permission-hidden",
        canReplace: false,
        allowClear: false,
      })

      const craftedProjections: EditableResourceProjection[] = [
        {
          ...editor.initialValues,
          type: AXON_HUB_CHANNEL_TYPE.OPENAI,
        },
        {
          ...editor.initialValues,
          key: { kind: "replace", value: "replacement-secret" },
        },
        {
          ...editor.initialValues,
          key: { kind: "clear" },
        },
      ]

      for (const projection of craftedProjections) {
        await expectGenericValidationRejection(editor.submit(projection))
      }

      expect(mocks.updateChannel).not.toHaveBeenCalled()
      expect(mocks.updateStatus).not.toHaveBeenCalled()
    },
  )

  it.each([
    {
      inheritedProperty: "kind",
      createIntent: () =>
        Object.assign(Object.create({ kind: "replace" }), {
          value: "prototype-secret",
        }),
    },
    {
      inheritedProperty: "value",
      createIntent: () =>
        Object.assign(Object.create({ value: "prototype-secret" }), {
          kind: "replace",
        }),
    },
  ])(
    "rejects a crafted secret intent with inherited $inheritedProperty",
    async ({ createIntent }) => {
      const workspace = await openWorkspace()
      const editor = await workspace.openCreateEditor()
      const values: EditableResourceProjection = {
        ...editor.initialValues,
        name: "Created channel",
        supportedModels: ["model-a"],
        defaultTestModel: "model-a",
        key: createIntent() as never,
      }

      expect(editor.validate(values)).toEqual({
        valid: false,
        issues: expect.arrayContaining([
          { fieldId: AXON_HUB_CHANNEL_FIELD_IDS.KEY, code: "required" },
        ]),
      })
      await expectGenericValidationRejection(editor.submit(values))
      expect(mocks.createChannel).not.toHaveBeenCalled()
    },
  )

  it("emits a replacement credential only for explicit replace intent", async () => {
    const detail = buildDetailChannel({ credentials: undefined })
    mocks.getChannel.mockResolvedValue(detail)
    mocks.updateChannel.mockResolvedValue({
      ...detail,
      credentials: { apiKeys: ["replacement-secret"] },
    })
    const workspace = await openWorkspace()
    const editor = await workspace.openEditEditor(refFor(detail))
    expect(
      editor.fields.find((field) => field.fieldId === "key"),
    ).toMatchObject({
      type: "secret",
      secretState: "unavailable",
      canReplace: true,
    })

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

  it("rejects crafted credential intents for a permission-hidden regular channel", async () => {
    const detail = buildDetailChannel({
      credentials: null,
      type: AXON_HUB_CHANNEL_TYPE.OPENAI,
    })
    mocks.getChannel.mockResolvedValue(detail)
    const workspace = await openWorkspace()
    const editor = await workspace.openEditEditor(refFor(detail))

    expect(
      editor.fields.find((field) => field.fieldId === "key"),
    ).toMatchObject({
      type: "secret",
      secretState: "permission-hidden",
      canReplace: false,
      allowClear: false,
    })

    for (const intent of [
      { kind: "replace", value: "replacement-secret" },
      { kind: "clear" },
    ] satisfies SecretEditIntent[]) {
      await expectGenericValidationRejection(
        editor.submit({ ...editor.initialValues, key: intent }),
      )
    }

    expect(mocks.updateChannel).not.toHaveBeenCalled()
    expect(mocks.updateStatus).not.toHaveBeenCalled()
  })

  it.each(updateFieldCases)(
    "maps $fieldId update according to the pinned field matrix",
    async ({ fieldId, detailOverrides, value, expectedInput }) => {
      const detail = buildDetailChannel(detailOverrides)
      mocks.getChannel.mockResolvedValue(detail)
      mocks.updateChannel.mockResolvedValue(detail)
      const workspace = await openWorkspace()
      const editor = await workspace.openEditEditor(refFor(detail))

      await editor.submit({
        ...editor.initialValues,
        [fieldId]: value,
      })

      const updateInput = mocks.updateChannel.mock.calls.at(-1)?.[2]
      expect(updateInput).toEqual(expectedInput)
      if (fieldId === AXON_HUB_CHANNEL_FIELD_IDS.EXTRA_MODEL_PREFIX) {
        expect(updateInput).not.toHaveProperty("clearSettings")
      }
    },
  )

  it("routes status-only updates through the dedicated status mutation", async () => {
    const detail = buildDetailChannel({
      status: AXON_HUB_CHANNEL_STATUS.DISABLED,
    })
    mocks.getChannel.mockResolvedValue(detail)
    mocks.updateStatus.mockResolvedValue({
      ...detail,
      status: AXON_HUB_CHANNEL_STATUS.ENABLED,
    })
    const workspace = await openWorkspace()
    const editor = await workspace.openEditEditor(refFor(detail))

    await editor.submit({
      ...editor.initialValues,
      status: AXON_HUB_CHANNEL_STATUS.ENABLED,
    })

    expect(mocks.updateChannel).not.toHaveBeenCalled()
    expect(mocks.updateStatus).toHaveBeenCalledWith(
      config,
      detail.id,
      AXON_HUB_CHANNEL_STATUS.ENABLED,
      undefined,
    )
  })

  it("reveals an available regular credential only through an explicit editor load", async () => {
    const detail = buildDetailChannel({
      credentials: { apiKeys: ["saved-secret-value"] },
      type: AXON_HUB_CHANNEL_TYPE.OPENAI,
    })
    mocks.getChannel.mockResolvedValue(detail)
    const workspace = await openWorkspace()
    const editor = await workspace.openEditEditor(refFor(detail))

    expect(editor.initialValues.key).toEqual({ kind: "unchanged" })
    expect(editor.loadSecret).toBeTypeOf("function")
    await expect(
      editor.loadSecret?.(AXON_HUB_CHANNEL_FIELD_IDS.KEY),
    ).resolves.toBe("saved-secret-value")
    expect(editor.initialValues.key).toEqual({ kind: "unchanged" })
    expect(mocks.getChannel).toHaveBeenCalledTimes(2)
  })

  it("fails closed when a credential becomes unavailable before explicit load", async () => {
    const openingDetail = buildDetailChannel({
      credentials: { apiKeys: ["opening-secret-value"] },
      type: AXON_HUB_CHANNEL_TYPE.OPENAI,
    })
    const freshDetail = buildDetailChannel({
      credentials: { apiKeys: ["sk-****masked"] },
      type: AXON_HUB_CHANNEL_TYPE.OPENAI,
    })
    mocks.getChannel
      .mockResolvedValueOnce(openingDetail)
      .mockResolvedValueOnce(freshDetail)
    const workspace = await openWorkspace()
    const editor = await workspace.openEditEditor(refFor(openingDetail))

    expect(editor.loadSecret).toBeTypeOf("function")
    await expect(editor.loadSecret?.("name")).rejects.toMatchObject({
      failure: { code: MANAGED_RESOURCE_FAILURE_CODES.Unexpected },
    })
    const unavailableFailure = await editor
      .loadSecret?.(AXON_HUB_CHANNEL_FIELD_IDS.KEY)
      .catch((failure) => failure)

    expect(unavailableFailure).toBeInstanceOf(ManagedResourceError)
    expect((unavailableFailure as ManagedResourceError).failure).toEqual({
      code: MANAGED_RESOURCE_FAILURE_CODES.Unavailable,
    })
    expect(JSON.stringify(unavailableFailure)).not.toContain(
      "opening-secret-value",
    )
    expect(JSON.stringify(unavailableFailure)).not.toContain("sk-****masked")
    expect(mocks.getChannel).toHaveBeenCalledTimes(2)
  })

  it.each([
    { credentials: undefined, type: AXON_HUB_CHANNEL_TYPE.OPENAI },
    { credentials: null, type: AXON_HUB_CHANNEL_TYPE.OPENAI },
    {
      credentials: { apiKeys: ["sk-****masked"] },
      type: AXON_HUB_CHANNEL_TYPE.OPENAI,
    },
    {
      credentials: { apiKeys: ["saved-secret-value"] },
      type: AXON_HUB_CHANNEL_TYPE.ANTHROPIC_GCP,
    },
  ] satisfies Array<Pick<AxonHubChannel, "credentials" | "type">>)(
    "does not expose a credential loader for non-revealable detail %#",
    async (overrides) => {
      const detail = buildDetailChannel(overrides)
      mocks.getChannel.mockResolvedValue(detail)
      const workspace = await openWorkspace()
      const editor = await workspace.openEditEditor(refFor(detail))

      expect(editor.loadSecret).toBeUndefined()
      expect(JSON.stringify(editor.initialValues)).not.toContain(
        "saved-secret-value",
      )
    },
  )

  it("does not send status in the ordinary patch and reports partial status failure", async () => {
    const detail = buildDetailChannel({
      status: AXON_HUB_CHANNEL_STATUS.DISABLED,
    })
    mocks.getChannel.mockResolvedValue(detail)
    mocks.updateChannel.mockResolvedValue({ ...detail, name: "Renamed" })
    mocks.updateStatus.mockRejectedValueOnce(
      new mocks.RequestError("unavailable", "dispatched"),
    )
    const workspace = await openWorkspace()
    const editor = await workspace.openEditEditor(refFor(detail))

    await expectMutationOutcome(
      editor.submit({
        ...editor.initialValues,
        name: "Renamed",
        status: AXON_HUB_CHANNEL_STATUS.ENABLED,
      }),
      MANAGED_SITE_MUTATION_OUTCOMES.Partial,
    )

    expect(mocks.updateChannel).toHaveBeenCalledWith(
      config,
      detail.id,
      { name: "Renamed" },
      undefined,
    )
    expect(mocks.updateStatus).toHaveBeenCalledOnce()
  })

  it.each(emptyFieldCases)(
    "maps empty $fieldId to its verified empty-value behavior",
    async ({ fieldId, value, expectedInput }) => {
      const detail = buildDetailChannel()
      mocks.getChannel.mockResolvedValue(detail)
      mocks.updateChannel.mockResolvedValue(detail)
      const workspace = await openWorkspace()
      const editor = await workspace.openEditEditor(refFor(detail))

      await editor.submit({
        ...editor.initialValues,
        [fieldId]: value,
      })

      expect(mocks.updateChannel.mock.calls.at(-1)?.[2]).toEqual(expectedInput)
    },
  )

  it("omits every normalized field when the edited values are unchanged", async () => {
    const detail = buildDetailChannel({
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
    mocks.getChannel.mockResolvedValue(detail)
    mocks.updateChannel.mockResolvedValue(detail)
    const workspace = await openWorkspace()
    const editor = await workspace.openEditEditor(refFor(detail))

    await editor.submit(editor.initialValues)

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

  it("keeps nested settings secrets out of the editor and merges the update into a fresh detail", async () => {
    const openingDetail = buildDetailChannel({
      settings: {
        ...structuredClone(pinnedSettings),
        proxy: {
          ...pinnedSettings.proxy,
          password: "opening-proxy-secret",
        },
        providerQuota: {
          opencodeGo: {
            workspaceId: "opening-workspace",
            authCookie: "opening-auth-cookie",
          },
        },
      },
    })
    const latestDetail = buildDetailChannel({
      settings: {
        ...structuredClone(pinnedSettings),
        hideOriginalModels: false,
        proxy: {
          ...pinnedSettings.proxy,
          password: "latest-proxy-secret",
        },
        providerQuota: {
          opencodeGo: {
            workspaceId: "latest-workspace",
            authCookie: "latest-auth-cookie",
          },
        },
      },
    })
    mocks.getChannel
      .mockResolvedValueOnce(openingDetail)
      .mockResolvedValueOnce(latestDetail)
    mocks.updateChannel.mockResolvedValue({
      ...latestDetail,
      settings: { ...latestDetail.settings, extraModelPrefix: "new-prefix" },
    })
    const workspace = await openWorkspace()
    const editor = await workspace.openEditEditor(refFor(openingDetail))

    const publicEditor = JSON.stringify({
      fields: editor.fields,
      initialValues: editor.initialValues,
    })
    expect(publicEditor).not.toContain("opening-proxy-secret")
    expect(publicEditor).not.toContain("opening-auth-cookie")

    await editor.submit({
      ...editor.initialValues,
      extraModelPrefix: "new-prefix",
    })

    expect(mocks.getChannel).toHaveBeenCalledTimes(2)
    expect(mocks.updateChannel.mock.calls.at(-1)?.[2]).toEqual({
      settings: { ...latestDetail.settings, extraModelPrefix: "new-prefix" },
    })
    expect(
      JSON.stringify(mocks.updateChannel.mock.calls.at(-1)?.[2]),
    ).not.toContain("opening-proxy-secret")
    expect(
      JSON.stringify(mocks.updateChannel.mock.calls.at(-1)?.[2]),
    ).not.toContain("opening-auth-cookie")
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
      manualModels: ["model-a"],
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
    expect(
      editor.validate({
        ...validBase,
        supportedModels: undefined as never,
        key: { kind: "replace", value: 42 } as never,
        status: AXON_HUB_CHANNEL_STATUS.ARCHIVED,
      }),
    ).toEqual({
      valid: false,
      issues: expect.arrayContaining([
        { fieldId: "supportedModels", code: "required" },
        { fieldId: "key", code: "required" },
        { fieldId: "status", code: "unsupported_option" },
      ]),
    })
    expect(editor.validate({ ...validBase, orderingWeight: 1.5 })).toEqual({
      valid: false,
      issues: expect.arrayContaining([
        { fieldId: "orderingWeight", code: "invalid_value" },
      ]),
    })
    expect(editor.validate({ ...validBase, orderingWeight: 101 })).toEqual({
      valid: false,
      issues: expect.arrayContaining([
        { fieldId: "orderingWeight", code: "out_of_range" },
      ]),
    })
    expect(
      editor.fields.find(({ fieldId }) => fieldId === "orderingWeight"),
    ).toMatchObject({ min: 0, max: 100, step: 1 })
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
        { fieldId: "manualModels", code: "inconsistent_value" },
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

    const futureStatusDetail = buildDetailChannel({ status: "future-status" })
    mocks.getChannel.mockResolvedValueOnce(futureStatusDetail)
    const futureStatusEditor = await workspace.openEditEditor(
      refFor(futureStatusDetail),
    )
    const statusField = futureStatusEditor.fields.find(
      (field) => field.fieldId === "status",
    )
    expect(statusField).toMatchObject({
      type: "select",
      options: expect.arrayContaining([{ value: "future-status" }]),
    })
    expect(
      futureStatusEditor.validate(futureStatusEditor.initialValues),
    ).toEqual({ valid: true })

    const legacyDetail = buildDetailChannel({
      supportedModels: undefined,
      manualModels: undefined,
      defaultTestModel: undefined,
    })
    mocks.getChannel.mockResolvedValueOnce(legacyDetail)
    const legacyEditor = await workspace.openEditEditor(refFor(legacyDetail))
    expect(
      legacyEditor.validate({
        ...legacyEditor.initialValues,
        status: AXON_HUB_CHANNEL_STATUS.DISABLED,
      }),
    ).toEqual({ valid: true })

    const inconsistentLegacyDetail = buildDetailChannel({
      supportedModels: ["supported-model"],
      manualModels: ["manual-only"],
      defaultTestModel: "manual-only",
    })
    mocks.getChannel.mockResolvedValueOnce(inconsistentLegacyDetail)
    const inconsistentLegacyEditor = await workspace.openEditEditor(
      refFor(inconsistentLegacyDetail),
    )
    expect(
      inconsistentLegacyEditor.validate({
        ...inconsistentLegacyEditor.initialValues,
        defaultTestModel: "supported-model",
      }),
    ).toEqual({ valid: true })
  })

  it.each([
    AXON_HUB_CHANNEL_TYPE.GITHUB_COPILOT,
    AXON_HUB_CHANNEL_TYPE.CLAUDECODE,
  ])("rejects auto-sync edits for provider-managed type %s", async (type) => {
    const detail = buildDetailChannel({
      type,
      autoSyncSupportedModels: false,
      autoSyncModelPattern: "legacy-*",
    })
    mocks.getChannel.mockResolvedValue(detail)
    const editor = await (await openWorkspace()).openEditEditor(refFor(detail))
    expect(
      editor.validate({
        ...editor.initialValues,
        autoSyncSupportedModels: true,
      }),
    ).toEqual({
      valid: false,
      issues: [
        {
          fieldId: AXON_HUB_CHANNEL_FIELD_IDS.AUTO_SYNC_SUPPORTED_MODELS,
          code: "unsupported_option",
        },
      ],
    })
    expect(
      editor.validate({
        ...editor.initialValues,
        autoSyncModelPattern: "updated-*",
      }),
    ).toEqual({
      valid: false,
      issues: [
        {
          fieldId: AXON_HUB_CHANNEL_FIELD_IDS.AUTO_SYNC_SUPPORTED_MODELS,
          code: "unsupported_option",
        },
      ],
    })
  })

  it("rejects crafted provider-managed create auto-sync before dispatch", async () => {
    const editor = await (await openWorkspace()).openCreateEditor()
    const craftedValues: EditableResourceProjection = {
      ...editor.initialValues,
      name: "Crafted channel",
      type: AXON_HUB_CHANNEL_TYPE.GITHUB_COPILOT,
      key: { kind: "replace", value: "replacement-secret" },
      supportedModels: ["model-example"],
      manualModels: ["model-example"],
      defaultTestModel: "model-example",
      autoSyncSupportedModels: true,
    }

    expect(editor.validate(craftedValues)).toEqual({
      valid: false,
      issues: [
        {
          fieldId: AXON_HUB_CHANNEL_FIELD_IDS.TYPE,
          code: "unsupported_option",
        },
      ],
    })
    await expectGenericValidationRejection(editor.submit(craftedValues))
    expect(mocks.createChannel).not.toHaveBeenCalled()
  })

  it("validates the model filter pattern only while automatic sync is enabled", async () => {
    const workspace = await openWorkspace()
    const editor = await workspace.openCreateEditor()
    const validBase: EditableResourceProjection = {
      ...editor.initialValues,
      name: "Created channel",
      key: { kind: "replace", value: "replacement-secret" },
      supportedModels: ["model-example-a"],
      manualModels: ["model-example-a"],
      defaultTestModel: "model-example-a",
      autoSyncSupportedModels: true,
    }

    for (const pattern of [
      "model-example",
      "*",
      "(?i)^model-example",
      "(?ii)^model-example",
      "",
    ]) {
      expect(
        editor.validate({ ...validBase, autoSyncModelPattern: pattern }),
      ).toEqual({ valid: true })
    }
    expect(
      editor.validate({
        ...validBase,
        autoSyncModelPattern: "[model-example",
      }),
    ).toEqual({
      valid: false,
      issues: [
        {
          fieldId: AXON_HUB_CHANNEL_FIELD_IDS.AUTO_SYNC_MODEL_PATTERN,
          code: "invalid_value",
        },
      ],
    })
    expect(
      editor.validate({
        ...validBase,
        autoSyncModelPattern: "(?im)^model-example",
      }),
    ).toEqual({
      valid: false,
      issues: [
        {
          fieldId: AXON_HUB_CHANNEL_FIELD_IDS.AUTO_SYNC_MODEL_PATTERN,
          code: "invalid_value",
        },
      ],
    })

    const detail = buildDetailChannel({
      autoSyncSupportedModels: false,
      autoSyncModelPattern: "[model-example",
    })
    mocks.getChannel.mockResolvedValue(detail)
    const editEditor = await workspace.openEditEditor(refFor(detail))

    expect(
      editEditor.validate({
        ...editEditor.initialValues,
        name: "Renamed channel",
      }),
    ).toEqual({ valid: true })
  })

  it("submits an unrelated legacy-detail rename without synthesizing model fields", async () => {
    const legacyDetail = buildDetailChannel({
      supportedModels: undefined,
      manualModels: undefined,
      defaultTestModel: undefined,
    })
    mocks.getChannel.mockResolvedValue(legacyDetail)
    mocks.updateChannel.mockResolvedValue({
      ...legacyDetail,
      name: "Legacy renamed",
    })
    const workspace = await openWorkspace()
    const editor = await workspace.openEditEditor(refFor(legacyDetail))

    await editor.submit({
      ...editor.initialValues,
      name: "Legacy renamed",
    })

    expect(mocks.updateChannel).toHaveBeenCalledWith(
      config,
      legacyDetail.id,
      { name: "Legacy renamed" },
      undefined,
    )
    expect(
      editor.validate({
        ...editor.initialValues,
        manualModels: ["manual-model"],
      }),
    ).toEqual({
      valid: false,
      issues: expect.arrayContaining([
        { fieldId: "supportedModels", code: "required" },
        { fieldId: "defaultTestModel", code: "required" },
      ]),
    })
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

  it("maps every approved editable field to the pinned create input", async () => {
    const created = buildDetailChannel({
      id: "created-complete-id",
      status: AXON_HUB_CHANNEL_STATUS.DISABLED,
    })
    mocks.createChannel.mockResolvedValue(created)
    const workspace = await openWorkspace()
    const editor = await workspace.openCreateEditor()

    await editor.submit({
      ...editor.initialValues,
      name: "Created channel",
      type: AXON_HUB_CHANNEL_TYPE.ANTHROPIC,
      baseURL: "https://upstream.example.invalid",
      status: AXON_HUB_CHANNEL_STATUS.DISABLED,
      key: { kind: "replace", value: " replacement-secret " },
      supportedModels: [" model-a ", "model-b", "manual-model"],
      manualModels: ["manual-model"],
      defaultTestModel: "model-a",
      autoSyncSupportedModels: true,
      autoSyncModelPattern: "model-*",
      tags: ["primary"],
      orderingWeight: 7,
      remark: "Example channel",
      extraModelPrefix: "vendor/",
    })

    expect(mocks.createChannel).toHaveBeenCalledWith(
      config,
      {
        type: AXON_HUB_CHANNEL_TYPE.ANTHROPIC,
        name: "Created channel",
        baseURL: "https://upstream.example.invalid",
        credentials: { apiKeys: ["replacement-secret"] },
        supportedModels: ["model-a", "model-b", "manual-model"],
        manualModels: ["manual-model"],
        autoSyncSupportedModels: true,
        autoSyncModelPattern: "model-*",
        tags: ["primary"],
        defaultTestModel: "model-a",
        settings: { extraModelPrefix: "vendor/" },
        orderingWeight: 7,
        remark: "Example channel",
      },
      undefined,
    )
    expect(mocks.updateStatus).not.toHaveBeenCalled()
  })

  it("returns a common succeeded result with exact create effect and options", async () => {
    const controller = new AbortController()
    const created = buildDetailChannel({ id: "common-created-id" })
    mocks.createChannel.mockResolvedValue(created)
    const operations = await openAxonHubNativeResourceOperations()
    const input: AxonHubCreateChannelInput = {
      type: AXON_HUB_CHANNEL_TYPE.OPENAI,
      name: "Common create",
      credentials: { apiKeys: ["credential-placeholder"] },
      supportedModels: ["model-a"],
      manualModels: ["model-a"],
      defaultTestModel: "model-a",
      settings: {},
      orderingWeight: 0,
    }

    const result = await operations.create(
      input,
      AXON_HUB_CHANNEL_STATUS.DISABLED,
      { signal: controller.signal },
    )

    expect(result).toEqual({
      outcome: "succeeded",
      data: created,
      confirmedEffects: [
        {
          kind: "resource-created",
          resourceKind: "channel",
          resourceId: "common-created-id",
        },
      ],
    })
    expect(result).not.toHaveProperty("certainty")
    expect(mocks.createChannel).toHaveBeenCalledWith(config, input, {
      signal: controller.signal,
    })
  })

  it("rejects an already-aborted create before invoking the write", async () => {
    const operations = await openAxonHubNativeResourceOperations()
    const controller = new AbortController()
    const abortError = new DOMException("Cancelled before create", "AbortError")
    controller.abort(abortError)

    const result = await operations.create(
      {
        type: AXON_HUB_CHANNEL_TYPE.OPENAI,
        name: "Pre-aborted create",
        credentials: { apiKeys: ["credential-placeholder"] },
        supportedModels: ["model-a"],
        manualModels: ["model-a"],
        defaultTestModel: "model-a",
        settings: {},
        orderingWeight: 0,
      },
      AXON_HUB_CHANNEL_STATUS.DISABLED,
      { signal: controller.signal },
    )

    expect(result).toEqual({
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Rejected,
      diagnostic: {
        message: "aborted",
        code: "aborted",
        raw: abortError,
      },
    })
    expect(mocks.createChannel).not.toHaveBeenCalled()
  })

  it("treats a bare abort thrown after write invocation as uncertain", async () => {
    const abortError = new DOMException("Cancelled during create", "AbortError")
    mocks.createChannel.mockRejectedValue(abortError)
    const operations = await openAxonHubNativeResourceOperations()

    const result = await operations.create(
      {
        type: AXON_HUB_CHANNEL_TYPE.OPENAI,
        name: "Invoked create",
        credentials: { apiKeys: ["credential-placeholder"] },
        supportedModels: ["model-a"],
        manualModels: ["model-a"],
        defaultTestModel: "model-a",
        settings: {},
        orderingWeight: 0,
      },
      AXON_HUB_CHANNEL_STATUS.DISABLED,
    )

    expect(result).toEqual({
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Uncertain,
      diagnostic: {
        message: "aborted",
        code: "aborted",
        raw: abortError,
      },
    })
    expect(mocks.createChannel).toHaveBeenCalledOnce()
  })

  it.each([
    {
      label: "rejected",
      error: new mocks.RequestError("upstream-rejected", "not-dispatched"),
      expectedOutcome: "rejected",
      expectedCode: "upstream_rejected",
    },
    {
      label: "uncertain",
      error: new mocks.RequestError("unavailable", "dispatched"),
      expectedOutcome: "uncertain",
      expectedCode: "unavailable",
    },
  ] as const)(
    "returns a common $label create result with native diagnostic identity",
    async ({ error, expectedOutcome, expectedCode }) => {
      mocks.createChannel.mockRejectedValue(error)
      const operations = await openAxonHubNativeResourceOperations()

      const result = await operations.create(
        {
          type: AXON_HUB_CHANNEL_TYPE.OPENAI,
          name: "Failed create",
          credentials: { apiKeys: ["credential-placeholder"] },
          supportedModels: ["model-a"],
          manualModels: ["model-a"],
          defaultTestModel: "model-a",
          settings: {},
          orderingWeight: 0,
        },
        AXON_HUB_CHANNEL_STATUS.DISABLED,
      )

      expect(result).toMatchObject({
        outcome: expectedOutcome,
        diagnostic: { code: expectedCode, raw: error },
      })
      expect(result).not.toHaveProperty("certainty")
      expect(mocks.createChannel).toHaveBeenCalledOnce()
    },
  )

  it("returns a common partial create result with confirmed create effect and raw status failure", async () => {
    const controller = new AbortController()
    const created = buildDetailChannel({
      id: "common-partial-id",
      status: AXON_HUB_CHANNEL_STATUS.DISABLED,
    })
    const statusError = new mocks.RequestError("unavailable", "dispatched")
    mocks.createChannel.mockResolvedValue(created)
    mocks.updateStatus.mockRejectedValue(statusError)
    const operations = await openAxonHubNativeResourceOperations()

    const result = await operations.create(
      {
        type: AXON_HUB_CHANNEL_TYPE.OPENAI,
        name: "Partial create",
        credentials: { apiKeys: ["credential-placeholder"] },
        supportedModels: ["model-a"],
        manualModels: ["model-a"],
        defaultTestModel: "model-a",
        settings: {},
        orderingWeight: 0,
      },
      AXON_HUB_CHANNEL_STATUS.ENABLED,
      { signal: controller.signal },
    )

    expect(result).toEqual({
      outcome: "partial",
      data: created,
      confirmedEffects: [
        {
          kind: "resource-created",
          resourceKind: "channel",
          resourceId: "common-partial-id",
        },
      ],
      completion: "uncertain",
      diagnostic: {
        message: "unavailable",
        code: "unavailable",
        raw: statusError,
      },
    })
    expect(result).not.toHaveProperty("certainty")
    expect(mocks.createChannel).toHaveBeenCalledOnce()
    expect(mocks.updateStatus).toHaveBeenCalledWith(
      config,
      "common-partial-id",
      AXON_HUB_CHANNEL_STATUS.ENABLED,
      { signal: controller.signal },
    )
  })

  it("uses a distinct attempt for each create write and retains the confirmed create effect", async () => {
    const created = buildDetailChannel({
      id: "created-before-status-rejection",
      status: AXON_HUB_CHANNEL_STATUS.DISABLED,
    })
    const statusError = new mocks.RequestError(
      "upstream-rejected",
      "not-dispatched",
    )
    mocks.createChannel.mockResolvedValue(created)
    mocks.updateStatus.mockRejectedValue(statusError)
    const operations = await openAxonHubNativeResourceOperations()

    await expect(
      operations.create(
        {
          type: AXON_HUB_CHANNEL_TYPE.OPENAI,
          name: "Create then enable",
          credentials: { apiKeys: ["credential-placeholder"] },
          supportedModels: ["model-a"],
          manualModels: ["model-a"],
          defaultTestModel: "model-a",
          settings: {},
          orderingWeight: 0,
        },
        AXON_HUB_CHANNEL_STATUS.ENABLED,
      ),
    ).resolves.toEqual({
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Partial,
      data: created,
      confirmedEffects: [
        {
          kind: "resource-created",
          resourceKind: "channel",
          resourceId: created.id,
        },
      ],
      completion: "rejected",
      diagnostic: {
        message: "upstream_rejected",
        code: "upstream_rejected",
        raw: statusError,
      },
    })
    expect(mocks.mutationSequenceStepCounts).toEqual([2])
  })

  it("uses a distinct attempt for each update write and retains the confirmed field effect", async () => {
    const detail = buildDetailChannel({
      status: AXON_HUB_CHANNEL_STATUS.DISABLED,
    })
    const updated = { ...detail, name: "Updated before status loss" }
    const statusError = new mocks.RequestError("unavailable", "dispatched")
    mocks.updateChannel.mockResolvedValue(updated)
    mocks.updateStatus.mockRejectedValue(statusError)
    const operations = await openAxonHubNativeResourceOperations()

    await expect(
      operations.update(detail, {
        name: updated.name,
        status: AXON_HUB_CHANNEL_STATUS.ENABLED,
      }),
    ).resolves.toEqual({
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Partial,
      data: updated,
      confirmedEffects: [
        {
          kind: "resource-updated",
          resourceKind: "channel",
          resourceId: detail.id,
        },
      ],
      completion: "uncertain",
      diagnostic: {
        message: "unavailable",
        code: "unavailable",
        raw: statusError,
      },
    })
    expect(mocks.mutationSequenceStepCounts).toEqual([2])
  })

  it("opens exactly one attempt for each single-write native mutation", async () => {
    const detail = buildDetailChannel()
    const operations = await openAxonHubNativeResourceOperations()

    await operations.create(
      {
        type: AXON_HUB_CHANNEL_TYPE.OPENAI,
        name: "Single create",
        credentials: { apiKeys: ["credential-placeholder"] },
        supportedModels: ["model-a"],
        manualModels: ["model-a"],
        defaultTestModel: "model-a",
        settings: {},
        orderingWeight: 0,
      },
      AXON_HUB_CHANNEL_STATUS.DISABLED,
    )
    await operations.update(detail, { name: "Single update" })
    await operations.delete(refFor(detail))

    expect(mocks.mutationSequenceStepCounts).toEqual([1, 1, 1])
  })

  it("rethrows programming failures from a later native write", async () => {
    const detail = buildDetailChannel({
      status: AXON_HUB_CHANNEL_STATUS.DISABLED,
    })
    const programmingError = new Error("status invariant failed")
    mocks.updateChannel.mockResolvedValue({ ...detail, name: "Updated" })
    mocks.updateStatus.mockRejectedValue(programmingError)
    const operations = await openAxonHubNativeResourceOperations()

    await expect(
      operations.update(detail, {
        name: "Updated",
        status: AXON_HUB_CHANNEL_STATUS.ENABLED,
      }),
    ).rejects.toBe(programmingError)
    expect(mocks.mutationSequenceStepCounts).toEqual([2])
  })

  it("maps create rejection and applies the requested enabled status", async () => {
    const workspace = await openWorkspace()
    const editor = await workspace.openCreateEditor()
    const values: EditableResourceProjection = {
      ...editor.initialValues,
      name: "Created channel",
      key: { kind: "replace", value: "replacement-secret" },
      supportedModels: ["model-a"],
      defaultTestModel: "model-a",
      status: AXON_HUB_CHANNEL_STATUS.ENABLED,
    }

    mocks.createChannel.mockRejectedValueOnce(
      new mocks.RequestError("upstream-rejected", "not-dispatched"),
    )
    await expectRejectedMutationCode(
      editor.submit(values),
      MANAGED_RESOURCE_FAILURE_CODES.UpstreamRejected,
    )

    const created = buildDetailChannel({
      id: "created-enabled-id",
      status: AXON_HUB_CHANNEL_STATUS.DISABLED,
    })
    mocks.createChannel.mockResolvedValueOnce(created)
    const result = await editor.submit(values)

    expect(result).toMatchObject({
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Succeeded,
      data: {
        status: "enabled",
        ref: { resourceId: "created-enabled-id" },
      },
    })
    expect(mocks.updateStatus).toHaveBeenCalledWith(
      config,
      created.id,
      AXON_HUB_CHANNEL_STATUS.ENABLED,
      undefined,
    )
  })

  it("preserves a partial create result and uncertain updates without replay", async () => {
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

    await expectMutationOutcome(
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
      MANAGED_SITE_MUTATION_OUTCOMES.Partial,
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

    await expectMutationOutcome(
      updateEditor.submit(changedValues),
      MANAGED_SITE_MUTATION_OUTCOMES.Uncertain,
    )
    await expectGenericValidationRejection(updateEditor.submit(changedValues))
    expect(mocks.updateChannel).toHaveBeenCalledOnce()
  })

  it("treats a dispatched GraphQL rejection as an uncertain result", async () => {
    const detail = buildDetailChannel()
    mocks.getChannel.mockResolvedValue(detail)
    mocks.updateChannel.mockRejectedValue(
      new mocks.RequestError("upstream-rejected", "dispatched"),
    )
    const workspace = await openWorkspace()
    const editor = await workspace.openEditEditor(refFor(detail))

    await expectMutationOutcome(
      editor.submit({ ...editor.initialValues, name: "Uncertain rename" }),
      MANAGED_SITE_MUTATION_OUTCOMES.Uncertain,
    )
    await expectGenericValidationRejection(
      editor.submit({ ...editor.initialValues, name: "Uncertain rename" }),
    )
    expect(mocks.updateChannel).toHaveBeenCalledOnce()
  })

  it.each([
    ["authentication", "authentication_failed"],
    ["permission", "permission_denied"],
  ] as const)(
    "treats dispatched %s failures as uncertain without losing the raw cause",
    async (kind, code) => {
      const detail = buildDetailChannel()
      const rawCause = new mocks.RequestError(kind, "dispatched")
      mocks.updateChannel.mockRejectedValue(rawCause)

      const operations = await openAxonHubNativeResourceOperations()
      const nativeResult = await operations.update(detail, {
        name: "Uncertain rename",
      })

      expect(nativeResult).toEqual({
        outcome: MANAGED_SITE_MUTATION_OUTCOMES.Uncertain,
        diagnostic: { message: code, code, raw: rawCause },
      })

      mocks.updateChannel.mockClear()
      mocks.getChannel.mockResolvedValue(detail)
      const workspace = await openWorkspace()
      const editor = await workspace.openEditEditor(refFor(detail))
      const changedValues = {
        ...editor.initialValues,
        name: "Uncertain rename",
      }

      const publicResult = await expectMutationOutcome(
        editor.submit(changedValues),
        MANAGED_SITE_MUTATION_OUTCOMES.Uncertain,
      )
      expect(publicResult).toMatchObject({
        diagnostic: { raw: rawCause },
      })
      await expectGenericValidationRejection(editor.submit(changedValues))
      expect(mocks.updateChannel).toHaveBeenCalledOnce()
    },
  )

  it("projects common delete outcomes without unsafe replay", async () => {
    const workspace = await openWorkspace()
    const ref = refFor()

    mocks.deleteChannel.mockResolvedValueOnce(true)
    await expectMutationOutcome(
      workspace.delete(ref),
      MANAGED_SITE_MUTATION_OUTCOMES.Succeeded,
    )

    mocks.deleteChannel.mockResolvedValueOnce(false)
    await expectRejectedMutationCode(
      workspace.delete(ref),
      MANAGED_RESOURCE_FAILURE_CODES.UpstreamRejected,
    )

    mocks.deleteChannel.mockRejectedValueOnce(
      new mocks.RequestError("not-found", "dispatched"),
    )
    mocks.getChannel.mockRejectedValueOnce(
      new mocks.RequestError("not-found", "not-dispatched"),
    )
    await expectMutationOutcome(
      workspace.delete(ref),
      MANAGED_SITE_MUTATION_OUTCOMES.Succeeded,
    )

    mocks.deleteChannel.mockRejectedValueOnce(
      new mocks.RequestError("unavailable", "dispatched"),
    )
    await expectMutationOutcome(
      workspace.delete(ref),
      MANAGED_SITE_MUTATION_OUTCOMES.Uncertain,
    )
    expect(mocks.deleteChannel).toHaveBeenCalledTimes(4)
    expect(mocks.getChannel).toHaveBeenCalledTimes(1)
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

  it("keeps registration presence and native rollout mode explicit", () => {
    expect(
      getManagedResourceRegistration(
        SITE_TYPES.AXON_HUB,
        MANAGED_RESOURCE_KINDS.Channel,
      ),
    ).not.toBeNull()
    expect(
      accountSiteDefinitionRegistry.getAccountSiteDefinition(
        SITE_TYPES.AXON_HUB,
      )?.managedResource?.mode,
    ).toBe(MANAGED_RESOURCE_MODES.NativeResource)
  })

  it("has a registration for every definition currently marked native-resource", () => {
    const nativeDefinitions = accountSiteDefinitionRegistry
      .getAccountSiteDefinitions()
      .filter(
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

  it("maps native Axon detail to a secret-free canonical migration source", async () => {
    mocks.getChannel.mockResolvedValue(
      buildDetailChannel({
        type: AXON_HUB_CHANNEL_TYPE.ANTHROPIC,
        status: AXON_HUB_CHANNEL_STATUS.ARCHIVED,
        baseURL: " https://native.example.invalid/v1 ",
        credentials: {
          apiKeys: ["sk-preview-placeholder", "sk-second-placeholder"],
        },
        supportedModels: ["supported-model", "shared-model"],
        manualModels: ["manual-model", "shared-model"],
        orderingWeight: 11,
        settings: {
          modelMappings: [{ from: "alias-model", to: "supported-model" }],
          proxy: { type: "http", url: "https://proxy.example.invalid" },
        },
      }),
    )

    const result = await axonHubManagedSiteMigrationCapability.source!.prepare({
      selectionId: "legacy-401",
      displayName: "Native source",
      ref: refFor(),
    })

    expect(result).toEqual({
      status: "ready",
      source: {
        sourceSiteType: SITE_TYPES.AXON_HUB,
        resourceType: ChannelType.Anthropic,
        baseUrl: "https://native.example.invalid/v1",
        models: ["supported-model", "shared-model", "manual-model"],
        groups: [],
        priority: 0,
        weight: 11,
        status: "other",
        lossSignals: {
          hasModelMapping: true,
          hasStatusCodeMapping: false,
          hasAdvancedSettings: true,
          hasMultiKeyState: true,
        },
      },
    })
    expect(JSON.stringify(result)).not.toContain("sk-preview-placeholder")
    expect(JSON.stringify(result)).not.toContain("credentials")
  })

  it("maps a plain disabled native detail without advanced migration loss", async () => {
    mocks.getChannel.mockResolvedValue(
      buildDetailChannel({
        status: AXON_HUB_CHANNEL_STATUS.DISABLED,
        settings: null,
        policies: null,
        endpoints: [],
        tags: [],
        autoSyncSupportedModels: false,
        autoSyncModelPattern: null,
        remark: null,
      }),
    )

    const result = await axonHubManagedSiteMigrationCapability.source!.prepare({
      selectionId: "plain-disabled",
      displayName: "Plain disabled source",
      ref: refFor(),
    })

    expect(result).toMatchObject({
      status: "ready",
      source: {
        status: "disabled",
        lossSignals: {
          hasModelMapping: false,
          hasStatusCodeMapping: false,
          hasAdvancedSettings: false,
          hasMultiKeyState: false,
        },
      },
    })
  })

  it("reloads native detail and returns a usable regular key only during execution", async () => {
    mocks.getChannel
      .mockResolvedValueOnce(
        buildDetailChannel({
          credentials: { apiKeys: ["sk-preview-placeholder"] },
        }),
      )
      .mockResolvedValueOnce(
        buildDetailChannel({
          credentials: { apiKeys: ["sk-execution-placeholder"] },
        }),
      )
    const selection = {
      selectionId: "native-credential",
      displayName: "Native credential",
      ref: refFor(),
    }

    const preview =
      await axonHubManagedSiteMigrationCapability.source!.prepare(selection)
    const resolution =
      await axonHubManagedSiteMigrationCapability.source!.resolveCredential(
        selection,
      )

    expect(preview.status).toBe("ready")
    expect(resolution).toEqual({
      status: "ready",
      credential: "sk-execution-placeholder",
    })
    expect(mocks.getChannel).toHaveBeenCalledTimes(2)
  })

  it.each([
    {
      label: "permission-hidden",
      credentials: null,
      reasonCode:
        MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_KEY_RESOLUTION_FAILED,
    },
    {
      label: "masked",
      credentials: { apiKeys: ["sk-********"] },
      reasonCode:
        MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_KEY_MISSING,
    },
    {
      label: "unavailable",
      credentials: { apiKeys: [] },
      reasonCode:
        MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_KEY_MISSING,
    },
  ])(
    "maps $label native credentials to a controlled blocker",
    async ({ credentials, reasonCode }) => {
      mocks.getChannel.mockResolvedValue(buildDetailChannel({ credentials }))
      const selection = {
        selectionId: "blocked-native",
        displayName: "Blocked native",
        ref: refFor(),
      }

      await expect(
        axonHubManagedSiteMigrationCapability.source!.prepare(selection),
      ).resolves.toEqual({ status: "blocked", reasonCode })
      await expect(
        axonHubManagedSiteMigrationCapability.source!.resolveCredential(
          selection,
        ),
      ).resolves.toEqual({ status: "blocked", reasonCode })
    },
  )

  it("projects canonical targets and creates one direct native Axon input with signal propagation", async () => {
    const controller = new AbortController()
    const source = {
      sourceSiteType: SITE_TYPES.NEW_API,
      resourceType: ChannelType.Gemini,
      baseUrl: "https://source.example.invalid/v1",
      models: ["model-one", "model-two"],
      groups: ["paid"],
      priority: 8,
      weight: 13,
      status: "enabled" as const,
      lossSignals: {
        hasModelMapping: false,
        hasStatusCodeMapping: false,
        hasAdvancedSettings: false,
        hasMultiKeyState: false,
      },
    }
    const preparation =
      await axonHubManagedSiteMigrationCapability.target!.prepare(source, {
        signal: controller.signal,
      })

    expect(preparation).toEqual({
      projection: {
        name: "",
        type: AXON_HUB_CHANNEL_TYPE.GEMINI,
        baseUrl: "https://source.example.invalid/v1",
        models: ["model-one", "model-two"],
        groups: ["default"],
        priority: 0,
        weight: 13,
        status: 1,
      },
      adjustments: {
        remappedType: true,
        normalizedBaseUrl: false,
        forcedDefaultGroup: true,
        ignoredPriority: true,
        ignoredWeight: false,
        simplifiedStatus: false,
      },
    })

    const result = await axonHubManagedSiteMigrationCapability.target!.create(
      {
        source,
        targetSiteType: SITE_TYPES.AXON_HUB,
        projection: { ...preparation.projection, name: "Native target" },
        credential: "sk-create-placeholder",
      },
      { signal: controller.signal },
    )

    expect(result).toEqual({ status: "created" })
    expect(mocks.createChannel).toHaveBeenCalledOnce()
    expect(mocks.createChannel).toHaveBeenCalledWith(
      config,
      {
        type: AXON_HUB_CHANNEL_TYPE.GEMINI,
        name: "Native target",
        baseURL: "https://source.example.invalid/v1",
        credentials: { apiKeys: ["sk-create-placeholder"] },
        supportedModels: ["model-one", "model-two"],
        manualModels: ["model-one", "model-two"],
        defaultTestModel: "model-one",
        settings: {},
        orderingWeight: 13,
      },
      { signal: controller.signal },
    )
    expect(mocks.updateStatus).toHaveBeenCalledWith(
      config,
      "opaque-channel-1",
      AXON_HUB_CHANNEL_STATUS.ENABLED,
      { signal: controller.signal },
    )
  })

  it("rejects target preparation when canonical models normalize to empty", async () => {
    await expect(
      axonHubManagedSiteMigrationCapability.target!.prepare(
        buildMigrationSource({ models: ["", "   "] }),
      ),
    ).rejects.toThrow("at least one model")
  })

  it("normalizes non-empty canonical models during target preparation", async () => {
    const preparation =
      await axonHubManagedSiteMigrationCapability.target!.prepare(
        buildMigrationSource({
          models: [" model-one ", "model-one", "", "model-two"],
        }),
      )

    expect(preparation.projection.models).toEqual(["model-one", "model-two"])
  })

  it("maps canonical Vertex AI targets to AxonHub Gemini during prepare and create", async () => {
    const source = buildMigrationSource({
      resourceType: ChannelType.VertexAi,
      baseUrl: "https://vertex.example.invalid",
    })
    const command = await buildMigrationCreateCommand(source)

    expect(command.projection.type).toBe(AXON_HUB_CHANNEL_TYPE.GEMINI)

    await expect(
      axonHubManagedSiteMigrationCapability.target!.create(command),
    ).resolves.toEqual({ status: "created" })
    expect(mocks.createChannel).toHaveBeenCalledWith(
      config,
      expect.objectContaining({ type: AXON_HUB_CHANNEL_TYPE.GEMINI }),
      undefined,
    )
  })

  it("omits an empty optional baseURL from native migration creation", async () => {
    const command = await buildMigrationCreateCommand(
      buildMigrationSource({ baseUrl: "   " }),
    )

    await expect(
      axonHubManagedSiteMigrationCapability.target!.create(command),
    ).resolves.toEqual({ status: "created" })

    expect(mocks.createChannel).toHaveBeenCalledOnce()
    expect(mocks.createChannel.mock.calls[0][1]).not.toHaveProperty("baseURL")
  })

  it("maps missing target configuration to target unavailable before the common adapter", async () => {
    mocks.resolveRuntimeConfig.mockReturnValue(null)
    const command = await buildMigrationCreateCommand()

    await expect(
      axonHubManagedSiteMigrationCapability.target!.create(command),
    ).resolves.toEqual({
      status: "failed",
      failureCode:
        MANAGED_SITE_MIGRATION_EXECUTION_FAILURE_CODES.TargetUnavailable,
    })
  })

  it("normalizes a controlled native abort while opening the target", async () => {
    mocks.signIn.mockRejectedValue(
      new mocks.RequestError("aborted", "not-dispatched"),
    )
    const command = await buildMigrationCreateCommand()

    const error = await axonHubManagedSiteMigrationCapability
      .target!.create(command)
      .catch((failure) => failure)

    expect(error).toMatchObject({ name: "AbortError" })
    expect(error.cause).toBeInstanceOf(AxonHubNativeError)
    expect(mocks.createChannel).not.toHaveBeenCalled()
  })

  it("propagates a pre-dispatch native create abort without replay", async () => {
    mocks.createChannel.mockRejectedValue(
      new mocks.RequestError("aborted", "not-dispatched"),
    )

    const error = await axonHubManagedSiteMigrationCapability
      .target!.create(await buildMigrationCreateCommand())
      .catch((failure) => failure)

    expect(error).toMatchObject({ name: "AbortError" })
    expect(mocks.createChannel).toHaveBeenCalledOnce()
    expect(mocks.updateStatus).not.toHaveBeenCalled()
  })

  it.each([
    { method: "prepare" as const, stage: "open" as const },
    { method: "prepare" as const, stage: "get" as const },
    { method: "resolveCredential" as const, stage: "open" as const },
    { method: "resolveCredential" as const, stage: "get" as const },
  ])(
    "normalizes native aborts from source $method $stage boundaries",
    async ({ method, stage }) => {
      const nativeAbort = new mocks.RequestError("aborted", "not-dispatched")
      if (stage === "open") mocks.signIn.mockRejectedValue(nativeAbort)
      else mocks.getChannel.mockRejectedValue(nativeAbort)
      const selection = {
        selectionId: `${method}-${stage}-abort`,
        displayName: "Aborted source",
        ref: refFor(),
      }

      const error = await axonHubManagedSiteMigrationCapability
        .source![method](selection)
        .catch((failure) => failure)

      expect(error).toMatchObject({ name: "AbortError" })
      expect(error.cause).toBeInstanceOf(AxonHubNativeError)
      expect((error.cause as AxonHubNativeError).failure).toEqual({
        code: "aborted",
        dispatch: "before",
      })
    },
  )

  it("rethrows non-native target open errors without normalization", async () => {
    const adapterError = new Error("Native open failure")
    const openSpy = vi
      .spyOn(axonHubNativeResources, "openAxonHubNativeResourceOperations")
      .mockRejectedValueOnce(adapterError)

    try {
      await expect(
        axonHubManagedSiteMigrationCapability.target!.create(
          await buildMigrationCreateCommand(),
        ),
      ).rejects.toBe(adapterError)
    } finally {
      openSpy.mockRestore()
    }
  })

  it.each([
    {
      type: AXON_HUB_CHANNEL_TYPE.ANTHROPIC_AWS,
      reasonCode:
        MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_KEY_MISSING,
    },
    {
      type: AXON_HUB_CHANNEL_TYPE.ANTHROPIC_GCP,
      reasonCode:
        MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_KEY_MISSING,
    },
    {
      type: "future-structured-type",
      reasonCode:
        MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_TYPE_UNSUPPORTED,
    },
  ])(
    "blocks non-regular native type $type even when apiKeys look usable",
    async ({ type, reasonCode }) => {
      mocks.getChannel.mockResolvedValue(
        buildDetailChannel({
          type,
          credentials: { apiKeys: ["sk-apparently-usable-placeholder"] },
        }),
      )
      const selection = {
        selectionId: `non-regular-${type}`,
        displayName: "Non-regular native",
        ref: refFor(),
      }
      const expected = {
        status: "blocked",
        reasonCode,
      }

      await expect(
        axonHubManagedSiteMigrationCapability.source!.prepare(selection),
      ).resolves.toEqual(expected)
      await expect(
        axonHubManagedSiteMigrationCapability.source!.resolveCredential(
          selection,
        ),
      ).resolves.toEqual(expected)
    },
  )

  it("maps confirmed native rejection and uncertain mutation states without replay", async () => {
    const preparation =
      await axonHubManagedSiteMigrationCapability.target!.prepare({
        sourceSiteType: SITE_TYPES.NEW_API,
        resourceType: ChannelType.OpenAI,
        baseUrl: "https://source.example.invalid",
        models: ["model-one"],
        groups: ["default"],
        priority: 0,
        weight: 0,
        status: "disabled",
        lossSignals: {
          hasModelMapping: false,
          hasStatusCodeMapping: false,
          hasAdvancedSettings: false,
          hasMultiKeyState: false,
        },
      })
    const command = {
      source: {
        sourceSiteType: SITE_TYPES.NEW_API,
        resourceType: ChannelType.OpenAI,
        baseUrl: "https://source.example.invalid",
        models: ["model-one"],
        groups: ["default"],
        priority: 0,
        weight: 0,
        status: "disabled" as const,
        lossSignals: {
          hasModelMapping: false,
          hasStatusCodeMapping: false,
          hasAdvancedSettings: false,
          hasMultiKeyState: false,
        },
      },
      targetSiteType: SITE_TYPES.AXON_HUB,
      projection: { ...preparation.projection, name: "Outcome target" },
      credential: "sk-outcome-placeholder",
    }

    mocks.createChannel.mockRejectedValueOnce(
      new mocks.RequestError("upstream-rejected", "not-dispatched"),
    )
    mocks.createChannel.mockRejectedValueOnce(
      new mocks.RequestError("unavailable", "dispatched"),
    )
    await expect(
      axonHubManagedSiteMigrationCapability.target!.create(command),
    ).resolves.toEqual({
      status: "failed",
      failureCode:
        MANAGED_SITE_MIGRATION_EXECUTION_FAILURE_CODES.TargetRejected,
    })

    mocks.createChannel.mockResolvedValueOnce(
      buildDetailChannel({ status: AXON_HUB_CHANNEL_STATUS.DISABLED }),
    )
    mocks.updateStatus.mockRejectedValueOnce(
      new mocks.RequestError("unavailable", "dispatched"),
    )
    await expect(
      axonHubManagedSiteMigrationCapability.target!.create(command),
    ).resolves.toEqual({ status: "uncertain" })

    await expect(
      axonHubManagedSiteMigrationCapability.target!.create({
        ...command,
        projection: { ...command.projection, status: 1 },
      }),
    ).resolves.toEqual({ status: "uncertain" })
    expect(mocks.createChannel).toHaveBeenCalledTimes(3)
  })

  it("maps an unclassified confirmed native failure to unexpected", async () => {
    mocks.createChannel.mockRejectedValue(
      new mocks.RequestError("protocol", "not-dispatched"),
    )

    await expect(
      axonHubManagedSiteMigrationCapability.target!.create(
        await buildMigrationCreateCommand(),
      ),
    ).resolves.toEqual({
      status: "failed",
      failureCode: MANAGED_SITE_MIGRATION_EXECUTION_FAILURE_CODES.Unexpected,
    })
    expect(mocks.createChannel).toHaveBeenCalledOnce()
  })
})
