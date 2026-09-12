import { webcrypto } from "node:crypto"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  ManagedResourceError,
  type ManagedResourceRef,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import {
  deleteWithLinkedChannelCleanup,
  finishLinkedChannelCleanup,
  getLinkedChannelCleanupTasks,
  getPendingLinkedChannelCleanupTasks,
  prepareLinkedChannelCleanup,
  runLinkedChannelCleanup,
} from "~/services/managedSites/linkedChannelCleanup"

const mocks = vi.hoisted(() => ({
  stored: new Map<string, unknown>(),
  list: vi.fn(),
  openKeys: vi.fn(),
  removeChannel: vi.fn(),
  accounts: vi.fn(),
  tokens: vi.fn(),
  config: vi.fn(),
}))
vi.mock("@plasmohq/storage", () => ({
  Storage: class {
    async get(key: string) {
      return structuredClone(mocks.stored.get(key))
    }
    async set(key: string, value: unknown) {
      mocks.stored.set(key, structuredClone(value))
    }
  },
}))
vi.mock("~/services/accounts/accountStorage/accountQueries", () => ({
  accountQueries: { getAllAccounts: mocks.accounts },
}))
vi.mock("~/services/accounts/utils/apiServiceRequest", () => ({
  createAccountApiRequestFromStoredAccount: () => ({ request: {} }),
}))
vi.mock("~/services/apiAdapters/registry", () => ({
  getManagedSiteCapabilities: () => ({ config: { get: mocks.config } }),
  getSiteTypeCapabilities: () => ({
    account: { keyManagement: { fetchTokens: mocks.tokens } },
  }),
}))
vi.mock("~/services/managedSites/runtimeConfig", () => ({
  getCurrentManagedSiteType: async () => "new-api",
}))
vi.mock("~/services/apiAdapters/managedResources/registry", () => ({
  getManagedResourceRegistration: () => ({
    open: async () => ({
      list: mocks.list,
      openKeyCleanup: mocks.openKeys,
      delete: mocks.removeChannel,
    }),
  }),
}))

type Channel = {
  keys: string[]
  url: string
  fail?: boolean
  throwAfter?: boolean
}
let channels: Map<string, Channel>
const sourceUrl = "https://upstream.example/v1"
const ref = (id: string): ManagedResourceRef => ({
  siteType: SITE_TYPES.NEW_API,
  kind: "channel",
  scopeKey: "https://managed.example",
  resourceId: id,
})
const input = {
  source: { accountId: "account", tokenId: 7 },
  baseUrl: sourceUrl,
  key: "sk-target-secret",
}
const prepare = () => prepareLinkedChannelCleanup(input)

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal("crypto", webcrypto)
  mocks.stored.clear()
  channels = new Map([
    ["single", { keys: ["target-secret"], url: sourceUrl }],
    [
      "multi",
      {
        keys: ["retained", "sk-target-secret", "sk-target-secret"],
        url: sourceUrl,
      },
    ],
    ["unrelated", { keys: ["sk-target-secret"], url: "https://other.example" }],
  ])
  mocks.config.mockResolvedValue({ baseUrl: "https://managed.example" })
  mocks.accounts.mockResolvedValue([
    { id: "account", site_url: sourceUrl, site_type: SITE_TYPES.NEW_API },
  ])
  mocks.tokens.mockResolvedValue([])
  mocks.list.mockImplementation(async () => ({
    items: [...channels].map(([id, value]) => ({
      ref: ref(id),
      displayName: id,
      fields: [{ fieldId: "newApi.baseUrl", kind: "text", value: value.url }],
    })),
    total: channels.size,
  }))
  mocks.openKeys.mockImplementation(async (reference: ManagedResourceRef) => {
    const current = channels.get(reference.resourceId)
    if (!current) throw new ManagedResourceError({ code: "not_found" })
    return {
      baseUrls: [current.url],
      keys: [...current.keys],
      remove: async (indices: number[]) => {
        if (current.fail) throw new Error("offline")
        current.keys = current.keys.filter(
          (_, index) => !indices.includes(index),
        )
        if (current.throwAfter) throw new Error("response lost")
        return { outcome: "succeeded" }
      },
    }
  })
  mocks.removeChannel.mockImplementation(
    async (reference: ManagedResourceRef) => {
      const current = channels.get(reference.resourceId)!
      if (current.fail) throw new Error("offline")
      channels.delete(reference.resourceId)
      if (current.throwAfter) throw new Error("response lost")
      return { outcome: "succeeded" }
    },
  )
})

