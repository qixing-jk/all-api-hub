#!/usr/bin/env node
import { loadLocalEnv } from "../../utils/local-env.mjs"

/**
 * Pure protocol and backend API probe for AI-Router.
 * Runs directly via Node.js fetch with zero browser/CDP overhead.
 */
export async function runAiRouterProbe({
  token,
  baseUrl = "https://api.ai-router.dev",
}) {
  if (!token) {
    console.log(
      "\n⚠️ 未提供 AI_ROUTER_ACCESS_TOKEN，跳过服务端在线接口鉴权探测。",
    )
    return {
      ok: false,
      groups: [],
      keyCrudOk: false,
      checkinOk: false,
      skipped: true,
    }
  }

  const normalizedBase = baseUrl.replace(/\/+$/, "")
  console.log(
    `\n🔍 开始针对 AI-Router 服务端接口进行连通性与生命周期探测: ${normalizedBase}`,
  )

  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  }

  // 1. 获取分组倍率
  const groupsRes = await fetch(`${normalizedBase}/api/v1/groups`, { headers })
  if (!groupsRes.ok) {
    throw new Error(`获取分组失败: HTTP ${groupsRes.status}`)
  }
  const groupsJson = await groupsRes.json()
  const groups = groupsJson?.data || []
  console.log(`  [分组探针]: 成功拉取 ${groups.length} 个模型分组`)

  // 2. 临时测试密钥生命周期 (Create -> Verify -> Delete)
  const testKeyName = `aah-probe-${Math.floor(Math.random() * 10000)}`
  const createRes = await fetch(`${normalizedBase}/api/v1/keys`, {
    method: "POST",
    headers,
    body: JSON.stringify({ name: testKeyName }),
  })
  const createJson = await createRes.json()
  const createdId = createJson?.data?.id

  let keyCrudOk = false
  if (createdId) {
    try {
      const listRes = await fetch(
        `${normalizedBase}/api/v1/keys?page=1&size=20`,
        { headers },
      )
      const listJson = await listRes.json()
      const found = (listJson?.data?.items || []).some(
        (k) => k.id === createdId,
      )
      keyCrudOk = found
      console.log(
        `  [密钥生命周期探针]: 创建成功 (ID: ${createdId})，列表校验: ${found ? "✅" : "❌"}`,
      )
    } finally {
      // 必须清理临时密钥
      await fetch(`${normalizedBase}/api/v1/keys/${createdId}`, {
        method: "DELETE",
        headers,
      }).catch(() => {})
      console.log(`  [密钥生命周期探针]: 临时测试密钥已及时清理。`)
    }
  }

  // 3. 每日签到接口探测
  const tz = encodeURIComponent("Asia/Shanghai")
  const checkinStatusRes = await fetch(
    `${normalizedBase}/api/v1/user/daily-checkin?timezone=${tz}`,
    { headers },
  )
  const checkinJson = await checkinStatusRes.json()
  const checkinData = checkinJson?.data || {}
  console.log("  [签到状态探针]:", {
    statusHttp: checkinStatusRes.status,
    checkedToday: checkinData.checked_today,
    rewardAmount: checkinData.reward_amount,
  })

  return {
    ok: groups.length > 0 && keyCrudOk,
    groups,
    keyCrudOk,
    checkinOk: checkinStatusRes.status === 200,
  }
}

// 允许单独作为 CLI 运行: node scripts/suites/ai-router/probe.mjs [token]
if (process.argv[1] && process.argv[1].endsWith("probe.mjs")) {
  loadLocalEnv()
  const token = process.argv[2] || process.env.AI_ROUTER_ACCESS_TOKEN || ""
  runAiRouterProbe({ token })
    .then((res) => {
      if (res.skipped) {
        console.log("ℹ️ 探针已跳过。如需探测请提供 Token。")
      } else {
        console.log(
          "\n✅ AI-Router 探针执行结果:",
          res.ok ? "全部正常" : "部分异常",
        )
      }
    })
    .catch((err) => {
      console.error("\n❌ 探测失败:", err.message)
      process.exit(1)
    })
}
