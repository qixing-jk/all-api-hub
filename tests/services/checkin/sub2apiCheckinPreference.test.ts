import { beforeEach, describe, expect, it, vi } from "vitest"

import { isSub2ApiCheckinEnabled } from "~/services/checkin/sub2apiCheckinPreference"

const { getPreferencesMock } = vi.hoisted(() => ({
  getPreferencesMock: vi.fn(),
}))

vi.mock("~/services/preferences/userPreferences", () => ({
  userPreferences: {
    getPreferences: (...args: unknown[]) => getPreferencesMock(...args),
  },
  DEFAULT_PREFERENCES: {
    autoCheckin: {
      sub2apiEnabled: false,
    },
  },
}))

describe("isSub2ApiCheckinEnabled", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("resolves true when the stored preference is enabled", async () => {
    getPreferencesMock.mockResolvedValue({
      autoCheckin: { sub2apiEnabled: true },
    })

    await expect(isSub2ApiCheckinEnabled()).resolves.toBe(true)
  })

  it("resolves false when the stored preference is disabled", async () => {
    getPreferencesMock.mockResolvedValue({
      autoCheckin: { sub2apiEnabled: false },
    })

    await expect(isSub2ApiCheckinEnabled()).resolves.toBe(false)
  })

  it("falls back to the default preference when autoCheckin is missing", async () => {
    getPreferencesMock.mockResolvedValue({})

    await expect(isSub2ApiCheckinEnabled()).resolves.toBe(false)
  })

  it("treats a storage read failure as disabled so no probe is ever sent", async () => {
    getPreferencesMock.mockRejectedValue(new Error("storage unavailable"))

    await expect(isSub2ApiCheckinEnabled()).resolves.toBe(false)
  })
})