describe("linked channel cleanup", () => {
  it.each([false, true])(
    "accepts confirmed cleanup without a redundant read (multi-key: %s)",
    async (multiKey) => {
      channels = new Map([
        [
          "target",
          {
            keys: multiKey ? ["target-secret", "retained"] : ["target-secret"],
            url: sourceUrl,
          },
        ],
      ])
      const read = mocks.openKeys.getMockImplementation()!
      const removeChannel = mocks.removeChannel.getMockImplementation()!
      let confirmed = false
      mocks.openKeys.mockImplementation(
        async (reference: ManagedResourceRef) => {
          if (confirmed) throw new Error("readback unavailable")
          const current = await read(reference)
          const remove = current.remove
          current.remove = async (indices: number[]) => {
            const result = await remove(indices)
            confirmed = true
            return result
          }
          return current
        },
      )
      mocks.removeChannel.mockImplementation(
        async (reference: ManagedResourceRef) => {
          const result = await removeChannel(reference)
          confirmed = true
          return result
        },
      )
      await finishLinkedChannelCleanup(await prepare())
      expect(confirmed).toBe(true)
      expect(await getLinkedChannelCleanupTasks()).toEqual([])
      expect(mocks.openKeys).toHaveBeenCalledTimes(2)
    },
  )
  it("serializes cleanup of different source keys in the same channel", async () => {
    channels = new Map([
      [
        "multi",
        {
          keys: ["target-secret", "second-secret", "retained"],
          url: sourceUrl,
        },
      ],
    ])
    const first = await prepare()
    const second = await prepareLinkedChannelCleanup({
      ...input,
      key: "second-secret",
      source: { accountId: "account", tokenId: 8 },
    })
    await Promise.all([
      finishLinkedChannelCleanup(first),
      finishLinkedChannelCleanup(second),
    ])
    expect(channels.get("multi")?.keys).toEqual(["retained"])
    expect(await getLinkedChannelCleanupTasks()).toEqual([])
  })
  it("collects all matching channels and persists no plaintext credentials", async () => {
    const task = await prepare()
    expect(task?.targets.map((target) => target.ref.resourceId)).toEqual([
      "single",
      "multi",
    ])
    expect(JSON.stringify(await getLinkedChannelCleanupTasks())).not.toContain(
      "target-secret",
    )
    expect(mocks.removeChannel).not.toHaveBeenCalled()
  })
  it("deletes single-key channels, removes all duplicate matching entries and retains other channels", async () => {
    await finishLinkedChannelCleanup(await prepare())
    expect(channels.has("single")).toBe(false)
    expect(channels.get("multi")?.keys).toEqual(["retained"])
    expect(channels.get("unrelated")?.keys).toEqual(["sk-target-secret"])
    expect(await getLinkedChannelCleanupTasks()).toEqual([])
  })
  it.each([{ urls: [] }, { urls: ["https://primary.example", sourceUrl] }])(
    "reads matching credentials when summary endpoints are $urls",
    async ({ urls }) => {
      mocks.list.mockResolvedValue({
        items: [
          {
            ref: ref("multi"),
            displayName: "multi",
            keyCleanupBaseUrls: urls,
            fields: [
              {
                fieldId: "octopus.baseUrl",
                kind: "text",
                value: urls[0] ?? "",
              },
            ],
          },
        ],
        total: 1,
      })
      await finishLinkedChannelCleanup(await prepare())
      expect(channels.get("multi")?.keys).toEqual(["retained"])
      expect(await getLinkedChannelCleanupTasks()).toEqual([])
    },
  )
  it("keeps only failed targets and retries using durable fingerprints after source deletion", async () => {
    const task = await prepare()
    channels.get("multi")!.fail = true
    await finishLinkedChannelCleanup(task)
    const pending = await getLinkedChannelCleanupTasks()
    expect(pending[0].targets.map((target) => target.ref.resourceId)).toEqual([
      "multi",
    ])
    channels.get("multi")!.fail = false
    await runLinkedChannelCleanup(pending[0])
    expect(await getLinkedChannelCleanupTasks()).toEqual([])
    expect(mocks.removeChannel).toHaveBeenCalledTimes(1)
  })
  it("reconciles a lost delete/update response by readback without replay", async () => {
    channels.get("single")!.throwAfter = true
    channels.get("multi")!.throwAfter = true
    await finishLinkedChannelCleanup(await prepare())
    expect(await getLinkedChannelCleanupTasks()).toEqual([])
    expect(mocks.removeChannel).toHaveBeenCalledTimes(1)
  })
  it("does not clean channels if an interrupted source deletion is not confirmed", async () => {
    const task = (await prepare())!
    mocks.tokens.mockResolvedValue([{ id: 7 }])
    await runLinkedChannelCleanup(task)
    expect(mocks.removeChannel).not.toHaveBeenCalled()
    expect(channels.get("multi")?.keys).toHaveLength(3)
    mocks.tokens.mockResolvedValue([])
    await runLinkedChannelCleanup(task)
    expect(await getLinkedChannelCleanupTasks()).toEqual([])
  })
  it("preserves changed source URLs and replacement credentials", async () => {
    const task = await prepare()
    channels.get("single")!.url = "https://changed.example"
    channels.get("multi")!.keys = ["replacement"]
    await finishLinkedChannelCleanup(task)
    expect(mocks.removeChannel).not.toHaveBeenCalled()
    expect(channels.get("multi")?.keys).toEqual(["replacement"])
    expect((await getLinkedChannelCleanupTasks())[0].targets).toHaveLength(1)
  })
  it("does not delete a channel when another credential was added after inspection", async () => {
    const task = await prepare()
    channels.get("single")!.keys.push("new-key")
    await finishLinkedChannelCleanup(task)
    expect(channels.get("single")?.keys).toEqual(["new-key"])
    expect(mocks.removeChannel).not.toHaveBeenCalled()
  })
  it("fails preparation on incomplete or masked inventories before saving a deletion plan", async () => {
    mocks.list.mockResolvedValueOnce({ items: [], total: 4 })
    await expect(prepare()).rejects.toMatchObject({
      failure: { code: "unavailable" },
    })
    channels.get("multi")!.keys = ["sk-****"]
    await expect(prepare()).rejects.toMatchObject({
      failure: { code: "unavailable" },
    })
    expect(await getLinkedChannelCleanupTasks()).toEqual([])
  })
  it("does not scan or persist work without a configured managed site", async () => {
    mocks.config.mockResolvedValue(null)
    expect(await prepare()).toBeNull()
    expect(mocks.list).not.toHaveBeenCalled()
  })
})

