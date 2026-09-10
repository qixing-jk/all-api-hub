import type { Page } from "@playwright/test"

import { CHANNEL_DIALOG_TEST_IDS } from "~/components/dialogs/ChannelDialog/testIds"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  AXON_HUB_PRIMARY_ID,
  getInterceptedAxonHubUpdateVariables,
  getInterceptedNewApiUpdatePayload,
  openInterceptedAxonHubManagedSiteChannels,
  openInterceptedDoneHubManagedSiteChannels,
  openInterceptedNewApiManagedSiteChannels,
  openInterceptedOctopusManagedSiteChannels,
} from "~~/e2e/fixtures/managedSiteChannelsIntercepted"
import {
  channelRowByName,
  openManagedSiteChannelRowActions,
} from "~~/e2e/scenarios/managedSiteChannels"

const renamed = "Upstream compatibility renamed"

async function renameChannel(page: Page, name: string) {
  await openManagedSiteChannelRowActions(page, name)
  await page.getByRole("menuitem", { name: "Edit", exact: true }).click()
  await page.getByTestId(CHANNEL_DIALOG_TEST_IDS.nameInput).fill(renamed)
  await page.getByTestId(CHANNEL_DIALOG_TEST_IDS.submitButton).click()
  await expect(channelRowByName(page, renamed)).toBeVisible()
}

test.use({ viewport: { width: 1440, height: 1000 }, locale: "en-US" })

test("DoneHub retains upstream fields when a model edit requires a complete update", async ({
  context,
  page,
  extensionId,
}) => {
  const nativeFields = {
    future_policy: { limits: [3, 7], enabled: false },
    setting: JSON.stringify({ future_setting: "keep" }),
  }
  await openInterceptedDoneHubManagedSiteChannels({
    context,
    page,
    extensionId,
    nativeFields,
  })
  await openManagedSiteChannelRowActions(page, "DoneHub primary")
  await page.getByRole("menuitem", { name: "Edit", exact: true }).click()
  await page
    .getByTestId(CHANNEL_DIALOG_TEST_IDS.modelsInput)
    .fill("model-added")
  await page.getByTestId(CHANNEL_DIALOG_TEST_IDS.modelsInput).press("Enter")
  const updates: unknown[] = []
  context.on("request", (request) => {
    if (request.method() === "PUT" && request.url().includes("/api/channel/"))
      updates.push(request.postDataJSON())
  })
  const save = page.getByTestId(CHANNEL_DIALOG_TEST_IDS.submitButton)
  await save.click()
  await expect(save).toBeHidden()
  expect(updates).toEqual([
    expect.objectContaining({
      ...nativeFields,
      models: "model-donehub-a,model-added",
    }),
  ])
})

test("New API retains upstream fields and opaque settings in a complete update", async ({
  context,
  page,
  extensionId,
}) => {
  const nativeFields = {
    future_policy: { limits: [3, 7], enabled: false },
    setting: JSON.stringify({ future_setting: { mode: "upstream" } }),
  }
  await openInterceptedNewApiManagedSiteChannels({
    context,
    page,
    extensionId,
    nativeFields,
  })
  await renameChannel(page, "Example primary")
  expect(getInterceptedNewApiUpdatePayload()).toMatchObject({
    ...nativeFields,
    name: renamed,
  })
  expect(getInterceptedNewApiUpdatePayload()).not.toHaveProperty("key")
})

test("Octopus v0.13 retains upstream detail and nested fields through a complete update", async ({
  context,
  page,
  extensionId,
}) => {
  const nativeDetail = {
    id: 17,
    name: "Example v0.13",
    dialect: "generic",
    enabled: true,
    base_url: "https://upstream.example.invalid",
    openai_chat_completion_path: "/v1/chat/completions",
    openai_response_path: "/v1/responses",
    anthropic_message_path: "/v1/messages",
    keys: [
      {
        name: "default",
        key: "fixture-key",
        enabled: true,
        future_key_policy: { mode: "upstream" },
      },
    ],
    models: ["model-a"],
    grants: [
      {
        model_name: "model-a",
        key_name: "default",
        protocols: 2,
        future_grant_policy: ["keep"],
      },
    ],
    proxy: false,
    custom_header: [
      {
        header_key: "X-Example",
        header_value: "value",
        future_header_policy: false,
      },
    ],
    param_override: "",
    channel_proxy: "",
    match_regex: "",
    future_policy: { limits: [3, 7], enabled: false },
  }
  const fixture = await openInterceptedOctopusManagedSiteChannels({
    context,
    page,
    extensionId,
    nativeDetail,
  })
  await renameChannel(page, nativeDetail.name)
  expect(fixture.getNativeDetail()).toEqual({ ...nativeDetail, name: renamed })
})

test("AxonHub can rename when an upstream optional GraphQL field is unavailable", async ({
  context,
  page,
  extensionId,
}) => {
  await openInterceptedAxonHubManagedSiteChannels({
    context,
    page,
    extensionId,
  })
  let rejectedAdvancedQueries = 0
  let coreQueries = 0
  await context.route("**/admin/graphql", async (route) => {
    const query = route.request().postDataJSON().query as string
    if (query.includes("query GetAxonHubChannel(")) {
      rejectedAdvancedQueries += 1
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          errors: [
            {
              message:
                'Cannot query field "extraModelPrefix" on type "ChannelSettings".',
              extensions: { code: "GRAPHQL_VALIDATION_FAILED" },
            },
          ],
        }),
      })
      return
    }
    if (query.includes("query GetAxonHubChannelCore(")) coreQueries += 1
    await route.fallback()
  })
  await renameChannel(page, "Example primary")
  expect(rejectedAdvancedQueries).toBe(1)
  expect(coreQueries).toBeGreaterThan(0)
  expect(getInterceptedAxonHubUpdateVariables()).toEqual({
    id: AXON_HUB_PRIMARY_ID,
    input: { name: renamed },
  })
})
