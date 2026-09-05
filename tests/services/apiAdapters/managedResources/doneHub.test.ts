import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  DONE_HUB_MANAGED_RESOURCE_FIELD_IDS,
  DoneHubChannelType,
} from "~/constants/doneHub"
import { SITE_TYPES } from "~/constants/siteType"
import { MANAGED_RESOURCE_KINDS } from "~/services/accountSiteDefinitions/contracts"
import {
  MANAGED_RESOURCE_CREATE_SEED_KINDS,
  MANAGED_RESOURCE_FAILURE_CODES,
  ManagedResourceError,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import {
  doneHubManagedResourceRegistration,
  openDoneHubNativeResourceOperations,
} from "~/services/apiAdapters/managedResources/doneHub"
import {
  MANAGED_SITE_MUTATION_EFFECT_KINDS,
  MANAGED_SITE_MUTATION_OUTCOMES,
} from "~/services/managedSites/mutations"
import { buildManagedSiteChannel } from "~~/tests/test-utils/factories"

const mocks = vi.hoisted(() => ({
  getPreferences: vi.fn(),
  list: vi.fn(),
  fetchChannelRaw: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  fetchModels: vi.fn(),
  fetchDraftModels: vi.fn(),
  fetchSiteUserGroups: vi.fn(),
  buildPayload: vi.fn(),
}))

vi.mock("~/services/preferences/userPreferences", () => ({
  userPreferences: { getPreferences: mocks.getPreferences },
}))

vi.mock("~/services/apiAdapters/managedSites/doneHub", () => ({
  doneHubManagedSiteCapabilities: {
    channels: {
      list: mocks.list,
      create: mocks.create,
      update: mocks.update,
      delete: mocks.remove,
      fetchModels: mocks.fetchModels,
      fetchDraftModels: mocks.fetchDraftModels,
    },
    channelDrafts: { buildPayload: mocks.buildPayload },
    queries: { fetchSiteUserGroups: mocks.fetchSiteUserGroups },
  },
}))

vi.mock("~/services/apiService/doneHub", async (original) => ({
  ...(await original<typeof import("~/services/apiService/doneHub")>()),
  fetchChannelRaw: mocks.fetchChannelRaw,
}))

const config = {
  baseUrl: "https://done-hub.example.invalid/",
  adminToken: "admin-token",
  userId: "42",
}

const channel = {
  ...buildManagedSiteChannel({
    id: 17,
    name: "Primary channel",
    type: DoneHubChannelType.GitHubModels,
    key: "",
    models: "model-a",
    group: "default,vip",
    priority: 4,
    weight: 5,
  }),
  proxy: "https://proxy.example.invalid",
  model_headers: '{"model-a":{"X-Example":"value"}}',
  cost_ratio: 0.5,
  future_field: { preserved: true },
}

const confirmed = (resourceId = channel.id) => ({
  outcome: MANAGED_SITE_MUTATION_OUTCOMES.Succeeded,
  data: undefined,
  confirmedEffects: [
    {
      kind: MANAGED_SITE_MUTATION_EFFECT_KINDS.ResourceUpdated,
      resourceKind: "channel" as const,
      resourceId,
    },
  ],
})

const expectFailureCode = async (promise: Promise<unknown>, code: string) => {
  const error = await promise.catch((failure) => failure)
  expect(error).toBeInstanceOf(ManagedResourceError)
  expect((error as ManagedResourceError).failure.code).toBe(code)
}

describe("DoneHub native managed resource", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.getPreferences.mockResolvedValue({ doneHub: config })
    mocks.list.mockResolvedValue({ items: [channel], total: 1 })
    mocks.fetchChannelRaw.mockResolvedValue({
      ...channel,
      key: "credential-placeholder",
    })
    mocks.update.mockResolvedValue(confirmed())
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

  it("projects DoneHub identity and provider-owned type facts without exposing secrets", async () => {
    const workspace = await doneHubManagedResourceRegistration.open()
    const page = await workspace.list()

    expect(page.items[0]).toEqual(
      expect.objectContaining({
        ref: {
          siteType: SITE_TYPES.DONE_HUB,
          kind: MANAGED_RESOURCE_KINDS.Channel,
          scopeKey: "https://done-hub.example.invalid",
          resourceId: "17",
        },
        displayName: "Primary channel",
      }),
    )
    expect(page.items[0].fields).toEqual(
      expect.arrayContaining([
        {
          fieldId: DONE_HUB_MANAGED_RESOURCE_FIELD_IDS.Type,
          kind: "text",
          value: String(DoneHubChannelType.GitHubModels),
        },
        {
          fieldId: DONE_HUB_MANAGED_RESOURCE_FIELD_IDS.Key,
          kind: "secret",
          state: "masked",
        },
      ]),
    )
    expect(JSON.stringify(page.items[0])).not.toContain(
      "credential-placeholder",
    )
  })

  it("uses a minimal payload when every changed field is safe for selective updates", async () => {
    const workspace = await doneHubManagedResourceRegistration.open()
    const ref = (await workspace.list()).items[0].ref
    const editor = await workspace.openEditEditor(ref)

    await editor.submit({
      ...editor.initialValues,
      [DONE_HUB_MANAGED_RESOURCE_FIELD_IDS.Name]: "Renamed channel",
    })

    expect(mocks.update).toHaveBeenCalledWith(
      config,
      { id: channel.id, name: "Renamed channel" },
      undefined,
    )
  })

  it("keeps the current tag in a selective type update", async () => {
    mocks.fetchChannelRaw.mockResolvedValue({
      ...channel,
      key: "credential-placeholder",
      tag: "linked-channels",
    })
    const workspace = await doneHubManagedResourceRegistration.open()
    const ref = (await workspace.list()).items[0].ref
    const editor = await workspace.openEditEditor(ref)

    await editor.submit({
      ...editor.initialValues,
      [DONE_HUB_MANAGED_RESOURCE_FIELD_IDS.Type]: String(
        DoneHubChannelType.OpenAI,
      ),
    })

    expect(mocks.update).toHaveBeenCalledWith(
      config,
      {
        id: channel.id,
        tag: "linked-channels",
        type: DoneHubChannelType.OpenAI,
      },
      undefined,
    )
  })

  it("falls back to a latest-detail full update for model changes and preserves native fields", async () => {
    const latest = {
      ...channel,
      key: "latest-credential",
      proxy: "https://latest-proxy.example.invalid",
      future_field: { version: 2 },
    }
    mocks.fetchChannelRaw
      .mockResolvedValueOnce({ ...channel, key: "opened-credential" })
      .mockResolvedValueOnce(latest)
    const workspace = await doneHubManagedResourceRegistration.open()
    const ref = (await workspace.list()).items[0].ref
    const editor = await workspace.openEditEditor(ref)

    await editor.submit({
      ...editor.initialValues,
      [DONE_HUB_MANAGED_RESOURCE_FIELD_IDS.Models]: ["model-a", "model-b"],
    })

    expect(mocks.update).toHaveBeenCalledWith(
      config,
      expect.objectContaining({
        id: channel.id,
        models: "model-a,model-b",
        key: "latest-credential",
        proxy: "https://latest-proxy.example.invalid",
        future_field: { version: 2 },
      }),
      undefined,
    )
  })

  it("uses a full update when clearing or zeroing a field cannot be applied selectively", async () => {
    const workspace = await doneHubManagedResourceRegistration.open()
    const ref = (await workspace.list()).items[0].ref
    const editor = await workspace.openEditEditor(ref)

    await editor.submit({
      ...editor.initialValues,
      [DONE_HUB_MANAGED_RESOURCE_FIELD_IDS.BaseUrl]: "",
      [DONE_HUB_MANAGED_RESOURCE_FIELD_IDS.Priority]: 0,
      [DONE_HUB_MANAGED_RESOURCE_FIELD_IDS.Weight]: 0,
    })

    expect(mocks.update).toHaveBeenCalledWith(
      config,
      expect.objectContaining({
        id: channel.id,
        base_url: "",
        priority: 0,
        weight: 0,
        models: "model-a",
        key: "credential-placeholder",
        future_field: { preserved: true },
      }),
      undefined,
    )
  })

  it("blocks a required full update when the latest credential is masked", async () => {
    mocks.fetchChannelRaw.mockResolvedValue({ ...channel, key: "sk-********" })
    const workspace = await doneHubManagedResourceRegistration.open()
    const ref = (await workspace.list()).items[0].ref
    const editor = await workspace.openEditEditor(ref)

    await expectFailureCode(
      editor.submit({
        ...editor.initialValues,
        [DONE_HUB_MANAGED_RESOURCE_FIELD_IDS.Models]: ["model-b"],
      }),
      MANAGED_RESOURCE_FAILURE_CODES.PermissionDenied,
    )
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it("can replace a credential with a minimal update", async () => {
    const workspace = await doneHubManagedResourceRegistration.open()
    const ref = (await workspace.list()).items[0].ref
    const editor = await workspace.openEditEditor(ref)

    await editor.submit({
      ...editor.initialValues,
      [DONE_HUB_MANAGED_RESOURCE_FIELD_IDS.Key]: {
        kind: "replace",
        value: "replacement-credential",
      },
    })

    expect(mocks.update).toHaveBeenCalledWith(
      config,
      { id: channel.id, key: "replacement-credential" },
      undefined,
    )
  })

  it("attributes create identity and routes delete through native operations", async () => {
    const created = { ...channel, id: 18, name: "Created channel" }
    mocks.list
      .mockResolvedValueOnce({ items: [channel], total: 1 })
      .mockResolvedValueOnce({ items: [channel, created], total: 2 })
      .mockResolvedValue({ items: [channel], total: 1 })
    const operations = await openDoneHubNativeResourceOperations()

    await expect(
      operations.create({
        name: created.name,
        type: DoneHubChannelType.OpenAI,
        key: "credential-placeholder",
        base_url: "https://upstream.example.invalid",
        models: ["model-a"],
        groups: ["default"],
        priority: 0,
        weight: 0,
        status: 1,
      }),
    ).resolves.toMatchObject({
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Succeeded,
      data: { id: 18 },
    })

    const workspace = await doneHubManagedResourceRegistration.open()
    const ref = (await workspace.list()).items[0].ref
    await workspace.delete(ref)
    expect(mocks.remove).toHaveBeenCalledWith(config, channel.id, undefined)
  })

  it("opens a create editor with DoneHub-owned field ids and types", async () => {
    const editor = await (
      await doneHubManagedResourceRegistration.open()
    ).openCreateEditor({
      seed: {
        kind: MANAGED_RESOURCE_CREATE_SEED_KINDS.ManagedChannelImport,
        name: "Imported channel",
        channelType: String(DoneHubChannelType.OpenAI),
        credential: "credential-placeholder",
        baseUrl: "https://upstream.example.invalid",
        enabled: true,
        models: ["model-a"],
        orderingWeight: 0,
        priority: 0,
        notes: "",
      },
    })

    expect(editor.fields.map(({ fieldId }) => fieldId)).toEqual(
      expect.arrayContaining([
        DONE_HUB_MANAGED_RESOURCE_FIELD_IDS.Name,
        DONE_HUB_MANAGED_RESOURCE_FIELD_IDS.Type,
        DONE_HUB_MANAGED_RESOURCE_FIELD_IDS.Key,
        DONE_HUB_MANAGED_RESOURCE_FIELD_IDS.Models,
      ]),
    )
  })

  it("keeps the saved credential out of editor state and loads it on demand", async () => {
    mocks.fetchChannelRaw
      .mockResolvedValueOnce({ ...channel, key: "saved-credential" })
      .mockResolvedValueOnce({ ...channel, key: "saved-credential" })
    const workspace = await doneHubManagedResourceRegistration.open()
    const ref = (await workspace.list()).items[0]!.ref
    const editor = await workspace.openEditEditor(ref)

    expect(
      editor.initialValues[DONE_HUB_MANAGED_RESOURCE_FIELD_IDS.Key],
    ).toEqual({ kind: "unchanged" })
    expect(JSON.stringify(editor.initialValues)).not.toContain(
      "saved-credential",
    )
    await expect(
      editor.loadSecret?.(DONE_HUB_MANAGED_RESOURCE_FIELD_IDS.Key),
    ).resolves.toBe("saved-credential")
  })

  it("does not expose a masked detail credential as a usable secret", async () => {
    mocks.fetchChannelRaw.mockResolvedValueOnce({
      ...channel,
      key: "sk-********",
    })
    const operations = await openDoneHubNativeResourceOperations()

    await expectFailureCode(
      operations.loadSecret(channel.id),
      MANAGED_RESOURCE_FAILURE_CODES.PermissionDenied,
    )
  })
})
