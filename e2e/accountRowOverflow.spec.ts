import { THEME_ATTRIBUTES } from "~/constants/theme"
import {
  getAccountManagementListItemTestId,
  ACCOUNT_MANAGEMENT_TEST_IDS as ids,
} from "~/features/AccountManagement/testIds"
import { createDefaultAccountStorageConfig } from "~/services/accounts/accountDefaults"
import { STORAGE_KEYS } from "~/services/core/storageKeys"
import { SiteHealthStatus } from "~/types"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import { finishColorTransitions } from "~~/e2e/utils/colorContrast"
import {
  createStoredAccount,
  forceExtensionLanguage,
  seedUserPreferences,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import {
  getServiceWorker,
  setPlasmoStorageValue,
} from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"

test("pinned account rows never create an inner vertical scrollbar", async ({
  page,
  context,
  extensionId,
}, testInfo) => {
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
  const worker = await getServiceWorker(context)
  await seedUserPreferences(worker, { themeMode: "light" })
  await setPlasmoStorageValue(worker, STORAGE_KEYS.ACCOUNTS, {
    ...createDefaultAccountStorageConfig(),
    accounts: [
      createStoredAccount({
        id: "pinned",
        site_name:
          "Pinned account with a long name that must stay inside its column",
        health: { status: SiteHealthStatus.Warning },
      }),
    ],
    pinnedAccountIds: ["pinned"],
  })
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto(`chrome-extension://${extensionId}/options.html#account`)
  await waitForExtensionRoot(page)
  const row = page.getByTestId(getAccountManagementListItemTestId("pinned"))
  const pin = row.getByRole("button", { name: "Unpin account", exact: true })
  const health = row.getByRole("button", {
    name: "Click to refresh health status",
    exact: true,
  })
  await expect(pin).toBeVisible()
  for (const dark of [false, true]) {
    await page
      .locator("html")
      .evaluate((el, value) => el.classList.toggle("dark", value), dark)
    for (const density of ["default", "compact", "comfortable"]) {
      await page
        .locator("html")
        .evaluate((el, args) => el.setAttribute(args.attribute, args.density), {
          attribute: THEME_ATTRIBUTES.DENSITY,
          density,
        })
      for (const width of [1280, 740, 390, 320]) {
        await page.setViewportSize({ width, height: 900 })
        for (const interaction of ["idle", "hover", "focus"]) {
          if (interaction === "idle") {
            await pin.blur()
            await page.mouse.move(0, 0)
          } else if (interaction === "hover") {
            await health.hover()
          } else {
            await pin.focus()
          }
          await finishColorTransitions(row)
          const scrollbars = await row.evaluate((root) =>
            [...root.querySelectorAll<HTMLElement>("*")].flatMap((el) => {
              const style = getComputedStyle(el)
              if (
                !["auto", "scroll"].includes(style.overflowY) ||
                el.clientHeight === 0 ||
                el.scrollHeight <= el.clientHeight
              )
                return []
              return [
                {
                  className: el.className,
                  overflowY: style.overflowY,
                  height: el.clientHeight,
                  scrollHeight: el.scrollHeight,
                },
              ]
            }),
          )
          expect(
            scrollbars,
            `${dark} ${density} ${width} ${interaction}`,
          ).toEqual([])
          await expect(pin).toBeVisible()
          await expect(row.getByTestId(ids.rowOpenButton)).toBeVisible()
        }
        // Horizontal clipping must still keep long names out of the actions column.
        const name = await row.getByTestId(ids.rowOpenButton).boundingBox()
        const action = await row.getByTestId(ids.rowCopyKeyButton).boundingBox()
        expect(name!.x + name!.width).toBeLessThanOrEqual(action!.x)
        await pin.blur()
        await page.mouse.move(0, 0)
        await row.screenshot({
          path: testInfo.outputPath(
            `${dark}-${density}-${width}-pinned-row.png`,
          ),
        })
      }
    }
  }
  await pin.click()
  await expect(pin).toHaveCount(0)
})
