import { DOC_SCREENSHOT_LOCALES as LOCALES } from "./doc-screenshot-config.mjs"

export const QUOTA_PER_USD = 500_000

/**
 * Localized copy used by the seeded mock data. Keyed by the English string so
 * call sites stay readable; every locale must cover the same keys.
 */
const MOCK_TEXT = {
  "Global Aggregator / Claude & Gemini": {
    zh: "全球大模型聚合网关 / Claude & Gemini",
    en: "Global Aggregator / Claude & Gemini",
    ja: "世界規模の LLM アグリゲーター / Claude & Gemini",
  },
  "Claude & OpenAI Subscription Carpool Relay": {
    zh: "Claude & OpenAI 订阅共享 / 拼车网关",
    en: "Claude & OpenAI Subscription Carpool Relay",
    ja: "Claude & OpenAI サブスク共有 / 相乗りゲートウェイ",
  },
  "Multi-Model High Availability / Production Relay": {
    zh: "多模型高可用聚合 / 生产环境主力",
    en: "Multi-Model High Availability / Production Relay",
    ja: "マルチモデル高可用アグリゲーション / 本番メイン回線",
  },
  "Codex & Cursor Coding Relay / High Speed": {
    zh: "Codex & Cursor 编程专线 / 高速稳定",
    en: "Codex & Cursor Coding Relay / High Speed",
    ja: "Codex & Cursor 開発専用線 / 高速・安定",
  },
  "Claude Code CLI Ultra-Fast Relay": {
    zh: "Claude Code CLI 极速中转线路",
    en: "Claude Code CLI Ultra-Fast Relay",
    ja: "Claude Code CLI 超高速リレー回線",
  },
  "Private Gateway / Load Balancing & Dispatch": {
    zh: "私有网关节点 / 渠道负载均衡与分发",
    en: "Private Gateway / Load Balancing & Dispatch",
    ja: "プライベートゲートウェイ / チャネル負荷分散と配信",
  },
  Primary: {
    zh: "主力",
    en: "Primary",
    ja: "メイン",
  },
  Backup: {
    zh: "备用",
    en: "Backup",
    ja: "予備",
  },
  "Coding Agent": {
    zh: "编程 Agent",
    en: "Coding Agent",
    ja: "コーディング Agent",
  },
  "Deep Reasoning": {
    zh: "深度推理",
    en: "Deep Reasoning",
    ja: "深い推論",
  },
  "Carpool Relay": {
    zh: "拼车共享",
    en: "Carpool Relay",
    ja: "相乗り共有",
  },
  "Aggregator Gateway": {
    zh: "聚合网关",
    en: "Aggregator Gateway",
    ja: "アグリゲーター",
  },
  "AIHubMix API Key": {
    zh: "AIHubMix 模型凭据",
    en: "AIHubMix API Key",
    ja: "AIHubMix モデルキー",
  },
  "Sub2API Claude Key": {
    zh: "Sub2API Claude 凭据",
    en: "Sub2API Claude Key",
    ja: "Sub2API Claude キー",
  },
  "OpenRouter Unified Gateway Key": {
    zh: "OpenRouter 全球统一网关",
    en: "OpenRouter Unified Gateway Key",
    ja: "OpenRouter 統合ゲートウェイキー",
  },
  "Novita AI API Key": {
    zh: "Novita AI 模型凭据",
    en: "Novita AI API Key",
    ja: "Novita AI モデルキー",
  },
  "OpenAI API Reference & Docs": {
    zh: "OpenAI 官方文档与 API 参考",
    en: "OpenAI API Reference & Docs",
    ja: "OpenAI 公式ドキュメントと API リファレンス",
  },
  "Official endpoint specs and examples": {
    zh: "官方接口定义与技术规范",
    en: "Official endpoint specs and examples",
    ja: "公式エンドポイント仕様と技術標準",
  },
  "Anthropic Claude Prompt Engineering Guide": {
    zh: "Anthropic Claude 提示词工程指南",
    en: "Anthropic Claude Prompt Engineering Guide",
    ja: "Anthropic Claude プロンプトエンジニアリングガイド",
  },
  "Official System Prompts and advanced techniques": {
    zh: "官方 System Prompt 与高阶技巧",
    en: "Official System Prompts and advanced techniques",
    ja: "公式 System Prompt と上級テクニック",
  },
  "DeepSeek Platform API Documentation": {
    zh: "DeepSeek 开放平台 API 文档",
    en: "DeepSeek Platform API Documentation",
    ja: "DeepSeek オープンプラットフォーム API ドキュメント",
  },
  "DeepSeek R1 reasoning format and pricing specs": {
    zh: "DeepSeek-R1 推理格式与价格说明",
    en: "DeepSeek R1 reasoning format and pricing specs",
    ja: "DeepSeek-R1 推論フォーマットと料金仕様",
  },
  "OpenRouter Model Catalog & Pricing": {
    zh: "OpenRouter 全球模型目录与价格",
    en: "OpenRouter Model Catalog & Pricing",
    ja: "OpenRouter 世界モデルカタログと料金",
  },
  "Multi-provider latency and context comparisons": {
    zh: "多供应商上下文延迟与可用性对比",
    en: "Multi-provider latency and context comparisons",
    ja: "複数プロバイダーの遅延と可用性の比較",
  },
  "Cherry Studio Desktop AI Client": {
    zh: "Cherry Studio 官方开源客户端",
    en: "Cherry Studio Desktop AI Client",
    ja: "Cherry Studio 公式オープンソースクライアント",
  },
  "Recommended multi-model desktop AI client": {
    zh: "一键导出支持的桌面级多模型客户端",
    en: "Recommended multi-model desktop AI client",
    ja: "推奨マルチモデルデスクトップクライアント",
  },
  "Daily Benefit Check-in": {
    zh: "每日福利签到",
    en: "Daily Benefit Check-in",
    ja: "毎日特典チェックイン",
  },
  "Web Check-in Task": {
    zh: "网页签到任务",
    en: "Web Check-in Task",
    ja: "Web チェックインタスク",
  },
  "Developer Daily Check-in": {
    zh: "开发者每日签到",
    en: "Developer Daily Check-in",
    ja: "開発者デイリーチェックイン",
  },
  "Already checked in today": {
    zh: "今日已签到",
    en: "Already checked in today",
    ja: "本日はチェックイン済み",
  },
  "Daily API Check-in": {
    zh: "API 每日签到",
    en: "Daily API Check-in",
    ja: "API デイリーチェックイン",
  },
  "Quota Auto-Refresh": {
    zh: "额度自动刷新",
    en: "Quota Auto-Refresh",
    ja: "クォータ自動更新",
  },
  "New API Model Gateway": {
    zh: "New API 多模型网关",
    en: "New API Model Gateway",
    ja: "New API マルチモデルゲートウェイ",
  },
  "Sub2API Claude Channel": {
    zh: "Sub2API Claude 渠道",
    en: "Sub2API Claude Channel",
    ja: "Sub2API Claude チャネル",
  },
  "OpenAI Direct Channel": {
    zh: "OpenAI 官方直连渠道",
    en: "OpenAI Direct Channel",
    ja: "OpenAI 公式直結チャネル",
  },
  "Anthropic High-Speed Channel": {
    zh: "Anthropic 官方高速通道",
    en: "Anthropic High-Speed Channel",
    ja: "Anthropic 公式高速チャネル",
  },
  "DeepSeek Native Channel": {
    zh: "DeepSeek 原生渠道",
    en: "DeepSeek Native Channel",
    ja: "DeepSeek ネイティブチャネル",
  },
  "Google Gemini Channel": {
    zh: "Google Gemini 专线",
    en: "Google Gemini Channel",
    ja: "Google Gemini 専用線",
  },
  "Azure OpenAI US/EU Channel": {
    zh: "Azure OpenAI 欧美节点",
    en: "Azure OpenAI US/EU Channel",
    ja: "Azure OpenAI 欧米ノード",
  },
  "Default Dev API Key": {
    zh: "开发主密钥 Default",
    en: "Default Dev API Key",
    ja: "開発用メインキー Default",
  },
  "Standard (1.0x)": {
    zh: "标准分组 (1.0x)",
    en: "Standard (1.0x)",
    ja: "標準グループ (1.0x)",
  },
  "VIP Fast Track (0.9x)": {
    zh: "VIP 高速通道 (0.9x)",
    en: "VIP Fast Track (0.9x)",
    ja: "VIP 高速チャネル (0.9x)",
  },
}

