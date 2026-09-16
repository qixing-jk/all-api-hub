import { pageHeaderActionsClassName } from "~/components/PageHeader"
import { actionGroupClassName } from "~/components/ui/ActionGroup"
import { buttonVariants } from "~/components/ui/button"
import { PRODUCT_TOUR_TEST_IDS } from "~/features/ProductTour/testIds"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import { forceExtensionLanguage } from "~~/e2e/utils/commonUserFlows"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"

test("page header preserves square icons at every density in narrow containers", async ({
  page,
  context,
  extensionId,
}, testInfo) => {
  void context
  await page.goto(`chrome-extension://${extensionId}/options.html`)
  await waitForExtensionRoot(page)
  await page.evaluate(
    ({ actionClasses, buttons }) => {
      const actions = document.createElement("section")
      actions.setAttribute("aria-label", "Page header actions")
      actions.className = actionClasses
      actions.style.cssText =
        "position:fixed;inset:16px auto auto 16px;z-index:9999;width:288px;padding:16px;background:var(--background)"
      for (const { size, classes } of buttons) {
        const button = document.createElement("button")
        button.dataset.slot = "button"
        button.dataset.size = size
        button.className = classes
        button.setAttribute("aria-label", size)
        button.innerHTML =
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 4v16M4 12h16"/></svg>'
        actions.append(button)
      }
      document.body.append(actions)
    },
    {
      actionClasses: pageHeaderActionsClassName,
      buttons: (["icon-xs", "icon-sm", "icon", "icon-lg"] as const).map(
        (size) => ({
          size,
          classes: buttonVariants({ size, variant: "outline" }),
        }),
      ),
    },
  )
  const actions = page.getByRole("region", { name: "Page header actions" })
  for (const density of ["default", "compact", "comfortable"]) {
    await page.evaluate(
      (value) =>
        document.documentElement.setAttribute("data-theme-density", value),
      density,
    )
    for (const size of ["icon-xs", "icon-sm", "icon", "icon-lg"]) {
      const icon = actions.getByRole("button", { name: size, exact: true })
      await expect
        .poll(async () => {
          const box = (await icon.boundingBox())!
          return Math.abs(box.width - box.height)
        })
        .toBeLessThanOrEqual(1)
    }
  }
  await actions.screenshot({ path: testInfo.outputPath("header-preview.png") })
})

for (const preview of [
  { width: 900, textSize: "default", name: "desktop" },
  { width: 390, textSize: "default", name: "narrow" },
  { width: 320, textSize: "extra-large", name: "extra-large-text" },
] as const) {
  test(`dialog actions remain usable in the ${preview.name} preview`, async ({
    page,
    extensionId,
  }, testInfo) => {
    await page.setViewportSize({ width: preview.width, height: 720 })
    await page.goto(`chrome-extension://${extensionId}/options.html`)
    await waitForExtensionRoot(page)
    await page.evaluate(
      ({ groupClasses, primaryClasses, secondaryClasses, textSize }) => {
        document.documentElement.setAttribute("data-theme-text-size", textSize)
        const overlay = document.createElement("div")
        overlay.className =
          "bg-overlay/50 fixed inset-0 z-50 grid place-items-center p-4"
        overlay.innerHTML = `
          <section role="dialog" aria-labelledby="preview-title" class="bg-popover text-popover-foreground w-full max-w-md rounded-2xl border shadow-lg">
            <div class="space-y-density-1 px-6 py-density-4">
              <h2 id="preview-title" class="text-lg font-medium">Decrypt WebDAV data</h2>
              <p class="text-muted-foreground text-sm">Enter the password used to protect this backup before importing it.</p>
            </div>
            <div class="space-y-density-3 px-6 py-density-4">
              <label class="text-sm font-medium" for="preview-password">Backup password</label>
              <input id="preview-password" value="••••••••••••" class="border-input bg-background min-h-(--density-control) w-full rounded-md border px-3 py-density-2 text-sm" />
            </div>
            <footer class="border-border border-t px-6 py-density-4">
              <div role="group" aria-label="Dialog actions" class="${groupClasses}">
                <button data-slot="button" data-size="sm" class="${secondaryClasses}">Cancel and keep current data</button>
                <button data-slot="button" data-size="sm" class="${primaryClasses}">Decrypt and import protected backup</button>
              </div>
            </footer>
          </section>`
        document.body.append(overlay)
      },
      {
        groupClasses: actionGroupClassName("wrap"),
        primaryClasses: buttonVariants({ size: "sm" }),
        secondaryClasses: buttonVariants({ size: "sm", variant: "secondary" }),
        textSize: preview.textSize,
      },
    )

    const dialog = page.getByRole("dialog")
    const buttons = dialog.getByRole("button")
    await expect(buttons).toHaveCount(2)
    const dialogBox = (await dialog.boundingBox())!
    for (const button of await buttons.all()) {
      const box = (await button.boundingBox())!
      expect(box.x).toBeGreaterThanOrEqual(dialogBox.x)
      expect(box.x + box.width).toBeLessThanOrEqual(
        dialogBox.x + dialogBox.width,
      )
      expect(
        await button.evaluate((node) => node.scrollHeight <= node.clientHeight),
      ).toBe(true)
    }
    if (preview.width === 320) {
      const [cancelBox, confirmBox] = await Promise.all([
        buttons.nth(0).boundingBox(),
        buttons.nth(1).boundingBox(),
      ])
      expect(confirmBox!.y).toBeGreaterThan(cancelBox!.y)
    }
    await dialog.screenshot({
      path: testInfo.outputPath(`dialog-${preview.name}.png`),
    })
  })
}

