import path from "node:path"
import { fileURLToPath } from "node:url"

import { runScenarioWithCleanup } from "../e2e/utils/scenarioErrors.ts"
import { connectDevExtension, defaultCdpUrl } from "./cdp/client.mjs"
import { applyIsolateFlag } from "./cdp/dev-profile.mjs"
import { runLiveSuites } from "./cdp/live-suites.mjs"
import { runRixProbe } from "./suites/rix/probe.mjs"
import { runRixUiTest } from "./suites/rix/ui.mjs"
import { loadLocalEnv } from "./utils/local-env.mjs"

export function parseArgs(args) {
  let targetUrl = process.env.TARGET_RIX_URL || "https://platform.ephone.ai"
  let suite = "all" // all | probe | ui
  // Resolve the default port after the flag pass so `--isolate` is honored.
  applyIsolateFlag(args)
  let cdpUrl = process.env.CDP_URL || defaultCdpUrl()

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
  --cdp=<url>        CDP 调试端口地址 (默认: 共享模式 9222，隔离模式按 worktree 偏移)
  --help, -h         显示帮助说明
`)
      process.exit(0)
    }
  }

  if (!["all", "probe", "ui"].includes(suite))
    throw new Error("Invalid suite; use all, probe, or ui")
  return { targetUrl, suite, cdpUrl }
}

export async function main(args = process.argv.slice(2)) {
  const { targetUrl, suite, cdpUrl } = parseArgs(args)
  const environment = { cdpUrl, targetUrl: targetUrl }
  return runLiveSuites({
    suite,
    environment,
    suites: [
      {
        id: "probe",
        covers: ["protocol.contract"],
        run: () => runRixProbe({ targetUrl }),
      },
      {
        id: "ui",
        covers: ["extension.ui"],
        run: async () => {
          const dev = await connectDevExtension({ cdpUrl })
          environment.extensionId = dev.extensionId
          return runScenarioWithCleanup({
            run: () => runRixUiTest({ ...dev, targetUrl }),
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
