import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

import { badgeVariants } from "~/components/ui/badge"
import { buttonVariants } from "~/components/ui/button"
import { inputVariants } from "~/components/ui/input"
import { textareaVariants } from "~/components/ui/Textarea"
import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { THEME_ATTRIBUTES, THEME_COLOR, THEME_MODE } from "~/constants/theme"
import { cn } from "~/lib/utils"
import { THEME_COLORS, THEME_PRESETS } from "~/types/theme"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  finishColorTransitions,
  MIN_CONTRAST_RATIO,
  readColorContrast,
} from "~~/e2e/utils/colorContrast"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"
import { setVisualThemeAttribute } from "~~/e2e/utils/visualTheme"

const statuses = {
  success: {
    solid: buttonVariants({ variant: "success" }),
    soft: "bg-success-soft text-success-soft-foreground border-success-border",
    text: "text-success-text",
    rgb: [0, 129, 64],
  },
  warning: {
    solid: buttonVariants({ variant: "warning" }),
    soft: "bg-warning-soft text-warning-soft-foreground border-warning-border",
    text: "text-warning-text",
    rgb: [255, 159, 0],
  },
  destructive: {
    solid: buttonVariants({ variant: "destructive" }),
    soft: "bg-destructive-soft text-destructive-soft-foreground border-destructive-border",
    text: "text-destructive-text",
    rgb: [217, 31, 22],
  },
  info: {
    solid:
      "rounded-md px-4 py-2 text-sm bg-info text-info-foreground hover:bg-info-hover",
    soft: "bg-info-soft text-info-soft-foreground border-info-border",
    text: "text-info-text",
    rgb: [15, 78, 179],
  },
} as const

const pricing = {
  input: "text-pricing-input bg-pricing-input-soft",
  output: "text-pricing-output bg-pricing-output-soft",
  "cache-read": "text-pricing-cache-read bg-pricing-cache-read-soft",
  "cache-write": "text-pricing-cache-write bg-pricing-cache-write-soft",
  "per-call": "text-pricing-per-call bg-pricing-per-call-soft",
}

/** Use public variants and native elements; component tests cover JSX wiring. */
function colorFixture() {
  return renderToStaticMarkup(
    createElement(
      "section",
      {
        "aria-label": "Semantic colors",
        [THEME_ATTRIBUTES.COLOR_SCOPE]: "",
        [THEME_ATTRIBUTES.COLOR]: THEME_COLOR.VIOLET,
        className: "bg-card text-card-foreground",
        style: { padding: 24, display: "grid", gap: 16, maxWidth: 1000 },
      },
      createElement("h1", null, "Status and pricing colors"),
      ...Object.entries(statuses).map(([status, styles]) =>
        createElement(
          "div",
          {
            key: status,
            style: { display: "flex", gap: 16, alignItems: "center" },
          },
          createElement(
            "button",
            { className: styles.solid, "aria-label": `${status} action` },
            `${status} action`,
            createElement(
              "span",
              {
                className: "bg-overlay/10 rounded-full px-1.5",
                "data-status-count": "",
              },
              "3",
            ),
          ),
          createElement(
            "span",
            {
              className: badgeVariants({
                variant: status as keyof typeof statuses,
              }),
            },
            `${status} badge`,
          ),
          createElement(
            "div",
            { className: `${styles.soft} rounded-md border p-3` },
            `${status} message`,
          ),
          createElement("span", { className: styles.text }, `${status} text`),
        ),
      ),
      createElement(
        "div",
        { style: { display: "flex", gap: 16 } },
        createElement(
          "button",
          { className: buttonVariants() },
          "Primary action",
        ),
        createElement("span", { className: badgeVariants() }, "Primary badge"),
      ),
      createElement(
        "div",
        { style: { display: "flex", gap: 16 } },
        ...Object.entries(pricing).map(([category, className]) =>
          createElement(
            "span",
            { key: category, className: `${className} rounded-md p-3` },
            `${category} $1.00`,
          ),
        ),
      ),
      ...(["error", "success"] as const).map((variant) =>
        createElement(
          "div",
          { key: variant, style: { display: "flex", gap: 16 } },
          createElement("input", {
            "aria-label": `${variant} input`,
            className: cn(inputVariants({ variant })),
            defaultValue: `${variant} input`,
          }),
          createElement("textarea", {
            "aria-label": `${variant} textarea`,
            className: cn(textareaVariants({ variant })),
            defaultValue: `${variant} textarea`,
          }),
        ),
      ),
    ),
  )
}

