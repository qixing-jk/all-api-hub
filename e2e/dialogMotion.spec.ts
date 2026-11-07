import type { Page } from "@playwright/test"

import {
  ACCOUNT_MANAGEMENT_TEST_IDS,
  getAccountManagementListItemTestId,
} from "~/features/AccountManagement/testIds"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  createStoredAccount,
  forceExtensionLanguage,
  installExtensionPageGuards,
  seedStoredAccounts,
  seedUserPreferences,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import { getServiceWorker } from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"

const ACCOUNT_ID = "dialog-motion-account"

/** Samples the early entrance and midpoint exit in the actual account editor. */
async function sampleFade(page: Page, phase: "open" | "closed") {
  return page.evaluate(
    async ({ phase, editId }) => {
      const samples: {
        slot: string
        duration: number
        startTime: number | null
        opacity: number
        scaleX: number
        scaleY: number
      }[] = []
      await new Promise<void>((resolve, reject) => {
        const captured = new Set<Element>()
        const animations: Animation[] = []
        const timeout = window.setTimeout(() => {
          cleanup()
          reject(new Error(`Missing ${phase} fade: ${JSON.stringify(samples)}`))
        }, 2000)
        const cleanup = () => {
          clearTimeout(timeout)
          document.removeEventListener("animationstart", capture, true)
          animations.forEach((animation) => {
            animation.play()
            // Release sampled effects after playback: older Chrome otherwise
            // keeps the filled entrance animation above the subsequent exit.
            void animation.finished.then(
              () => animation.cancel(),
              () => {},
            )
          })
        }
        const capture = (event: AnimationEvent) => {
          const element = event.target
          if (!(element instanceof HTMLElement) || captured.has(element)) return
          const slot = element.getAttribute("data-slot")
          if (slot !== "modal-content" && slot !== "modal-overlay") return
          if (element.dataset.state !== phase) return
          const animation = element
            .getAnimations()
            .find(
              (item) =>
                item instanceof CSSAnimation &&
                item.animationName === event.animationName,
            )
          if (!animation) return
          captured.add(element)
          animations.push(animation)
          const startTime =
            animation.startTime === null
              ? null
              : Number(animation.startTime) +
                Number(animation.effect!.getTiming().delay)
          animation.pause()
          const duration = Number(
            animation.effect!.getComputedTiming().duration,
          )
          animation.currentTime = phase === "open" ? duration / 4 : duration / 2
          const style = getComputedStyle(element)
          samples.push({
            slot,
            duration,
            startTime,
            opacity: Number(style.opacity),
            scaleX: new DOMMatrixReadOnly(style.transform).m11,
            scaleY: new DOMMatrixReadOnly(style.transform).m22,
          })
          if (samples.length === 2) {
            cleanup()
            resolve()
          }
        }
        document.addEventListener("animationstart", capture, true)
        if (phase === "open") {
          const trigger = document.querySelector<HTMLButtonElement>(
            `[data-testid="${editId}"]`,
          )!
          trigger.focus()
          trigger.click()
        } else {
          document
            .querySelector<HTMLButtonElement>(
              '[role="dialog"] button[aria-label="关闭"]',
            )!
            .click()
        }
      })
      return samples
    },
    { phase, editId: ACCOUNT_MANAGEMENT_TEST_IDS.rowEditButton },
  )
}

type NaturalAnimationCapture = {
  editId: string
  animationName: "fadeIn"
  targets: { slot: string; selector: string }[]
  loadingSelector?: string
}

