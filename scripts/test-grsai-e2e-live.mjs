import path from "node:path"
import { fileURLToPath } from "node:url"

import { runScenarioWithCleanup } from "../e2e/utils/scenarioErrors.ts"
import { connectDevExtension, defaultCdpUrl } from "./cdp/client.mjs"
import { applyIsolateFlag } from "./cdp/dev-profile.mjs"
import { runLiveSuites } from "./cdp/live-suites.mjs"
import { runGrsaiProbe } from "./suites/grsai/probe.mjs"
import { runGrsaiUiTest } from "./suites/grsai/ui.mjs"
import { loadLocalEnv } from "./utils/local-env.mjs"

export function parseArgs(args) {
  let siteUrl = process.env.GRSAI_SITE_URL || "https://grsai.com"
  let token = process.env.GRSAI_SESSION_TOKEN || ""
  let suite = "all" // all | probe | ui
  // Resolve the default port after the flag pass so `--isolate` is honored.
  applyIsolateFlag(args)
  let cdpUrl = process.env.CDP_URL || defaultCdpUrl()

  for (const arg of args) {
    if (arg.startsWith("--url=")) {
      siteUrl = arg.slice(6)
    } else if (arg.startsWith("--token=")) {
      token = arg.slice(8)
    } else if (arg.startsWith("--suite=")) {
      suite = arg.slice(8).toLowerCase()
    } else if (arg.startsWith("--cdp=")) {
      cdpUrl = arg.slice(6)
    } else if (arg === "--help" || arg === "-h") {
      console.log(`
Grsai 现场端到端测试运行器 (CDP & Protocol Probe)

用法:
  node scripts/test-grsai-e2e-live.mjs [选项]
  pnpm e2e:cdp:grsai -- [选项]

选项:
  --url=<url>        目标 Grsai 控制台地址 (默认: https://grsai.com)
  --token=<token>    控制台会话 token (默认读 GRSAI_SESSION_TOKEN)
  --suite=<type>     运行套件: 'all' (默认), 'probe' (纯协议), 'ui' (纯界面)
  --cdp=<url>        CDP 调试端口地址 (默认: 共享模式 9222，隔离模式按 worktree 偏移)
  --help, -h         显示帮助说明

注意: UI 套件需要 GRSAI_SESSION_TOKEN；缺失时记录受阻并以非零状态退出。密钥创建/重命名/删除走控制台 xtx 签名写路径，套件结束后应无残留。
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
    !["grsai.com", "grsai.ai"].includes(parsedUrl.hostname)
  ) {
    throw new Error("Expected a Grsai console URL")
  }
  return { siteUrl: parsedUrl.origin, token, suite, cdpUrl }
}

export async function main(args = process.argv.slice(2)) {
  const { siteUrl, token, suite, cdpUrl } = parseArgs(args)
  const environment = { cdpUrl, targetUrl: siteUrl }
  return runLiveSuites({
    suite,
    environment,
    suites: [
      {
        id: "probe",
        covers: ["protocol.contract"],
        run: () => runGrsaiProbe({ token, siteUrl }),
      },
      {
        id: "ui",
        covers: ["extension.ui"],
        prerequisite: () =>
          !token
            ? "Missing session token; authenticated live coverage is unavailable"
            : undefined,
        run: async () => {
          const dev = await connectDevExtension({ cdpUrl })
          environment.extensionId = dev.extensionId
          return runScenarioWithCleanup({
            run: () => runGrsaiUiTest({ ...dev, siteUrl, token }),
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
