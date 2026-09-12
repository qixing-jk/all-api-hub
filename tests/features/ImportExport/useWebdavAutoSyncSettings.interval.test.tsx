import { act, renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { useWebdavAutoSyncSettings } from "~/features/ImportExport/hooks/useWebdavAutoSyncSettings"
import { DEFAULT_PREFERENCES } from "~/services/preferences/userPreferences"

const context = vi.hoisted(() => ({
  preferences: {} as typeof DEFAULT_PREFERENCES,
  updateWebdavAutoSyncSettings: vi.fn(),
  loadPreferences: vi.fn(),
}))
vi.mock("~/contexts/UserPreferencesContext", () => ({
  useUserPreferencesContext: () => context,
}))
vi.mock("~/services/webdav/webdavAutoSyncMessaging", () => ({
  sendWebdavAutoSyncMessage: vi.fn().mockResolvedValue({ success: true }),
}))

describe("invalid stored cloud sync intervals", () => {
  it.each([
    ["webdav", 60],
    ["github_gist", 300],
  ] as const)(
    "repairs a nonfinite %s interval to its minimum",
    async (provider, minimum) => {
      context.preferences = {
        ...DEFAULT_PREFERENCES,
        webdav: {
          ...DEFAULT_PREFERENCES.webdav,
          provider,
          syncInterval: Number.NaN,
        },
      }
      context.updateWebdavAutoSyncSettings.mockResolvedValue({
        ok: true,
        preferences: context.preferences,
      })
      const { result } = renderHook(() => useWebdavAutoSyncSettings({}))
      await act(async () => result.current.saveInterval())
      expect(context.updateWebdavAutoSyncSettings).toHaveBeenLastCalledWith({
        syncInterval: minimum,
      })
    },
  )
})