/** Captures a real animation at a controlled midpoint, then records its natural playback. */
async function captureNaturalAnimation(
  page: Page,
  capture: NaturalAnimationCapture,
) {
  return page.evaluate(
    async ({ editId, animationName, targets, loadingSelector }) => {
      type Sample = {
        slot: string
        duration: number
        opacity: number
        scaleX: number
        scaleY: number
      }
      type Frame = {
        time: number
        samples: Sample[]
        dark: boolean
      }

      const startedAt = performance.now()
      const animationsBySlot = new Map<string, CSSAnimation>()
      const controlledSamples: Sample[] = []
      const naturalFrames: Frame[] = []
      const loading: { spinner: boolean }[] = []
      let settledSamples: Sample[] = []
      let timedOut = false
      let complete = false
      let resolveCapture!: () => void
      const observer = loadingSelector
        ? new MutationObserver(() => {
            const placeholder = document.querySelector(loadingSelector)
            if (placeholder)
              loading.push({
                spinner: Boolean(placeholder.querySelector("svg")),
              })
          })
        : null
      observer?.observe(document.body, { childList: true, subtree: true })

      const readSamples = (): Sample[] =>
        targets.flatMap(({ slot, selector }) => {
          const element = document.querySelector<HTMLElement>(selector)
          const animation = animationsBySlot.get(slot)
          if (!element || !animation) return []
          const style = getComputedStyle(element)
          return [
            {
              slot,
              duration: Number(animation.effect!.getComputedTiming().duration),
              opacity: Number(style.opacity),
              scaleX: new DOMMatrixReadOnly(style.transform).m11,
              scaleY: new DOMMatrixReadOnly(style.transform).m22,
            },
          ]
        })

      const capturePromise = new Promise<void>((resolve) => {
        resolveCapture = resolve
      })
      const cleanup = () => {
        window.clearTimeout(timeout)
        document.removeEventListener("animationstart", onAnimationStart, true)
        observer?.disconnect()
        resolveCapture()
      }
      const finish = () => {
        if (complete) return
        complete = true
        if (!timedOut) settledSamples = readSamples()
        cleanup()
      }
      const timeout = window.setTimeout(() => {
        timedOut = true
        finish()
      }, 3000)

      const onAnimationStart = (event: AnimationEvent) => {
        const element = event.target
        if (
          !(element instanceof HTMLElement) ||
          event.animationName !== animationName
        )
          return
        const target = targets.find(({ selector }) => element.matches(selector))
        if (!target || animationsBySlot.has(target.slot)) return
        const animation = element
          .getAnimations()
          .find(
            (item): item is CSSAnimation =>
              item instanceof CSSAnimation &&
              item.animationName === animationName,
          )
        if (!animation) return
        animationsBySlot.set(target.slot, animation)
        if (animationsBySlot.size !== targets.length) return

        const animations = [...animationsBySlot.values()]
        animations.forEach((item) => item.pause())
        animations.forEach((item) => {
          const duration = Number(item.effect!.getComputedTiming().duration)
          item.currentTime = duration / 2
        })
        controlledSamples.push(...readSamples())
        animations.forEach((item) => item.play())
      }

      const sampleNaturalFrame = () => {
        if (complete) return
        const samples = readSamples()
        if (
          controlledSamples.length === targets.length &&
          samples.length === targets.length
        ) {
          naturalFrames.push({
            time: performance.now() - startedAt,
            samples,
            dark: document.documentElement.classList.contains("dark"),
          })
        }
        if (
          animationsBySlot.size === targets.length &&
          [...animationsBySlot.values()].every(
            (animation) => animation.playState === "finished",
          )
        ) {
          finish()
          return
        }
        requestAnimationFrame(sampleNaturalFrame)
      }

      document.addEventListener("animationstart", onAnimationStart, true)
      requestAnimationFrame(sampleNaturalFrame)
      const trigger = document.querySelector<HTMLButtonElement>(
        `[data-testid="${editId}"]`,
      )!
      trigger.focus()
      trigger.click()
      await capturePromise

      return {
        sampling: {
          controlledSamples: "paused at 50% currentTime",
          naturalFrames: "requestAnimationFrame after play() resumed",
        },
        animationStartedSlots: [...animationsBySlot.keys()],
        finishedSlots: [...animationsBySlot.entries()]
          .filter(([, animation]) => animation.playState === "finished")
          .map(([slot]) => slot),
        controlledSamples,
        naturalFrames,
        settledSamples,
        loading,
        timedOut,
      }
    },
    capture,
  )
}

test.beforeEach(async ({ context, page, extensionId }) => {
  installExtensionPageGuards(page)
  await forceExtensionLanguage(page, "zh-CN")
  await stubLlmMetadataIndex(context)
  const worker = await getServiceWorker(context)
  await seedUserPreferences(worker, { language: "zh-CN", refreshOnOpen: false })
  await seedStoredAccounts(worker, [
    createStoredAccount({ id: ACCOUNT_ID, site_name: "动画测试站点" }),
  ])
  await page.goto(`chrome-extension://${extensionId}/options.html#account`)
  await waitForExtensionRoot(page)
  await expect(
    page.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.rowEditButton),
  ).toBeVisible()
})

