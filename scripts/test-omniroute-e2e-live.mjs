#!/usr/bin/env node
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { connectDevExtension, connectExtensionById } from "./cdp/client.mjs"
import { runOmniRouteProbe } from "./suites/omniroute/probe.mjs"
import { runOmniRouteUiTest } from "./suites/omniroute/ui.mjs"

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
)
const DEFAULT_ENV_FILE = path.join(REPO_ROOT, ".env.local")

/**
 * Read `AAH_E2E_OMNIROUTE_*` values from a `.env`-style file.
 *
 * Operators keep every live credential in one checkout, so the runner accepts
 * `--env-file=<path>` and only falls back to its own worktree's `.env.local`.
 */
function readEnvFileIfPresent(filePath) {
  let raw
  try {
    raw = readFileSync(filePath, "utf8")
  } catch {
    return {}
  }

  const values = {}
  for (const line of raw.split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line)
    if (!match) continue
    let value = match[2].trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    values[match[1]] = value
  }
  return values
}

function parseArgs(args) {
  const options = {
    suite: "all",
    cdpUrl: process.env.CDP_URL || "http://127.0.0.1:9222",
    allowWrite: false,
    envFile: DEFAULT_ENV_FILE,
    baseUrl: undefined,
    token: undefined,
  }

  for (const arg of args) {
    if (arg.startsWith("--base-url=")) {
      options.baseUrl = arg.slice("--base-url=".length)
    } else if (arg.startsWith("--token=")) {
      options.token = arg.slice("--token=".length)
    } else if (arg.startsWith("--suite=")) {
      options.suite = arg.slice("--suite=".length).toLowerCase()
    } else if (arg.startsWith("--cdp=")) {
      options.cdpUrl = arg.slice("--cdp=".length)
    } else if (arg.startsWith("--extension-id=")) {
      options.extensionId = arg.slice("--extension-id=".length)
    } else if (arg.startsWith("--env-file=")) {
      options.envFile = path.resolve(arg.slice("--env-file=".length))
    } else if (arg === "--write") {
      options.allowWrite = true
    } else if (arg === "--help" || arg === "-h") {
      console.log(`
OmniRoute 现场端到端测试运行器 (CDP & Protocol Probe)

用法:
  node scripts/test-omniroute-e2e-live.mjs [选项]
  pnpm e2e:cdp:omniroute -- [选项]

选项:
  --env-file=<path> 从指定 .env 文件读取 AAH_E2E_OMNIROUTE_* (默认: 本 worktree 的 .env.local)
  --base-url=<url>  覆盖部署地址 (默认读 AAH_E2E_OMNIROUTE_BASE_URL)
  --token=<token>   覆盖 admin 作用域令牌 (默认读 AAH_E2E_OMNIROUTE_ADMIN_TOKEN)
  --suite=<type>    运行套件: 'all' (默认), 'probe' (纯协议), 'ui' (纯界面)
  --cdp=<url>       CDP 调试端口地址 (默认: http://127.0.0.1:9222)
  --extension-id=<id> 指定要驱动的扩展 ID (默认按当前 worktree 自动发现)
  --write           协议探测额外执行 创建→回读→删除 的写入轮 (默认只读)
  --help, -h        显示帮助说明

注意: UI 套件会真实创建/删除一个 AAH E2E 前缀的渠道，并在结束时复原共享
dev profile 的扩展设置；协议探测默认完全只读。
`)
      process.exit(0)
    }
  }

  const fileValues = readEnvFileIfPresent(options.envFile)
  options.baseUrl =
    options.baseUrl ||
    process.env.OMNIROUTE_BASE_URL ||
    fileValues.AAH_E2E_OMNIROUTE_BASE_URL ||
    process.env.AAH_E2E_OMNIROUTE_BASE_URL
  options.token =
    options.token ||
    process.env.OMNIROUTE_ADMIN_TOKEN ||
    fileValues.AAH_E2E_OMNIROUTE_ADMIN_TOKEN ||
    process.env.AAH_E2E_OMNIROUTE_ADMIN_TOKEN

  return options
}

/**
 * Connect to the live extension, retrying discovery while the browser boots.
 *
 * A freshly started debug browser needs a moment before its extension's service
 * worker registers, and a single discovery pass races that startup. The
 * documented flow (`pnpm browser:cdp` against an already-running browser) leaves
 * the worker awake, so this only matters when a browser was just launched.
 */
async function connectLiveExtension(cdpUrl, extensionId) {
  const attempts = 6
  let lastError
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return extensionId
        ? await connectExtensionById({ cdpUrl, extensionId })
        : await connectDevExtension({ cdpUrl })
    } catch (error) {
      lastError = error
      if (attempt === attempts) break
      process.stdout.write(`\r等待扩展就绪… (${attempt}/${attempts})`)
      await new Promise((resolve) => setTimeout(resolve, 3000))
    }
  }
  throw lastError
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const { suite, cdpUrl, baseUrl, token, allowWrite } = options
  console.log("========================================================")
  console.log("  OmniRoute 真实部署端到端实测 (协议 + 扩展 UI)")
  console.log("========================================================")
  console.log(`执行模式: [${suite.toUpperCase()}]`)
  console.log(`目标部署: ${baseUrl ?? "(未配置)"}`)

  if (!baseUrl || !token) {
    console.error(
      `\n❌ 缺少 OmniRoute 连接参数。请在 ${options.envFile} 中配置 AAH_E2E_OMNIROUTE_BASE_URL 与 AAH_E2E_OMNIROUTE_ADMIN_TOKEN，或用 --base-url/--token 传入。`,
    )
    process.exit(1)
  }

  // 1. Protocol layer first: no browser needed, and it decides whether the
  //    deployment still matches what the adapter was written against.
  if (suite === "all" || suite === "probe") {
    const probeResult = await runOmniRouteProbe({
      baseUrl,
      token,
      allowWrite,
    })
    console.log(
      `\n✅ 协议层探测完成 (渠道: ${probeResult.connectionCount}, 模型: ${probeResult.modelCount})`,
    )
    if (!probeResult.ok) {
      process.exitCode = 1
    }
  }

  // 2. Extension UI through the live dev browser.
  if (suite === "all" || suite === "ui") {
    console.log(`\n正在连接 CDP 调试浏览器: ${cdpUrl}...`)
    const dev = await connectLiveExtension(cdpUrl, options.extensionId)
    console.log(`✅ 成功连接已挂载扩展: ID [${dev.extensionId}]`)

    try {
      await runOmniRouteUiTest({
        context: dev.context,
        extensionId: dev.extensionId,
        serviceWorker: dev.serviceWorker,
        baseUrl,
        token,
      })
    } finally {
      await dev.close()
    }
  }

  console.log("\n========================================================")
  console.log("  🎉 OmniRoute 测试套件执行完毕！")
  console.log("========================================================")
}

main().catch((error) => {
  console.error("\n❌ 测试运行失败:", error.message)
  process.exit(1)
})
