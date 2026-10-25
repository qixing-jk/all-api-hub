import path from "node:path"
import { fileURLToPath } from "node:url"

import { REQUESTY_WEB_ORIGIN } from "../src/services/accountSiteDefinitions/identifiers.ts"
import { findInstalledDevExtension } from "./cdp/browser-runtime.mjs"
import {
  connectDevBrowser,
  connectDevExtension,
  connectExtensionById,
  defaultCdpUrl,
} from "./cdp/client.mjs"
import { applyIsolateFlag } from "./cdp/dev-profile.mjs"
import { runRequestyProbe } from "./suites/requesty/probe.mjs"
import { runRequestyUiTest } from "./suites/requesty/ui.mjs"
import { loadLocalEnv } from "./utils/local-env.mjs"

/**
 * Connect to the mounted extension, preferring title-based discovery but
 * falling back to matching the current worktree's built extension path — a
 * dormant MV3 worker exposes no "All API Hub" titled target to discover.
 */
async function connectRequestyExtension({ cdpUrl }) {
  try {
    return await connectDevExtension({ cdpUrl })
  } catch (discoveryError) {
    const dev = await connectDevBrowser({ cdpUrl })
    let extensionId = null
    try {
      extensionId = await findInstalledDevExtension(
        dev.browser,
        path.resolve(".output/chrome-mv3"),
      )
    } finally {
      await dev.close().catch(() => {})
    }
    if (!extensionId) throw discoveryError
    return connectExtensionById({ cdpUrl, extensionId })
  }
}

export function parseArgs(args) {
  let siteUrl = process.env.REQUESTY_SITE_URL || REQUESTY_WEB_ORIGIN
  let key = process.env.REQUESTY_MANAGE_KEY || ""
  let suite = "all" // all | probe | ui
  // Resolve the default port after the flag pass so `--isolate` is honored.
  applyIsolateFlag(args)
  let cdpUrl = process.env.CDP_URL || defaultCdpUrl()
  let evidenceDir =
    process.env.REQUESTY_EVIDENCE_DIR ||
    `.scratch/requesty-adaptation/live/ui-${Date.now()}`

  for (const arg of args) {
    if (arg.startsWith("--url=")) {
      siteUrl = arg.slice(6)
    } else if (arg.startsWith("--key=")) {
      key = arg.slice(6)
    } else if (arg.startsWith("--suite=")) {
      suite = arg.slice(8).toLowerCase()
    } else if (arg.startsWith("--cdp=")) {
      cdpUrl = arg.slice(6)
    } else if (arg.startsWith("--evidence-dir=")) {
      evidenceDir = arg.slice(15)
    } else if (arg === "--help" || arg === "-h") {
      console.log(`
Requesty 现场端到端测试运行器 (CDP & Protocol Probe)

用法:
  node scripts/test-requesty-e2e-live.mjs [选项]
  pnpm e2e:cdp:requesty -- [选项]

选项:
  --url=<url>         目标 Requesty 控制台地址 (默认: https://app.requesty.ai)
  --key=<key>         管理密钥 rqsty-... (默认读 REQUESTY_MANAGE_KEY)
  --suite=<type>      运行套件: 'all' (默认), 'probe' (纯协议), 'ui' (纯界面)
  --cdp=<url>         CDP 调试端口地址 (默认: 共享模式 9222，隔离模式按 worktree 偏移)
  --evidence-dir=<p>  证据截图目录 (默认: .scratch/requesty-adaptation/live/ui-<时间戳>)
  --isolate           使用当前 worktree 的隔离调试浏览器 profile
  --help, -h          显示帮助说明

注意: 识别与密钥引导阶段无需凭据；保存/刷新/密钥 CRUD/模型目录需要管理密钥。
一次性密钥与临时账号在套件结束时清理，明文密钥不会出现在输出中。
`)
      process.exit(0)
    }
  }

  if (!["all", "probe", "ui"].includes(suite)) {
    throw new Error("Invalid suite; use all, probe, or ui")
  }
  const parsedUrl = new URL(siteUrl)
  if (
    parsedUrl.protocol !== "https:" ||
    !parsedUrl.hostname.endsWith("requesty.ai")
  ) {
    throw new Error("Expected a Requesty console URL")
  }
  return { siteUrl: parsedUrl.origin, key, suite, cdpUrl, evidenceDir }
}

export async function main(args = process.argv.slice(2)) {
  const { siteUrl, key, suite, cdpUrl, evidenceDir } = parseArgs(args)

  console.log("========================================================")
  console.log("  Requesty 分支功能真机测试 (模块化解耦套件)")
  console.log("========================================================")
  console.log(`执行模式: [${suite.toUpperCase()}]`)
  console.log(`目标站点: ${siteUrl}`)
  console.log(
    `管理密钥: ${key ? "已提供" : "未提供 (仅跑识别/引导与信封指纹)"}`,
  )

  // 1. 协议探测阶段 (无需 CDP，纯 Node.js HTTP)
  if (suite === "all" || suite === "probe") {
    const probeResult = await runRequestyProbe({ key })
    console.log(
      `\n✅ 协议层探测结果: ${probeResult.ok ? "管理 API 契约与适配器一致" : "存在不一致"}${probeResult.skipped ? " (跳过已授权接口)" : ""}`,
    )
    if (!probeResult.ok) {
      process.exitCode = 1
    }
  }

  // 2. UI 自动化实测阶段 (需要 CDP)
  if (suite === "all" || suite === "ui") {
    console.log(`\n正在连接 CDP 调试浏览器: ${cdpUrl}...`)
    const dev = await connectRequestyExtension({ cdpUrl })
    console.log(`✅ 成功连接已挂载扩展: ID [${dev.extensionId}]`)

    try {
      await runRequestyUiTest({
        context: dev.context,
        extensionId: dev.extensionId,
        serviceWorker: dev.serviceWorker,
        key,
        evidenceDir,
      })
    } finally {
      await dev.close()
    }
  }

  console.log("\n========================================================")
  console.log("  🎉 Requesty 测试套件执行完毕！")
  console.log("========================================================")
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  loadLocalEnv()
  main().catch((err) => {
    console.error("\n❌ 测试运行失败:", err.message)
    process.exit(1)
  })
}
