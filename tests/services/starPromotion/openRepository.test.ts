import { beforeEach, expect, it, vi } from "vitest"

import { openStarPromotionRepository } from "~/services/starPromotion/openRepository"

const mocks = vi.hoisted(() => ({ createTab: vi.fn(), defer: vi.fn() }))
vi.mock("~/utils/browser/tabs", () => ({ createTab: mocks.createTab }))
vi.mock("~/services/starPromotion/state", () => ({
  starPromotionState: { deferThresholdPrompt: mocks.defer },
}))

beforeEach(() => {
  mocks.createTab.mockReset().mockResolvedValue(undefined)
  mocks.defer.mockReset().mockResolvedValue(undefined)
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
