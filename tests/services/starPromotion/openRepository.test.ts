import { beforeEach, expect, it, vi } from "vitest"

import { openStarPromotionRepository } from "~/services/starPromotion/openRepository"

const mocks = vi.hoisted(() => ({
  createTab: vi.fn(),
  defer: vi.fn(),
  popup: false,
  send: vi.fn(),
}))
vi.mock("~/utils/browser", () => ({ isExtensionPopup: () => mocks.popup }))
vi.mock("~/utils/browser/runtimeMessages", () => ({
  sendRuntimeActionMessage: mocks.send,
}))
vi.mock("~/utils/browser/tabs", () => ({ createTab: mocks.createTab }))
vi.mock("~/services/starPromotion/state", () => ({
  starPromotionState: { deferThresholdPrompt: mocks.defer },
}))

beforeEach(() => {
  mocks.popup = false
  mocks.send.mockReset().mockResolvedValue({ success: true })
  mocks.createTab.mockReset().mockResolvedValue(undefined)
  mocks.defer.mockReset().mockResolvedValue(undefined)
})

it("delegates popup handoffs to the background without opening a local tab", async () => {
  mocks.popup = true
  expect(await openStarPromotionRepository()).toBe(true)
  expect(mocks.send).toHaveBeenCalledWith({
    action: "starPromotionOpenRepository",
  })
  expect(mocks.createTab).not.toHaveBeenCalled()
  expect(mocks.defer).not.toHaveBeenCalled()
})

it("opens one tab and defers once while concurrent requests are pending", async () => {
  let finish!: () => void
  mocks.createTab.mockReturnValue(
    new Promise<void>((resolve) => {
      finish = resolve
    }),
  )
  const first = openStarPromotionRepository()
  const second = openStarPromotionRepository()
  finish()
  expect(await Promise.all([first, second])).toEqual([true, true])
  expect(mocks.createTab).toHaveBeenCalledTimes(1)
  expect(mocks.defer).toHaveBeenCalledTimes(1)
})

it("retains the popup invitation when the background handoff fails", async () => {
  mocks.popup = true
  mocks.send
    .mockResolvedValueOnce({ success: false })
    .mockRejectedValueOnce(new Error("worker unavailable"))
  expect(await openStarPromotionRepository()).toBe(false)
  expect(await openStarPromotionRepository()).toBe(false)
  expect(mocks.createTab).not.toHaveBeenCalled()
})

it("allows retry after a failed tab open without deferring the failed attempt", async () => {
  mocks.createTab.mockRejectedValueOnce(new Error("tab failed"))
  expect(await openStarPromotionRepository()).toBe(false)
  expect(mocks.defer).not.toHaveBeenCalled()
  expect(await openStarPromotionRepository()).toBe(true)
  expect(mocks.createTab).toHaveBeenCalledTimes(2)
  expect(mocks.defer).toHaveBeenCalledTimes(1)
})

it("reports a successful handoff even if saving the deferral fails", async () => {
  mocks.defer.mockRejectedValueOnce(new Error("storage failed"))
  expect(await openStarPromotionRepository()).toBe(true)
  expect(await openStarPromotionRepository()).toBe(true)
  expect(mocks.createTab).toHaveBeenCalledTimes(2)
})
