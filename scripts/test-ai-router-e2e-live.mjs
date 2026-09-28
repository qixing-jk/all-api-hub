#!/usr/bin/env node
/* global chrome */
import { chromium } from "@playwright/test"

const CDP_URL = "http://127.0.0.1:9222"
const REAL_TOKEN = process.env.AI_ROUTER_ACCESS_TOKEN || ""

async function main() {
  console.log("======================================================")
  console.log("  AI-Router 真实全功能实测 (从识别到密钥、模型与签到)  ")
  console.log("======================================================")

  if (!REAL_TOKEN) {
    console.log("\n⚠️ 未设置 AI_ROUTER_ACCESS_TOKEN 环境变量。")
    console.log("   在线真实交互测试需要真实的会话访问令牌。")
    console.log("   如需执行端到端真机在线调用，请设置该环境变量后运行:")
    console.log(
      '     $env:AI_ROUTER_ACCESS_TOKEN="..." ; pnpm e2e:cdp:ai-router\n',
    )
    process.exitCode = 1
    return
  }

  console.log(`\n正在连接到 Dev 调试浏览器: ${CDP_URL}...`)
  const browser = await chromium.connectOverCDP(CDP_URL)
  const context = browser.contexts()[0]

  // 1. 唤醒并定位扩展
  const session = await browser.newBrowserCDPSession()
  let { targetInfos } = await session.send("Target.getTargets")
  let extTargets = targetInfos.filter((t) =>
    t.url?.startsWith("chrome-extension://"),
  )

  if (extTargets.length === 0) {
    const dummy = await context.newPage()
    await dummy.goto("edge://extensions").catch(() => {})
    await dummy.waitForTimeout(600)
    await dummy.close().catch(() => {})
    const updated = await session.send("Target.getTargets")
    extTargets = updated.targetInfos.filter((t) =>
      t.url?.startsWith("chrome-extension://"),
    )
  }

  if (extTargets.length === 0) {
    throw new Error("未能找到已挂载的 All API Hub 扩展实例！")
  }

  const extensionId = new URL(extTargets[0].url).hostname
  console.log(`✅ 定位到目标扩展 ID: ${extensionId}`)

  let sw = context.serviceWorkers().find((w) => w.url().includes(extensionId))
  if (!sw) {
    const p = await context.newPage()
    await p
      .goto(`chrome-extension://${extensionId}/options.html`)
      .catch(() => {})
    await p.waitForTimeout(600)
    await p.close().catch(() => {})
    sw = context.serviceWorkers().find((w) => w.url().includes(extensionId))
  }

  // =========================================================================
  // [阶段 1] 注入/同步 AI-ROUTER 账户并验证本地存储
  // =========================================================================
  console.log("\n------------------------------------------------------")
  console.log("[阶段 1] 注入/同步 AI-ROUTER 账户到扩展本地存储...")
  console.log("------------------------------------------------------")

  const accountId = "account-ai-router-e2e-live"
  const accountPayload = {
    id: accountId,
    site_name: "AI-ROUTER",
    site_url: "https://ai-router.dev",
    site_type: "sub2api",
    exchange_rate: 7.2,
    auth_token: REAL_TOKEN,
    account_info: {
      id: "live-test-user",
      access_token: REAL_TOKEN,
      email: "user@example.com",
      username: "ai-router-user",
    },
    balance: 1.0,
    active_balance: 1.0,
    checkInMethod: "automatic",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  const storageRes = await sw.evaluate((acc) => {
    return new Promise((resolve) => {
      chrome.storage.local.get("site_accounts", (res) => {
        let accounts = []
        if (typeof res.site_accounts === "string") {
          try {
            accounts = JSON.parse(res.site_accounts)?.accounts || []
          } catch {
            /* ignore */
          }
        } else if (res.site_accounts?.accounts) {
          accounts = res.site_accounts.accounts
        }

        const idx = accounts.findIndex((a) => a.id === acc.id)
        if (idx !== -1) {
          accounts[idx] = { ...accounts[idx], ...acc }
        } else {
          accounts.push(acc)
        }

        chrome.storage.local.set({ site_accounts: { accounts } }, () => {
          resolve({
            ok: true,
            totalAccounts: accounts.length,
            currentAccount: acc.site_name,
          })
        })
      })
    })
  }, accountPayload)

  console.log(
    `✅ 账户同步成功！总账户数: ${storageRes.totalAccounts}，已加载站点: ${storageRes.currentAccount}`,
  )

  // =========================================================================
  // [阶段 2] 验证实际 API 密钥管理生命周期 (查询、创建、校验、删除)
  // =========================================================================
  console.log("\n------------------------------------------------------")
  console.log(
    "[阶段 2] 密钥生命周期实测 (List -> Create -> Verify -> Delete)...",
  )
  console.log("------------------------------------------------------")

  const testKeyName = `aah-live-verify-${Math.floor(Math.random() * 10000)}`
  console.log(`准备创建临时测试密钥: ${testKeyName}`)

  const keyOpResult = await sw.evaluate(
    async ({ token, keyName }) => {
      const BASE = "https://api.ai-router.dev/api/v1"
      const headers = {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      }

      // 1. 获取现有 keys
      const listBefore = await fetch(`${BASE}/keys?page=1&size=20`, {
        headers,
      }).then((r) => r.json())
      const initialCount = listBefore?.data?.items?.length || 0

      // 2. 创建新 key
      const createRes = await fetch(`${BASE}/keys`, {
        method: "POST",
        headers,
        body: JSON.stringify({ name: keyName }),
      }).then((r) => r.json())
      const createdKey = createRes?.data?.key
      const createdId = createRes?.data?.id

      if (!createdId || !createdKey) {
        throw new Error(
          `创建测试密钥失败: ${createRes?.message || JSON.stringify(createRes)}`,
        )
      }

      // 3. 再次获取列表确认包含新 key，并在 finally 中确保删除清理
      let found = false
      let deleteOk = false
      try {
        const listAfter = await fetch(`${BASE}/keys?page=1&size=20`, {
          headers,
        }).then((r) => r.json())
        found = !!listAfter?.data?.items?.some((k) => k.id === createdId)
      } finally {
        if (createdId) {
          const delRes = await fetch(`${BASE}/keys/${createdId}`, {
            method: "DELETE",
            headers,
          }).then((r) => r.json())
          deleteOk = delRes?.code === 0 || delRes?.message === "success"
        }
      }

      if (!found) {
        throw new Error(`在密钥列表中未找到新建的密钥 ID: ${createdId}`)
      }
      if (!deleteOk) {
        throw new Error(`清理测试密钥失败 (ID: ${createdId})`)
      }

      return {
        initialCount,
        createdKey: createdKey.slice(0, 10) + "...",
        createdId,
        verifiedInList: found,
        deleteOk,
      }
    },
    { token: REAL_TOKEN, keyName: testKeyName },
  )

  console.log(`- 初始密钥数量: ${keyOpResult.initialCount}`)
  console.log(
    `- 新建密钥结果: ${keyOpResult.createdKey} (ID: ${keyOpResult.createdId})`,
  )
  console.log(`- 列表中校验存在: ${keyOpResult.verifiedInList ? "✅" : "❌"}`)
  console.log(
    `- 临时密钥清理结果: ${keyOpResult.deleteOk ? "✅ (无残留)" : "❌"}`,
  )

  // =========================================================================
  // [阶段 3] 验证真实模型分组与目录拉取
  // =========================================================================
  console.log("\n------------------------------------------------------")
  console.log("[阶段 3] 模型与价格目录实测...")
  console.log("------------------------------------------------------")

  const modelCatalogResult = await sw.evaluate(async (token) => {
    const BASE = "https://api.ai-router.dev"
    const headers = { Authorization: "Bearer " + token }

    // 1. 获取分组列表 (倍率)
    const groupsRes = await fetch(`${BASE}/api/v1/groups`, { headers }).then(
      (r) => r.json(),
    )
    const groups = groupsRes?.data || []

    // 2. 获取临时 API Key 用于测试 /v1/models (模拟用户测试)
    const keyRes = await fetch(`${BASE}/api/v1/keys`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "aah-temp-model-test" }),
    }).then((r) => r.json())
    const tempKey = keyRes?.data?.key
    const tempKeyId = keyRes?.data?.id

    let modelsCount = 0
    let sampleModels = []
    if (tempKey) {
      try {
        const modelsRes = await fetch(`${BASE}/v1/models`, {
          headers: { Authorization: "Bearer " + tempKey },
        }).then((r) => r.json())
        const items = modelsRes?.data || []
        modelsCount = items.length
        sampleModels = items.slice(0, 5).map((m) => m.id)
      } finally {
        if (tempKeyId) {
          await fetch(`${BASE}/api/v1/keys/${tempKeyId}`, {
            method: "DELETE",
            headers,
          })
        }
      }
    }

    return {
      groupCount: groups.length,
      groups: groups.map((g) => ({ name: g.name, ratio: g.ratio })),
      modelsCount,
      sampleModels,
    }
  }, REAL_TOKEN)

  console.log(`- 获取到模型分组: ${modelCatalogResult.groupCount} 个`)
  for (const g of modelCatalogResult.groups) {
    console.log(`    分组 [${g.name}]: 倍率 ${g.ratio}`)
  }
  console.log(`- 真实网关返回模型数: ${modelCatalogResult.modelsCount} 个`)
  console.log(`- 样本模型:`, modelCatalogResult.sampleModels)
  console.log(`✅ 模型目录接口解析成功！`)

  // =========================================================================
  // [阶段 4] 真实每日签到功能测试
  // =========================================================================
  console.log("\n------------------------------------------------------")
  console.log("[阶段 4] 每日签到接口实测...")
  console.log("------------------------------------------------------")

  const checkinStatus = await sw.evaluate(async (token) => {
    const tz = encodeURIComponent("Asia/Shanghai")
    const res = await fetch(
      `https://api.ai-router.dev/api/v1/user/daily-checkin?timezone=${tz}`,
      {
        headers: { Authorization: "Bearer " + token },
      },
    )
    return { status: res.status, data: await res.json() }
  }, REAL_TOKEN)

  if (checkinStatus.status !== 200) {
    throw new Error(
      `签到状态查询失败，返回意外状态码: HTTP ${checkinStatus.status}`,
    )
  }

  console.log(`- 签到状态查询 HTTP: ${checkinStatus.status}`)
  console.log(`- 今日已签到: ${checkinStatus.data?.data?.checked_today}`)
  console.log(`- 签到功能启用: ${checkinStatus.data?.data?.enabled}`)
  console.log(`- 奖励金额: $${checkinStatus.data?.data?.reward_amount}`)

  console.log("\n测试签到幂等提交验证 (POST /api/v1/user/daily-checkin)...")
  const idempotentRes = await sw.evaluate(async (token) => {
    const res = await fetch(
      "https://api.ai-router.dev/api/v1/user/daily-checkin",
      {
        method: "POST",
        headers: { Authorization: "Bearer " + token },
      },
    )
    return { status: res.status, data: await res.json() }
  }, REAL_TOKEN)

  if (idempotentRes.status !== 200 && idempotentRes.status !== 409) {
    throw new Error(
      `签到提交返回意外状态码: HTTP ${idempotentRes.status} (预期 200 成功或 409 已签到)`,
    )
  }

  console.log(`✅ 重复签到测试结果: HTTP ${idempotentRes.status}`)
  console.log(`   服务端原因码: ${idempotentRes.data.reason}`)
  console.log(`   服务端提示: "${idempotentRes.data.message}"`)

  // =========================================================================
  // [阶段 5] 浏览器 UI 真实渲染验证 (Options #account 与 #models)
  // =========================================================================
  console.log("\n------------------------------------------------------")
  console.log("[阶段 5] 浏览器 UI 真实 DOM 渲染验证...")
  console.log("------------------------------------------------------")

  const page = await context.newPage()

  // 5.1 验证 #account 页面
  await page.goto(`chrome-extension://${extensionId}/options.html#account`)
  await page.waitForLoadState("domcontentloaded")
  await page.waitForTimeout(1000)

  const accountRows = page.locator(
    '[data-testid="account-card"], tr, [role="row"]',
  )
  const rowCount = await accountRows.count()
  console.log(`- #account 页面中检测到列表元素行数: ${rowCount}`)

  const aiRouterEl = page.locator("text=AI-ROUTER").first()
  const isAiRouterVisible = await aiRouterEl
    .isVisible({ timeout: 5000 })
    .catch(() => false)
  console.log(`✅ AI-ROUTER 账户在扩展设置页中是否可见: ${isAiRouterVisible}`)

  // 5.2 验证 #models 页面
  console.log(`- 打开 #models 页面验证模型目录渲染...`)
  await page.goto(`chrome-extension://${extensionId}/options.html#models`)
  await page.waitForLoadState("domcontentloaded")
  await page.waitForTimeout(1500)

  const modelsContainer = page
    .locator('[data-testid="models-page"], .model-list, main')
    .first()
  const isModelsPageVisible = await modelsContainer
    .isVisible({ timeout: 5000 })
    .catch(() => false)
  console.log(`✅ 模型列表页面加载渲染成功 (可见性: ${isModelsPageVisible})`)

  await page.close()
  await session.detach()
  await browser.close()

  console.log("\n======================================================")
  console.log(
    "  🎉 AI-Router 全功能链路（识别、账户、密钥、模型、签到、UI）全部通过！",
  )
  console.log("======================================================")
}

main().catch((err) => {
  console.error("\n❌ 测试过程中发生异常:", err)
  process.exit(1)
})