test("account editor fades in and out together with its backdrop", async ({
  page,
}, testInfo) => {
  const trigger = page.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.rowEditButton)
  for (const dark of [false, true]) {
    await page.evaluate(
      (dark) => document.documentElement.classList.toggle("dark", dark),
      dark,
    )
    const entrance = await sampleFade(page, "open")
    expect(entrance).toHaveLength(2)
    expect(entrance.every((sample) => sample.startTime !== null)).toBe(true)
    expect(
      Math.abs(entrance[0]!.startTime! - entrance[1]!.startTime!),
    ).toBeLessThan(20)
    for (const sample of entrance) {
      expect(sample.duration).toBe(140)
      expect(sample.opacity).toBeGreaterThan(0)
      expect(sample.opacity).toBeLessThan(0.6)
      expect(sample.scaleX).toBe(1)
      expect(sample.scaleY).toBe(1)
    }
    const dialog = page.getByRole("dialog", { name: "编辑账号" })
    await expect(dialog).toBeVisible()
    await expect(dialog).toHaveCSS("opacity", "1")
    await page.screenshot({
      path: testInfo.outputPath(
        `account-dialog-${dark ? "dark" : "light"}.png`,
      ),
      animations: "disabled",
    })
    const exit = await sampleFade(page, "closed")
    expect(exit).toHaveLength(2)
    expect(exit.every((sample) => sample.startTime !== null)).toBe(true)
    expect(Math.abs(exit[0]!.startTime! - exit[1]!.startTime!)).toBeLessThan(20)
    for (const sample of exit) {
      expect(sample.duration).toBe(120)
      expect(sample.opacity).toBeGreaterThan(0)
      expect(sample.opacity).toBeLessThan(1)
      expect(sample.scaleX).toBe(1)
      expect(sample.scaleY).toBe(1)
    }
    await testInfo.attach(`fade-timing-${dark ? "dark" : "light"}`, {
      body: JSON.stringify({ entrance, exit }, null, 2),
      contentType: "application/json",
    })
    await expect(dialog).toHaveCount(0)
    await expect(page.locator('[data-slot="modal-overlay"]')).toHaveCount(0)
    await expect(trigger).toBeFocused()
  }
})

test("account editor closes cleanly with reduced motion and a fresh draft on reopen", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.setViewportSize({ width: 390, height: 844 })
  const trigger = page.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.rowEditButton)
  await page.getByTestId(getAccountManagementListItemTestId(ACCOUNT_ID)).hover()
  await trigger.click()
  const dialog = page.getByRole("dialog", { name: "编辑账号" })
  await expect(dialog).toBeVisible()
  const duration = await dialog.evaluate((element) =>
    parseFloat(getComputedStyle(element).animationDuration),
  )
  expect(duration).toBeLessThanOrEqual(0.001)
  await page
    .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.siteNameInput)
    .fill("未保存的名字")
  await page.keyboard.press("Escape")
  await expect(dialog).toHaveCount(0)
  await expect(trigger).toBeFocused()
  await trigger.click()
  await expect(
    page.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.siteNameInput),
  ).toHaveValue("动画测试站点")
  await page
    .locator('[data-slot="modal-overlay"]')
    .click({ position: { x: 1, y: 1 } })
  await expect(dialog).toHaveCount(0)
  await expect(trigger).toBeFocused()
})

test("account editor can close during entrance and reopen during exit", async ({
  page,
}) => {
  const trigger = page.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.rowEditButton)
  await page.getByTestId(getAccountManagementListItemTestId(ACCOUNT_ID)).hover()
  await page.evaluate(async (editId) => {
    await new Promise<void>((resolve) => {
      const capture = (event: AnimationEvent) => {
        if (
          !(event.target instanceof HTMLElement) ||
          event.target.dataset.slot !== "modal-content" ||
          event.animationName !== "fadeIn"
        )
          return
        const animation = event.target
          .getAnimations()
          .find(
            (item) =>
              item instanceof CSSAnimation && item.animationName === "fadeIn",
          )!
        animation.pause()
        animation.currentTime =
          Number(animation.effect!.getComputedTiming().duration) / 4
        document.removeEventListener("animationstart", capture, true)
        resolve()
      }
      document.addEventListener("animationstart", capture, true)
      const trigger = document.querySelector<HTMLButtonElement>(
        `[data-testid="${editId}"]`,
      )!
      trigger.focus()
      trigger.click()
    })
  }, ACCOUNT_MANAGEMENT_TEST_IDS.rowEditButton)
  const entrance = await page
    .locator('[data-slot="modal-content"]')
    .evaluate((element) => {
      const animation = element.getAnimations()[0]!
      return {
        state: animation.playState,
        progress: animation.effect!.getComputedTiming().progress,
      }
    })
  expect(entrance.state).toBe("paused")
  expect(entrance.progress).toBeGreaterThan(0)
  expect(entrance.progress).toBeLessThan(1)
  // Request a replacement in the closing commit, before the exit can finish.
  await page.evaluate(async (editId) => {
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        observer.disconnect()
        reject(new Error("Closing surface was removed before it could fade"))
      }, 2000)
      const observer = new MutationObserver(() => {
        if (
          !document.querySelector(
            '[data-slot="modal-content"][data-state="closed"]',
          )
        )
          return
        observer.disconnect()
        window.clearTimeout(timeout)
        document
          .querySelector<HTMLButtonElement>(`[data-testid="${editId}"]`)!
          .click()
        resolve()
      })
      observer.observe(document.body, {
        subtree: true,
        attributes: true,
        attributeFilter: ["data-state"],
      })
      document
        .querySelector<HTMLButtonElement>(
          '[role="dialog"] button[aria-label="关闭"]',
        )!
        .click()
    })
  }, ACCOUNT_MANAGEMENT_TEST_IDS.rowEditButton)
  const dialog = page.getByRole("dialog", { name: "编辑账号" })
  await expect(dialog).toBeVisible()
  await expect(dialog).toHaveCSS("opacity", "1")
  await expect(page.locator('[data-slot="modal-content"]')).toHaveCount(1)
  await page.keyboard.press("Escape")
  await expect(dialog).toHaveCount(0)
  await expect(trigger).toBeFocused()
})