for (const preview of [
  { width: 390, textSize: "default", name: "narrow" },
  { width: 320, textSize: "extra-large", name: "extra-large-text" },
] as const) {
  test(`compact actions and appearance choices fit in the ${preview.name} view`, async ({
    page,
    extensionId,
  }, testInfo) => {
    await forceExtensionLanguage(page, "en")
    await page.setViewportSize({ width: preview.width, height: 720 })
    await page.goto(`chrome-extension://${extensionId}/options.html`)
    await waitForExtensionRoot(page)
    await page.evaluate((textSize) => {
      document.documentElement.setAttribute("data-theme-text-size", textSize)
    }, preview.textSize)
    const tourActions = page
      .getByTestId(PRODUCT_TOUR_TEST_IDS.invitation)
      .getByRole("button")
    await expect(tourActions).toHaveCount(2)
    const [laterBox, startBox] = await Promise.all([
      tourActions.nth(0).boundingBox(),
      tourActions.nth(1).boundingBox(),
    ])
    expect(laterBox!.x + laterBox!.width).toBeLessThanOrEqual(startBox!.x)
    expect(
      Math.min(laterBox!.y + laterBox!.height, startBox!.y + startBox!.height) -
        Math.max(laterBox!.y, startBox!.y),
    ).toBeGreaterThan(0)
    const tourBox = (await page
      .getByTestId(PRODUCT_TOUR_TEST_IDS.invitation)
      .boundingBox())!
    for (const box of [laterBox, startBox]) {
      expect(box!.x).toBeGreaterThanOrEqual(tourBox.x)
      expect(box!.x + box!.width).toBeLessThanOrEqual(tourBox.x + tourBox.width)
    }
    await page.getByRole("button", { name: /^Current:/ }).click()
    await page
      .getByRole("menuitem", { name: "Appearance settings", exact: true })
      .click()
    const drawer = page.getByRole("dialog", {
      name: "Appearance settings",
      exact: true,
    })
    await drawer.evaluate((element) =>
      Promise.all(
        element.getAnimations().map((animation) => animation.finished),
      ),
    )

    for (const name of ["Theme mode", "Interface density", "Text size"]) {
      const group = drawer.getByRole("group", { name, exact: true })
      await group.evaluate((element) =>
        element.scrollIntoView({ block: "center", behavior: "instant" }),
      )
      const choices = group.getByRole("radio")
      const boxes = await Promise.all(
        [0, 1, 2].map((index) =>
          choices.nth(index).locator("..").boundingBox(),
        ),
      )
      const drawerBox = (await drawer.boundingBox())!
      for (const box of boxes) {
        expect(box!.x).toBeGreaterThanOrEqual(drawerBox.x)
        expect(box!.x + box!.width).toBeLessThanOrEqual(
          drawerBox.x + drawerBox.width,
        )
      }
    }

    await drawer.evaluate((element) => {
      const scroller = element.querySelector("[aria-busy]")?.parentElement
      if (scroller) scroller.scrollTop = 0
    })
    await drawer.screenshot({
      path: testInfo.outputPath(`appearance-drawer-${preview.name}.png`),
    })
  })
}
