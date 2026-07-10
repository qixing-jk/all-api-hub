import assert from "node:assert/strict"
import test from "node:test"

import {
  createNewApiChannel,
  createNewApiMultiKeyChannel,
  discoverNewApiUserId,
  fetchChannelModels,
  fetchChannelTemplate,
  fetchChannelUsage,
  fetchNewApiDefaultModels,
  fetchNewApiGroups,
  fetchNewApiSystemName,
  findCreatedChannel,
  findSimilarChannels,
  listChannelTemplates,
  loginNewApi,
  refreshChannelBalance,
  setChannelEnabled,
  updateExistingChannelKey,
  verifyNewApi,
} from "../src/newApiClient.js"

test("reads the configured New API system name from public status", async (context) => {
  context.mock.method(globalThis, "fetch", async () =>
    jsonResponse({ success: true, data: { system_name: "内部资源池" } }),
  )

  assert.equal(
    await fetchNewApiSystemName("https://new-api.example.com"),
    "内部资源池",
  )
})

test("reads channel groups from the current New API site", async (context) => {
  context.mock.method(globalThis, "fetch", async () =>
    jsonResponse({
      success: true,
      data: ["default", "vip", "default", ""],
    }),
  )

  assert.deepEqual(await fetchNewApiGroups(config), ["default", "vip"])
})

test("reads built-in models without validating provider keys", async (context) => {
  context.mock.method(globalThis, "fetch", async () =>
    jsonResponse({
      success: true,
      data: { 43: ["deepseek-chat", "deepseek-reasoner", "deepseek-chat"] },
    }),
  )

  assert.deepEqual(await fetchNewApiDefaultModels(config, 43), [
    "deepseek-chat",
    "deepseek-reasoner",
  ])
})

const config = {
  targetUrl: "https://new-api.example.com",
  userId: "1",
  adminToken: "admin-secret-token",
}

const deepSeek = {
  channelType: 43,
  baseUrl: "https://api.deepseek.com",
}

const jsonResponse = (payload) =>
  new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })

test("asks New API to discover provider-specific models", async (context) => {
  let captured
  context.mock.method(globalThis, "fetch", async (url, options) => {
    captured = { url, options }
    return jsonResponse({
      success: true,
      data: ["deepseek-reasoner", "deepseek-chat", "deepseek-chat", ""],
    })
  })

  const models = await fetchChannelModels(config, {
    provider: deepSeek,
    apiKey: "sk-provider-secret",
    baseUrl: deepSeek.baseUrl,
  })

  assert.deepEqual(models, ["deepseek-chat", "deepseek-reasoner"])
  assert.equal(
    captured.url,
    "https://new-api.example.com/api/channel/fetch_models",
  )
  assert.equal(
    captured.options.headers.Authorization,
    "Bearer admin-secret-token",
  )
  assert.equal(captured.options.headers["New-API-User"], "1")
  assert.deepEqual(JSON.parse(captured.options.body), {
    base_url: "https://api.deepseek.com",
    type: 43,
    key: "sk-provider-secret",
  })
})

test("logs in with New API credentials and keeps only the session cookie", async (context) => {
  let captured
  context.mock.method(globalThis, "fetch", async (url, options) => {
    captured = { url, options }
    return new Response(
      JSON.stringify({
        success: true,
        data: { id: 8, username: "admin", role: 10 },
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie": "session=opaque-value; Path=/; HttpOnly; SameSite=Lax",
        },
      },
    )
  })

  const result = await loginNewApi({
    targetUrl: config.targetUrl,
    username: "admin",
    password: "correct horse battery staple",
  })

  assert.equal(captured.url, "https://new-api.example.com/api/user/login")
  assert.deepEqual(JSON.parse(captured.options.body), {
    username: "admin",
    password: "correct horse battery staple",
  })
  assert.deepEqual(result, {
    userId: "8",
    username: "admin",
    role: 10,
    sessionCookie: "session=opaque-value",
  })
})

test("direct login explains when two-factor authentication needs a token", async (context) => {
  context.mock.method(globalThis, "fetch", async () =>
    jsonResponse({ success: true, data: { require_2fa: true } }),
  )

  await assert.rejects(
    loginNewApi({
      targetUrl: config.targetUrl,
      username: "admin",
      password: "password",
    }),
    /两步验证/,
  )
})

