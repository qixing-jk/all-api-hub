import type { Page } from "@playwright/test"

import { CHANNEL_DIALOG_TEST_IDS } from "~/components/dialogs/ChannelDialog/testIds"
import { SITE_TYPES } from "~/constants/siteType"
import {
  getManagedSiteChannelRowDeleteActionTestId,
  MANAGED_SITE_CHANNELS_TEST_IDS,
} from "~/features/ManagedSiteChannels/testIds"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  getOmniRouteClientRequestCount,
  getOmniRouteCreatePayloads,
  getOmniRouteDeletedConnectionIds,
  getOmniRouteDeletedNodeIds,
  getOmniRouteLastListRows,
  getOmniRouteListRequestCount,
  getOmniRouteNodeCreatePayloads,
  getOmniRouteUpdatePayloads,
  OMNIROUTE_FIXTURE_ORIGIN,
  OMNIROUTE_PRIMARY_ERROR,
  openInterceptedOmniRouteManagedSiteChannels,
} from "~~/e2e/fixtures/omniRouteChannelsIntercepted"
import {
  channelRowByName,
  openManagedSiteChannelRowActions,
  runManagedSiteChannelsCrudScenario,
} from "~~/e2e/scenarios/managedSiteChannels"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"

test.use({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 1,
  locale: "en-US",
  timezoneId: "UTC",
  contextOptions: { reducedMotion: "reduce" },
})

async function deleteChannelFromRow(page: Page, name: string) {
  const { rowTestToken } = await openManagedSiteChannelRowActions(page, name)
  await page
    .getByTestId(getManagedSiteChannelRowDeleteActionTestId(rowTestToken))
    .click()
  const confirm = page.getByTestId(
    MANAGED_SITE_CHANNELS_TEST_IDS.deleteChannelConfirmButton,
  )
  await expect(confirm).toBeEnabled({ timeout: 10_000 })
  await confirm.click()
  await expect(channelRowByName(page, name)).toHaveCount(0, {
    timeout: 30_000,
  })
}

test("shows the gateway's own diagnosis and keeps the credential out of the page", async ({
  context,
  page,
  extensionId,
}) => {
  // The gateway answers this route with plaintext when the deployment runs with
  // `ALLOW_API_KEY_REVEAL`, so the stub does too: proving the page drops a value
  // it was actually handed is the claim worth testing, not the masked case.
  await openInterceptedOmniRouteManagedSiteChannels({
    context,
    page,
    extensionId,
    revealApiKeys: true,
  })
  await waitForExtensionRoot(page)

  await expect(page.getByRole("table")).toBeVisible({ timeout: 30_000 })
  await expect(channelRowByName(page, "Example primary")).toBeVisible({
    timeout: 30_000,
  })
  await expect(channelRowByName(page, "Example secondary")).toBeVisible()

  await openManagedSiteChannelRowActions(page, "Example primary")
  await page
    .getByRole("menuitem", { name: "View channel", exact: true })
    .click()

  const detail = page.getByRole("dialog").first()
  await expect(detail).toBeVisible({ timeout: 30_000 })
  // The gateway's connection test is the only signal that separates a working
  // channel from one it cannot reach, and it is read-only here.
  await expect(detail).toContainText("Connection test")
  await expect(detail).toContainText("Failed")
  await expect(detail).toContainText("Last error")
  await expect(detail).toContainText(OMNIROUTE_PRIMARY_ERROR)

  // The gateway really did send the credential to this page.
  expect(getOmniRouteLastListRows()).toContainEqual(
    expect.objectContaining({ apiKey: "sk-omni-fixture-primary" }),
  )

  // Neither the credential nor the gateway's `first8****last4` placeholder may
  // reach any surface: the projection keeps a secret state, not a value.
  const rendered = `${await detail.innerText()}\n${await page.locator("body").innerText()}`
  expect(rendered).not.toContain("sk-omni-")
  expect(rendered).not.toContain("****")

  // `GET /api/providers/client` returns the same rows in plaintext; nothing the
  // workspace renders may need it, and the masked list route must be the source.
  expect(getOmniRouteClientRequestCount()).toBe(0)
  expect(getOmniRouteListRequestCount()).toBeGreaterThan(0)
})

