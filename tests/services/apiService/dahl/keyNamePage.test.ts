import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { synchronizeDahlWebsiteKeyNames } from "~/services/apiService/dahl/keyNamePage"
import { server } from "~~/tests/msw/server"

const origin = "https://inference.dahl.global"
const userId = "00000000-0000-4000-8000-000000000001"
let stored: string
const storage = {
  getItem: vi.fn(() => stored),
  setItem: vi.fn((_key: string, value: string) => {
    stored = value
  }),
}
const command = {
  expectedUserId: userId,
  keyIds: [7],
  pendingLabels: { "7": "Work key" },
}

beforeEach(() => {
  stored = JSON.stringify({ "7": "Old name", "99": "Unrelated key" })
  vi.stubGlobal("location", { origin })
  vi.stubGlobal("localStorage", storage)
  server.use(
    http.get(`${origin}/v1/account`, () =>
      HttpResponse.json({ user: { user_id: userId, username: "test" } }),
    ),
    http.get(`${origin}/v1/account/keys`, () =>
      HttpResponse.json({ keys: [{ id: 7 }] }),
    ),
  )
})

describe("Dahl website naming bridge", () => {
  it.each([123, null, { name: "Invalid" }, "x".repeat(129)])(
    "rejects a malformed stored label instead of acknowledging an empty name: %j",
    async (label) => {
      stored = JSON.stringify({ "7": label, "99": "Unrelated key" })
      expect(
        await synchronizeDahlWebsiteKeyNames({ ...command, pendingLabels: {} }),
      ).toEqual({ success: false })
      expect(storage.setItem).not.toHaveBeenCalled()
    },
  )
  it("acknowledges an absent website label as a deliberate removal", async () => {
    stored = JSON.stringify({ "99": "Unrelated key" })
    expect(
      await synchronizeDahlWebsiteKeyNames({ ...command, pendingLabels: {} }),
    ).toEqual({ success: true, userId, labels: { "7": "" } })
  })
  it("updates only an owned key after fresh UUID verification and preserves other website names", async () => {
    expect(await synchronizeDahlWebsiteKeyNames(command)).toEqual({
      success: true,
      userId,
      labels: { "7": "Work key" },
    })
    expect(JSON.parse(stored)).toEqual({
      "7": "Work key",
      "99": "Unrelated key",
    })
  })
  it("rejects noncanonical IDs instead of writing names the website cannot use", async () => {
    expect(
      await synchronizeDahlWebsiteKeyNames({
        ...command,
        pendingLabels: { "07": "Invalid mapping" },
      }),
    ).toEqual({ success: false })
    expect(storage.setItem).not.toHaveBeenCalled()
  })
  it("never reads or writes names for another account", async () => {
    expect(
      await synchronizeDahlWebsiteKeyNames({
        ...command,
        expectedUserId: "another-account",
      }),
    ).toEqual({ success: false })
    expect(storage.getItem).not.toHaveBeenCalled()
    expect(storage.setItem).not.toHaveBeenCalled()
  })
  it("rejects unrelated origins, unowned keys and navigation during verification", async () => {
    vi.stubGlobal("location", { origin: "https://unrelated.example" })
    expect(await synchronizeDahlWebsiteKeyNames(command)).toEqual({
      success: false,
    })
    vi.stubGlobal("location", { origin })
    expect(
      await synchronizeDahlWebsiteKeyNames({
        ...command,
        keyIds: [99],
        pendingLabels: { "99": "Other" },
      }),
    ).toEqual({ success: false })
    server.use(
      http.get(`${origin}/v1/account/keys`, () => {
        vi.stubGlobal("location", { origin: "https://unrelated.example" })
        return HttpResponse.json({ keys: [{ id: 7 }] })
      }),
    )
    expect(await synchronizeDahlWebsiteKeyNames(command)).toEqual({
      success: false,
    })
    expect(storage.setItem).not.toHaveBeenCalled()
  })
  it("does not overwrite malformed website storage", async () => {
    stored = "invalid JSON"
    expect(await synchronizeDahlWebsiteKeyNames(command)).toEqual({
      success: false,
    })
    expect(stored).toBe("invalid JSON")
    expect(storage.setItem).not.toHaveBeenCalled()
  })
})