test("uses the login session for subsequent channel requests", async (context) => {
  let capturedHeaders
  context.mock.method(globalThis, "fetch", async (_url, options) => {
    capturedHeaders = options.headers
    return jsonResponse({ success: true, data: { items: [] } })
  })

  await findSimilarChannels(
    {
      targetUrl: config.targetUrl,
      userId: "8",
      sessionCookie: "session=opaque-value",
    },
    deepSeek,
  )

  assert.equal(capturedHeaders.Cookie, "session=opaque-value")
  assert.equal(capturedHeaders["New-API-User"], "8")
  assert.equal(capturedHeaders.Authorization, undefined)
})

test("shows a safe New API error when HTTP 200 contains a failed response", async (context) => {
  context.mock.method(globalThis, "fetch", async () =>
    jsonResponse({
      success: false,
      message: "Unauthorized, invalid access token admin-secret-token",
    }),
  )

  await assert.rejects(
    verifyNewApi(config),
    (error) =>
      error.message.includes("invalid access token") &&
      !error.message.includes("admin-secret-token"),
  )
})

test("automatically finds the user id required by a system access token", async (context) => {
  const attempted = []
  context.mock.method(globalThis, "fetch", async (_url, options) => {
    const userId = options.headers["New-API-User"]
    attempted.push(userId)
    if (userId === "2") {
      return jsonResponse({ success: true, data: { items: [] } })
    }
    return new Response(
      JSON.stringify({ success: false, message: "User ID mismatch" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    )
  })

  assert.equal(
    await discoverNewApiUserId({
      targetUrl: config.targetUrl,
      adminToken: config.adminToken,
    }),
    "2",
  )
  assert.deepEqual(attempted, ["1", "2"])
})

test("finds channels sharing a type or a non-empty base URL", async (context) => {
  context.mock.method(globalThis, "fetch", async () =>
    jsonResponse({
      success: true,
      data: {
        items: [
          {
            id: 1,
            name: "DeepSeek A",
            type: 43,
            base_url: "",
            status: 1,
            channel_info: { is_multi_key: true },
          },
          {
            id: 2,
            name: "Proxy B",
            type: 8,
            base_url: "https://api.deepseek.com/",
            status: 2,
          },
          { id: 3, name: "Other", type: 1, base_url: "", status: 1 },
        ],
      },
    }),
  )

  const matches = await findSimilarChannels(config, {
    ...deepSeek,
    resolvedBaseUrl: deepSeek.baseUrl,
  })

  assert.deepEqual(matches, [
    {
      id: 1,
      name: "DeepSeek A",
      status: "正常",
      isMultiKey: true,
      multiKeySize: 0,
    },
    {
      id: 2,
      name: "Proxy B",
      status: "已停用",
      isMultiKey: false,
      multiKeySize: 0,
    },
  ])
})

test("lists same-type channels for explicit template selection", async (context) => {
  context.mock.method(globalThis, "fetch", async () =>
    jsonResponse({
      success: true,
      data: {
        items: [
          {
            id: 26,
            name: "Bedrock US",
            type: 33,
            base_url: "https://bedrock-runtime.us-east-1.amazonaws.com",
            group: "default,aws",
            models: "claude-sonnet-4-6,claude-opus-4-6",
            status: 1,
          },
          { id: 25, name: "OpenAI", type: 1, status: 1 },
        ],
      },
    }),
  )

  assert.deepEqual(await listChannelTemplates(config, { channelType: 33 }), [
    {
      id: 26,
      name: "Bedrock US",
      status: "正常",
      baseUrl: "https://bedrock-runtime.us-east-1.amazonaws.com",
      groups: ["default", "aws"],
      modelCount: 2,
    },
  ])
})

test("reads a selected channel template without returning its key", async (context) => {
  context.mock.method(globalThis, "fetch", async () =>
    jsonResponse({
      success: true,
      data: {
        id: 26,
        name: "Bedrock US",
        type: 33,
        key: "must-not-be-returned",
        base_url: "https://bedrock-runtime.us-east-1.amazonaws.com",
        group: "aws",
        models: "claude-sonnet-4-6",
        model_mapping: '{"claude-sonnet-4-6":"us.anthropic.claude-sonnet-4-6"}',
        settings: '{"aws_key_type":"api_key"}',
        other: "region-config",
        priority: 7,
        weight: 11,
        status: 1,
      },
    }),
  )

  const template = await fetchChannelTemplate(config, 26, { channelType: 33 })
  assert.equal(template.key, undefined)
  assert.deepEqual(template.models, ["claude-sonnet-4-6"])
  assert.deepEqual(template.modelMappings, [
    {
      standardModel: "claude-sonnet-4-6",
      actualModel: "us.anthropic.claude-sonnet-4-6",
    },
  ])
  assert.deepEqual(template.channelSettings, { aws_key_type: "api_key" })
  assert.equal(template.advanced.priority, 7)
  assert.equal(template.advanced.weight, 11)
})

test("calculates per-key gateway usage from New API admin logs", async (context) => {
  context.mock.method(globalThis, "fetch", async (url) => {
    if (String(url).includes("/api/status")) {
      return jsonResponse({ success: true, data: { quota_per_unit: 500000 } })
    }
    return jsonResponse({
      success: true,
      data: {
        items: [
          {
            quota: 250000,
            prompt_tokens: 100,
            completion_tokens: 25,
            created_at: 1_750_000_000,
            other: '{"admin_info":{"multi_key_index":3}}',
          },
          {
            quota: 500000,
            prompt_tokens: 200,
            completion_tokens: 50,
            created_at: 1_750_000_100,
            other: '{"admin_info":{"multi_key_index":4}}',
          },
        ],
      },
    })
  })

  assert.deepEqual(
    await fetchChannelUsage(config, {
      channelId: 9,
      keyIndex: 3,
      startTimestamp: 1_740_000_000,
    }),
    {
      spentUsd: 0.5,
      requestCount: 1,
      promptTokens: 100,
      completionTokens: 25,
      lastUsedAt: 1_750_000_000,
      quotaPerUnit: 500000,
      scannedLogCount: 2,
      totalLogCount: null,
      truncated: false,
      usageDetailsComplete: true,
      usageMethod: "log-scan",
    },
  )
})

test("uses New API database stats for exact independent-channel cost", async (context) => {
  let statRequests = 0
  let detailRequests = 0
  context.mock.method(globalThis, "fetch", async (url) => {
    if (String(url).includes("/api/status")) {
      return jsonResponse({ success: true, data: { quota_per_unit: 500000 } })
    }
    if (String(url).includes("/api/log/stat")) {
      statRequests += 1
      return jsonResponse({ success: true, data: { quota: 1_250_000 } })
    }
    detailRequests += 1
    return jsonResponse({
      success: true,
      data: {
        total: 2001,
        items: Array.from({ length: 100 }, () => ({
          quota: 1,
          prompt_tokens: 2,
          completion_tokens: 1,
          created_at: 1_750_000_000,
        })),
      },
    })
  })

  const usage = await fetchChannelUsage(config, {
    channelId: 9,
    startTimestamp: 1_740_000_000,
  })

  assert.equal(statRequests, 1)
  assert.equal(detailRequests, 1)
  assert.equal(usage.spentUsd, 2.5)
  assert.equal(usage.requestCount, 2001)
  assert.equal(usage.promptTokens, null)
  assert.equal(usage.completionTokens, null)
  assert.equal(usage.scannedLogCount, 100)
  assert.equal(usage.totalLogCount, 2001)
  assert.equal(usage.truncated, false)
  assert.equal(usage.usageDetailsComplete, false)
  assert.equal(usage.usageMethod, "database-stat")
})

test("appends a key only when the selected channel is multi-key", async (context) => {
  const requests = []
  context.mock.method(globalThis, "fetch", async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body) })
    return jsonResponse({ success: true })
  })

  await updateExistingChannelKey(config, {
    channelId: 7,
    apiKey: "sk-new-multi-key",
    append: true,
  })
  await updateExistingChannelKey(config, {
    channelId: 8,
    apiKey: "sk-replacement-key",
    append: false,
  })

  assert.deepEqual(requests, [
    {
      url: "https://new-api.example.com/api/channel/",
      body: { id: 7, key: "sk-new-multi-key", key_mode: "append" },
    },
    {
      url: "https://new-api.example.com/api/channel/",
      body: { id: 8, key: "sk-replacement-key" },
    },
  ])
})

