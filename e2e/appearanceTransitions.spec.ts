import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { THEME_ATTRIBUTES } from "~/constants/theme"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  forceExtensionLanguage,
  seedUserPreferences,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import { getServiceWorker } from "~~/e2e/utils/extensionState"

test("palette switches are instant while subsequent button hover still transitions", async ({
  context,
  page,
  extensionId,
}) => {
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
  await seedUserPreferences(await getServiceWorker(context), {
    themeMode: "light",
  })
  await page.goto(
    `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.BASIC}`,
  )
  await page
    .getByRole("button", { name: "Appearance settings", exact: true })
    .click()
  const drawer = page.getByRole("dialog", { name: "Appearance settings" })
  await expect(drawer).toBeVisible()

  for (const name of ["Dark", "Light", "Violet", "Blue", "Anthropic"]) {
    const radio = drawer.getByRole("radio", { name, exact: true })
    await radio.scrollIntoViewIfNeeded()
    // Finish existing hover/open animations before observing a palette change.
    await page.evaluate(async () => {
      await Promise.all(
        document
          .getAnimations()
          .map((animation) => animation.finished.catch(() => {})),
      )
    })
    const result = await radio.evaluate(
      async (input: HTMLInputElement, attributes) => {
        const root = document.documentElement
        const start = performance.now()
        const changed = new Promise<{ transitions: number; elapsed: number }>(
          (resolve, reject) => {
            const timeout = setTimeout(() => {
              observer.disconnect()
              reject(new Error("Palette did not change"))
            }, 5000)
            const observer = new MutationObserver(() => {
              const transitions = document
                .getAnimations()
                .filter(
                  (animation) =>
                    animation instanceof CSSTransition &&
                    /color|shadow|fill|stroke/.test(
                      animation.transitionProperty,
                    ),
                ).length
              observer.disconnect()
              clearTimeout(timeout)
              resolve({ transitions, elapsed: performance.now() - start })
            })
            observer.observe(root, {
              attributes: true,
              attributeFilter: ["class", attributes.COLOR, attributes.PRESET],
            })
          },
        )
        input.click()
        return changed
      },
      THEME_ATTRIBUTES,
    )
    console.log(
      `Palette ${name}: ${Math.round(result.elapsed)} ms, ${result.transitions} color transitions`,
    )
    expect(result.transitions).toBe(0)
    await expect(radio).toBeChecked()
  }

  const reset = drawer.getByRole("button", {
    name: "Reset appearance",
    exact: true,
  })
  await reset.scrollIntoViewIfNeeded()
  await page.mouse.move(0, 0)
  await page.evaluate(async () => {
    await Promise.all(
      document
        .getAnimations()
        .map((animation) => animation.finished.catch(() => {})),
    )
  })
  // Real pointer movement must still start the normal local background transition.
  await reset.evaluate((element) => {
    element.addEventListener("transitionrun", (event) => {
      if ((event as TransitionEvent).propertyName === "background-color")
        element.setAttribute("data-hover-transition-observed", "true")
    })
  })
  await reset.hover()
  await expect(reset).toHaveAttribute("data-hover-transition-observed", "true")
})
