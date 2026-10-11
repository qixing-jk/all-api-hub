import { expect, it, vi } from "vitest"

import {
  readDahlKeyNames,
  saveDahlKeyName,
} from "~/services/apiAdapters/dahl/keyNames"
import { syncDahlKeyNames } from "~/services/apiAdapters/dahl/keyNameSync"
import { dahlKeyNameOwner } from "~/services/apiAdapters/dahl/keyNameValue"
import { AuthTypeEnum } from "~/types"

const request = {
  baseUrl: "https://inference.dahl.global",
  auth: {
    authType: AuthTypeEnum.Cookie,
    userId: "00000000-0000-4000-8000-000000000001",
  },
}
const owner = dahlKeyNameOwner(request)

it("orders website writes while a newer local rename remains immediately writable", async () => {
  await saveDahlKeyName(owner, 7, "First")
  vi.spyOn(browser.tabs, "query").mockResolvedValue([
    { id: 7, incognito: false } as browser.tabs.Tab,
  ])
  let acknowledge!: (value: unknown) => void
  let started!: () => void
  const ready = new Promise<void>((resolve) => {
    started = resolve
  })
  const send = vi
    .spyOn(browser.tabs, "sendMessage")
    .mockImplementationOnce(() => {
      started()
      return new Promise((resolve) => {
        acknowledge = resolve
      })
    })
    .mockImplementationOnce(
      async (_id, message: { pendingLabels: Record<string, string> }) => ({
        success: true,
        userId: request.auth.userId,
        labels: message.pendingLabels,
      }),
    )
  const first = syncDahlKeyNames(request, [7])
  await ready
  await saveDahlKeyName(owner, 7, "Second")
  const second = syncDahlKeyNames(request, [7])
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(send).toHaveBeenCalledTimes(1)
  acknowledge({
    success: true,
    userId: request.auth.userId,
    labels: { "7": "First" },
  })
  await first
  expect((await second).names["7"]).toMatchObject({
    name: "Second",
    pending: false,
  })
  expect(send.mock.calls[1]?.[1]).toMatchObject({
    pendingLabels: { "7": "Second" },
  })
})

it("retains a pending name when the website acknowledgement omits the key", async () => {
  await saveDahlKeyName(owner, 7, "Unsynced")
  vi.spyOn(browser.tabs, "query").mockResolvedValue([
    { id: 7, incognito: false } as browser.tabs.Tab,
  ])
  vi.spyOn(browser.tabs, "sendMessage").mockResolvedValue({
    success: true,
    userId: request.auth.userId,
    labels: {},
  })
  expect(await syncDahlKeyNames(request, [7])).toMatchObject({
    connected: false,
    names: { "7": { name: "Unsynced", pending: true } },
  })
})

it("retains a newer local rename when an older website acknowledgement arrives", async () => {
  await saveDahlKeyName(owner, 7, "Old draft")
  vi.spyOn(browser.tabs, "query").mockResolvedValue([
    { id: 7, incognito: false } as browser.tabs.Tab,
  ])
  let acknowledge!: (value: unknown) => void
  let started!: () => void
  const ready = new Promise<void>((resolve) => {
    started = resolve
  })
  vi.spyOn(browser.tabs, "sendMessage").mockImplementation(() => {
    started()
    return new Promise((resolve) => {
      acknowledge = resolve
    })
  })
  const syncing = syncDahlKeyNames(request, [7])
  await ready
  await saveDahlKeyName(owner, 7, "New draft")
  acknowledge({
    success: true,
    userId: request.auth.userId,
    labels: { "7": "Old draft" },
  })
  expect((await syncing).names["7"]).toMatchObject({
    name: "New draft",
    pending: true,
  })
  expect((await readDahlKeyNames(owner))["7"]).toMatchObject({
    name: "New draft",
    pending: true,
  })
})

it("preserves concurrent names and does not write over a failed storage read", async () => {
  await Promise.all([
    saveDahlKeyName(owner, 7, "Work"),
    saveDahlKeyName(owner, 8, "Home"),
  ])
  expect(await readDahlKeyNames(owner)).toMatchObject({
    "7": { name: "Work" },
    "8": { name: "Home" },
  })
  vi.spyOn(browser.storage.local, "get").mockRejectedValue(
    new Error("Unavailable storage"),
  )
  const write = vi.spyOn(browser.storage.local, "set")
  await expect(saveDahlKeyName(owner, 9, "Unsaved")).rejects.toThrow(
    "Unavailable storage",
  )
  expect(write).not.toHaveBeenCalled()
})
