#!/usr/bin/env node
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { connectDevExtension, defaultCdpUrl } from "./cdp/client.mjs"
import { applyIsolateFlag } from "./cdp/dev-profile.mjs"
import { runClawhudUiTest } from "./suites/clawhud/ui.mjs"
import { loadLocalEnv } from "./utils/local-env.mjs"

loadLocalEnv()

const DEFAULT_SCREENSHOTS_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  ".scratch",
  "issue-1670",
  "screenshots",
)

function parseArgs(args) {
  let token = process.env.CLAWHUD_ACCESS_TOKEN || ""
  let tokenFile = ""
  let cdpUrl = process.env.CDP_URL || ""
  applyIsolateFlag(args)

  for (const arg of args) {
    if (arg.startsWith("--token=")) {
      token = arg.slice(8)
    } else if (arg.startsWith("--token-file=")) {
      tokenFile = arg.slice("--token-file=".length)
    } else if (arg.startsWith("--cdp=")) {
      cdpUrl = arg.slice(6)
    } else if (arg === "--help" || arg === "-h") {
      console.log(`
詞元公益站 (clawhud) 现场端到端测试运行器 (CDP)

用法:
  node scripts/test-clawhud-e2e-live.mjs [选项]
  pnpm e2e:cdp:clawhud -- [选项]

选项:
  --token=<token>      clawhud 访问令牌 (默认读取 CLAWHUD_ACCESS_TOKEN 环境变量)
  --token-file=<path>  从本地文件读取令牌 (推荐, 文件不入库)
  --cdp=<url>          CDP 调试端口地址 (默认: 共享模式 9222, 隔离模式按 worktree 偏移)
  --help               显示帮助
`)
      process.exit(0)
    }
  }
  if (tokenFile) {
    token = readFileSync(tokenFile, "utf8").trim()
  }
  if (!cdpUrl) cdpUrl = defaultCdpUrl()
  return { token, cdpUrl }
}

async function main() {
  const { token, cdpUrl } = parseArgs(process.argv.slice(2))

  console.log("========================================================")
  console.log("  詞元公益站 (clawhud) 签到现场实测")
  console.log("========================================================")

  if (!token) {
    console.log(
      "\n⚠️ 未提供 CLAWHUD_ACCESS_TOKEN 或 --token-file, 无法执行 live 校验。",
    )
    process.exitCode = 1
    return
  }

  console.log(`\n正在连接 CDP 调试浏览器: ${cdpUrl}...`)
  const dev = await connectDevExtension({ cdpUrl })
  console.log(`✅ 成功连接已挂载扩展: ID [${dev.extensionId}]`)

  try {
    const { result } = await runClawhudUiTest({
      context: dev.context,
      extensionId: dev.extensionId,
      serviceWorker: dev.serviceWorker,
      token,
      screenshotsDir: DEFAULT_SCREENSHOTS_DIR,
    })
    console.log(`\n✅ 詞元公益站 live 校验完成: ${JSON.stringify(result)}`)
  } finally {
    await dev.close()
  }
}

main().catch((err) => {
  console.error("\n❌ 测试运行失败:", err.message)
  process.exit(1)
})
