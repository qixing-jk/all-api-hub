import { webcrypto } from "node:crypto"
import { beforeEach, expect, it, vi } from "vitest"

import { doneHubManagedResourceRegistration } from "~/services/apiAdapters/managedResources/doneHub"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { extractDataFromApiResponseBody } from "~/services/apiTransport/response"
import {
  finishLinkedChannelCleanup,
  getLinkedChannelCleanupTasks,
  prepareLinkedChannelCleanup,
  runLinkedChannelCleanup,
} from "~/services/managedSites/linkedChannelCleanup"
import { buildManagedSiteChannel } from "~~/tests/test-utils/factories"

const mocks = vi.hoisted(() => ({
  stored: new Map<string, unknown>(),
  data: vi.fn(),
  list: vi.fn(),
  remove: vi.fn(),
}))
const config = {
  baseUrl: "https://donehub.example",
  adminToken: "test-admin",
  userId: "42",
}
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
vi.mock("~/services/preferences/userPreferences", () => ({
  userPreferences: { getPreferences: async () => ({ doneHub: config }) },
}))
vi.mock("~/services/apiAdapters/registry", () => ({
  getManagedSiteCapabilities: () => ({ config: { get: async () => config } }),
}))
vi.mock("~/services/managedSites/runtimeConfig", async (original) => ({
  ...(await original<typeof import("~/services/managedSites/runtimeConfig")>()),
  getCurrentManagedSiteType: async () => "done-hub",
}))
vi.mock("~/services/apiAdapters/managedResources/registry", () => ({
  getManagedResourceRegistration: () => doneHubManagedResourceRegistration,
}))
vi.mock("~/services/apiAdapters/managedResources/doneHubOperations", () => ({
  doneHubChannelOperations: { list: mocks.list, delete: mocks.remove },
  doneHubManagedResourceModels: {},
}))
vi.mock("~/services/apiAdapters/managedSites/doneHub", () => ({
  doneHubManagedSiteCapabilities: { queries: {} },
}))
vi.mock("~/services/apiService/doneHub/request", () => ({
  doneHubRequests: { data: mocks.data },
}))

const channel = buildManagedSiteChannel({
  id: 17,
  name: "Deleted channel",
  key: "test-source-key",
  base_url: "https://source.example",
})
let deleted: boolean
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal("crypto", webcrypto)
  mocks.stored.clear()
  deleted = false
  mocks.list.mockResolvedValue({ items: [channel], total: 1 })
  mocks.data.mockImplementation(async () => {
    if (deleted)
      return extractDataFromApiResponseBody(
        { success: false, message: "record not found" },
        "/api/channel/17",
      )
    return channel
  })
  mocks.remove.mockImplementation(async () => {
    deleted = true
    return {
      outcome: "succeeded",
      confirmedEffects: [
        { kind: "resource-deleted", resourceKind: "channel", resourceId: 17 },
      ],
    }
  })
})
const prepare = () =>
  prepareLinkedChannelCleanup({
    source: { accountId: "source", tokenId: 7 },
    baseUrl: "https://source.example",
    key: "test-source-key",
  })

it("clears pending cleanup after DoneHub deletes the channel and reports record not found with HTTP 200", async () => {
  await finishLinkedChannelCleanup(await prepare())
  expect(deleted).toBe(true)
  expect(await getLinkedChannelCleanupTasks()).toEqual([])
})

it("reconciles an already-deleted pending channel without repeating deletion", async () => {
  const task = await prepare()
  mocks.data.mockRejectedValueOnce(
    new ApiError(
      "offline",
      undefined,
      undefined,
      API_ERROR_CODES.NETWORK_ERROR,
    ),
  )
  await finishLinkedChannelCleanup(task)
  const [pending] = await getLinkedChannelCleanupTasks()
  expect(pending).toBeDefined()
  deleted = true
  await runLinkedChannelCleanup(pending)
  expect(mocks.remove).not.toHaveBeenCalled()
  expect(await getLinkedChannelCleanupTasks()).toEqual([])
})

it.each(["permission denied", "database connection failed"])(
  "retains pending cleanup for %s",
  async (message) => {
    const task = await prepare()
    mocks.data.mockRejectedValue(
      new ApiError(
        message,
        200,
        "/api/channel/17",
        API_ERROR_CODES.BUSINESS_ERROR,
      ),
    )
    await finishLinkedChannelCleanup(task)
    expect(await getLinkedChannelCleanupTasks()).toHaveLength(1)
    expect(mocks.remove).not.toHaveBeenCalled()
  },
)