test("creates, renames and deletes a connection through the gateway's own routes", async ({
  context,
  page,
  extensionId,
}) => {
  await openInterceptedOmniRouteManagedSiteChannels({
    context,
    page,
    extensionId,
  })

  await runManagedSiteChannelsCrudScenario({
    page,
    extensionId,
    siteType: SITE_TYPES.OMNIROUTE,
    label: "OmniRoute",
    runPrefix: "AAH E2E OmniRoute",
    verifyRenamePreservation: { baseUrl: OMNIROUTE_FIXTURE_ORIGIN },
  })

  // The arbitrary relay is imported in one step: the built-in OpenAI-compatible
  // provider plus a connection-level address override, with no reachability
  // fields the gateway would treat as a precondition.
  expect(getOmniRouteCreatePayloads()).toEqual([
    {
      provider: "openai",
      name: "AAH E2E OmniRoute CRUD",
      apiKey: "sk-aah-e2e-omniroute-crud",
      providerSpecificData: { baseUrl: "https://upstream.example.invalid/v1" },
    },
  ])

  // A rename sends only the field the editor changed, which is what keeps the
  // gateway's own priority ordering and status untouched.
  expect(getOmniRouteUpdatePayloads()).toEqual([
    { name: "AAH E2E OmniRoute CRUD edited" },
  ])

  expect(getOmniRouteDeletedConnectionIds()).toHaveLength(1)
})

test("builds a provider node for a prefix-addressed channel and retains it on delete", async ({
  context,
  page,
  extensionId,
}) => {
  await openInterceptedOmniRouteManagedSiteChannels({
    context,
    page,
    extensionId,
  })
  await waitForExtensionRoot(page)

  const channelName = "AAH E2E OmniRoute prefix"
  await page
    .getByTestId(MANAGED_SITE_CHANNELS_TEST_IDS.addChannelButton)
    .click()

  const dialog = page.getByRole("dialog").first()
  const submit = page.getByTestId(CHANNEL_DIALOG_TEST_IDS.submitButton)
  await expect(submit).toBeVisible({ timeout: 30_000 })
  await page.getByTestId(CHANNEL_DIALOG_TEST_IDS.nameInput).fill(channelName)
  await page
    .getByTestId(CHANNEL_DIALOG_TEST_IDS.keyInput)
    .fill("sk-aah-e2e-omniroute-prefix")
  await page
    .getByTestId(CHANNEL_DIALOG_TEST_IDS.baseUrlInput)
    .fill("https://relay.example.invalid")
  await dialog.getByRole("button", { name: "Advanced", exact: true }).click()
  await dialog
    .getByRole("textbox", { name: "Custom model prefix", exact: true })
    .fill("fixtureprefix")
  await submit.click()
  await expect(submit).not.toBeVisible({ timeout: 30_000 })

  await expect(channelRowByName(page, channelName)).toBeVisible({
    timeout: 30_000,
  })

  // A dedicated prefix needs its own node, and the connection that follows
  // references that node instead of overriding the built-in provider.
  expect(getOmniRouteNodeCreatePayloads()).toEqual([
    {
      name: channelName,
      prefix: "fixtureprefix",
      apiType: "chat",
      baseUrl: "https://relay.example.invalid",
      type: "openai-compatible",
    },
  ])
  const createPayloads = getOmniRouteCreatePayloads()
  expect(createPayloads).toHaveLength(1)
  expect(createPayloads[0]?.provider).toBe("node-created-1")
  expect(createPayloads[0]).not.toHaveProperty("providerSpecificData")

  await deleteChannelFromRow(page, channelName)

  // Channel deletion retains the node because gateway-side node deletion could
  // cascade into other connections created after this channel.
  expect(getOmniRouteDeletedConnectionIds()).toHaveLength(1)
  expect(getOmniRouteDeletedNodeIds()).toEqual([])
})
