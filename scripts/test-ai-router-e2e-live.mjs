import path from "node:path"
import { fileURLToPath } from "node:url"

import { runScenarioWithCleanup } from "../e2e/utils/scenarioErrors.ts"
import { connectDevExtension, defaultCdpUrl } from "./cdp/client.mjs"
import { applyIsolateFlag } from "./cdp/dev-profile.mjs"
import { runLiveSuites } from "./cdp/live-suites.mjs"
import { runAiRouterProbe } from "./suites/ai-router/probe.mjs"
import { runAiRouterUiTest } from "./suites/ai-router/ui.mjs"
import { loadLocalEnv } from "./utils/local-env.mjs"

export function parseArgs(args) {
  let token = process.env.AI_ROUTER_ACCESS_TOKEN || ""
  let suite = "all" // all | probe | ui
  // Resolve the default port after the flag pass so `--isolate` is honored.
  applyIsolateFlag(args)
  let cdpUrl = process.env.CDP_URL || defaultCdpUrl()

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
  --cdp=<url>        CDP 调试端口地址 (默认: 共享模式 9222，隔离模式按 worktree 偏移)
  --help, -h         显示帮助说明
`)
      process.exit(0)
    }
  }

  if (!["all", "probe", "ui"].includes(suite))
    throw new Error("Invalid suite; use all, probe, or ui")
  return { token, suite, cdpUrl }
}

export async function main(args = process.argv.slice(2)) {
  const { token, suite, cdpUrl } = parseArgs(args)
  const environment = { cdpUrl, targetUrl: "https://ai-router.dev" }
  return runLiveSuites({
    suite,
    environment,
    suites: [
      {
        id: "probe",
        covers: ["protocol.contract"],
        prerequisite: () =>
          !token
            ? "Missing session token; authenticated protocol coverage is unavailable"
            : undefined,
        run: () => runAiRouterProbe({ token }),
      },
      {
        id: "ui",
        covers: ["account.card.fixture", "models.source-page.smoke"],
        prerequisite: () =>
          !token
            ? "Missing session token; authenticated live coverage is unavailable"
            : undefined,
        run: async () => {
          const dev = await connectDevExtension({ cdpUrl })
          environment.extensionId = dev.extensionId
          return runScenarioWithCleanup({
            run: () => runAiRouterUiTest({ ...dev, token }),
            finalizers: [() => dev.close()],
            cleanupMessage: "Live UI connection cleanup failed",
            failureMessage: "Live UI execution and cleanup failed",
          })
        },
      },
    ],
  })
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
