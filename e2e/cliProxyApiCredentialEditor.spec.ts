import { CHANNEL_DIALOG_TEST_IDS } from "~/components/dialogs/ChannelDialog/testIds"
import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { SITE_TYPES } from "~/constants/siteType"
import { getManagedSiteChannelRowEditActionTestId } from "~/features/ManagedSiteChannels/testIds"
import type { CliProxyApiProvider } from "~/services/apiService/cliProxyApi"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import { openManagedSiteChannelRowActions } from "~~/e2e/scenarios/managedSiteChannels"
import {
  forceExtensionLanguage,
  seedUserPreferences,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import { getServiceWorker } from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"

for (const width of [1200, 390]) {
  test(`edits compact CLIProxyAPI credentials at ${width}px`, async ({
    context,
    page,
    extensionId,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 })
    const origin = "https://cliproxy-ui.example.invalid"
    let provider: CliProxyApiProvider = {
      name: "UI credentials",
      "base-url": "https://upstream.example.invalid/v1",
      models: [{ name: "example-model", context: 123 }],
      headers: { "X-Endpoint": "https://example.invalid:8443/v1" },
      "api-key-entries": [
        {
          "api-key": "fixture-first",
          "proxy-url": "http://localhost:7890",
          weight: 2,
        },
        { "api-key": "fixture-second" },
        ...(width === 390
          ? Array.from({ length: 8 }, (_, index) => ({
              "api-key": `fixture-extra-${index}`,
            }))
          : []),
      ],
    }
    await context.route(`${origin}/**`, async (route) => {
      const kind = new URL(route.request().url()).pathname.split("/").pop()!
      if (route.request().method() === "PATCH") {
        const body = route.request().postDataJSON()
        provider = { ...provider, ...body.value }
        await route.fulfill({ json: { status: "ok" } })
        return
      }
      await route.fulfill({
        json: {
          [kind]: kind === "openai-compatibility" ? [provider] : [],
        },
      })
    })
    await forceExtensionLanguage(page, "en")
    await stubLlmMetadataIndex(context)
    await seedUserPreferences(await getServiceWorker(context), {
      managedSiteType: SITE_TYPES.CLI_PROXY_API,
      cliProxyApi: { baseUrl: origin, adminToken: "fixture-token" },
      openChangelogOnUpdate: false,
    })
    await page.goto(
      `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.MANAGED_SITE_CHANNELS}`,
    )
    await waitForExtensionRoot(page)
    const action = await openManagedSiteChannelRowActions(
      page,
      "UI credentials",
    )
    const editAction = page.getByTestId(
      getManagedSiteChannelRowEditActionTestId(action.rowTestToken),
    )
    for (const dark of [true, false]) {
      await page.evaluate(
        (value) => document.documentElement.classList.toggle("dark", value),
        dark,
      )
      await editAction.hover()
      await editAction.focus()
      await expect(editAction).toBeFocused()
      expect(
        await editAction.evaluate((element) =>
          Number.parseFloat(getComputedStyle(element).borderRadius),
        ),
      ).toBeGreaterThanOrEqual(6)
      await page.getByRole("menu").screenshot({
        path: testInfo.outputPath(`menu-hover-${dark ? "dark" : "light"}.png`),
        animations: "disabled",
      })
    }
    const unavailableSync = page.getByRole("menuitem", {
      name: /Sync model list immediately/,
    })
    await expect(unavailableSync).toHaveAttribute("aria-disabled", "true")
    await unavailableSync.hover()
    await expect(unavailableSync).toHaveCSS("cursor", "not-allowed")
    await unavailableSync.focus()
    await unavailableSync.press("Enter")
    await expect(unavailableSync).toBeVisible()
    expect(
      (await page.getByRole("menu").boundingBox())!.width,
    ).toBeLessThanOrEqual(256)
    await expect(unavailableSync).toHaveCSS("box-shadow", "none")
    expect(
      await unavailableSync.evaluate((element) =>
        Number.parseFloat(getComputedStyle(element).borderRadius),
      ),
    ).toBeGreaterThanOrEqual(6)
    await page.screenshot({ path: testInfo.outputPath("unavailable-sync.png") })
    await page
      .getByTestId(
        getManagedSiteChannelRowEditActionTestId(action.rowTestToken),
      )
      .click()
    const dialog = page.getByRole("dialog")
    await page.screenshot({ path: testInfo.outputPath("compact-editor.png") })
    const first = dialog.getByRole("group", { name: "API Key 1", exact: true })
    const input = first.getByLabel("API Key 1", { exact: true })
    await expect(input).not.toBeVisible()
    expect((await first.boundingBox())!.height).toBeLessThanOrEqual(50)
    await first.getByText("Key 1", { exact: true }).click()
    await expect(input).toHaveAttribute(
      "placeholder",
      "Leave blank to keep the saved key",
    )
    await first.getByRole("button", { name: "Show key", exact: true }).click()
    await expect(input).toHaveValue("fixture-first")
    await input.press("End")
    await input.pressSequentially("-edited")
    await expect(input).toHaveAttribute("type", "text")
    await expect(input).toHaveValue("fixture-first-edited")
    await expect(
      first.getByText("Key will be replaced", { exact: true }),
    ).toBeVisible()
    const proxy = await first
      .getByLabel("Proxy URL", { exact: true })
      .boundingBox()
    const weight = await first
      .getByLabel("Weight", { exact: true })
      .boundingBox()
    expect(proxy).not.toBeNull()
    expect(weight).not.toBeNull()
    if (width > 640) {
      expect(Math.abs(proxy!.y - weight!.y)).toBeLessThan(2)
      expect(proxy!.width).toBeGreaterThan(weight!.width)
    } else {
      expect(weight!.y).toBeGreaterThan(proxy!.y + proxy!.height)
    }
    expect(weight!.width).toBeLessThanOrEqual(100)
    await expect(dialog.getByText(/Leave blank for weight 1\./)).toHaveCount(1)
    for (const dark of [false, true]) {
      await page.evaluate(
        (value) => document.documentElement.classList.toggle("dark", value),
        dark,
      )
      await first.scrollIntoViewIfNeeded()
      await expect
        .poll(() =>
          first.evaluate(
            (element) => element.scrollWidth <= element.clientWidth,
          ),
        )
        .toBe(true)
      await page.screenshot({
        path: testInfo.outputPath(`credentials-${dark ? "dark" : "light"}.png`),
      })
    }
    await first
      .getByRole("button", { name: "Keep saved key", exact: true })
      .click()
    await expect(input).toHaveValue("")
    await expect(input).toHaveAttribute("type", "password")
    const collapse = first.getByRole("button", {
      name: "Collapse API Key 1",
      exact: true,
    })
    const triggerBounds = (await collapse.boundingBox())!
    expect(triggerBounds.width).toBeGreaterThan(
      (await first.boundingBox())!.width * 0.7,
    )
    await collapse.click({
      position: { x: triggerBounds.width - 8, y: triggerBounds.height / 2 },
    })
    await expect(input).not.toBeVisible()
    await dialog.getByRole("button", { name: "Models", exact: true }).click()
    const aliasInput = dialog.getByRole("textbox", {
      name: "Alias (optional) 1",
      exact: true,
    })
    await aliasInput.fill("invalid=alias")
    await expect(
      dialog.getByText("Enter a valid value.", { exact: true }),
    ).toBeVisible()
    await expect(
      dialog.getByTestId(CHANNEL_DIALOG_TEST_IDS.submitButton),
    ).toBeDisabled()
    await dialog
      .getByRole("textbox", { name: "Alias (optional) 1", exact: true })
      .fill("friendly-model")
    await expect(aliasInput).toBeVisible()
    await expect(
      dialog.getByText("Enter a valid value.", { exact: true }),
    ).not.toBeVisible()
    await dialog.getByRole("button", { name: "Advanced", exact: true }).click()
    await expect(
      dialog.getByRole("textbox", { name: "Value 1", exact: true }),
    ).toHaveValue("https://example.invalid:8443/v1")
    await dialog
      .getByRole("textbox", { name: "Value 1", exact: true })
      .fill("https://changed.invalid:9443/v1")
    await page.screenshot({
      path: testInfo.outputPath("structured-editor.png"),
    })
    expect(
      await dialog.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true)
    await dialog.getByTestId(CHANNEL_DIALOG_TEST_IDS.submitButton).click()
    await expect(dialog).not.toBeVisible()
    expect(provider.models).toEqual([
      { name: "example-model", alias: "friendly-model", context: 123 },
    ])
    expect(provider.headers).toEqual({
      "X-Endpoint": "https://changed.invalid:9443/v1",
    })
    expect(provider["api-key-entries"]?.[0]["api-key"]).toBe("fixture-first")
    const updatedAction = await openManagedSiteChannelRowActions(
      page,
      "UI credentials",
    )
    await page
      .getByTestId(
        getManagedSiteChannelRowEditActionTestId(updatedAction.rowTestToken),
      )
      .click()
    await dialog.getByRole("button", { name: "Add key", exact: true }).click()
    await expect(
      dialog
        .getByRole("group", {
          name: `API Key ${width === 390 ? 11 : 3}`,
          exact: true,
        })
        .getByText("New, not saved"),
    ).toBeVisible()
  })
}