test("account editor starts and completes its fade on first open, warm open and after refresh", async ({
  page,
}, testInfo) => {
  for (const phase of ["first", "warm", "after-refresh"] as const) {
    if (phase === "after-refresh") {
      await page.reload({ waitUntil: "domcontentloaded" })
      await page
        .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.rowEditButton)
        .waitFor({ state: "visible" })
    }
    const result = await captureNaturalAnimation(page, {
      editId: ACCOUNT_MANAGEMENT_TEST_IDS.rowEditButton,
      animationName: "fadeIn",
      targets: [
        {
          slot: "modal-content",
          selector: '[data-slot="modal-content"][data-state="open"]',
        },
        {
          slot: "modal-overlay",
          selector: '[data-slot="modal-overlay"][data-state="open"]',
        },
      ],
    })
    await testInfo.attach(`natural-opening-${phase}`, {
      body: JSON.stringify(result, null, 2),
      contentType: "application/json",
    })
    expect(result.timedOut).toBe(false)
    expect(result.animationStartedSlots.sort()).toEqual([
      "modal-content",
      "modal-overlay",
    ])
    expect(result.finishedSlots.sort()).toEqual([
      "modal-content",
      "modal-overlay",
    ])
    expect(result.controlledSamples).toHaveLength(2)
    for (const sample of result.controlledSamples) {
      expect(sample.duration).toBe(140)
      expect(sample.opacity).toBeGreaterThan(0)
      expect(sample.opacity).toBeLessThan(1)
      expect(sample.scaleX).toBe(1)
      expect(sample.scaleY).toBe(1)
    }
    expect(
      Math.abs(
        result.controlledSamples[0]!.opacity -
          result.controlledSamples[1]!.opacity,
      ),
    ).toBeLessThan(0.05)
    expect(result.settledSamples).toHaveLength(2)
    expect(result.settledSamples.every((sample) => sample.opacity === 1)).toBe(
      true,
    )
    expect(result.naturalFrames.length).toBeGreaterThan(0)
    expect(new Set(result.naturalFrames.map((frame) => frame.dark)).size).toBe(
      1,
    )
    await page.keyboard.press("Escape")
    await expect(page.getByRole("dialog", { name: "编辑账号" })).toHaveCount(0)
  }
})

test("ready account fields fade in quickly without a loading spinner or replay on typing", async ({
  page,
}, testInfo) => {
  const result = await captureNaturalAnimation(page, {
    editId: ACCOUNT_MANAGEMENT_TEST_IDS.rowEditButton,
    animationName: "fadeIn",
    targets: [
      {
        slot: "account-form",
        selector: `[data-testid="${ACCOUNT_MANAGEMENT_TEST_IDS.accountForm}"][data-account-form-ready]`,
      },
    ],
    loadingSelector: '[data-testid="account-dialog-loading"]',
  })
  await testInfo.attach("ready-fields-natural-fade", {
    body: JSON.stringify(result, null, 2),
    contentType: "application/json",
  })
  expect(result.timedOut).toBe(false)
  expect(result.animationStartedSlots).toEqual(["account-form"])
  expect(result.finishedSlots).toEqual(["account-form"])
  expect(result.controlledSamples).toHaveLength(1)
  expect(result.controlledSamples[0]!.duration).toBe(80)
  expect(result.controlledSamples[0]!.opacity).toBeGreaterThan(0)
  expect(result.controlledSamples[0]!.opacity).toBeLessThan(1)
  expect(result.settledSamples).toHaveLength(1)
  expect(result.settledSamples[0]!.opacity).toBe(1)
  expect(result.naturalFrames.length).toBeGreaterThan(0)
  expect(result.loading.every((state) => !state.spinner)).toBe(true)
  await page
    .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.accountForm)
    .evaluate((form) => {
      form.setAttribute("data-fade-replays", "0")
      form.addEventListener("animationstart", (event) => {
        if (
          event.target === form &&
          (event as AnimationEvent).animationName === "fadeIn"
        )
          form.setAttribute(
            "data-fade-replays",
            String(Number(form.getAttribute("data-fade-replays")) + 1),
          )
      })
    })
  await page
    .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.siteNameInput)
    .fill("输入不重播动画")
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  )
  await expect(
    page.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.accountForm),
  ).toHaveAttribute("data-fade-replays", "0")
})
