#!/usr/bin/env node

/**
 * Pure protocol and backend API probe for Kimi Open Platform.
 * Runs directly via Node.js fetch with zero browser/CDP overhead.
 */
export async function runKimiProbe({
  token,
  refreshToken = "",
  baseUrl = "https://platform.kimi.ai",
}) {
  if (!token) {
    console.log("\n⚠️ 未提供 Kimi Access Token，跳过服务端在线接口鉴权探测。")
    return {
      ok: false,
      userInfoOk: false,
      balanceOk: false,
      projectsOk: false,
      keyCrudOk: false,
      tokenRefreshOk: false,
      skipped: true,
    }
  }

  const normalizedBase = baseUrl.replace(/\/+$/, "")
  console.log(
    `\n🔍 开始针对 Kimi 开放平台接口进行连通性与生命周期探测: ${normalizedBase}`,
  )

  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "X-Msh-Platform-Agent": "Web/1.0.0",
  }

  // 1. 获取用户信息与组织 ID
  console.log("  [1/4] 用户信息探针 (GET /api?endpoint=userInfo)...")
  const userRes = await fetch(`${normalizedBase}/api?endpoint=userInfo`, {
    headers,
  })
  if (!userRes.ok) {
    throw new Error(`获取 Kimi 用户信息失败: HTTP ${userRes.status}`)
  }
  const userJson = await userRes.json()
  const userData = userJson?.data || {}
  const orgs = userData.organizations || []
  const primaryOrgId = orgs[0]?.organization?.id || ""
  console.log(
    `  - 用户: [${userData.name || userData.username || userData.id}]，归属组织数: ${orgs.length}，主组织 ID: [${primaryOrgId}]`,
  )

  // 2. 组织账户余额与代金券
  let balanceData = {}
  let balanceOk = false
  if (primaryOrgId) {
    console.log(
      `  [2/4] 账户余额探针 (GET /api?endpoint=organizationAccountInfo&oid=${primaryOrgId})...`,
    )
    const balRes = await fetch(
      `${normalizedBase}/api?endpoint=organizationAccountInfo&oid=${encodeURIComponent(primaryOrgId)}`,
      { headers },
    )
    if (balRes.ok) {
      const balJson = await balRes.json()
      balanceData = balJson?.data || {}
      balanceOk = true
      console.log("  - 账户资产:", {
        总余额: balanceData.cur,
        可用余额: balanceData.available_amount,
        今日消耗: balanceData.today_consume,
      })
    }
  }

  // 3. 项目列表
  console.log(
    `  [3/4] 项目列表探针 (GET /api?endpoint=listProjects&oid=${primaryOrgId})...`,
  )
  const projRes = await fetch(
    `${normalizedBase}/api?endpoint=listProjects&oid=${encodeURIComponent(primaryOrgId)}`,
    { headers },
  )
  if (!projRes.ok) {
    throw new Error(`获取 Kimi 项目列表失败: HTTP ${projRes.status}`)
  }
  const projJson = await projRes.json()
  const projects = Array.isArray(projJson?.data)
    ? projJson.data
    : projJson?.data?.items || []
  const defaultProj = projects.find((p) => p.is_default) || projects[0]
  console.log(
    `  - 成功拉取 ${projects.length} 个项目，默认项目: [${defaultProj?.name || "无"}] (${defaultProj?.id || ""})`,
  )

  // 4. 原生密钥生命周期 (查询 -> 创建 -> 查询校验 -> 删除)
  let keyCrudOk = false
  if (defaultProj?.id && primaryOrgId) {
    console.log(
      `  [4/4] 密钥生命周期探针 (Project: ${defaultProj.id}, Org: ${primaryOrgId})...`,
    )
    const testKeyName = `aah-probe-${Math.floor(Math.random() * 10000)}`
    const createParams = new URLSearchParams({
      endpoint: "createApiKey",
      pid: defaultProj.id,
      oid: primaryOrgId,
    })
    const createRes = await fetch(
      `${normalizedBase}/api?${createParams.toString()}`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ name: testKeyName }),
      },
    )
    const createJson = await createRes.json()
    const createdKey = createJson?.data?.key
    const createdSecret = createJson?.data?.auth

    if (createdKey) {
      console.log(
        `  - 成功创建一次性密钥 (KeyID: ${createdKey}, 凭证掩码: ${createdSecret ? "已捕获明文" : "无"})`,
      )
      try {
        const listParams = new URLSearchParams({
          endpoint: "organizationKeys",
          oid: primaryOrgId,
        })
        const listRes = await fetch(
          `${normalizedBase}/api?${listParams.toString()}`,
          { headers },
        )
        const listJson = await listRes.json()
        const keys = Array.isArray(listJson?.data)
          ? listJson.data
          : listJson?.data?.items || []
        const found = keys.some((k) => k.key === createdKey)
        keyCrudOk = found
        console.log(
          `  - 列表查询校验新密钥: ${found ? "✅ 存在" : "❌ 未找到"}`,
        )
      } finally {
        const deleteParams = new URLSearchParams({
          endpoint: "deleteApiKey",
          id: createdKey,
          pid: defaultProj.id,
          oid: primaryOrgId,
        })
        await fetch(`${normalizedBase}/api?${deleteParams.toString()}`, {
          method: "DELETE",
          headers,
        }).catch(() => {})
        console.log("  - 临时测试密钥已及时清理删除。")
      }
    }
  }

  // 5. 可选：刷新令牌探测 (Token Refresh)
  let tokenRefreshOk = false
  if (refreshToken) {
    console.log(
      "  [可选 5/5] Refresh Token 轮换探针 (GET /api?endpoint=refreshToken)...",
    )
    const refreshRes = await fetch(
      `${normalizedBase}/api?endpoint=refreshToken`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          "Msh-Authorization": refreshToken,
        },
      },
    )
    if (refreshRes.ok) {
      const refreshJson = await refreshRes.json()
      tokenRefreshOk = Boolean(refreshJson?.data?.access_token)
      console.log(
        `  - Refresh Token 换票验证: ${tokenRefreshOk ? "✅ 换票成功" : "❌ 换票失败"}`,
      )
    }
  }

  return {
    ok: Boolean(userData.uid && balanceOk && projects.length > 0 && keyCrudOk),
    userInfoOk: Boolean(userData.uid),
    balanceOk,
    projectsOk: projects.length > 0,
    keyCrudOk,
    tokenRefreshOk,
  }
}

// 允许单独作为 CLI 运行: node scripts/suites/kimi/probe.mjs [token] [refreshToken] [baseUrl]
if (process.argv[1] && process.argv[1].endsWith("probe.mjs")) {
  const token = process.argv[2] || process.env.KIMI_ACCESS_TOKEN || ""
  const refreshToken = process.argv[3] || process.env.KIMI_REFRESH_TOKEN || ""
  const baseUrl =
    process.argv[4] || process.env.KIMI_BASE_URL || "https://platform.kimi.ai"

  runKimiProbe({ token, refreshToken, baseUrl })
    .then((res) => {
      if (res.skipped) {
        console.log("ℹ️ 探针已跳过。如需探测请提供 Token。")
      } else {
        console.log(
          "\n✅ Kimi 开放平台探针执行结果:",
          res.ok ? "全部正常" : "部分异常",
        )
      }
    })
    .catch((err) => {
      console.error("\n❌ 探测失败:", err.message)
      process.exit(1)
    })
}
