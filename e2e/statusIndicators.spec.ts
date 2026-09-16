import { AUTO_CHECKIN_METHOD_IDS } from "~/constants/checkIn"
import { SITE_TYPES } from "~/constants/siteType"
import { THEME_ATTRIBUTES } from "~/constants/theme"
import {
  getAccountManagementListItemTestId,
  ACCOUNT_MANAGEMENT_TEST_IDS as ids,
} from "~/features/AccountManagement/testIds"
import { createCompatibilityCheckInConfig } from "~/services/checkin/autoCheckin/compatibilityConfig"
import { mergeCompatibilityCheckInStatus } from "~/services/checkin/autoCheckin/state"
import { SiteHealthStatus } from "~/types"
import { THEME_COLORS, THEME_PRESETS } from "~/types/theme"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  finishColorTransitions,
  readColorContrast,
} from "~~/e2e/utils/colorContrast"
import {
  createStoredAccount,
  forceExtensionLanguage,
  seedStoredAccounts,
  seedUserPreferences,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import { getServiceWorker } from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"

test("account dots and check-in icons share readable colors across themes and widths", async ({
  page,
  context,
  extensionId,
}, testInfo) => {
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
  const worker = await getServiceWorker(context)
  await seedUserPreferences(worker, {
    language: "en",
    themeMode: "light",
    appearance: { density: "compact" },
    autoCheckin: { globalEnabled: false, pretriggerDailyOnUiOpen: false },
  })
  await seedStoredAccounts(
    worker,
    [
      SiteHealthStatus.Healthy,
      SiteHealthStatus.Warning,
      SiteHealthStatus.Error,
      SiteHealthStatus.Unknown,
    ].map((status) =>
      createStoredAccount({
        id: status,
        site_name: `${status} account`,
        health: { status },
        checkIn: mergeCompatibilityCheckInStatus({
          config: createCompatibilityCheckInConfig({
            siteType: SITE_TYPES.NEW_API,
            supported: true,
            automaticExecutionEnabled: false,
            customCheckIn: {
              url: "https://example.com/checkin",
              isCheckedInToday: status === SiteHealthStatus.Healthy,
            },
          }),
          methodId: AUTO_CHECKIN_METHOD_IDS.NewApiDailyCheckIn,
          isCheckedInToday: status !== SiteHealthStatus.Error,
          observedAt:
            status === SiteHealthStatus.Warning
              ? Date.now() - 172800000
              : Date.now(),
        }),
      }),
    ),
  )
  await page.goto(`chrome-extension://${extensionId}/options.html#account`)
  await waitForExtensionRoot(page)
  const row = (status: SiteHealthStatus) =>
    page.getByTestId(getAccountManagementListItemTestId(status))
  const healthButton = (status: SiteHealthStatus) =>
    row(status).getByRole("button", {
      name: "Click to refresh health status",
      exact: true,
    })
  const dot = (status: SiteHealthStatus) =>
    healthButton(status).locator('span[aria-hidden="true"]')
  const pairs = [
    {
      status: SiteHealthStatus.Healthy,
      icon: row(SiteHealthStatus.Healthy)
        .getByTestId(ids.siteCheckInStatusButton)
        .locator("svg"),
    },
    {
      status: SiteHealthStatus.Warning,
      icon: row(SiteHealthStatus.Warning)
        .getByRole("button", { name: /Check-in status wasn't detected today/ })
        .locator("svg"),
    },
    {
      status: SiteHealthStatus.Unknown,
      icon: row(SiteHealthStatus.Unknown)
        .getByTestId(ids.customCheckInStatusButton)
        .locator("svg"),
    },
  ]
  for (const preset of THEME_PRESETS) {
    for (const dark of [false, true]) {
      await page.locator("html").evaluate(
        (html, args) => {
          html.setAttribute(args.attribute, args.preset)
          html.classList.toggle("dark", args.dark)
        },
        { attribute: THEME_ATTRIBUTES.PRESET, preset, dark },
      )
      await finishColorTransitions(page.locator("html"))
      for (const { status, icon } of pairs) {
        await expect(icon).toBeVisible()
        const fill = await readColorContrast(dot(status), "background")
        const stroke = await readColorContrast(icon)
        expect(
          stroke.foreground,
          `${preset} ${dark} ${status} dot/icon`,
        ).toEqual(fill.foreground)
        expect(fill.ratio).toBeGreaterThanOrEqual(3)
        expect(stroke.ratio).toBeGreaterThanOrEqual(3)
        // Keep small status marks vivid rather than grayish or pastel.
        const brightest = Math.max(...stroke.foreground)
        const saturation =
          (brightest - Math.min(...stroke.foreground)) / brightest
        if (status !== SiteHealthStatus.Unknown) {
          expect(saturation).toBeGreaterThanOrEqual(dark ? 0.7 : 0.88)
        }
      }
      const errorDot = await readColorContrast(
        dot(SiteHealthStatus.Error),
        "background",
      )
      expect(errorDot.ratio).toBeGreaterThanOrEqual(3)
      if (dark) {
        expect(
          errorDot.foreground[0] - errorDot.foreground[1],
        ).toBeGreaterThanOrEqual(150)
      }
      const completedCustomCheckIn = row(SiteHealthStatus.Healthy)
        .getByTestId(ids.customCheckInStatusButton)
        .locator("svg")
      expect(
        (await readColorContrast(completedCustomCheckIn)).foreground,
      ).toEqual(
        (await readColorContrast(dot(SiteHealthStatus.Healthy), "background"))
          .foreground,
      )
      expect(
        (await readColorContrast(dot(SiteHealthStatus.Unknown), "background"))
          .ratio,
      ).toBeGreaterThanOrEqual(3)
      for (const width of [1280, 390, 320]) {
        await page.setViewportSize({ width, height: 900 })
        await page.mouse.move(0, 0)
        for (const { status, icon } of pairs) {
          await expect(icon).toBeVisible()
          await expect(row(status).getByTestId(ids.rowOpenButton)).toBeVisible()
          const bounds = await healthButton(status).boundingBox()
          expect(bounds!.width).toBe(16)
          expect(
            await dot(status).evaluate(
              (el) => el.getBoundingClientRect().width,
            ),
          ).toBe(8)
        }
        // Empty pending circles are optically smaller; detailed icons keep 16px.
        for (const status of [
          SiteHealthStatus.Healthy,
          SiteHealthStatus.Error,
        ]) {
          const siteCheckIn = row(status).getByTestId(
            ids.siteCheckInStatusButton,
          )
          const customCheckIn = row(status).getByTestId(
            ids.customCheckInStatusButton,
          )
          expect((await siteCheckIn.locator("svg").boundingBox())!.width).toBe(
            status === SiteHealthStatus.Error ? 14 : 16,
          )
          expect(
            (await customCheckIn.locator("svg").boundingBox())!.width,
          ).toBe(16)
          expect((await siteCheckIn.boundingBox())!.width).toBe(
            (await customCheckIn.boundingBox())!.width,
          )
        }
        await page.screenshot({
          path: testInfo.outputPath(
            `${preset}-${dark ? "dark" : "light"}-${width}.png`,
          ),
        })
      }
      await healthButton(SiteHealthStatus.Error).hover()
      const tooltip = page.getByRole("tooltip").filter({ hasText: "Status:" })
      await expect(tooltip).toBeVisible()
      const statusText = tooltip.getByText("Error", { exact: true })
      expect(
        (await readColorContrast(statusText)).ratio,
      ).toBeGreaterThanOrEqual(4.5)
      await page.mouse.move(0, 0)
    }
  }
})

test("status roles remain readable on theme surfaces and resolve within each theme scope", async ({
  page,
  extensionId,
}) => {
  await page.goto(`chrome-extension://${extensionId}/options.html`)
  await waitForExtensionRoot(page)
  const tones = ["success", "warning", "destructive", "info", "neutral"]
  await page.evaluate(
    ({ tones, attributes }) => {
      const host = document.createElement("div")
      host.id = "indicator-scope-fixture"
      host.style.cssText = "position:fixed;inset:0;z-index:9999;overflow:auto"
      for (const dark of [false, true]) {
        const scope = document.createElement("section")
        scope.setAttribute(
          "aria-label",
          dark ? "Dark indicators" : "Light indicators",
        )
        scope.setAttribute(attributes.COLOR_SCOPE, "")
        scope.classList.toggle("dark", dark)
        for (const surface of ["card", "muted", "secondary"]) {
          const container = document.createElement("div")
          container.style.cssText = `background:var(--${surface});padding:16px;display:flex;gap:16px`
          for (const tone of tones) {
            const dot = document.createElement("span")
            dot.setAttribute("role", "img")
            dot.setAttribute("aria-label", `${tone} on ${surface}`)
            dot.style.cssText = `display:block;width:10px;height:10px;border-radius:50%;background:var(--${tone}-indicator)`
            container.append(dot)
          }
          scope.append(container)
        }
        host.append(scope)
      }
      document.body.append(host)
    },
    { tones, attributes: THEME_ATTRIBUTES },
  )
  const scopes = page.locator("#indicator-scope-fixture section")
  for (const preset of THEME_PRESETS) {
    await scopes.evaluateAll(
      (elements, args) => {
        for (const el of elements) el.setAttribute(args.attribute, args.preset)
      },
      { attribute: THEME_ATTRIBUTES.PRESET, preset },
    )
    for (const scope of await scopes.all()) {
      const baseline = await scope
        .getByRole("img")
        .evaluateAll((elements) =>
          elements.map((el) => getComputedStyle(el).backgroundColor),
        )
      for (const color of THEME_COLORS) {
        await scope.evaluate(
          (el, args) => el.setAttribute(args.attribute, args.color),
          { attribute: THEME_ATTRIBUTES.COLOR, color },
        )
        expect(
          await scope
            .getByRole("img")
            .evaluateAll((elements) =>
              elements.map((el) => getComputedStyle(el).backgroundColor),
            ),
        ).toEqual(baseline)
      }
      for (const marker of await scope.getByRole("img").all()) {
        expect(
          (await readColorContrast(marker, "background")).ratio,
          `${preset} ${await marker.getAttribute("aria-label")}`,
        ).toBeGreaterThanOrEqual(3)
      }
    }
  }
  // A future preset can override an indicator role locally, without touching consumers.
  const light = page.getByRole("region", { name: "Light indicators" })
  const dark = page.getByRole("region", { name: "Dark indicators" })
  const unchanged = await dark
    .getByRole("img", { name: "destructive on card", exact: true })
    .evaluate((el) => getComputedStyle(el).backgroundColor)
  await light.evaluate((el) =>
    (el as HTMLElement).style.setProperty("--destructive-indicator", "#b00d09"),
  )
  await expect(
    light.getByRole("img", { name: "destructive on card", exact: true }),
  ).toHaveCSS("background-color", "rgb(176, 13, 9)")
  await expect(
    dark.getByRole("img", { name: "destructive on card", exact: true }),
  ).toHaveCSS("background-color", unchanged)
})

test("account editing separates the re-detect action from warnings and the primary save action", async ({
  page,
  context,
  extensionId,
}, testInfo) => {
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
  const worker = await getServiceWorker(context)
  await seedUserPreferences(worker, {
    themeMode: "light",
    autoCheckin: { globalEnabled: false, pretriggerDailyOnUiOpen: false },
  })
  await seedStoredAccounts(worker, [
    createStoredAccount({ id: "edit-colors", site_name: "Edit colors" }),
  ])
  await page.goto(`chrome-extension://${extensionId}/options.html#account`)
  await waitForExtensionRoot(page)
  await page
    .getByTestId(getAccountManagementListItemTestId("edit-colors"))
    .getByTestId(ids.rowEditButton)
    .click()
  const dialog = page.getByRole("dialog")
  const redetect = dialog.getByRole("button", {
    name: "Re-detect",
    exact: true,
  })
  const save = dialog.getByTestId(ids.confirmAddButton)
  for (const preset of THEME_PRESETS) {
    for (const dark of [false, true]) {
      await page.locator("html").evaluate(
        (el, args) => {
          el.setAttribute(args.attribute, args.preset)
          el.classList.toggle("dark", args.dark)
        },
        { attribute: THEME_ATTRIBUTES.PRESET, preset, dark },
      )
      for (const width of [1280, 390, 320]) {
        await page.setViewportSize({ width, height: 900 })
        await expect(redetect).toBeVisible()
        await expect(save).toBeVisible()
        await finishColorTransitions(dialog)
        expect(
          (await readColorContrast(redetect)).ratio,
        ).toBeGreaterThanOrEqual(4.5)
        expect((await readColorContrast(save)).ratio).toBeGreaterThanOrEqual(
          4.5,
        )
        await expect(redetect).toHaveClass(/button-outline-bg/)
        await expect(save).toHaveClass(/button-primary-bg/)
        const controls = await Promise.all([
          redetect.boundingBox(),
          save.boundingBox(),
        ])
        for (const bounds of controls) {
          expect(bounds!.x).toBeGreaterThanOrEqual(0)
          expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width)
        }
        await dialog.screenshot({
          path: testInfo.outputPath(`edit-${preset}-${dark}-${width}.png`),
        })
      }
    }
  }
})

test("a theme can change each status base and update every presentation in its own scope", async ({
  page,
  extensionId,
}) => {
  await page.goto(`chrome-extension://${extensionId}/options.html`)
  await waitForExtensionRoot(page)
  const result = await page.evaluate((attributes) => {
    const roles = [
      "",
      "-hover",
      "-text",
      "-soft",
      "-soft-foreground",
      "-border",
      "-indicator",
    ]
    const tones = ["success", "warning", "destructive", "info", "neutral"]
    const host = document.createElement("div")
    document.body.append(host)
    const canvas = document.createElement("canvas")
    canvas.width = canvas.height = 1
    const paint = canvas.getContext("2d")!
    const results = []
    for (const dark of [false, true]) {
      for (const tone of tones) {
        const scope = document.createElement("section")
        scope.setAttribute(attributes.COLOR_SCOPE, "")
        scope.classList.toggle("dark", dark)
        host.append(scope)
        const markers = (tone === "neutral" ? ["-indicator"] : roles).map(
          (role) => {
            const el = document.createElement("span")
            el.style.color = `var(--${tone}${role})`
            el.style.transition = "none"
            scope.append(el)
            return el
          },
        )
        const sibling = scope.cloneNode(true) as HTMLElement
        host.append(sibling)
        const read = (elements: Element[]) =>
          elements.map((el) => {
            paint.fillStyle = getComputedStyle(el).color
            paint.fillRect(0, 0, 1, 1)
            return [...paint.getImageData(0, 0, 1, 1).data].slice(0, 3)
          })
        const before = read(markers)
        const siblingBefore = read([...sibling.children])
        scope.style.setProperty(`--status-${tone}-base`, "#8040c0")
        results.push({
          tone,
          dark,
          before,
          after: read(markers),
          siblingBefore,
          siblingAfter: read([...sibling.children]),
        })
      }
    }
    host.remove()
    return results
  }, THEME_ATTRIBUTES)
  for (const {
    tone,
    dark,
    before,
    after,
    siblingBefore,
    siblingAfter,
  } of result) {
    for (let i = 0; i < before.length; i++) {
      expect(after[i], `${tone} ${dark} presentation ${i}`).not.toEqual(
        before[i],
      )
    }
    const indicator = after.at(-1)!
    expect(indicator[2]).toBeGreaterThan(indicator[0])
    expect(indicator[0]).toBeGreaterThan(indicator[1])
    expect(siblingAfter).toEqual(siblingBefore)
  }
})