test("re-enables the selected existing channel after updating it", async (context) => {
  let captured
  context.mock.method(globalThis, "fetch", async (url, options) => {
    captured = { url, options }
    return jsonResponse({ success: true })
  })

  await setChannelEnabled(config, 7)

  assert.equal(captured.url, "https://new-api.example.com/api/channel/7/status")
  assert.equal(captured.options.method, "POST")
  assert.deepEqual(JSON.parse(captured.options.body), { status: 1 })
})

test("creates a single New API channel with normalized fields", async (context) => {
  let requestBody
  context.mock.method(globalThis, "fetch", async (_url, options) => {
    requestBody = JSON.parse(options.body)
    return jsonResponse({ success: true, data: null })
  })

  await createNewApiChannel(config, {
    provider: deepSeek,
    apiKey: "sk-provider-secret",
    baseUrl: deepSeek.baseUrl,
    name: "DeepSeek production",
    models: ["deepseek-chat", "deepseek-reasoner"],
    modelMapping: { "deepseek-v4": "deepseek-v4-pro" },
    groups: ["default", "vip"],
  })

  assert.equal(requestBody.mode, "single")
  assert.deepEqual(requestBody.channel, {
    name: "DeepSeek production",
    type: 43,
    key: "sk-provider-secret",
    base_url: "https://api.deepseek.com",
    models: "deepseek-chat,deepseek-reasoner",
    model_mapping: '{"deepseek-v4":"deepseek-v4-pro"}',
    settings: "{}",
    other: "",
    group: "default,vip",
    groups: ["default", "vip"],
    priority: 0,
    weight: 0,
    status: 1,
  })
})

