import type { Page } from "@playwright/test"

import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { LOGGING_SETTINGS_TARGET_IDS } from "~/features/BasicSettings/components/tabs/General/searchTargets"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  forceExtensionLanguage,
  installExtensionPageGuards,
  seedUserPreferences,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import { getServiceWorker } from "~~/e2e/utils/extensionState"

type MotionSample = {
  slot: "dialog-content" | "dialog-overlay"
  duration: number
  startTime: number | null
  opacity: number
  scaleX: number
  scaleY: number
  width: number
  height: number
}

/** Pause each native Dialog surface at the same fraction of its CSS fade. */
async function armMotionCapture(page: Page, phase: "open" | "closed") {
  await page.evaluate((phase) => {
    const targetWindow = window as typeof window & {
      __dialogMotionSamples?: MotionSample[]
    }
    const samples: MotionSample[] = []
    const animations: Animation[] = []
    const listener = (event: AnimationEvent) => {
      const element = event.target
      if (!(element instanceof HTMLElement)) return
      const slot = element.getAttribute("data-slot")
      if (slot !== "dialog-content" && slot !== "dialog-overlay") return
      if (element.dataset.state !== phase) return
      const animation = element
        .getAnimations()
        .find(
          (item) =>
            item instanceof CSSAnimation &&
            item.animationName === (phase === "open" ? "fadeIn" : "fadeOut"),
        )
      if (!animation || animations.includes(animation)) return
      animations.push(animation)
      const startTime =
        animation.startTime === null
          ? null
          : Number(animation.startTime) +
            Number(animation.effect!.getTiming().delay)
      animation.pause()
      const duration = Number(animation.effect!.getComputedTiming().duration)
      animation.currentTime = duration / 2
      const style = getComputedStyle(element)
      const bounds = element.getBoundingClientRect()
      samples.push({
        slot,
        duration,
        startTime,
        opacity: Number(style.opacity),
        scaleX: new DOMMatrixReadOnly(style.transform).m11,
        scaleY: new DOMMatrixReadOnly(style.transform).m22,
        width: bounds.width,
        height: bounds.height,
      })
      if (samples.length === 2) {
        document.removeEventListener("animationstart", listener, true)
        animations.forEach((item) => item.play())
        targetWindow.__dialogMotionSamples = samples
      }
    }
    targetWindow.__dialogMotionSamples = undefined
    document.addEventListener("animationstart", listener, true)
  }, phase)
}

async function readMotionSamples(page: Page) {
  await page.waitForFunction(
    () =>
      (window as typeof window & { __dialogMotionSamples?: MotionSample[] })
        .__dialogMotionSamples?.length === 2,
    undefined,
    { timeout: 2000 },
  )
  return page.evaluate(
    () =>
      (window as typeof window & { __dialogMotionSamples: MotionSample[] })
        .__dialogMotionSamples,
  )
}

test.beforeEach(async ({ context, page, extensionId }) => {
  installExtensionPageGuards(page)
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
  await seedUserPreferences(await getServiceWorker(context), {
    language: "en",
    refreshOnOpen: false,
    openChangelogOnUpdate: false,
  })
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}?tab=general&anchor=${LOGGING_SETTINGS_TARGET_IDS.history}#${MENU_ITEM_IDS.BASIC}`,
  )
  await expect(
    page.locator(`#${LOGGING_SETTINGS_TARGET_IDS.history}`),
  ).toBeVisible()
})

test("native Dialog fades its content and overlay together without zoom and restores focus", async ({
  page,
}) => {
  const trigger = page.locator(`#${LOGGING_SETTINGS_TARGET_IDS.history}`)
  await armMotionCapture(page, "open")
  await trigger.click()
  const dialog = page.getByRole("dialog", { name: "Recent logs" })
  const entrance = await readMotionSamples(page)
  expect(entrance.every((sample) => sample.startTime !== null)).toBe(true)
  expect(
    Math.abs(entrance[0]!.startTime! - entrance[1]!.startTime!),
  ).toBeLessThan(20)
  expect(entrance.map((sample) => sample.slot).sort()).toEqual([
    "dialog-content",
    "dialog-overlay",
  ])
  for (const sample of entrance) {
    expect(sample.duration).toBe(140)
    expect(sample.opacity).toBeGreaterThan(0)
    expect(sample.opacity).toBeLessThan(1)
    expect(sample.scaleX).toBeCloseTo(1)
    expect(sample.scaleY).toBeCloseTo(1)
  }
  expect(Math.abs(entrance[0]!.opacity - entrance[1]!.opacity)).toBeLessThan(
    0.05,
  )
  const contentMidpoint = entrance.find(
    (sample) => sample.slot === "dialog-content",
  )!
  await expect(dialog).toBeVisible()
  await expect(dialog).toHaveCSS("opacity", "1")
  const settledBounds = await dialog.boundingBox()
  expect(settledBounds).not.toBeNull()
  expect(settledBounds!.width).toBeCloseTo(contentMidpoint.width, 0)
  expect(settledBounds!.height).toBeCloseTo(contentMidpoint.height, 0)

  await armMotionCapture(page, "closed")
  await page.keyboard.press("Escape")
  const exit = await readMotionSamples(page)
  expect(exit.every((sample) => sample.startTime !== null)).toBe(true)
  expect(Math.abs(exit[0]!.startTime! - exit[1]!.startTime!)).toBeLessThan(20)
  expect(exit.map((sample) => sample.slot).sort()).toEqual([
    "dialog-content",
    "dialog-overlay",
  ])
  for (const sample of exit) {
    expect(sample.duration).toBe(120)
    expect(sample.opacity).toBeGreaterThan(0)
    expect(sample.opacity).toBeLessThan(1)
    expect(sample.scaleX).toBeCloseTo(1)
    expect(sample.scaleY).toBeCloseTo(1)
  }
  expect(Math.abs(exit[0]!.opacity - exit[1]!.opacity)).toBeLessThan(0.05)
  await expect(dialog).toHaveCount(0)
  await expect(trigger).toBeFocused()
})

test("native Dialog closes promptly with reduced motion and returns focus", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  const trigger = page.locator(`#${LOGGING_SETTINGS_TARGET_IDS.history}`)
  await trigger.click()
  const dialog = page.getByRole("dialog", { name: "Recent logs" })
  await expect(dialog).toBeVisible()
  const duration = await dialog.evaluate((element) =>
    parseFloat(getComputedStyle(element).animationDuration),
  )
  expect(duration).toBeLessThanOrEqual(0.001)
  await page.keyboard.press("Escape")
  await expect(dialog).toHaveCount(0)
  await expect(trigger).toBeFocused()
})