describe("cleanup activity", () => {
  it("hides persisted work during source deletion and exposes only failed targets afterwards", async () => {
    let release!: () => void
    const source = new Promise<void>((resolve) => {
      release = resolve
    })
    const deleteSource = vi.fn(() => source)
    const operation = deleteWithLinkedChannelCleanup(input, deleteSource)
    await vi.waitFor(() => expect(deleteSource).toHaveBeenCalledOnce())
    expect(await getLinkedChannelCleanupTasks()).toHaveLength(1)
    expect(await getPendingLinkedChannelCleanupTasks()).toEqual([])
    channels.get("multi")!.fail = true
    release()
    await operation
    const pending = await getPendingLinkedChannelCleanupTasks()
    expect(pending).toHaveLength(1)
    expect(pending[0].targets.map((target) => target.ref.resourceId)).toEqual([
      "multi",
    ])
  })

  it("releases activity when source deletion fails without touching target channels", async () => {
    await expect(
      deleteWithLinkedChannelCleanup(input, async () => {
        throw new Error("source failed")
      }),
    ).rejects.toThrow("source failed")
    expect(await getPendingLinkedChannelCleanupTasks()).toHaveLength(1)
    expect(mocks.removeChannel).not.toHaveBeenCalled()
  })

  it("treats another context's live lock as active and recovers its work when the lock disappears", async () => {
    const task = await prepare()
    const query = vi.fn(async () => ({
      held: [{ name: `linked-channel-cleanup-active:${task!.id}` }],
      pending: [],
    }))
    vi.stubGlobal("navigator", { locks: { query } })
    try {
      expect(await getPendingLinkedChannelCleanupTasks()).toEqual([])
      query.mockResolvedValue({ held: [], pending: [] })
      expect(await getPendingLinkedChannelCleanupTasks()).toHaveLength(1)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
