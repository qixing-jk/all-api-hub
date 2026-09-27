import { afterEach, expect, it, vi } from "vitest"

import { removeTabOwningWindow } from "~/utils/browser/ownedTabRemoval"

afterEach(() => vi.restoreAllMocks())

it("removes only the owned tab when another tab has joined its window", async () => {
  const query = vi.spyOn(browser.tabs, "query").mockResolvedValue([
    { id: 41, windowId: 7 },
    { id: 42, windowId: 7 },
  ] as browser.tabs.Tab[])
  const removeTab = vi.spyOn(browser.tabs, "remove").mockResolvedValue()
  const removeWindow = vi.spyOn(browser.windows, "remove").mockResolvedValue()

  await expect(removeTabOwningWindow(41, 7)).resolves.toBe("tab")

  expect(query).toHaveBeenCalledWith({ windowId: 7 })
  expect(removeTab).toHaveBeenCalledWith(41)
  expect(removeWindow).not.toHaveBeenCalled()
})

it("removes the owned tab when its window cannot be inspected", async () => {
  vi.spyOn(browser.tabs, "query").mockRejectedValue(new Error("window gone"))
  const removeTab = vi.spyOn(browser.tabs, "remove").mockResolvedValue()
  const removeWindow = vi.spyOn(browser.windows, "remove").mockResolvedValue()

  await expect(removeTabOwningWindow(41, 7)).resolves.toBe("tab")

  expect(removeTab).toHaveBeenCalledWith(41)
  expect(removeWindow).not.toHaveBeenCalled()
})

it("removes only the tab when it has no owned window handle", async () => {
  const query = vi.spyOn(browser.tabs, "query")
  const removeTab = vi.spyOn(browser.tabs, "remove").mockResolvedValue()

  await expect(removeTabOwningWindow(41, null)).resolves.toBe("tab")

  expect(removeTab).toHaveBeenCalledWith(41)
  expect(query).not.toHaveBeenCalled()
})

it("removes the window when it still contains only the owned tab", async () => {
  vi.spyOn(browser.tabs, "query").mockResolvedValue([
    { id: 41, windowId: 7 },
  ] as browser.tabs.Tab[])
  const removeTab = vi.spyOn(browser.tabs, "remove").mockResolvedValue()
  const removeWindow = vi.spyOn(browser.windows, "remove").mockResolvedValue()

  await expect(removeTabOwningWindow(41, 7)).resolves.toBe("window")

  expect(removeWindow).toHaveBeenCalledWith(7)
  expect(removeTab).not.toHaveBeenCalled()
})
