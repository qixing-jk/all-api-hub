import type { Page } from "@playwright/test"

import { CHANNEL_DIALOG_TEST_IDS } from "~/components/dialogs/ChannelDialog/testIds"
import { expect } from "~~/e2e/fixtures/extensionTest"

/** Exercises Octopus's backend model probe with the untouched import or saved URL. */
export async function expectOctopusImportModels(params: {
  page: Page
  sourceBaseUrl: string
  saved?: boolean
}) {
  const models = params.page.getByRole("group", {
    name: "Available Models",
    exact: true,
  })
  const loadModels = models.getByRole("button", {
    name: /^(?:Load|Refresh) Available Models$/u,
  })
  await expect(loadModels).toBeEnabled({ timeout: 30_000 })
  const [response] = await Promise.all([
    params.page.context().waitForEvent("response", {
      timeout: 30_000,
      predicate: (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname.endsWith(
          "/api/v1/channel/fetch-model",
        ),
    }),
    loadModels.click(),
  ])

  const payload = response.request().postDataJSON()
  const protocolPaths = Boolean(payload.channel)
  const sourceRoot = params.sourceBaseUrl
    .replace(/\/+$/u, "")
    .replace(/\/v1$/u, "")
  const baseUrl = protocolPaths
    ? payload.channel.base_url
    : payload.base_url ?? payload.base_urls?.[0]?.url
  // v0.12 normalizes /v1 when persisting a channel; JWT-era servers retain it.
  const expectedUrls = protocolPaths
    ? [sourceRoot]
    : params.saved
      ? [sourceRoot, `${sourceRoot}/v1`]
      : [`${sourceRoot}/v1`]
  expect(expectedUrls).toContain(baseUrl)
  await expect(
    params.page.getByTestId(CHANNEL_DIALOG_TEST_IDS.baseUrlInput),
  ).toHaveValue(baseUrl)
  if (protocolPaths) {
    expect(payload.channel.openai_chat_completion_path).toBe(
      "/v1/chat/completions",
    )
  }

  // Report only status and model counts: live bodies and requests contain credentials.
  expect(response.status(), "Octopus model probe HTTP status").toBe(200)
  const body = await response.json()
  expect(body.code, "Octopus model probe result code").toBe(200)
  expect(Array.isArray(body.data), "Octopus returned a model list").toBe(true)
  // An authenticated upstream may legitimately expose no models. Discovery must
  // complete successfully without making channel creation depend on its catalog.
  await expect(
    models.getByRole("button", {
      name: "Refresh Available Models",
      exact: true,
    }),
  ).toBeEnabled({ timeout: 30_000 })
  await expect(models.getByRole("alert")).toHaveCount(0)
  await expect(
    params.page.getByTestId(CHANNEL_DIALOG_TEST_IDS.modelsInput),
  ).toBeEnabled()
}
