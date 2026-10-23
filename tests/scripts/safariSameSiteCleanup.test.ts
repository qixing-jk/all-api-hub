import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

// @ts-expect-error Native validation tooling is authored as executable JS.
import { cleanupOwnedFixtureUsers } from "~~/e2e/safariNativeCookie/sameSite.mjs"

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true })
})

const response = (status: number, body: unknown) => ({
  status: () => status,
  ok: () => status >= 200 && status < 300,
  json: vi.fn(async () => body),
})
const present = (username = "owned-fixture-a", role = 1) =>
  response(200, { success: true, data: { id: 7, username, role } })
const missing = () =>
  response(200, { success: false, message: "record not found" })
const fixture = (
  owned = [{ id: 7 as number | null, username: "owned-fixture-a" }],
) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "safari-owned-cleanup-"))
  roots.push(root)
  const journal = path.join(root, "owned-real-users.json")
  const save = vi.fn(() => fs.writeFileSync(journal, JSON.stringify(owned)))
  save()
  const admin = {
    get: vi.fn(),
    delete: vi.fn(async () => {}),
    dispose: vi.fn(async () => {}),
  }
  return { admin, owned, journal, save }
}

describe("same-site owned user cleanup", () => {
  it.each([
    [200, { success: false, message: "backend unavailable" }],
    [401, { success: false, message: "unauthorized" }],
    [403, { success: false, message: "record not found" }],
    [500, { success: false, message: "database unavailable" }],
  ])(
    "retains recovery data when the initial lookup is not confirmed (HTTP %s)",
    async (status, body) => {
      const state = fixture()
      state.admin.get.mockResolvedValue(response(status, body))
      await expect(cleanupOwnedFixtureUsers(state)).rejects.toThrow(
        "Owned fixture lookup not confirmed",
      )
      expect(JSON.parse(fs.readFileSync(state.journal, "utf8"))).toEqual(
        state.owned,
      )
      expect(state.admin.delete).not.toHaveBeenCalled()
      expect(state.admin.dispose).toHaveBeenCalledOnce()
    },
  )

  it.each([200, 403, 500])(
    "retains recovery data when post-delete verification fails (HTTP %s)",
    async (status) => {
      const state = fixture()
      state.admin.get.mockResolvedValueOnce(present()).mockResolvedValueOnce(
        response(status, {
          success: false,
          message: "verification unavailable",
        }),
      )
      await expect(cleanupOwnedFixtureUsers(state)).rejects.toThrow(
        "Owned fixture lookup not confirmed",
      )
      expect(fs.existsSync(state.journal)).toBe(true)
      expect(state.admin.delete).toHaveBeenCalledWith("/api/user/7")
      expect(state.admin.dispose).toHaveBeenCalledOnce()
    },
  )

  it.each([404, 200])(
    "accepts confirmed absence before deletion (HTTP %s)",
    async (status) => {
      const state = fixture()
      const absent = status === 404 ? response(404, undefined) : missing()
      state.admin.get.mockResolvedValue(absent)
      await cleanupOwnedFixtureUsers(state)
      expect(fs.existsSync(state.journal)).toBe(false)
      expect(state.admin.delete).not.toHaveBeenCalled()
      if (status === 404) expect(absent.json).not.toHaveBeenCalled()
      expect(state.admin.dispose).toHaveBeenCalledOnce()
    },
  )

  it.each([404, 200])(
    "removes the journal only after deletion is confirmed (HTTP %s)",
    async (status) => {
      const state = fixture()
      state.admin.get
        .mockResolvedValueOnce(present())
        .mockResolvedValueOnce(
          status === 404 ? response(404, undefined) : missing(),
        )
      await cleanupOwnedFixtureUsers(state)
      expect(fs.existsSync(state.journal)).toBe(false)
      expect(state.admin.delete).toHaveBeenCalledExactlyOnceWith("/api/user/7")
      expect(state.admin.dispose).toHaveBeenCalledOnce()
    },
  )

  it.each([
    ["another-user", 1],
    ["owned-fixture-a", 10],
  ] as const)(
    "retains the journal on an ownership mismatch (%s, role %s)",
    async (username, role) => {
      const state = fixture()
      state.admin.get.mockResolvedValue(present(username, role))
      await expect(cleanupOwnedFixtureUsers(state)).rejects.toThrow(
        "Owned fixture deletion scope mismatch",
      )
      expect(fs.existsSync(state.journal)).toBe(true)
      expect(state.admin.delete).not.toHaveBeenCalled()
      expect(state.admin.dispose).toHaveBeenCalledOnce()
    },
  )

  it("retains the complete journal when a later user cannot be verified", async () => {
    const state = fixture([
      { id: 7, username: "owned-fixture-a" },
      { id: 8, username: "owned-fixture-b" },
    ])
    state.admin.get
      .mockResolvedValueOnce(missing())
      .mockResolvedValueOnce(response(503, { success: false }))
    await expect(cleanupOwnedFixtureUsers(state)).rejects.toThrow()
    expect(JSON.parse(fs.readFileSync(state.journal, "utf8"))).toEqual(
      state.owned,
    )
    expect(state.admin.dispose).toHaveBeenCalledOnce()
  })

  it("rejects a lookup returning a different ID even if its username matches", async () => {
    const state = fixture()
    state.admin.get.mockResolvedValue(
      response(200, {
        success: true,
        data: { id: 8, username: "owned-fixture-a", role: 1 },
      }),
    )
    await expect(cleanupOwnedFixtureUsers(state)).rejects.toThrow(
      "Owned fixture lookup not confirmed",
    )
    expect(fs.existsSync(state.journal)).toBe(true)
    expect(state.admin.delete).not.toHaveBeenCalled()
    expect(state.admin.dispose).toHaveBeenCalledOnce()
  })

  it("does not claim deletion when the owned user remains present", async () => {
    const state = fixture()
    state.admin.get.mockResolvedValue(present())
    await expect(cleanupOwnedFixtureUsers(state)).rejects.toThrow(
      "Owned fixture deletion not confirmed",
    )
    expect(fs.existsSync(state.journal)).toBe(true)
    expect(state.admin.dispose).toHaveBeenCalledOnce()
  })

  it("verifies a successful recovery lookup before persisting a previously missing ID", async () => {
    const state = fixture([{ id: null, username: "owned-fixture-a" }])
    state.admin.get
      .mockResolvedValueOnce(
        response(200, {
          success: true,
          data: { items: [{ id: 7, username: "owned-fixture-a", role: 1 }] },
        }),
      )
      .mockResolvedValueOnce(present())
      .mockResolvedValueOnce(missing())
    await cleanupOwnedFixtureUsers(state)
    expect(state.owned[0]!.id).toBe(7)
    expect(state.save).toHaveBeenCalledTimes(2)
    expect(state.admin.delete).toHaveBeenCalledWith("/api/user/7")
    expect(fs.existsSync(state.journal)).toBe(false)
  })

  it("does not use an unsuccessful recovery lookup even when it contains a user-shaped body", async () => {
    const state = fixture([{ id: null, username: "owned-fixture-a" }])
    state.admin.get.mockResolvedValue(
      response(403, {
        success: false,
        data: [{ id: 7, username: "owned-fixture-a", role: 1 }],
      }),
    )
    await expect(cleanupOwnedFixtureUsers(state)).rejects.toThrow(
      "Owned fixture lookup not confirmed",
    )
    expect(state.owned[0]!.id).toBeNull()
    expect(fs.existsSync(state.journal)).toBe(true)
    expect(state.admin.delete).not.toHaveBeenCalled()
    expect(state.admin.dispose).toHaveBeenCalledOnce()
  })
})
