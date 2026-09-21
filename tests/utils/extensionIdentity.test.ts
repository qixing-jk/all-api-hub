import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  EMPTY_DEV_IDENTITY,
  getDevIdentityColor,
  getDevIdentityColorIndex,
} from "~/utils/core/devIdentity"
import {
  buildBakedDevIdentity,
  DEV_IDENTITY_FIXTURE_PATH,
} from "~~/tests/test-utils/devIdentityFixtures"

const { getRuntimeIdMock } = vi.hoisted(() => ({ getRuntimeIdMock: vi.fn() }))

vi.mock("~/utils/browser/browserApi", () => ({
  getRuntimeId: (...args: unknown[]) => getRuntimeIdMock(...args),
}))

const RUNTIME_ID = "abcdefghijklmnopabcdefghijklmnop"
const BAKED_IDENTITY = buildBakedDevIdentity()

async function importFreshIdentity() {
  vi.resetModules()
  return await import("~/utils/browser/extensionIdentity")
}

describe("getDevIdentity", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv("MODE", "development")
    getRuntimeIdMock.mockReturnValue(RUNTIME_ID)
    ;(globalThis as any).__AAH_DEV_IDENTITY__ = null
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    delete (globalThis as any).__AAH_DEV_IDENTITY__
  })

  it("reports nothing outside development mode", async () => {
    vi.stubEnv("MODE", "production")
    const { getDevIdentity } = await importFreshIdentity()

    expect(getDevIdentity()).toEqual(EMPTY_DEV_IDENTITY)
    expect(getRuntimeIdMock).not.toHaveBeenCalled()
  })

  it("reads the baked build identity", async () => {
    ;(globalThis as any).__AAH_DEV_IDENTITY__ = BAKED_IDENTITY
    const { getDevIdentity } = await importFreshIdentity()

    const identity = getDevIdentity()

    expect(identity).toMatchObject({
      path: DEV_IDENTITY_FIXTURE_PATH,
      pathTail: "C:…\\all-api-hub\\temp",
      outputPath: BAKED_IDENTITY.outputPath,
      badgeText: "TEM",
      builtAt: BAKED_IDENTITY.builtAt,
      browserTarget: "chrome",
      source: "build",
    })
    expect(identity.color).toBe(
      getDevIdentityColor(getDevIdentityColorIndex(DEV_IDENTITY_FIXTURE_PATH)),
    )
  })

  it("falls back to the extension id when the build baked no path", async () => {
    const { getDevIdentity } = await importFreshIdentity()

    const identity = getDevIdentity()

    expect(identity.path).toBeNull()
    expect(identity.pathTail).toBeNull()
    expect(identity.outputPath).toBeNull()
    expect(identity.source).toBe("runtime-id")
    expect(identity.colorIndex).toBe(getDevIdentityColorIndex(RUNTIME_ID))
    // No path means no directory letters, so the code can only come from the seed.
    expect(identity.badgeText).toMatch(/^[A-Z]{3}$/)
  })

  it("ignores a baked identity without a usable path", async () => {
    ;(globalThis as any).__AAH_DEV_IDENTITY__ = {
      ...BAKED_IDENTITY,
      projectPath: "   ",
    }
    const { getDevIdentity } = await importFreshIdentity()

    expect(getDevIdentity().source).toBe("runtime-id")
  })

  it("has no identity at all without a path or a runtime id", async () => {
    getRuntimeIdMock.mockReturnValue(undefined)
    const { getDevIdentity } = await importFreshIdentity()

    const identity = getDevIdentity()

    expect(identity.source).toBe("none")
    expect(identity.badgeText).toBe("DEV")
    expect(identity.color).toBe(getDevIdentityColor(0))
  })

  it("computes the identity once per load", async () => {
    const { getDevIdentity } = await importFreshIdentity()

    const first = getDevIdentity()
    const second = getDevIdentity()

    expect(second).toBe(first)
    expect(getRuntimeIdMock).toHaveBeenCalledTimes(1)
  })
})
