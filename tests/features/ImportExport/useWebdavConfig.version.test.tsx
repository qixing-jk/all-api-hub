import { act, renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { useWebdavConfig } from "~/features/ImportExport/hooks/useWebdavConfig"
import { DEFAULT_PREFERENCES } from "~/services/preferences/userPreferences"

const context = vi.hoisted(() => ({
  preferences: {} as typeof DEFAULT_PREFERENCES,
  updateWebdavSettings: vi.fn(),
  loadPreferences: vi.fn(),
}))
vi.mock("~/contexts/UserPreferencesContext", () => ({
  useUserPreferencesContext: () => context,
}))
vi.mock("~/services/webdav/webdavAutoSyncMessaging", () => ({
  sendWebdavAutoSyncMessage: vi.fn().mockResolvedValue({ success: true }),
}))

describe("cloud configuration save versions", () => {
  it("uses the completed field save version while the context snapshot is delayed", async () => {
    context.preferences = { ...DEFAULT_PREFERENCES, lastUpdated: 100 }
    context.updateWebdavSettings.mockResolvedValue({
      ok: true,
      preferences: { ...context.preferences, lastUpdated: 200 },
    })
    const { result, rerender } = renderHook(() => useWebdavConfig({}))
    await act(async () => {
      result.current.handleProviderChange("github_gist")
    })
    rerender()
    await act(async () => {
      await result.current.persistWebdavConfig({ username: "new-user" })
    })
    expect(context.updateWebdavSettings).toHaveBeenLastCalledWith(
      { username: "new-user" },
      { expectedLastUpdated: 200 },
    )
  })
})
