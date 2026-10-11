import { afterEach, expect, it, vi } from "vitest"

import { Storage } from "@plasmohq/storage"

import {
  readDahlKeyNames,
  removeDahlKeyName,
  saveDahlKeyName,
} from "~/services/apiAdapters/dahl/keyNames"
import { dahlKeyNameOwner } from "~/services/apiAdapters/dahl/keyNameValue"
import { STORAGE_KEYS } from "~/services/core/storageKeys"
import { AuthTypeEnum } from "~/types"

const request = {
  baseUrl: "https://inference.dahl.global",
  auth: { authType: AuthTypeEnum.Cookie, userId: "uuid-example" },
}
const owner = dahlKeyNameOwner(request)
afterEach(() => vi.restoreAllMocks())

it.each([
  null,
  [],
  { broken: null },
  { broken: { "7": { name: "Work", pending: true } } },
])("does not overwrite malformed persisted names: %j", async (value) => {
  const storage = new Storage({ area: "local" })
  await storage.set(STORAGE_KEYS.DAHL_KEY_NAMES, value)
  const write = vi.spyOn(browser.storage.local, "set")
  await expect(saveDahlKeyName(owner, 7, "Replacement")).rejects.toThrow(
    "Invalid Dahl key name storage",
  )
  expect(write).not.toHaveBeenCalled()
  expect(await storage.get(STORAGE_KEYS.DAHL_KEY_NAMES)).toEqual(value)
})

it("removes one name without deleting unrelated names or other account owners", async () => {
  const other = dahlKeyNameOwner({
    ...request,
    auth: { ...request.auth, userId: "other-uuid" },
  })
  await saveDahlKeyName(owner, 7, "Work")
  await saveDahlKeyName(owner, 8, "Home")
  await saveDahlKeyName(other, 7, "Other account")
  await removeDahlKeyName(owner, "7")
  expect(await readDahlKeyNames(owner)).toMatchObject({ "8": { name: "Home" } })
  expect((await readDahlKeyNames(owner))["7"]).toBeUndefined()
  await removeDahlKeyName(owner, "8")
  expect(await readDahlKeyNames(owner)).toEqual({})
  expect(await readDahlKeyNames(other)).toMatchObject({
    "7": { name: "Other account" },
  })
})

it("rejects an oversized local name before storage access", async () => {
  const read = vi.spyOn(browser.storage.local, "get")
  await expect(saveDahlKeyName(owner, 7, "x".repeat(129))).rejects.toThrow(
    "Invalid Dahl key name",
  )
  expect(read).not.toHaveBeenCalled()
})

it("separates browser-profile owners and rejects missing account bindings", () => {
  expect(
    dahlKeyNameOwner({
      ...request,
      fetchContext: {
        kind: "browser-context",
        incognito: true,
        cookieStoreId: "private",
      },
    }),
  ).not.toBe(owner)
  expect(
    dahlKeyNameOwner({
      ...request,
      fetchContext: { kind: "browser-context", cookieStoreId: "container" },
    }),
  ).not.toBe(owner)
  expect(() =>
    dahlKeyNameOwner({ ...request, baseUrl: "https://other.example" }),
  ).toThrow("bound console account")
  expect(() =>
    dahlKeyNameOwner({ ...request, auth: { ...request.auth, userId: " " } }),
  ).toThrow("bound console account")
})