/**
 * Resolves seeded mock copy for one of the {@link LOCALES} keys.
 */
function createTranslator(localeKey) {
  const texts = LOCALES[localeKey]
  if (!texts) {
    throw new Error(`Unsupported locale: ${localeKey}`)
  }
  return (englishKey) => {
    const entry = MOCK_TEXT[englishKey]
    if (!entry) {
      throw new Error(`Missing mock copy: ${englishKey}`)
    }
    const value = entry[localeKey]
    if (value === undefined) {
      throw new Error(`Missing ${localeKey} mock copy: ${englishKey}`)
    }
    return value
  }
}

function getDayKey(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

function subtractDays(dayKey, days) {
  const [y, m, d] = dayKey.split("-").map(Number)
  const date = new Date(y, m - 1, d)
  date.setDate(date.getDate() - days)
  return getDayKey(date)
}

/** A discovered, enabled method with a confirmed successful result today. */
function getMockCheckInConfig(methodId, now) {
  return {
    automaticExecutionEnabled: true,
    selection: { mode: "automatic", methodId },
    methodKnowledge: {
      methods: {
        [methodId]: {
          detection: {
            outcome: "matched",
            evidence: { source: "probe", observedAt: now },
          },
          status: {
            outcome: "known",
            availability: "enabled",
            today: "checked",
            evidence: { source: "execution", observedAt: now },
          },
        },
      },
      lastFullDiscoveryAt: now,
    },
  }
}

function getMockAccounts() {
  const now = Date.now()
  // Official platforms first, then supported deployments and one custom gateway.
  const sites = [
    ["openrouter", "OpenRouter", "https://openrouter.ai", "openrouter", 148.5],
    [
      "vercel",
      "Vercel AI Gateway",
      "https://vercel.com",
      "vercel-ai-gateway",
      125.0,
    ],
    ["requesty", "Requesty", "https://app.requesty.ai", "requesty", 95.0],
    ["novita", "Novita AI", "https://novita.ai", "novita", 82.5],
    ["aimlapi", "AI/ML API", "https://aimlapi.com", "aimlapi", 76.0],
    ["kimi", "Kimi", "https://platform.kimi.com", "kimi", 65.0],
    ["aihubmix", "AIHubMix", "https://console.aihubmix.com", "AIHubMix", 112.4],
    ["laozhang", "老张 API", "https://api.laozhang.ai", "laozhang", 54.0],
    ["anyrouter", "AnyRouter", "https://anyrouter.top", "anyrouter", 35.0],
    ["sub2api", "Sub2API", "https://sub2api.example.com", "sub2api", 42.0],
    ["my-newapi", "New API", "https://newapi.example.com", "new-api", 180.0],
  ]
  const checkinMethods = {
    anyrouter: "anyrouter:daily-checkin",
    sub2api: "sub2api-pro:daily-checkin",
    "my-newapi": "new-api:daily-checkin",
  }
  return sites.map(([id, name, url, siteType, balance], index) => ({
    id: `acc-${id}`,
    site_name: name,
    site_url: url,
    site_type: siteType,
    exchange_rate: 7.2,
    health: { status: "healthy" },
    account_info: {
      id: `${id}-1001`,
      username: "alex.dev",
      access_token: `fixture-${id}-token`,
      quota: Math.round(balance * QUOTA_PER_USD),
      today_quota_consumption: Math.round(
        (0.65 + index * 0.18) * QUOTA_PER_USD,
      ),
      today_prompt_tokens: 42000 + index * 3500,
      today_completion_tokens: 18000 + index * 1500,
      today_requests_count: 32 + index * 5,
      today_income: Math.round(
        (id === "anyrouter" ? 1 : id === "my-newapi" ? 0.2 : 0) * QUOTA_PER_USD,
      ),
      todayStatsAvailability: {
        consumption: { status: "complete" },
        requests: { status: "complete" },
        tokens: { status: "complete" },
        income: { status: "complete" },
      },
    },
    last_sync_time: now - (index + 1) * 60000,
    updated_at: now - (index + 1) * 60000,
    user_updated_at: now - (index + 1) * 60000,
    created_at: now - 30 * 86400000,
    notes: "",
    tagIds: [index < 8 ? "tag-primary" : "tag-backup"],
    disabled: false,
    excludeFromTotalBalance: false,
    excludeFromTodayIncome: false,
    authType: "access_token",
    configVersion: 8,
    checkIn: checkinMethods[id]
      ? getMockCheckInConfig(checkinMethods[id], now)
      : { automaticExecutionEnabled: false },
  }))
}

/** Seed product-owned catalog snapshots so comparison never uses live prices. */
function getMockModelPricingCache() {
  const providerSources = {
    openrouter: "openrouter-public",
    requesty: "requesty-public",
    novita: "novita-public",
    aimlapi: "aimlapi-public-structured-pricing-v13",
    kimi: "kimi-open-platform-pricing-doc-kimi",
  }
  const scales = [1, 1.05, 0.82, 0.62, 1.15, 0.9, 0.78, 0.93, 0.86, 0.75, 1.2]
  const models = [
    ["deepseek-chat", 0.3, 1.2],
    ["deepseek-reasoner", 1.5, 6],
    ["claude-3-7-sonnet", 3, 15],
    ["gpt-4o", 2.5, 10],
    ["gemini-2.5-pro", 1.25, 10],
  ]
  const cache = {}
  getMockAccounts().forEach((account, index) => {
    if (account.site_type === "sub2api") return
    const sourceId = providerSources[account.site_type]
    const grouped = ["laozhang", "anyrouter", "new-api"].includes(
      account.site_type,
    )
    const catalogModels =
      account.site_type === "kimi"
        ? [
            ["kimi-k3", 3, 15],
            ["kimi-k2.6", 0.95, 4],
          ]
        : account.site_type === "novita"
          ? models.filter(([name]) => name.startsWith("deepseek"))
          : models
    const pricing = {
      success: true,
      data: catalogModels.map(([name, input, output]) => ({
        model_name: name,
        quota_type: 0,
        model_ratio: 1,
        model_price: 0,
        completion_ratio: output / input,
        token_price_usd_per_million: {
          input: Number((input * scales[index]).toFixed(4)),
          output: Number((output * scales[index]).toFixed(4)),
          cache_read: Number((input * scales[index] * 0.1).toFixed(4)),
        },
        price_metadata: {
          source: sourceId ? "provider-catalog" : "channel-pricing",
          precision: "exact",
        },
        enable_groups: grouped ? ["default", "vip"] : [],
        supported_endpoint_types: name.includes("claude")
          ? ["anthropic", "openai"]
          : ["openai"],
      })),
      groupAccess: grouped
        ? { kind: "authoritative", usableGroups: ["default", "vip"] }
        : { kind: "not-applicable" },
      groupRatios: grouped ? { default: 1, vip: 0.9 } : {},
      model_list_source: sourceId
        ? {
            kind: "provider-catalog",
            provider: account.site_type,
            catalogScope: "provider",
            supportsRuntimeModelList: false,
            supportsPricing: true,
            actionPolicy: {
              supportsGroupFiltering: false,
              supportsAccountSummary: false,
              supportsTokenCompatibility: false,
              supportsCredentialVerification: false,
              supportsBatchCredentialVerification: false,
              supportsCliVerification: false,
            },
          }
        : { kind: "user-scoped" },
    }
    const entry = { pricing, lastUpdated: Date.now() }
    const accountKey = [
      account.id,
      account.site_url,
      account.account_info.id,
      account.site_type,
      account.authType,
      ...(account.site_type === "aimlapi" ? ["structured-pricing-v13"] : []),
    ].join("|")
    cache[accountKey] = entry
    if (sourceId) cache[`provider-catalog|${sourceId}`] = entry
  })
  return cache
}

function getMockTags(t) {
  return {
    version: 1,
    tags: [
      {
        id: "tag-primary",
        name: t("Primary"),
        color: "blue",
        created_at: Date.now(),
      },
      {
        id: "tag-backup",
        name: t("Backup"),
        color: "gray",
        created_at: Date.now(),
      },
      {
        id: "tag-coding",
        name: t("Coding Agent"),
        color: "green",
        created_at: Date.now(),
      },
      {
        id: "tag-reasoning",
        name: t("Deep Reasoning"),
        color: "purple",
        created_at: Date.now(),
      },
      {
        id: "tag-carpool",
        name: t("Carpool Relay"),
        color: "cyan",
        created_at: Date.now(),
      },
      {
        id: "tag-gateway",
        name: t("Aggregator Gateway"),
        color: "orange",
        created_at: Date.now(),
      },
    ],
  }
}

function getMockCodingPlan(id, name, baseUrl, mode, apiType, now) {
  return {
    id,
    name,
    baseUrl,
    apiType,
    apiKey: `fixture-${id}-key`,
    tagIds: ["tag-coding"],
    notes: "",
    createdAt: now - 14 * 86400000,
    updatedAt: now - 5 * 60000,
    telemetryConfig: { mode },
    telemetrySnapshot: {
      health: { status: "healthy" },
      lastSyncTime: now - 5 * 60000,
      lastSuccessTime: now - 5 * 60000,
      source: mode,
      attempts: [],
      facts: {
        quota: {
          membershipLevel: mode === "kimiQuota" ? "LEVEL_PRO" : "Pro",
          windows: [
            {
              type: "fiveHour",
              unit: { kind: "percent" },
              used: 28,
              limit: 100,
              remaining: 72,
              remainingPercent: 72,
              resetTime: now + 3 * 3600000,
            },
            {
              type: "weekly",
              unit: { kind: "percent" },
              used: 35,
              limit: 100,
              remaining: 65,
              remainingPercent: 65,
              resetTime: now + 4 * 86400000,
            },
          ],
        },
      },
    },
  }
}

function getMockApiCredentialProfiles(t) {
  const now = Date.now()
  return [
    getMockCodingPlan(
      "prof-kimi-coding",
      "Kimi Coding Plan",
      "https://api.kimi.com/coding",
      "kimiQuota",
      "anthropic",
      now,
    ),
    getMockCodingPlan(
      "prof-glm-coding",
      "GLM Coding Plan",
      "https://api.z.ai/api/coding/paas/v4",
      "glmQuota",
      "openai-compatible",
      now,
    ),
    {
      id: "prof-deepseek-main",
      name: t("AIHubMix API Key"),
      baseUrl: "https://aihubmix.com/v1",
      apiKey: "sk-ds-7b29e41a3c5d8e0f1a2b3c4d5e6f7a8b",
      siteType: "AIHubMix",
      accountId: "acc-aihubmix",
      health: { status: "healthy", lastCheckTime: now - 10 * 60 * 1000 },
      createdAt: now - 20 * 86400 * 1000,
      updatedAt: now - 10 * 60 * 1000,
    },
    {
      id: "prof-claude-prod",
      name: t("Sub2API Claude Key"),
      baseUrl: "https://sub2api.example.com/v1",
      apiKey: "sk-ant-api03-9d8a37f2a1b0c9e8d7f6a5b4c3d2e1f0",
      siteType: "sub2api",
      accountId: "acc-sub2api",
      health: { status: "healthy", lastCheckTime: now - 15 * 60 * 1000 },
      createdAt: now - 18 * 86400 * 1000,
      updatedAt: now - 15 * 60 * 1000,
    },
    {
      id: "prof-openrouter-gw",
      name: t("OpenRouter Unified Gateway Key"),
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: "sk-or-v1-8c12e73a9f02b4d6e8a0c2e4f6a8b0d2",
      siteType: "openrouter",
      accountId: "acc-openrouter",
      health: { status: "healthy", lastCheckTime: now - 20 * 60 * 1000 },
      createdAt: now - 25 * 86400 * 1000,
      updatedAt: now - 20 * 60 * 1000,
    },
    {
      id: "prof-coding-budget",
      name: t("Novita AI API Key"),
      baseUrl: "https://api.novita.ai/openai/v1",
      apiKey: "sk-coding-8820c1eab0d2e4f6a8b0c2e4f6a8b0d2",
      siteType: "novita",
      accountId: "acc-novita",
      health: { status: "healthy", lastCheckTime: now - 35 * 60 * 1000 },
      createdAt: now - 8 * 86400 * 1000,
      updatedAt: now - 35 * 60 * 1000,
    },
  ]
}

function getMockBookmarks(t) {
  const now = Date.now()
  return [
    {
      id: "bm-1",
      name: t("OpenAI API Reference & Docs"),
      url: "https://platform.openai.com/docs",
      tagIds: ["tag-primary"],
      notes: t("Official endpoint specs and examples"),
      created_at: now - 20 * 86400 * 1000,
      updated_at: now - 20 * 86400 * 1000,
    },
    {
      id: "bm-2",
      name: t("Anthropic Claude Prompt Engineering Guide"),
      url: "https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering",
      tagIds: ["tag-coding"],
      notes: t("Official System Prompts and advanced techniques"),
      created_at: now - 18 * 86400 * 1000,
      updated_at: now - 18 * 86400 * 1000,
    },
    {
      id: "bm-3",
      name: t("DeepSeek Platform API Documentation"),
      url: "https://api-docs.deepseek.com",
      tagIds: ["tag-reasoning"],
      notes: t("DeepSeek R1 reasoning format and pricing specs"),
      created_at: now - 15 * 86400 * 1000,
      updated_at: now - 15 * 86400 * 1000,
    },
    {
      id: "bm-4",
      name: t("OpenRouter Model Catalog & Pricing"),
      url: "https://openrouter.ai/models",
      tagIds: ["tag-gateway"],
      notes: t("Multi-provider latency and context comparisons"),
      created_at: now - 12 * 86400 * 1000,
      updated_at: now - 12 * 86400 * 1000,
    },
    {
      id: "bm-5",
      name: t("Cherry Studio Desktop AI Client"),
      url: "https://cherry-ai.com",
      tagIds: ["tag-primary"],
      notes: t("Recommended multi-model desktop AI client"),
      created_at: now - 10 * 86400 * 1000,
      updated_at: now - 10 * 86400 * 1000,
    },
  ]
}

function getMockBalanceHistory() {
  const demoAccounts = getMockAccounts()
  const snapshotsByAccountId = {}
  const now = new Date()

  demoAccounts.forEach((account, index) => {
    const snapshots = (snapshotsByAccountId[account.id] = {})
    let quota = account.account_info.quota
    for (let i = 0; i < 7; i++) {
      const d = new Date(now)
      d.setDate(d.getDate() - i)
      const dayKey = getDayKey(d)
      // The first snapshot precedes demo activity, so period cashflow also
      // matches the change between the displayed start and end balances.
      const today_quota_consumption =
        i === 6
          ? 0
          : i === 0
            ? account.account_info.today_quota_consumption
            : Math.round(
                account.account_info.today_quota_consumption *
                  [0.6, 1.8, 0.85, 2.4, 0.45, 1.35, 1][(index + i * 2) % 7],
              )
      const today_income =
        i === 6
          ? 0
          : i === 0
            ? account.account_info.today_income
            : i === 1 + (index % 4)
              ? Math.round(quota * (0.18 + (index % 3) * 0.07))
              : account.account_info.today_income

      snapshots[dayKey] = {
        quota,
        today_income,
        today_quota_consumption,
        capturedAt: d.getTime(),
        source: "alarm",
      }
      quota += today_quota_consumption - today_income
    }
  })

  return {
    schemaVersion: 1,
    snapshotsByAccountId,
  }
}

function getMockAutoCheckinStatus(t) {
  const now = Date.now()
  const accounts = getMockAccounts().filter(
    (account) => account.checkIn.automaticExecutionEnabled,
  )
  const perAccount = Object.fromEntries(
    accounts.map((account) => [
      account.id,
      {
        accountId: account.id,
        accountName: account.site_name,
        status: account.id === "acc-sub2api" ? "already_checked" : "success",
        timestamp: now - 2 * 3600000,
        ...(account.id === "acc-sub2api"
          ? { message: t("Already checked in today") }
          : {
              messageKey: "autoCheckin:providerFallback.checkinSuccessful",
              reward: { quota: account.account_info.today_income },
            }),
        methodId: account.checkIn.selection.methodId,
        methodName: t("Daily API Check-in"),
      },
    ]),
  )
  return {
    lastRunAt: new Date(now - 2 * 3600000).toISOString(),
    nextDailyScheduledAt: new Date(now + 22 * 3600000).toISOString(),
    lastRunResult: "success",
    lastDailyRunDay: getDayKey(),
    summary: {
      totalEligible: accounts.length,
      executed: accounts.length,
      successCount: accounts.length,
      alreadyCheckedCount: 1,
      failedCount: 0,
      skippedCount: 0,
      needsRetry: false,
    },
    perAccount,
    accountsSnapshot: accounts.map((account) => ({
      accountId: account.id,
      accountName: account.site_name,
      siteType: account.site_type,
      detectionEnabled: true,
      autoCheckinEnabled: true,
      providerAvailable: true,
      isCheckedInToday: true,
      lastCheckInDate: getDayKey(),
    })),
  }
}

function getMockUsageHistory() {
  const todayKey = getDayKey()
  const days = []
  for (let i = 6; i >= 0; i--) {
    days.push(subtractDays(todayKey, i))
  }

  const accountIds = getMockAccounts().map((account) => account.id)

  const accounts = {}

  accountIds.forEach((accId, accIdx) => {
    const daily = {}
    const hourly = {}
    const dailyByModel = {
      "deepseek-reasoner": {},
      "deepseek-chat": {},
      "claude-3-7-sonnet": {},
      "gpt-4o": {},
      "gemini-2.5-pro": {},
    }
    const latencyDaily = {}
    const latencyDailyByModel = {
      "deepseek-reasoner": {},
      "deepseek-chat": {},
      "claude-3-7-sonnet": {},
      "gpt-4o": {},
      "gemini-2.5-pro": {},
    }
    const latencyDailyByToken = {
      101: {},
      102: {},
      103: {},
    }
    const dailyByToken = {
      101: {},
      102: {},
      103: {},
    }

    days.forEach((day, dayIdx) => {
      // Shared busy/quiet days plus account-specific peaks avoid parallel lines.
      const activity = [1.15, 0.55, 1.8, 0.7, 1.35, 2.1, 0.9]
      const accountActivity = [0.8, 1.25, 0.65, 1.5, 1.05, 0.9, 1.3]
      const factor =
        activity[dayIdx] *
        accountActivity[(dayIdx + accIdx * 2) % 7] *
        (1 - accIdx * 0.04)

      const modelsData = {
        "deepseek-reasoner": {
          requests: Math.round(180 * factor),
          promptTokens: Math.round(350_000 * factor),
          completionTokens: Math.round(120_000 * factor),
          totalTokens: Math.round(470_000 * factor),
          quotaConsumed: Math.round(1.85 * factor * QUOTA_PER_USD),
        },
        "deepseek-chat": {
          requests: Math.round(240 * factor),
          promptTokens: Math.round(520_000 * factor),
          completionTokens: Math.round(180_000 * factor),
          totalTokens: Math.round(700_000 * factor),
          quotaConsumed: Math.round(0.95 * factor * QUOTA_PER_USD),
        },
        "claude-3-7-sonnet": {
          requests: Math.round(110 * factor),
          promptTokens: Math.round(210_000 * factor),
          completionTokens: Math.round(85_000 * factor),
          totalTokens: Math.round(295_000 * factor),
          quotaConsumed: Math.round(3.4 * factor * QUOTA_PER_USD),
        },
        "gpt-4o": {
          requests: Math.round(95 * factor),
          promptTokens: Math.round(140_000 * factor),
          completionTokens: Math.round(65_000 * factor),
          totalTokens: Math.round(205_000 * factor),
          quotaConsumed: Math.round(1.65 * factor * QUOTA_PER_USD),
        },
        "gemini-2.5-pro": {
          requests: Math.round(60 * factor),
          promptTokens: Math.round(110_000 * factor),
          completionTokens: Math.round(45_000 * factor),
          totalTokens: Math.round(155_000 * factor),
          quotaConsumed: Math.round(0.85 * factor * QUOTA_PER_USD),
        },
      }

      Object.values(modelsData).forEach((data, modelIndex) => {
        const mix = [0.6, 1.4, 0.9, 1.7, 0.75, 1.1, 1.3][
          (dayIdx + modelIndex * 2 + accIdx) % 7
        ]
        for (const key of [
          "requests",
          "promptTokens",
          "completionTokens",
          "quotaConsumed",
        ])
          data[key] = Math.round(data[key] * mix)
        data.totalTokens = data.promptTokens + data.completionTokens
      })

      let dayRequests = 0
      let dayPrompt = 0
      let dayCompletion = 0
      let dayTotalTokens = 0
      let dayQuota = 0

      for (const [model, mData] of Object.entries(modelsData)) {
        dailyByModel[model][day] = mData
        dayRequests += mData.requests
        dayPrompt += mData.promptTokens
        dayCompletion += mData.completionTokens
        dayTotalTokens += mData.totalTokens
        dayQuota += mData.quotaConsumed

        latencyDailyByModel[model][day] = {
          count: mData.requests,
          sum: +(
            mData.requests * (model.includes("reasoner") ? 2.5 : 0.8)
          ).toFixed(2),
          max: model.includes("reasoner") ? 18.2 : 4.5,
          slowCount: model.includes("reasoner")
            ? Math.round(12 * factor)
            : Math.round(2 * factor),
          unknownCount: 0,
          buckets: [
            Math.round(20 * factor),
            Math.round(40 * factor),
            Math.round(30 * factor),
            Math.round(15 * factor),
            Math.round(8 * factor),
            Math.round(4 * factor),
            Math.round(2 * factor),
            Math.round(1 * factor),
            0,
            0,
            0,
          ],
        }
      }

      daily[day] = {
        requests: dayRequests,
        promptTokens: dayPrompt,
        completionTokens: dayCompletion,
        totalTokens: dayTotalTokens,
        quotaConsumed: dayQuota,
      }

      latencyDaily[day] = {
        count: dayRequests,
        sum: +(dayRequests * 1.2).toFixed(2),
        max: 18.2,
        slowCount: Math.round(16 * factor),
        unknownCount: 0,
        buckets: [
          Math.round(80 * factor),
          Math.round(150 * factor),
          Math.round(110 * factor),
          Math.round(65 * factor),
          Math.round(35 * factor),
          Math.round(18 * factor),
          Math.round(8 * factor),
          Math.round(4 * factor),
          Math.round(1 * factor),
          0,
          0,
        ],
      }

      const tokenKeys = ["101", "102", "103"]
      const tokenSplits = [0.5, 0.3, 0.2]
      tokenKeys.forEach((tId, tIdx) => {
        const tSplit = tokenSplits[tIdx]
        dailyByToken[tId][day] = {
          requests: Math.round(dayRequests * tSplit),
          promptTokens: Math.round(dayPrompt * tSplit),
          completionTokens: Math.round(dayCompletion * tSplit),
          totalTokens: Math.round(dayTotalTokens * tSplit),
          quotaConsumed: Math.round(dayQuota * tSplit),
        }
        latencyDailyByToken[tId][day] = {
          count: Math.round(dayRequests * tSplit),
          sum: +(dayRequests * tSplit * 1.2).toFixed(2),
          max: 18.2,
          slowCount: Math.round(16 * factor * tSplit),
          unknownCount: 0,
          buckets: [
            Math.round(40 * factor * tSplit),
            Math.round(75 * factor * tSplit),
            Math.round(55 * factor * tSplit),
            Math.round(30 * factor * tSplit),
            Math.round(18 * factor * tSplit),
            Math.round(9 * factor * tSplit),
            Math.round(4 * factor * tSplit),
            Math.round(2 * factor * tSplit),
            0,
            0,
            0,
          ],
        }
      })
    })

    accounts[accId] = {
      cursor: {
        lastSeenCreatedAt: Math.floor(Date.now() / 1000),
        fingerprintsAtLastSeenCreatedAt: [],
      },
      status: {
        state: "success",
        lastSyncAt: Date.now() - 5 * 60 * 1000,
        lastSuccessAt: Date.now() - 5 * 60 * 1000,
      },
      daily,
      hourly,
      dailyByModel,
      tokenNamesById: {
        101: "Default API Key",
        102: "Cursor IDE Key",
        103: "Claude Code CLI",
      },
      dailyByToken,
      hourlyByToken: {},
      dailyByTokenByModel: {},
      latencyDaily,
      latencyDailyByModel,
      latencyDailyByToken,
      latencyDailyByTokenByModel: {},
    }
  })

  return {
    schemaVersion: 1,
    accounts,
  }
}

function getMockModelSyncLastExecution(t) {
  const now = Date.now()
  return {
    statistics: {
      startedAt: now - 25 * 60 * 1000,
      endedAt: now - 24 * 60 * 1000,
      durationMs: 42300,
      total: 5,
      successCount: 5,
      failureCount: 0,
      skippedCount: 0,
    },
    items: [
      {
        resourceRef: {
          siteType: "new-api",
          kind: "channel",
          scopeKey: "https://managed.example.invalid",
          resourceId: "1",
        },
        channelName: t("OpenAI Direct Channel"),
        ok: true,
        attempts: 1,
        finishedAt: now - 24 * 60 * 1000,
        oldModels: ["gpt-4o", "gpt-4o-mini"],
        newModels: [
          "gpt-4o",
          "gpt-4o-mini",
          "o3-mini",
          "text-embedding-3-large",
        ],
      },
      {
        resourceRef: {
          siteType: "new-api",
          kind: "channel",
          scopeKey: "https://managed.example.invalid",
          resourceId: "2",
        },
        channelName: t("Anthropic High-Speed Channel"),
        ok: true,
        attempts: 1,
        finishedAt: now - 24 * 60 * 1000,
        oldModels: ["claude-3-5-sonnet"],
        newModels: [
          "claude-3-7-sonnet",
          "claude-3-5-sonnet",
          "claude-3-5-haiku",
        ],
      },
      {
        resourceRef: {
          siteType: "new-api",
          kind: "channel",
          scopeKey: "https://managed.example.invalid",
          resourceId: "3",
        },
        channelName: t("DeepSeek Native Channel"),
        ok: true,
        attempts: 1,
        finishedAt: now - 24 * 60 * 1000,
        oldModels: ["deepseek-chat"],
        newModels: ["deepseek-chat", "deepseek-reasoner", "deepseek-coder"],
      },
      {
        resourceRef: {
          siteType: "new-api",
          kind: "channel",
          scopeKey: "https://managed.example.invalid",
          resourceId: "4",
        },
        channelName: t("Google Gemini Channel"),
        ok: true,
        attempts: 1,
        finishedAt: now - 24 * 60 * 1000,
        oldModels: ["gemini-2.0-flash"],
        newModels: ["gemini-2.5-pro", "gemini-2.5-flash"],
      },
      {
        resourceRef: {
          siteType: "new-api",
          kind: "channel",
          scopeKey: "https://managed.example.invalid",
          resourceId: "5",
        },
        channelName: t("Azure OpenAI US/EU Channel"),
        ok: true,
        attempts: 1,
        finishedAt: now - 24 * 60 * 1000,
        oldModels: ["gpt-4o"],
        newModels: ["gpt-4o", "gpt-4o-mini"],
      },
    ],
  }
}

export {
  createTranslator,
  getMockAccounts,
  getMockModelPricingCache,
  getMockTags,
  getMockApiCredentialProfiles,
  getMockBookmarks,
  getMockBalanceHistory,
  getMockAutoCheckinStatus,
  getMockUsageHistory,
  getMockModelSyncLastExecution,
}
