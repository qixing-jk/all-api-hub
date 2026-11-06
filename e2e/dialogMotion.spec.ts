import type { Page } from "@playwright/test"

import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"
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

/** Samples the early entrance and midpoint exit in the actual account editor. */
async function sampleFade(page: Page, phase: "open" | "closed") {
  return page.evaluate(
    async ({ phase, editId }) => {
      const samples: {
        slot: string
        duration: number
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
          animations.forEach((animation) => animation.play())
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
          animation.pause()
          const duration = Number(
            animation.effect!.getComputedTiming().duration,
          )
          animation.currentTime = phase === "open" ? duration / 4 : duration / 2
          const style = getComputedStyle(element)
          samples.push({
            slot,
            duration,
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

test.beforeEach(async ({ context, page, extensionId }) => {
  installExtensionPageGuards(page)
  await forceExtensionLanguage(page, "zh-CN")
  await stubLlmMetadataIndex(context)
  const worker = await getServiceWorker(context)
  await seedUserPreferences(worker, { language: "zh-CN", refreshOnOpen: false })
  await seedStoredAccounts(worker, [
    createStoredAccount({ site_name: "动画测试站点" }),
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
  await trigger.click()
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

test("account editor naturally paints its fade on first open, warm open and after refresh", async ({
  page,
}, testInfo) => {
  for (const phase of ["first", "warm", "after-refresh"] as const) {
    if (phase === "after-refresh") {
      await page.reload({ waitUntil: "domcontentloaded" })
      await page
        .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.rowEditButton)
        .waitFor({ state: "visible" })
    }
    const frames = await page.evaluate(async (editId) => {
      const frames: {
        time: number
        opacity: number
        backdrop: number
        dark: boolean
      }[] = []
      const started = performance.now()
      const trigger = document.querySelector<HTMLButtonElement>(
        `[data-testid="${editId}"]`,
      )!
      trigger.focus()
      trigger.click()
      await new Promise<void>((resolve, reject) => {
        const sample = () => {
          const content = document.querySelector<HTMLElement>(
            '[data-slot="modal-content"][data-state="open"]',
          )
          const backdrop = document.querySelector<HTMLElement>(
            '[data-slot="modal-overlay"][data-state="open"]',
          )
          if (content && backdrop) {
            frames.push({
              time: performance.now() - started,
              opacity: Number(getComputedStyle(content).opacity),
              backdrop: Number(getComputedStyle(backdrop).opacity),
              dark: document.documentElement.classList.contains("dark"),
            })
            const fade = content
              .getAnimations()
              .find(
                (animation) =>
                  animation instanceof CSSAnimation &&
                  animation.animationName === "fadeIn",
              )
            if (fade?.playState === "finished") return resolve()
          }
          if (performance.now() - started > 3000)
            return reject(
              new Error(
                `Natural opening did not finish: ${JSON.stringify(frames)}`,
              ),
            )
          requestAnimationFrame(sample)
        }
        requestAnimationFrame(sample)
      })
      return frames
    }, ACCOUNT_MANAGEMENT_TEST_IDS.rowEditButton)
    await testInfo.attach(`natural-opening-${phase}`, {
      body: JSON.stringify(frames, null, 2),
      contentType: "application/json",
    })
    expect(
      frames.some((frame) => frame.opacity > 0 && frame.opacity < 0.8),
    ).toBe(true)
    expect(
      frames.every((frame) => Math.abs(frame.opacity - frame.backdrop) < 0.05),
    ).toBe(true)
    expect(new Set(frames.map((frame) => frame.dark)).size).toBe(1)
    await page.keyboard.press("Escape")
    await expect(page.getByRole("dialog", { name: "编辑账号" })).toHaveCount(0)
  }
})

test("ready account fields fade in quickly without a loading spinner or replay on typing", async ({
  page,
}, testInfo) => {
  const result = await page.evaluate(
    async ({ editId, formId }) => {
      const frames: number[] = []
      const loading: { spinner: boolean }[] = []
      const observer = new MutationObserver(() => {
        const placeholder = document.querySelector(
          '[data-testid="account-dialog-loading"]',
        )
        if (placeholder)
          loading.push({ spinner: Boolean(placeholder.querySelector("svg")) })
      })
      observer.observe(document.body, { childList: true, subtree: true })
      const started = performance.now()
      const trigger = document.querySelector<HTMLButtonElement>(
        `[data-testid="${editId}"]`,
      )!
      trigger.focus()
      trigger.click()
      let duration = 0
      try {
        await new Promise<void>((resolve, reject) => {
          const sample = () => {
            const form = document.querySelector<HTMLElement>(
              `[data-testid="${formId}"][data-account-form-ready]`,
            )
            const animation = form
              ?.getAnimations()
              .find(
                (item) =>
                  item instanceof CSSAnimation &&
                  item.animationName === "fadeIn",
              )
            if (form && animation) {
              duration = Number(animation.effect!.getComputedTiming().duration)
              frames.push(Number(getComputedStyle(form).opacity))
              if (animation.playState === "finished") return resolve()
            }
            if (performance.now() - started > 3000)
              return reject(new Error("Ready fields did not finish their fade"))
            requestAnimationFrame(sample)
          }
          requestAnimationFrame(sample)
        })
      } finally {
        observer.disconnect()
      }
      return { duration, frames, loading }
    },
    {
      editId: ACCOUNT_MANAGEMENT_TEST_IDS.rowEditButton,
      formId: ACCOUNT_MANAGEMENT_TEST_IDS.accountForm,
    },
  )
  expect(result.duration).toBe(80)
  expect(result.frames.some((opacity) => opacity > 0 && opacity < 1)).toBe(true)
  expect(result.frames.at(-1)).toBe(1)
  expect(result.loading.every((state) => !state.spinner)).toBe(true)
  await testInfo.attach("ready-fields-natural-fade", {
    body: JSON.stringify(result, null, 2),
    contentType: "application/json",
  })
  await page
    .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.siteNameInput)
    .fill("输入不重播动画")
  const replaying = await page
    .getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.accountForm)
    .evaluate((form) =>
      form
        .getAnimations()
        .some(
          (animation) =>
            animation instanceof CSSAnimation &&
            animation.animationName === "fadeIn" &&
            animation.playState === "running",
        ),
    )
  expect(replaying).toBe(false)
})
