import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

// @ts-expect-error Native validation tooling is authored as executable JS.
import { prepareSameSite } from "~~/e2e/safariNativeCookie/sameSite.mjs"

const bridge = vi.hoisted(() => ({ newContext: vi.fn() }))
vi.mock("@playwright/test", () => ({
  request: { newContext: bridge.newContext },
}))
vi.mock("~~/scripts/utils/local-env.mjs", () => ({ loadLocalEnv: vi.fn() }))

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true })
  vi.unstubAllEnvs()
  vi.resetAllMocks()
})

const fixture = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "safari-preparation-"))
  roots.push(root)
  const journal = path.join(root, "owned-real-users.json")
  vi.stubEnv("AAH_E2E_DONE_HUB_BASE_URL", "https://fixture.example.invalid")
  const admin = {
    get: vi.fn().mockResolvedValue({
      json: async () => ({ success: true, data: { role: 10 } }),
    }),
    post: vi.fn().mockResolvedValue({
      ok: () => true,
      json: async () => ({ success: true }),
    }),
    dispose: vi.fn().mockResolvedValue(undefined),
  }
  const preparationError = new Error("synthetic fixture login failure")
  const account = {
    post: vi.fn().mockRejectedValue(preparationError),
    dispose: vi.fn().mockResolvedValue(undefined),
  }
  bridge.newContext.mockResolvedValueOnce(admin).mockResolvedValueOnce(account)
  return { journal, admin, account, preparationError }
}

describe("same-site fixture preparation failures", () => {
  it("retains both preparation and cleanup errors without deleting the recovery journal", async () => {
    const state = fixture()
    const cleanupError = new Error("synthetic cleanup lookup failure")
    // First read is the admin self check; the second is cleanup's owned-user lookup.
    state.admin.get
      .mockReset()
      .mockResolvedValueOnce({
        json: async () => ({ success: true, data: { role: 10 } }),
      })
      .mockRejectedValueOnce(cleanupError)
    const result = await prepareSameSite({ journal: state.journal }).catch(
      (error: unknown) => error,
    )
    expect(result).toBeInstanceOf(AggregateError)
    expect((result as AggregateError).errors).toEqual([
      state.preparationError,
      cleanupError,
    ])
    expect((result as Error).cause).toBe(state.preparationError)
    expect((result as Error).message).toBe(
      "Fixture preparation and cleanup failed",
    )
    expect(fs.existsSync(state.journal)).toBe(true)
    expect(state.admin.dispose).toHaveBeenCalledOnce()
    expect(state.account.dispose).toHaveBeenCalledOnce()
  })

  it("rethrows the original preparation error when owned-user cleanup succeeds", async () => {
    const state = fixture()
    state.admin.get.mockImplementation(async (url: string) =>
      url === "/api/user/self"
        ? { json: async () => ({ success: true, data: { role: 10 } }) }
        : url === "/api/user/"
          ? {
              ok: () => true,
              json: async () => ({
                success: true,
                data: [
                  {
                    id: 7,
                    username: state.admin.post.mock.calls[0]![1].data.username,
                    role: 1,
                  },
                ],
              }),
            }
          : { status: () => 404 },
    )
    await expect(prepareSameSite({ journal: state.journal })).rejects.toBe(
      state.preparationError,
    )
    expect(fs.existsSync(state.journal)).toBe(false)
    expect(state.admin.dispose).toHaveBeenCalledOnce()
    expect(state.account.dispose).toHaveBeenCalledOnce()
  })

  it("keeps the normal failure path when preparation owns no fixtures", async () => {
    const state = fixture()
    state.admin.get.mockRejectedValueOnce(state.preparationError)
    await expect(prepareSameSite({ journal: state.journal })).rejects.toBe(
      state.preparationError,
    )
    expect(state.admin.post).not.toHaveBeenCalled()
    expect(state.admin.dispose).toHaveBeenCalledOnce()
    expect(fs.existsSync(state.journal)).toBe(false)
  })
})
