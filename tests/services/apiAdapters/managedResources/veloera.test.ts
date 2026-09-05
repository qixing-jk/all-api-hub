import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  VELOERA_MANAGED_RESOURCE_FIELD_IDS,
  VeloeraChannelType,
} from "~/constants/veloera"
import { MANAGED_RESOURCE_KINDS } from "~/services/accountSiteDefinitions/contracts"
import { MANAGED_RESOURCE_FAILURE_CODES } from "~/services/apiAdapters/contracts/managedResourceNative"
import {
  openVeloeraNativeResourceOperations,
  veloeraManagedResourceRegistration,
} from "~/services/apiAdapters/managedResources/veloera"
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
})
