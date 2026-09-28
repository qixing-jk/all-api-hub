#!/usr/bin/env node
import { connectDevExtension } from "./cdp/client.mjs"
import { runAiRouterProbe } from "./suites/ai-router/probe.mjs"
import { runAiRouterUiTest } from "./suites/ai-router/ui.mjs"

function parseArgs(args) {
  let token = process.env.AI_ROUTER_ACCESS_TOKEN || ""
  let suite = "all" // all | probe | ui
  let cdpUrl = process.env.CDP_URL || "http://127.0.0.1:9222"

  for (const arg of args) {
    if (arg.startsWith("--token=")) {
      token = arg.slice(8)
    } else if (arg.startsWith("--suite=")) {
      suite = arg.slice(8).toLowerCase()
    } else if (arg.startsWith("--cdp=")) {
      cdpUrl = arg.slice(6)
    } else if (arg === "--help" || arg === "-h") {
      console.log(`
AI-Router 现场端到端测试运行器 (CDP & Protocol Probe)

用法:
  node scripts/test-ai-router-e2e-live.mjs [选项]
  pnpm e2e:cdp:ai-router -- [选项]

选项:
  --token=<token>    AI-Router 访问会话令牌 (默认读取 AI_ROUTER_ACCESS_TOKEN 环境变量)
  --suite=<type>     运行套件: 'all' (默认), 'probe' (纯后端协议), 'ui' (纯界面)
  --cdp=<url>        CDP 调试端口地址 (默认: http://127.0.0.1:9222)
  --help, -h         显示帮助说明
`)
      process.exit(0)
    }
  }

  return { token, suite, cdpUrl }
}

async function main() {
  const { token, suite, cdpUrl } = parseArgs(process.argv.slice(2))

  console.log("========================================================")
  console.log("  AI-Router 真实功能实测 (模块化解耦套件)")
  console.log("========================================================")
  console.log(`执行模式: [${suite.toUpperCase()}]`)

  // 1. 服务端协议与接口探测 (无需 CDP，纯 Node.js HTTP)
  if (suite === "all" || suite === "probe") {
    if (token) {
      const probeResult = await runAiRouterProbe({ token })
      console.log(
        `\n✅ AI-Router 协议层探测完成 (分组数: ${probeResult.groups?.length || 0}, 密钥生命周期: ${probeResult.keyCrudOk ? "正常" : "异常"})`,
      )
      if (!probeResult.ok) {
        process.exitCode = 1
      }
    } else {
      console.log(
        "\nℹ️ 未提供 AI_ROUTER_ACCESS_TOKEN，跳过协议探测 (可通过 --token=... 提供)",
      )
    }
  }

  // 2. 扩展 UI 渲染实测 (需要 CDP)
  if (suite === "all" || suite === "ui") {
    console.log(`\n正在连接 CDP 调试浏览器: ${cdpUrl}...`)
    const dev = await connectDevExtension({ cdpUrl })
    console.log(`✅ 成功连接已挂载扩展: ID [${dev.extensionId}]`)

    try {
      await runAiRouterUiTest({
        context: dev.context,
        extensionId: dev.extensionId,
        serviceWorker: dev.serviceWorker,
        token: token || "mock-temp-token",
      })
    } finally {
      await dev.close()
    }
  }

  console.log("\n========================================================")
  console.log("  🎉 AI-Router 测试套件执行完毕！")
  console.log("========================================================")
}

main().catch((err) => {
  console.error("\n❌ 测试运行失败:", err.message)
  process.exit(1)
})
