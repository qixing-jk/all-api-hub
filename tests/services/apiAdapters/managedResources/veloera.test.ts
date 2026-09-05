import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  VELOERA_MANAGED_RESOURCE_FIELD_IDS,
  VeloeraChannelType,
} from "~/constants/veloera"
import { MANAGED_RESOURCE_KINDS } from "~/services/accountSiteDefinitions/contracts"
import {
  MANAGED_RESOURCE_CREATE_SEED_KINDS,
  MANAGED_RESOURCE_FAILURE_CODES,
  ManagedResourceError,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import {
  openVeloeraNativeResourceOperations,
  veloeraManagedResourceRegistration,
} from "~/services/apiAdapters/managedResources/veloera"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import {
  MANAGED_SITE_MUTATION_COMPLETIONS,
  MANAGED_SITE_MUTATION_EFFECT_KINDS,
  MANAGED_SITE_MUTATION_OUTCOMES,
} from "~/services/managedSites/mutations"
import { buildManagedSiteChannel } from "~~/tests/test-utils/factories"

const mocks = vi.hoisted(() => ({
  getPreferences: vi.fn(),
  list: vi.fn(),
  get: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  fetchSecretKey: vi.fn(),
  fetchModels: vi.fn(),
  fetchDraftModels: vi.fn(),
  fetchSiteUserGroups: vi.fn(),
  buildPayload: vi.fn(),
}))

vi.mock("~/services/preferences/userPreferences", () => ({
  userPreferences: { getPreferences: mocks.getPreferences },
}))

vi.mock("~/services/apiAdapters/managedSites/veloera", () => ({
  veloeraManagedSiteCapabilities: {
    channels: {
      list: mocks.list,
      get: mocks.get,
      create: mocks.create,
      update: mocks.update,
      delete: mocks.remove,
      fetchSecretKey: mocks.fetchSecretKey,
      fetchModels: mocks.fetchModels,
      fetchDraftModels: mocks.fetchDraftModels,
    },
    channelDrafts: { buildPayload: mocks.buildPayload },
    queries: { fetchSiteUserGroups: mocks.fetchSiteUserGroups },
  },
}))

const config = {
  baseUrl: "https://veloera.example.invalid/",
  adminToken: "admin-token",
  userId: "42",
}

const channel = buildManagedSiteChannel({
  id: 17,
  name: "Primary channel",
  type: VeloeraChannelType.GitHubModels,
  key: "sk-********",
  models: "model-a,model-b",
  group: "default,vip",
})

const createDraft = (name: string) => ({
  name,
  type: VeloeraChannelType.OpenAI,
  key: "credential-placeholder",
  base_url: "https://upstream.example.invalid",
  models: ["model-a"],
  groups: ["default"],
  priority: 0,
  weight: 0,
  status: 1 as const,
})

const expectFailureCode = async (promise: Promise<unknown>, code: string) => {
  const error = await promise.catch((failure) => failure)
  expect(error).toBeInstanceOf(ManagedResourceError)
  expect((error as ManagedResourceError).failure.code).toBe(code)
}

describe("Veloera native managed resource", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.getPreferences.mockResolvedValue({ veloera: config })
    mocks.list.mockResolvedValue({ items: [channel], total: 1 })
    mocks.get.mockResolvedValue(channel)
    mocks.update.mockResolvedValue({
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Succeeded,
      data: { id: channel.id },
      confirmedEffects: [
        {
          kind: MANAGED_SITE_MUTATION_EFFECT_KINDS.ResourceUpdated,
          resourceKind: "channel",
          resourceId: channel.id,
        },
      ],
    })
    mocks.create.mockResolvedValue({
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Succeeded,
      data: undefined,
      confirmedEffects: [
        {
          kind: MANAGED_SITE_MUTATION_EFFECT_KINDS.ResourceCreated,
          resourceKind: "channel",
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
    mocks.fetchSiteUserGroups.mockResolvedValue(["default", "vip"])
    mocks.buildPayload.mockImplementation((draft) => ({
      mode: "single",
      channel: draft,
    }))
  })

  it("projects Veloera channel identity with provider-owned type vocabulary", async () => {
    const workspace = await veloeraManagedResourceRegistration.open()
    const page = await workspace.list()

    expect(page.items).toHaveLength(1)
    expect(page.items[0]).toEqual(
      expect.objectContaining({
        ref: {
          siteType: SITE_TYPES.VELOERA,
          kind: MANAGED_RESOURCE_KINDS.Channel,
          scopeKey: "https://veloera.example.invalid",
          resourceId: "17",
        },
        displayName: "Primary channel",
        actions: expect.objectContaining({
          canUpdate: true,
          canDelete: true,
        }),
      }),
    )
    expect(page.items[0].fields).toEqual(
      expect.arrayContaining([
        {
          fieldId: VELOERA_MANAGED_RESOURCE_FIELD_IDS.Type,
          kind: "text",
          value: "GitHub Models",
        },
        {
          fieldId: VELOERA_MANAGED_RESOURCE_FIELD_IDS.Key,
          kind: "secret",
          state: "masked",
        },
      ]),
    )
    expect(JSON.stringify(page.items[0])).not.toContain("sk-********")
  })

  it("treats omitted list credentials as masked when detail can reveal them", async () => {
    mocks.list.mockResolvedValueOnce({
      items: [{ ...channel, key: "" }],
      total: 1,
    })

    const workspace = await veloeraManagedResourceRegistration.open()
    const page = await workspace.list()

    expect(page.items[0].fields).toContainEqual({
      fieldId: VELOERA_MANAGED_RESOURCE_FIELD_IDS.Key,
      kind: "secret",
      state: "masked",
    })
  })

  it("projects provider status, secret, and unknown type fallbacks without exposing secrets", async () => {
    mocks.list.mockResolvedValueOnce({
      items: [
        { ...channel, id: 18, status: 2, key: "sk-usable-example" },
        { ...channel, id: 19, status: 3, key: "masked-value" },
        { ...channel, id: 20, status: 0, type: 999, key: "" },
      ],
      total: 3,
    })

    const page = await (await veloeraManagedResourceRegistration.open()).list()

    expect(page.items.map((item) => item.status)).toEqual([
      "manually-disabled",
      "auto-disabled",
      "unknown",
    ])
    expect(page.items[0].fields).toContainEqual({
      fieldId: VELOERA_MANAGED_RESOURCE_FIELD_IDS.Key,
      kind: "secret",
      state: "available",
    })
    expect(page.items[2].fields).toContainEqual({
      fieldId: VELOERA_MANAGED_RESOURCE_FIELD_IDS.Type,
      kind: "text",
      value: "999",
    })
    expect(JSON.stringify(page.items)).not.toContain("sk-usable-example")
  })

  it("searches the complete Veloera inventory across provider-owned facts", async () => {
    mocks.list.mockResolvedValue({
      items: [
        channel,
        {
          ...channel,
          id: 18,
          name: "Secondary",
          type: VeloeraChannelType.OpenAI,
          base_url: "https://gateway.example.invalid",
          models: "model-searchable",
          group: "research",
        },
      ],
      total: 2,
    })
    const workspace = await veloeraManagedResourceRegistration.open()

    for (const search of [
      "openai",
      "GATEWAY.EXAMPLE.INVALID",
      "model-searchable",
      "research",
    ]) {
      await expect(workspace.list({ search })).resolves.toMatchObject({
        total: 1,
        items: [{ ref: { resourceId: "18" } }],
      })
    }
  })

  it.each([
    {
      name: "owned failures",
      error: () =>
        new ManagedResourceError({
          code: MANAGED_RESOURCE_FAILURE_CODES.ConfigurationRequired,
        }),
      code: MANAGED_RESOURCE_FAILURE_CODES.ConfigurationRequired,
    },
    {
      name: "authentication status",
      error: () => new ApiError("sign in again", 401),
      code: MANAGED_RESOURCE_FAILURE_CODES.AuthenticationFailed,
    },
    {
      name: "permission error code",
      error: () =>
        new ApiError(
          "forbidden",
          undefined,
          undefined,
          API_ERROR_CODES.HTTP_403,
          "provider-forbidden",
        ),
      code: MANAGED_RESOURCE_FAILURE_CODES.PermissionDenied,
    },
    {
      name: "missing resources",
      error: () => new ApiError("missing", 404),
      code: MANAGED_RESOURCE_FAILURE_CODES.NotFound,
    },
    {
      name: "network failures",
      error: () =>
        new ApiError(
          "offline",
          undefined,
          undefined,
          API_ERROR_CODES.NETWORK_ERROR,
        ),
      code: MANAGED_RESOURCE_FAILURE_CODES.Unavailable,
    },
    {
      name: "upstream rejections",
      error: () => new ApiError("rejected", 502),
      code: MANAGED_RESOURCE_FAILURE_CODES.UpstreamRejected,
    },
    {
      name: "aborted operations",
      error: () => new DOMException("cancelled", "AbortError"),
      code: MANAGED_RESOURCE_FAILURE_CODES.Aborted,
    },
    {
      name: "unexpected failures",
      error: () => new Error("unexpected"),
      code: MANAGED_RESOURCE_FAILURE_CODES.Unexpected,
    },
  ])("maps $name at the native resource boundary", async ({ error, code }) => {
    mocks.list.mockRejectedValueOnce(error())
    const workspace = await veloeraManagedResourceRegistration.open()

    await expectFailureCode(workspace.list(), code)
  })

  it("rejects missing and invalid Veloera runtime configuration", async () => {
    mocks.getPreferences.mockResolvedValueOnce({})
    await expectFailureCode(
      veloeraManagedResourceRegistration.open(),
      MANAGED_RESOURCE_FAILURE_CODES.ConfigurationRequired,
    )

    mocks.getPreferences.mockResolvedValueOnce({
      veloera: { ...config, baseUrl: "ftp://user@example.invalid" },
    })
    await expectFailureCode(
      veloeraManagedResourceRegistration.open(),
      MANAGED_RESOURCE_FAILURE_CODES.InvalidConfiguration,
    )
  })

  it("opens an editor with Veloera field ids and channel type options", async () => {
    const workspace = await veloeraManagedResourceRegistration.open()
    const editor = await workspace.openCreateEditor()
    const typeField = editor.fields.find(
      (field) => field.fieldId === VELOERA_MANAGED_RESOURCE_FIELD_IDS.Type,
    )

    expect(typeField).toMatchObject({
      type: "select",
      options: expect.arrayContaining([
        {
          value: String(VeloeraChannelType.GitHubModels),
          displayLabel: "GitHub Models",
        },
      ]),
    })
    expect(editor.fields.map((field) => field.fieldId)).toEqual(
      expect.arrayContaining([
        VELOERA_MANAGED_RESOURCE_FIELD_IDS.Name,
        VELOERA_MANAGED_RESOURCE_FIELD_IDS.Key,
        VELOERA_MANAGED_RESOURCE_FIELD_IDS.Models,
      ]),
    )
  })

  it("loads the saved credential through cancellable Veloera detail reads", async () => {
    const signal = new AbortController().signal
    mocks.get
      .mockResolvedValueOnce(channel)
      .mockResolvedValueOnce({ ...channel, key: "saved-credential" })
    const workspace = await veloeraManagedResourceRegistration.open()
    const ref = (await workspace.list()).items[0]!.ref
    const editor = await workspace.openEditEditor(ref)

    await expect(
      editor.loadSecret?.(VELOERA_MANAGED_RESOURCE_FIELD_IDS.Key, { signal }),
    ).resolves.toBe("saved-credential")
    expect(mocks.get).toHaveBeenLastCalledWith(config, channel.id, { signal })
  })

  it("preserves latest Veloera-only fields and omits an unchanged masked key", async () => {
    const openedDetail = {
      ...channel,
      model_prefix: "opened-",
      system_prompt: "Opened policy",
    }
    const latestDetail = {
      ...openedDetail,
      model_prefix: "latest-",
      system_prompt: "Latest policy",
    }
    mocks.list.mockResolvedValue({ items: [openedDetail], total: 1 })
    mocks.get
      .mockResolvedValueOnce(openedDetail)
      .mockResolvedValueOnce(latestDetail)
    const workspace = await veloeraManagedResourceRegistration.open()
    const ref = (await workspace.list()).items[0]!.ref
    const editor = await workspace.openEditEditor(ref)

    await editor.submit({
      ...editor.initialValues,
      [VELOERA_MANAGED_RESOURCE_FIELD_IDS.Name]: "Renamed channel",
    })

    expect(mocks.update).toHaveBeenCalledWith(
      config,
      expect.objectContaining({
        id: channel.id,
        name: "Renamed channel",
        model_prefix: "latest-",
        system_prompt: "Latest policy",
      }),
      undefined,
    )
    expect(mocks.update.mock.calls.at(-1)?.[1]).not.toHaveProperty("key")
  })

  it("projects partial updates and preserves the saved key while returning rejections unchanged", async () => {
    const operations = await openVeloeraNativeResourceOperations()
    const draft = { ...createDraft(" Renamed channel "), key: channel.key }
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
    })

    await expect(operations.update(channel, draft)).resolves.toMatchObject({
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Partial,
      data: { name: "Renamed channel", key: channel.key },
    })
    expect(mocks.update.mock.calls[0][1]).not.toHaveProperty("key")

    mocks.update.mockResolvedValueOnce({
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Succeeded,
      data: { id: channel.id },
      confirmedEffects: [],
    })
    await expect(
      operations.update(channel, {
        ...draft,
        key: " replacement-credential ",
      }),
    ).resolves.toMatchObject({
      data: { key: "replacement-credential" },
    })
    expect(mocks.update.mock.calls[1][1]).toHaveProperty(
      "key",
      "replacement-credential",
    )

    const rejected = {
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Rejected,
      diagnostic: { message: "provider rejected" },
    } as const
    mocks.update.mockResolvedValueOnce(rejected)
    await expect(operations.update(channel, draft)).resolves.toBe(rejected)
  })

  it("attributes a confirmed create by complete inventory identity", async () => {
    const created = {
      ...channel,
      id: 18,
      name: "Created channel",
      model_prefix: null,
      system_prompt: null,
    }
    mocks.list
      .mockResolvedValueOnce({ items: [channel], total: 1 })
      .mockResolvedValueOnce({ items: [channel, created], total: 2 })
    const operations = await openVeloeraNativeResourceOperations()

    await expect(operations.create(createDraft(created.name))).resolves.toEqual(
      expect.objectContaining({
        outcome: MANAGED_SITE_MUTATION_OUTCOMES.Succeeded,
        data: expect.objectContaining({ id: 18 }),
      }),
    )
    expect(mocks.list).toHaveBeenCalledTimes(2)
    for (const [, options] of mocks.list.mock.calls) {
      expect(options).toEqual({ requireCompleteInventory: true })
    }
  })

  it("keeps a confirmed create non-replayable when identity is ambiguous", async () => {
    mocks.list
      .mockResolvedValueOnce({ items: [channel], total: 1 })
      .mockResolvedValueOnce({ items: [channel], total: 1 })
    const operations = await openVeloeraNativeResourceOperations()

    await expect(
      operations.create(createDraft("Ambiguous channel")),
    ).resolves.toMatchObject({
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Partial,
      completion: MANAGED_SITE_MUTATION_COMPLETIONS.Uncertain,
      diagnostic: {
        code: MANAGED_RESOURCE_FAILURE_CODES.MutationStateUncertain,
      },
    })
    expect(mocks.create).toHaveBeenCalledOnce()
  })

  it("removes unknown mutation data when creation is not confirmed", async () => {
    mocks.create.mockResolvedValueOnce({
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Partial,
      data: { id: 999 },
      confirmedEffects: [
        {
          kind: MANAGED_SITE_MUTATION_EFFECT_KINDS.ResourceCreated,
          resourceKind: "channel",
        },
      ],
      completion: MANAGED_SITE_MUTATION_COMPLETIONS.Rejected,
    })
    const operations = await openVeloeraNativeResourceOperations()

    await expect(
      operations.create(createDraft("Partial channel")),
    ).resolves.toEqual(expect.not.objectContaining({ data: expect.anything() }))

    const rejected = {
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Rejected,
      data: { id: 999 },
      diagnostic: { message: "provider rejected" },
    } as const
    mocks.create.mockResolvedValueOnce(rejected)
    await expect(
      operations.create(createDraft("Rejected channel")),
    ).resolves.toBe(rejected)
  })

  it("keeps a confirmed create uncertain when the follow-up inventory fails", async () => {
    mocks.list
      .mockResolvedValueOnce({ items: [channel], total: 1 })
      .mockRejectedValueOnce(new ApiError("inventory unavailable", 503))
    const operations = await openVeloeraNativeResourceOperations()

    await expect(
      operations.create(createDraft("Created channel")),
    ).resolves.toMatchObject({
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Partial,
      completion: MANAGED_SITE_MUTATION_COMPLETIONS.Uncertain,
    })
    expect(mocks.create).toHaveBeenCalledOnce()
  })

  it("serializes create attribution for one managed-site scope", async () => {
    let releaseFirstCreate: (() => void) | undefined
    mocks.list
      .mockResolvedValueOnce({ items: [channel], total: 1 })
      .mockResolvedValueOnce({ items: [channel], total: 1 })
      .mockResolvedValueOnce({ items: [channel], total: 1 })
      .mockResolvedValueOnce({ items: [channel], total: 1 })
    mocks.create
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            releaseFirstCreate = () =>
              resolve({
                outcome: MANAGED_SITE_MUTATION_OUTCOMES.Succeeded,
                data: undefined,
                confirmedEffects: [
                  {
                    kind: MANAGED_SITE_MUTATION_EFFECT_KINDS.ResourceCreated,
                    resourceKind: "channel",
                  },
                ],
              })
          }),
      )
      .mockResolvedValueOnce({
        outcome: MANAGED_SITE_MUTATION_OUTCOMES.Succeeded,
        data: undefined,
        confirmedEffects: [
          {
            kind: MANAGED_SITE_MUTATION_EFFECT_KINDS.ResourceCreated,
            resourceKind: "channel",
          },
        ],
      })
    const operations = await openVeloeraNativeResourceOperations()

    const first = operations.create(createDraft("First"))
    const second = operations.create(createDraft("Second"))
    await vi.waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1))
    releaseFirstCreate?.()
    await Promise.all([first, second])

    expect(mocks.create).toHaveBeenCalledTimes(2)
    expect(mocks.list).toHaveBeenCalledTimes(4)
  })

  it("releases create attribution after a provider rejection", async () => {
    mocks.create
      .mockRejectedValueOnce(new ApiError("create failed", 503))
      .mockResolvedValueOnce({
        outcome: MANAGED_SITE_MUTATION_OUTCOMES.Succeeded,
        data: undefined,
        confirmedEffects: [
          {
            kind: MANAGED_SITE_MUTATION_EFFECT_KINDS.ResourceCreated,
            resourceKind: "channel",
          },
        ],
      })
    const operations = await openVeloeraNativeResourceOperations()

    await expect(operations.create(createDraft("Rejected"))).rejects.toThrow(
      "create failed",
    )
    await expect(
      operations.create(createDraft("Retried")),
    ).resolves.toMatchObject({
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Partial,
    })
    expect(mocks.create).toHaveBeenCalledTimes(2)
  })

  it("forwards native auxiliary operations and degrades optional group lookup failures", async () => {
    const signal = new AbortController().signal
    mocks.fetchModels.mockResolvedValueOnce(["saved-model"])
    mocks.fetchDraftModels.mockResolvedValueOnce(["draft-model"])
    mocks.remove.mockResolvedValueOnce({
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Succeeded,
      data: undefined,
      confirmedEffects: [],
    })
    mocks.fetchSiteUserGroups.mockRejectedValueOnce(
      new ApiError("unavailable", 503),
    )
    const operations = await openVeloeraNativeResourceOperations()

    await expect(
      operations.fetchModels(channel.id, { signal }),
    ).resolves.toEqual(["saved-model"])
    await expect(
      operations.fetchDraftModels(
        {
          channelType: VeloeraChannelType.OpenAI,
          baseUrl: "https://upstream.example.invalid",
          credential: "credential-placeholder",
        },
        { signal },
      ),
    ).resolves.toEqual(["draft-model"])
    await operations.delete(channel.id, { signal })
    await expect(operations.loadEditorGroups({ signal })).resolves.toEqual([])

    expect(mocks.fetchModels).toHaveBeenCalledWith(config, channel.id, {
      signal,
    })
    expect(mocks.fetchDraftModels).toHaveBeenCalledWith(
      config,
      expect.objectContaining({ channelType: VeloeraChannelType.OpenAI }),
      { signal },
    )
    expect(mocks.remove).toHaveBeenCalledWith(config, channel.id, { signal })
  })

  it("rejects invalid resource locators before provider reads", async () => {
    const workspace = await veloeraManagedResourceRegistration.open()
    const ref = (await workspace.list()).items[0].ref
    mocks.get.mockClear()

    await expectFailureCode(
      workspace.openEditEditor({ ...ref, resourceId: "not-a-channel-id" }),
      MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed,
    )
    expect(mocks.get).not.toHaveBeenCalled()
  })

  it("routes public create and delete commands through native operations", async () => {
    const workspace = await veloeraManagedResourceRegistration.open()
    const ref = (await workspace.list()).items[0].ref
    const editor = await workspace.openCreateEditor({
      seed: {
        kind: MANAGED_RESOURCE_CREATE_SEED_KINDS.ManagedChannelImport,
        name: "Created channel",
        channelType: String(VeloeraChannelType.OpenAI),
        credential: "credential-placeholder",
        baseUrl: "https://upstream.example.invalid",
        enabled: true,
        models: ["model-a"],
        orderingWeight: 0,
        priority: 0,
        notes: "",
      },
    })

    await editor.submit({
      ...editor.initialValues,
      [VELOERA_MANAGED_RESOURCE_FIELD_IDS.Name]: "Created channel",
      [VELOERA_MANAGED_RESOURCE_FIELD_IDS.Key]: {
        kind: "replace",
        value: "credential-placeholder",
      },
      [VELOERA_MANAGED_RESOURCE_FIELD_IDS.Models]: ["model-a"],
    })
    await workspace.delete(ref)

    expect(mocks.create).toHaveBeenCalledOnce()
    expect(mocks.remove).toHaveBeenCalledWith(config, channel.id, undefined)
  })
})
