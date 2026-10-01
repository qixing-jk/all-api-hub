import path from "node:path"
import { fileURLToPath } from "node:url"

import { connectDevExtension } from "./cdp/client.mjs"
import { runKimiProbe } from "./suites/kimi/probe.mjs"
import { runKimiUiTest } from "./suites/kimi/ui.mjs"

export function parseArgs(args) {
  let token = process.env.KIMI_ACCESS_TOKEN || ""
  let refreshToken = process.env.KIMI_REFRESH_TOKEN || ""
  let organizationId = process.env.KIMI_ORGANIZATION_ID || ""
  let suite = "all" // all | probe | ui
  let cdpUrl = process.env.CDP_URL || "http://127.0.0.1:9222"
  let site = "global" // global | cn

  for (const arg of args) {
    if (arg.startsWith("--token=")) {
      token = arg.slice(8)
    } else if (arg.startsWith("--refresh-token=")) {
      refreshToken = arg.slice(16)
    } else if (arg.startsWith("--suite=")) {
      suite = arg.slice(8).toLowerCase()
    } else if (arg.startsWith("--cdp=")) {
      cdpUrl = arg.slice(6)
    } else if (arg.startsWith("--site=")) {
      site = arg.slice(7).toLowerCase()
    } else if (arg === "--cn") {
      site = "cn"
    } else if (arg === "--global") {
      site = "global"
    } else if (arg === "--help" || arg === "-h") {
      console.log(`
Kimi 开放平台现场端到端测试运行器 (CDP & Protocol Probe)

用法:
  node scripts/test-kimi-e2e-live.mjs [选项]
  pnpm e2e:cdp:kimi -- [选项]

选项:
  --token=<token>           Kimi Access Token (默认自动从调试浏览器 localStorage 提取)
  --refresh-token=<rtoken>  Kimi Refresh Token (供扩展 UI 正常鉴权恢复，探针不主动换票)
  --suite=<type>            运行套件: 'all' (默认), 'probe' (纯后端协议), 'ui' (纯界面)
  --site=<cn|global>        选择站点环境 (默认: global)
  --cn                      测试国内版 (https://platform.kimi.com)
  --global                  测试国际版 (https://platform.kimi.ai)
  --cdp=<url>               CDP 调试端口地址 (默认: http://127.0.0.1:9222)
  --help, -h                显示帮助说明
`)
      process.exit(0)
    }
  }

  if (!["cn", "global"].includes(site))
    throw new Error("invalid Kimi site selection")
  if (!["all", "probe", "ui"].includes(suite))
    throw new Error("invalid Kimi suite selection")

  const siteUrl =
    site === "cn" ? "https://platform.kimi.com" : "https://platform.kimi.ai"
  const siteType = site === "cn" ? "kimi" : "kimi-global"

  return {
    token,
    refreshToken,
    organizationId,
    suite,
    cdpUrl,
    siteUrl,
    siteType,
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  let {
    token,
    refreshToken,
    organizationId,
    suite,
    cdpUrl,
    siteUrl,
    siteType,
  } = options

  console.log("========================================================")
  console.log("  Kimi 开放平台端到端全功能实测 (CDP & 接口探针)")
  console.log("========================================================")
  console.log(`目标站点: [${siteType}] (${siteUrl})`)
  console.log(`执行模式: [${suite.toUpperCase()}]`)

  // 1. 如果未显式提供 token，尝试通过 CDP 从当前浏览器已登录的 Kimi 页面静默提取
  if (!token) {
    try {
      console.log(
        `\n🔍 检测到未指定 Token，尝试从调试浏览器 (${cdpUrl}) 自动读取会话凭证...`,
      )
      const dev = await connectDevExtension({ cdpUrl })
      const probePage = await dev.context.newPage()
      await probePage
        .goto(`${siteUrl}/console/account`, {
          waitUntil: "domcontentloaded",
          timeout: 10000,
        })
        .catch(() => {})
      await probePage.waitForTimeout(1500)

      const extracted = await probePage.evaluate(() => {
        try {
          return {
            token: localStorage.getItem("token") || "",
            rtoken: localStorage.getItem("rtoken") || "",
            oid:
              JSON.parse(
                localStorage.getItem("currentOrganizationId") || '""',
              ) || "",
          }
        } catch {
          return null
        }
      })
      await probePage.close().catch(() => {})
      await dev.close()

      if (extracted?.token) {
        token = extracted.token
        refreshToken = refreshToken || extracted.rtoken
        organizationId = organizationId || extracted.oid
        console.log("✅ 成功从调试浏览器自动提取到有效登录态 Token！")
      } else {
        console.log(
          "ℹ️ 未能自动提取到 Token，如需测试在线接口请通过 --token 提供。",
        )
      }
    } catch {
      console.log("ℹ️ 暂未连接到调试浏览器读取 Token，将仅使用离线模拟凭证。")
    }
  }

  // 2. 服务端协议与接口探针 (纯 Node.js HTTP)
  if (suite === "all" || suite === "probe") {
    if (token) {
      const probeResult = await runKimiProbe({
        token,
        baseUrl: siteUrl,
      })
      console.log(
        `\n✅ Kimi 协议层探针完成 (用户信息: ${probeResult.userInfoOk ? "正常" : "异常"}, 余额: ${probeResult.balanceOk ? "正常" : "异常"}, 密钥生命周期: ${probeResult.keyCrudOk ? "正常" : "异常"})`,
      )
      if (!probeResult.ok) {
        process.exitCode = 1
      }
    } else {
      console.log(
        "\nℹ️ 未提供 Token，跳过服务端在线探针 (可通过 --token=... 提供)",
      )
    }
  }

  // 3. 扩展 UI 端到端实测 (需要 CDP 驱动扩展)
  if (suite === "all" || suite === "ui") {
    console.log(`\n正在连接 CDP 调试浏览器: ${cdpUrl}...`)
    const dev = await connectDevExtension({ cdpUrl })
    console.log(`✅ 成功连接已挂载扩展: ID [${dev.extensionId}]`)

    try {
      await runKimiUiTest({
        context: dev.context,
        extensionId: dev.extensionId,
        serviceWorker: dev.serviceWorker,
        token: token || "mock-temp-kimi-token",
        refreshToken,
        organizationId,
        siteUrl,
        siteType,
      })
    } finally {
      await dev.close()
    }
  }

  console.log("\n========================================================")
  console.log("  🎉 Kimi 开放平台现场测试套件执行完毕！")
  console.log("========================================================")
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((err) => {
    console.error("\n❌ 测试运行失败:", err.message)
    process.exit(1)
  })
}
