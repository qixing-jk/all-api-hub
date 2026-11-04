import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

import {
  getMockModelPricingCache,
  QUOTA_PER_USD,
} from "./doc-screenshot-data.mjs"

const root = fileURLToPath(new URL("../", import.meta.url))

export async function setupRoutes(context, t) {
  const deepseekPricing = [
    {
      model_name: "deepseek-chat",
      quota_type: 0,
      model_ratio: 1.0,
      model_price: 0,
      prompt_ratio: 1.0,
      completion_ratio: 2.0,
      cache_ratio: 0.1,
      available: true,
      supported_endpoint_types: ["openai", "anthropic"],
      enable_groups: ["default", "vip"],
    },
    {
      model_name: "deepseek-reasoner",
      quota_type: 0,
      model_ratio: 2.5,
      model_price: 0,
      prompt_ratio: 1.0,
      completion_ratio: 4.0,
      cache_ratio: 0.2,
      available: true,
      supported_endpoint_types: ["openai"],
      enable_groups: ["default", "vip"],
    },
    {
      model_name: "claude-3-7-sonnet",
      quota_type: 0,
      model_ratio: 15.0,
      model_price: 0,
      prompt_ratio: 1.0,
      completion_ratio: 5.0,
      cache_ratio: 0.1,
      available: true,
      supported_endpoint_types: ["anthropic", "openai"],
      enable_groups: ["default", "vip"],
    },
    {
      model_name: "gpt-4o",
      quota_type: 0,
      model_ratio: 12.5,
      model_price: 0,
      prompt_ratio: 1.0,
      completion_ratio: 4.0,
      cache_ratio: 0.5,
      available: true,
      supported_endpoint_types: ["openai"],
      enable_groups: ["default", "vip"],
    },
    {
      model_name: "gemini-2.5-pro",
      quota_type: 0,
      model_ratio: 6.0,
      model_price: 0,
      prompt_ratio: 1.0,
      completion_ratio: 4.0,
      cache_ratio: 0.25,
      available: true,
      supported_endpoint_types: ["openai", "gemini"],
      enable_groups: ["default", "vip"],
    },
  ]

  const deepseekModels = [
    "deepseek-chat",
    "deepseek-reasoner",
    "claude-3-7-sonnet",
    "gpt-4o",
    "gemini-2.5-pro",
  ]

  const mockTokens = [
    {
      id: 101,
      name: t("Default Dev API Key"),
      key: "sk-ah-9a8b7c6d5e4f3a2b1c0d",
      remain_quota: Math.round(50.0 * QUOTA_PER_USD),
      unlimited_quota: false,
      used_quota: Math.round(15.3 * QUOTA_PER_USD),
      created_time: Math.floor(Date.now() / 1000) - 86400 * 15,
      accessed_time: Math.floor(Date.now() / 1000) - 300,
      expired_time: -1,
      status: 1,
    },
    {
      id: 102,
      name: "Cursor IDE Key",
      key: "sk-ah-1f2e3d4c5b6a708192a3",
      remain_quota: Math.round(30.0 * QUOTA_PER_USD),
      unlimited_quota: false,
      used_quota: Math.round(8.5 * QUOTA_PER_USD),
      created_time: Math.floor(Date.now() / 1000) - 86400 * 10,
      accessed_time: Math.floor(Date.now() / 1000) - 1200,
      expired_time: Math.floor(Date.now() / 1000) + 30 * 86400,
      status: 1,
    },
    {
      id: 103,
      name: "Claude Code CLI",
      key: "sk-ah-88a91c0e3d2b5f4a6c7e",
      remain_quota: 0,
      unlimited_quota: true,
      used_quota: Math.round(28.4 * QUOTA_PER_USD),
      created_time: Math.floor(Date.now() / 1000) - 86400 * 5,
      accessed_time: Math.floor(Date.now() / 1000) - 60,
      expired_time: -1,
      status: 1,
    },
    {
      id: 104,
      name: "Roo Code / Cline Key",
      key: "sk-ah-77b82d1f4e3c6a5b8d9f",
      remain_quota: Math.round(20.0 * QUOTA_PER_USD),
      unlimited_quota: false,
      used_quota: Math.round(4.2 * QUOTA_PER_USD),
      created_time: Math.floor(Date.now() / 1000) - 86400 * 2,
      accessed_time: Math.floor(Date.now() / 1000) - 1800,
      expired_time: -1,
      status: 2,
    },
  ]

  const handleSiteApiRoute = async (route) => {
    const url = new URL(route.request().url())
    const path = url.pathname
    if (
      url.hostname === "openrouter.ai" &&
      (path === "/api/v1/models/user" || path === "/api/v1/models")
    ) {
      const catalog =
        getMockModelPricingCache()["provider-catalog|openrouter-public"].pricing
      const models = catalog.data.map((model) => ({
        id: model.model_name,
        name: model.model_name,
        pricing: {
          prompt: String(model.token_price_usd_per_million.input / 1e6),
          completion: String(model.token_price_usd_per_million.output / 1e6),
          input_cache_read: String(
            model.token_price_usd_per_million.cache_read / 1e6,
          ),
        },
        architecture: {
          input_modalities: ["text"],
          output_modalities: ["text"],
        },
        supported_parameters: ["tools", "temperature"],
      }))
      await route.fulfill({
        status: 200,
        json: {
          data: models,
          total_count: models.length,
          links: { next: null },
        },
      })
      return
    }
    if (url.hostname === "sub2api.example.com" && path.startsWith("/api/v1/")) {
      const key = {
        id: 103,
        user_id: 1001,
        name: mockTokens[2].name,
        key: mockTokens[2].key,
        status: "active",
        group_id: 1,
        group: {
          id: 1,
          name: "default",
          platform: "anthropic",
          rate_multiplier: 0.75,
        },
      }
      const data =
        path === "/api/v1/keys"
          ? { items: [key], page: 1, pages: 1, total: 1 }
          : path === "/api/v1/keys/103"
            ? key
            : path.includes("rates")
              ? { 1: 0.75 }
              : [key.group]
      await route.fulfill({
        status: 200,
        json: { code: 0, message: "success", data },
      })
      return
    }
    const tokenDetail = /^\/api\/token\/(\d+)$/.exec(path)
    if (tokenDetail) {
      await route.fulfill({
        status: 200,
        json: {
          success: true,
          data: mockTokens.find((token) => token.id === Number(tokenDetail[1])),
        },
      })
      return
    }
    const tokenSecret = /^\/api\/token\/(\d+)\/key$/.exec(path)
    if (tokenSecret) {
      const token = mockTokens.find(
        (token) => token.id === Number(tokenSecret[1]),
      )
      await route.fulfill({
        status: 200,
        json: { success: true, data: { key: token?.key } },
      })
      return
    }
    if (path === "/api/pricing") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: deepseekPricing,
          group_ratio: { default: 1.0, vip: 0.9 },
          usable_group: {
            default: t("Standard (1.0x)"),
            vip: t("VIP Fast Track (0.9x)"),
          },
        }),
      })
      return
    }
    if (path.startsWith("/api/token")) {
      const p = parseInt(url.searchParams.get("p") || "1", 10)
      if (p > 1) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            data: {
              items: [],
              page: p,
              page_size: 100,
              total: mockTokens.length,
            },
          }),
        })
        return
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            items: mockTokens,
            page: 1,
            page_size: 100,
            total: mockTokens.length,
          },
        }),
      })
      return
    }
    if (path === "/api/user/models" || path === "/v1/models") {
      const modelIds =
        url.hostname === "sub2api.example.com"
          ? ["claude-3-7-sonnet"]
          : deepseekModels
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data:
            path === "/api/user/models"
              ? modelIds
              : modelIds.map((id) => ({ id })),
        }),
      })
      return
    }
    if (path === "/api/user/self") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            id: "ah_5502",
            username: "alex.dev",
            group: "default",
            quota: Math.round(112.4 * QUOTA_PER_USD),
          },
        }),
      })
      return
    }
    if (path === "/api/group") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: ["default", "vip"],
        }),
      })
      return
    }
    if (path === "/api/status") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: { system_name: "API Gateway", price: 7.2 },
        }),
      })
      return
    }
    if (path === "/api/log/self/stat") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            quota: Math.round(3.45 * QUOTA_PER_USD),
            rpm: 12,
            tpm: 45000,
          },
        }),
      })
      return
    }
    await route.fulfill({ status: 200, json: { success: true, data: [] } })
  }

  await context.route("https://aihubmix.com/**", handleSiteApiRoute)
  await context.route("https://console.aihubmix.com/**", handleSiteApiRoute)
  await context.route("https://sub2api.example.com/**", handleSiteApiRoute)
  await context.route("https://openrouter.ai/**", handleSiteApiRoute)
  await context.route("https://newapi.example.com/**", handleSiteApiRoute)

  const kimiPricingDoc = await fs.readFile(
    path.join(root, "tests/fixtures/kimi/pricing-doc.cny.md"),
    "utf8",
  )
  const handleKimiRoute = async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname === "/docs/pricing.md") {
      await route.fulfill({
        status: 200,
        contentType: "text/plain",
        body: kimiPricingDoc,
      })
      return
    }
    const endpoint = url.searchParams.get("endpoint")
    const data =
      endpoint === "userInfo"
        ? {
            uid: "kimi-1001",
            name: "alex.dev",
            organizations: [{ organization: { id: "org-demo" } }],
          }
        : endpoint === "listProjects"
          ? [{ id: "project-demo", name: "Default", is_default: true }]
          : { object: "list", data: [{ id: "kimi-k3" }, { id: "kimi-k2.6" }] }
    await route.fulfill({ status: 200, json: { code: 0, data } })
  }
  await context.route("https://platform.kimi.com/**", handleKimiRoute)
  await context.route("https://platform.kimi.ai/**", handleKimiRoute)

  // Playwright applies matching routes in reverse registration order.
  await context.route("https://raw.githubusercontent.com/**", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        schemaVersion: 1,
        catalogVersion: "1.0.0",
        updatedAt: "2026-03-01T00:00:00.000Z",
        sponsors: [],
      }),
    })
  })

  await context.route(
    "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json",
    async (route) => {
      const catalog =
        getMockModelPricingCache()["provider-catalog|openrouter-public"].pricing
      await route.fulfill({
        status: 200,
        json: Object.fromEntries(
          catalog.data.map((model) => [
            model.model_name,
            {
              input_cost_per_token:
                model.token_price_usd_per_million.input / 1e6,
              output_cost_per_token:
                model.token_price_usd_per_million.output / 1e6,
            },
          ]),
        ),
      })
    },
  )

  const managedChannels = [
    ...[mockTokens[0], mockTokens[2]].map((token, index) => ({
      id: 6 + index,
      name: t(index === 0 ? "New API Model Gateway" : "Sub2API Claude Channel"),
      type: 1,
      key: token.key,
      base_url:
        index === 0
          ? "https://newapi.example.com"
          : "https://sub2api.example.com",
      models: index === 0 ? deepseekModels.join(",") : "claude-3-7-sonnet",
      group: "default,vip",
      status: 1,
      priority: 10,
      weight: 1,
      response_time: 180,
    })),
    {
      id: 1,
      name: t("OpenAI Direct Channel"),
      type: 1,
      key: "sk-mock-key-1",
      base_url: "https://api.openai.com",
      models: "gpt-4o,gpt-4o-mini,o3-mini,text-embedding-3-large",
      group: "default,vip",
      status: 1,
      priority: 10,
      weight: 1,
      response_time: 180,
    },
    {
      id: 2,
      name: t("Anthropic High-Speed Channel"),
      type: 14,
      key: "sk-mock-key-2",
      base_url: "https://api.anthropic.com",
      models: "claude-3-7-sonnet,claude-3-5-sonnet,claude-3-5-haiku",
      group: "default,vip",
      status: 1,
      priority: 9,
      weight: 1,
      response_time: 210,
    },
    {
      id: 3,
      name: t("DeepSeek Native Channel"),
      type: 1,
      key: "sk-mock-key-3",
      base_url: "https://api.deepseek.com",
      models: "deepseek-chat,deepseek-reasoner,deepseek-coder",
      group: "default",
      status: 1,
      priority: 8,
      weight: 2,
      response_time: 145,
    },
    {
      id: 4,
      name: t("Google Gemini Channel"),
      type: 24,
      key: "sk-mock-key-4",
      base_url: "https://generativelanguage.googleapis.com/v1beta",
      models: "gemini-2.5-pro,gemini-2.5-flash",
      group: "default",
      status: 1,
      priority: 6,
      weight: 1,
      response_time: 260,
    },
    {
      id: 5,
      name: t("Azure OpenAI US/EU Channel"),
      type: 3,
      key: "sk-mock-key-5",
      base_url: "https://azure-openai.openai.azure.com",
      models: "gpt-4o,gpt-4o-mini",
      group: "vip",
      status: 1,
      priority: 5,
      weight: 1,
      response_time: 195,
    },
  ]

  await context.route("https://managed.example.invalid/**", async (route) => {
    const url = new URL(route.request().url())
    const path = url.pathname
    const channelDetail = /^\/api\/channel\/(\d+)$/.exec(path)
    if (channelDetail) {
      await route.fulfill({
        status: 200,
        json: {
          success: true,
          data: managedChannels.find(
            (channel) => channel.id === Number(channelDetail[1]),
          ),
        },
      })
      return
    }
    if (path.startsWith("/api/channel/")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: { items: managedChannels, total: managedChannels.length },
        }),
      })
      return
    }
    if (path === "/api/channel/search") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: { items: managedChannels, total: managedChannels.length },
        }),
      })
      return
    }
    if (path === "/api/group") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, data: ["default", "vip"] }),
      })
      return
    }
    if (path === "/api/user/models") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: [
            "gpt-4o",
            "claude-3-7-sonnet",
            "deepseek-reasoner",
            "gemini-2.5-pro",
          ],
        }),
      })
      return
    }
    await route.fulfill({ status: 200, json: { success: true, data: [] } })
  })
}
