import { beforeEach, describe, expect, it, vi } from "vitest"

import { PreferencesMessageTypes } from "~/services/preferences/messaging"

const mocks = vi.hoisted(() => ({
  applyActionClickBehavior: vi.fn(),
  setupContextMenus: vi.fn(),
  handlers: new Map<string, (message: { data: unknown }) => Promise<unknown>>(),
}))

vi.mock("~/entrypoints/background/actionClickBehavior", () => ({
  applyActionClickBehavior: mocks.applyActionClickBehavior,
}))

vi.mock("~/entrypoints/background/contextMenus", () => ({
  setupContextMenus: mocks.setupContextMenus,
}))

vi.mock("~/services/preferences/messaging", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/services/preferences/messaging")>()

  return {
    ...actual,
    onPreferencesMessage: vi.fn((type, handler) => {
      mocks.handlers.set(type, handler)
      return vi.fn()
    }),
  }
})

describe("runtime preference messaging", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mocks.handlers.clear()
    mocks.setupContextMenus.mockResolvedValue(undefined)
  })

  async function importService() {
    return await import("~/services/preferences/runtimePreferencesService")
  }

  it("registers preference side-effect listeners once", async () => {
    const { setupPreferencesMessagingListeners } = await importService()

    setupPreferencesMessagingListeners()
    setupPreferencesMessagingListeners()

    expect(mocks.handlers.size).toBe(2)
    expect(
      mocks.handlers.has(PreferencesMessageTypes.UpdateActionClickBehavior),
    ).toBe(true)
    expect(
      mocks.handlers.has(PreferencesMessageTypes.RefreshContextMenus),
    ).toBe(true)
  })

  it("applies action click behavior updates through the listener", async () => {
    const { setupPreferencesMessagingListeners } = await importService()

    setupPreferencesMessagingListeners()
    const handler = mocks.handlers.get(
      PreferencesMessageTypes.UpdateActionClickBehavior,
    )

    await expect(
      handler?.({ data: { behavior: "sidepanel" } }),
    ).resolves.toEqual({
      success: true,
      data: undefined,
    })
    expect(mocks.applyActionClickBehavior).toHaveBeenCalledWith("sidepanel")

    mocks.applyActionClickBehavior.mockImplementationOnce(() => {
      throw new Error("action failed")
    })

    await expect(handler?.({ data: { behavior: "popup" } })).resolves.toEqual({
      success: false,
      error: "action failed",
    })
  })

  it("refreshes context menus through the listener", async () => {
    const { setupPreferencesMessagingListeners } = await importService()

    setupPreferencesMessagingListeners()
    const handler = mocks.handlers.get(
      PreferencesMessageTypes.RefreshContextMenus,
    )

    await expect(handler?.({ data: undefined })).resolves.toEqual({
      success: true,
      data: undefined,
    })
    expect(mocks.setupContextMenus).toHaveBeenCalledTimes(1)

    mocks.setupContextMenus.mockRejectedValueOnce(new Error("menu failed"))

    await expect(handler?.({ data: undefined })).resolves.toEqual({
      success: false,
      error: "menu failed",
    })
  })
})
