#!/usr/bin/env node
import { connectDevExtension } from "./cdp/client.mjs"
import { runRixProbe } from "./suites/rix/probe.mjs"
import { runRixUiTest } from "./suites/rix/ui.mjs"

function parseArgs(args) {
  let targetUrl = process.env.TARGET_RIX_URL || "https://platform.ephone.ai"
  let suite = "all" // all | probe | ui
  let cdpUrl = process.env.CDP_URL || "http://127.0.0.1:9222"

  for (const arg of args) {
    if (arg.startsWith("--url=")) {
      targetUrl = arg.slice(6)
    } else if (arg.startsWith("--suite=")) {
      suite = arg.slice(8).toLowerCase()
    } else if (arg.startsWith("--cdp=")) {
      cdpUrl = arg.slice(6)
    } else if (arg === "--help" || arg === "-h") {
      console.log(`
Rix API 现场端到端测试运行器 (CDP & Protocol Probe)

用法:
  node scripts/test-rix-api-e2e-live.mjs [选项]
  pnpm e2e:cdp:rix -- [选项]

选项:
  --url=<url>        目标 Rix 站点地址 (默认: https://platform.ephone.ai)
  --suite=<type>     运行套件: 'all' (默认), 'probe' (纯网络协议), 'ui' (纯界面)
  --cdp=<url>        CDP 调试端口地址 (默认: http://127.0.0.1:9222)
  --help, -h         显示帮助说明
`)
      process.exit(0)
    }
  }

  return { targetUrl, suite, cdpUrl }
}

async function main() {
  const { targetUrl, suite, cdpUrl } = parseArgs(process.argv.slice(2))

  console.log("========================================================")
  console.log("  Rix API 分支功能真机测试 (模块化解耦套件)")
  console.log("========================================================")
  console.log(`执行模式: [${suite.toUpperCase()}]`)
  console.log(`目标站点: ${targetUrl}`)

  // 1. 协议探测阶段 (无需 CDP，纯 Node.js HTTP)
  if (suite === "all" || suite === "probe") {
    const probeResult = await runRixProbe({ targetUrl })
    console.log(
      `\n✅ 协议层探测结果: ${probeResult.ok ? "命中 Rix API 结构签名" : "未完全命中"} (版本: ${probeResult.version}, 模型数: ${probeResult.modelCount})`,
    )
  }

  // 2. UI 自动化实测阶段 (需要 CDP)
  if (suite === "all" || suite === "ui") {
    console.log(`\n正在连接 CDP 调试浏览器: ${cdpUrl}...`)
    const dev = await connectDevExtension({ cdpUrl })
    console.log(`✅ 成功连接已挂载扩展: ID [${dev.extensionId}]`)

    try {
      await runRixUiTest({
        context: dev.context,
        extensionId: dev.extensionId,
        serviceWorker: dev.serviceWorker,
        targetUrl,
      })
    } finally {
      await dev.close()
    }
  }

  console.log("\n========================================================")
  console.log("  🎉 Rix API 测试套件执行完毕！")
  console.log("========================================================")
}

main().catch((err) => {
  console.error("\n❌ 测试运行失败:", err.message)
  process.exit(1)
})
