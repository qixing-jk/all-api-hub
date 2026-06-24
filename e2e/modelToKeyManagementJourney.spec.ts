import type { ModelPricing } from "~/services/apiService/common/type"
import { test } from "~~/e2e/fixtures/extensionTest"
import { runModelToKeyManagementScenario } from "~~/e2e/scenarios/modelToKeyManagement"
import {
  createStoredAccount,
  forceExtensionLanguage,
  installExtensionPageGuards,
  seedStoredAccounts,
  stubLlmMetadataIndex,
  stubNewApiSiteRoutes,
} from "~~/e2e/utils/commonUserFlows"
import { getServiceWorker } from "~~/e2e/utils/extensionState"

const MODEL_KEY_BASE_URL = "https://model-key.example.com"
const MODEL_KEY_ACCOUNT_ID = "model-key-account"
const MODEL_ID = "gpt-model-key-mini"
const CREATED_KEY_NAME = "vip group (auto)"

const MODEL_KEY_PRICING: ModelPricing[] = [
  {
    model_name: MODEL_ID,
    model_description: "E2E model that should produce a group default key",
    quota_type: 0,
    model_ratio: 1,
    model_price: 0,
    owner_by: "openai",
    completion_ratio: 1,
    enable_groups: ["vip"],
    supported_endpoint_types: ["chat_completions"],
  },
]

test.beforeEach(async ({ context, page }) => {
  installExtensionPageGuards(page)
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
})

test("creates a group default key from Model List and continues in Key Management", async ({
  context,
  extensionId,
  page,
}) => {
  const serviceWorker = await getServiceWorker(context)
  await seedStoredAccounts(serviceWorker, [
    createStoredAccount({
      id: MODEL_KEY_ACCOUNT_ID,
      site_name: "Model Key Account",
      site_url: MODEL_KEY_BASE_URL,
      account_info: {
        id: "301",
        username: "model-key-user",
        access_token: "model-key-token",
      },
    }),
  ])
  await stubNewApiSiteRoutes(context, {
    baseUrl: MODEL_KEY_BASE_URL,
    models: [MODEL_ID],
    pricingModels: MODEL_KEY_PRICING,
    groups: {
      default: { desc: "Default", ratio: 1 },
      vip: { desc: "VIP", ratio: 2 },
    },
  })

  await runModelToKeyManagementScenario({
    page,
    extensionId,
    accountId: MODEL_KEY_ACCOUNT_ID,
    modelId: MODEL_ID,
    createdKeyName: CREATED_KEY_NAME,
    catalogExpectations: {
      sourceLabel: "Model Key Account",
      modelNames: [MODEL_ID],
      totalModels: 1,
    },
    expectedModelDialogLabels: ["vip"],
    expectedAddKeyDialogLabels: ["vip - VIP"],
    expectedKeyManagementLabels: ["vip"],
    prepareKeyManagementPage: async (keysPage) => {
      installExtensionPageGuards(keysPage)
      await forceExtensionLanguage(keysPage, "en")
    },
  })
})