test("passes provider-specific settings and extra configuration to New API", async (context) => {
  let requestBody
  context.mock.method(globalThis, "fetch", async (_url, options) => {
    requestBody = JSON.parse(options.body)
    return jsonResponse({ success: true })
  })

  await createNewApiChannel(config, {
    provider: { channelType: 33 },
    apiKey: "access|secret|us-east-1",
    baseUrl: "",
    name: "AWS Bedrock",
    models: ["claude-3-5-sonnet-20241022"],
    modelMapping: {},
    channelSettings: { aws_key_type: "ak_sk" },
    channelOther: '{"default":"us-east-1"}',
    templateConfig: {
      priority: 7,
      weight: 11,
      param_override: '{"temperature":0.2}',
    },
    groups: ["default"],
  })

  assert.equal(requestBody.channel.settings, '{"aws_key_type":"ak_sk"}')
  assert.equal(requestBody.channel.other, '{"default":"us-east-1"}')
  assert.equal(requestBody.channel.priority, 7)
  assert.equal(requestBody.channel.weight, 11)
  assert.equal(requestBody.channel.param_override, '{"temperature":0.2}')
})

test("creates many keys as one native New API multi-key channel", async (context) => {
  let requestBody
  context.mock.method(globalThis, "fetch", async (_url, options) => {
    requestBody = JSON.parse(options.body)
    return jsonResponse({ success: true })
  })

  await createNewApiMultiKeyChannel(config, {
    provider: deepSeek,
    apiKeys: ["sk-first", "sk-second"],
    baseUrl: deepSeek.baseUrl,
    name: "DeepSeek pool",
    models: ["deepseek-chat"],
    modelMapping: {},
    groups: ["default"],
  })

  assert.equal(requestBody.mode, "multi_to_single")
  assert.equal(requestBody.multi_key_mode, "random")
  assert.equal(requestBody.channel.key, "sk-first\nsk-second")
  assert.equal(requestBody.channel.name, "DeepSeek pool")
})

test("locates the newest exact channel after creation", async (context) => {
  context.mock.method(globalThis, "fetch", async () =>
    jsonResponse({
      success: true,
      data: {
        items: [
          {
            id: 7,
            name: "DeepSeek production",
            type: 43,
            base_url: "https://api.deepseek.com",
          },
          {
            id: 9,
            name: "DeepSeek production",
            type: 43,
            base_url: "https://api.deepseek.com/",
          },
          {
            id: 11,
            name: "Different name",
            type: 43,
            base_url: "https://api.deepseek.com",
          },
        ],
      },
    }),
  )

  const channel = await findCreatedChannel(config, {
    provider: deepSeek,
    baseUrl: deepSeek.baseUrl,
    name: "DeepSeek production",
  })

  assert.equal(channel.id, 9)
})

test("normalizes a supported New API channel balance", async (context) => {
  context.mock.method(globalThis, "fetch", async () =>
    jsonResponse({ success: true, balance: 18.625 }),
  )

  assert.deepEqual(await refreshChannelBalance(config, 9), {
    status: "available",
    currency: "USD",
    balance: 18.625,
  })
})

test("returns an explicit unsupported balance state", async (context) => {
  context.mock.method(globalThis, "fetch", async () =>
    jsonResponse({ success: false, message: "billing not supported" }),
  )

  assert.deepEqual(await refreshChannelBalance(config, 9), {
    status: "unsupported",
    reason: "该渠道或上游暂不支持自动查询余额",
  })
})