test("status, pricing and field colors remain readable in independent theme scopes", async ({
  page,
  extensionId,
}, testInfo) => {
  await page.goto(`chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}`)
  await waitForExtensionRoot(page)
  await page.evaluate((html) => {
    const host = document.createElement("div")
    host.id = "semantic-color-fixture"
    host.style.cssText = "position:fixed;inset:0;z-index:9999;overflow:auto"
    host.innerHTML = html
    document.body.append(host)
  }, colorFixture())
  const fixture = page.getByRole("region", { name: "Semantic colors" })

  for (const preset of THEME_PRESETS) {
    for (const mode of [THEME_MODE.LIGHT, THEME_MODE.DARK]) {
      await fixture.evaluate(
        (scope, theme) => {
          scope.setAttribute(theme.presetAttribute, theme.preset)
          scope.classList.toggle(theme.darkClass, theme.dark)
          // A light scope must reset inherited dark roles just as a content root does.
          scope.parentElement!.classList.toggle(theme.darkClass, !theme.dark)
        },
        {
          preset,
          presetAttribute: THEME_ATTRIBUTES.PRESET,
          darkClass: THEME_MODE.DARK,
          dark: mode === THEME_MODE.DARK,
        },
      )

      for (const [status, styles] of Object.entries(statuses)) {
        const action = fixture.getByRole("button", {
          name: `${status} action`,
          exact: true,
        })
        await finishColorTransitions(action)
        const normal = await readColorContrast(action)
        expect(normal.background, `${preset} ${mode} ${status} solid`).toEqual(
          styles.rgb,
        )
        expect(
          normal.ratio,
          `${preset} ${mode} ${status} foreground`,
        ).toBeGreaterThanOrEqual(MIN_CONTRAST_RATIO.TEXT)
        const count = await readColorContrast(
          action.locator("[data-status-count]"),
        )
        expect(count.foreground).toEqual(normal.foreground)
        expect(
          count.ratio,
          `${preset} ${mode} ${status} count`,
        ).toBeGreaterThanOrEqual(MIN_CONTRAST_RATIO.TEXT)
        await action.hover()
        await finishColorTransitions(action)
        const hovered = await readColorContrast(action)
        expect(hovered.background).not.toEqual(normal.background)
        expect(
          hovered.ratio,
          `${preset} ${mode} ${status} hover`,
        ).toBeGreaterThanOrEqual(MIN_CONTRAST_RATIO.TEXT)
        for (const kind of ["badge", "message", "text"]) {
          const target = fixture.getByText(`${status} ${kind}`, { exact: true })
          expect(
            (await readColorContrast(target)).ratio,
            `${preset} ${mode} ${status} ${kind}`,
          ).toBeGreaterThanOrEqual(MIN_CONTRAST_RATIO.TEXT)
          if (kind === "badge") {
            await target.hover()
            await finishColorTransitions(target)
            expect(
              (await readColorContrast(target)).ratio,
              `${preset} ${mode} ${status} badge hover`,
            ).toBeGreaterThanOrEqual(MIN_CONTRAST_RATIO.TEXT)
          }
        }
      }
      for (const category of Object.keys(pricing)) {
        const target = fixture.getByText(`${category} $1.00`, { exact: true })
        expect(
          (await readColorContrast(target)).ratio,
          `${preset} ${mode} ${category}`,
        ).toBeGreaterThanOrEqual(MIN_CONTRAST_RATIO.TEXT)
      }
      for (const variant of ["error", "success"]) {
        const text = fixture.getByText(
          `${variant === "error" ? "destructive" : variant} text`,
          { exact: true },
        )
        const expectedBorder = await text.evaluate(
          (element) => getComputedStyle(element).color,
        )
        for (const control of ["input", "textarea"]) {
          const field = fixture.getByRole("textbox", {
            name: `${variant} ${control}`,
            exact: true,
          })
          await field.focus()
          await finishColorTransitions(field)
          await expect(field).toHaveCSS("border-top-color", expectedBorder)
        }
      }
      await fixture.screenshot({
        path: testInfo.outputPath(`${preset}-${mode}-semantic-colors.png`),
      })

      // All configurable accents must keep the solid and tinted foreground contracts.
      for (const color of THEME_COLORS) {
        await setVisualThemeAttribute(fixture, THEME_ATTRIBUTES.COLOR, color)
        for (const name of ["Primary action", "Primary badge"]) {
          const control = fixture.getByText(name, { exact: true })
          await page.mouse.move(0, 0)
          await finishColorTransitions(control)
          expect
            .soft(
              (await readColorContrast(control)).ratio,
              `${preset} ${mode} ${color} ${name}`,
            )
            .toBeGreaterThanOrEqual(MIN_CONTRAST_RATIO.TEXT)
          await control.hover()
          await finishColorTransitions(control)
          expect
            .soft(
              (await readColorContrast(control)).ratio,
              `${preset} ${mode} ${color} ${name} hover`,
            )
            .toBeGreaterThanOrEqual(MIN_CONTRAST_RATIO.TEXT)
        }
      }
      await setVisualThemeAttribute(
        fixture,
        THEME_ATTRIBUTES.COLOR,
        THEME_COLOR.VIOLET,
      )
    }
  }
})
