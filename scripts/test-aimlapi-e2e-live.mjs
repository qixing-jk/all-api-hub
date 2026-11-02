import path from "node:path"
import { fileURLToPath } from "node:url"

import { runScenarioWithCleanup } from "../e2e/utils/scenarioErrors.ts"
import { connectWorktreeExtension, defaultCdpUrl } from "./cdp/client.mjs"
import { applyIsolateFlag } from "./cdp/dev-profile.mjs"
import { runLiveSuites } from "./cdp/live-suites.mjs"
import { runAimlapiAuthMatrix } from "./suites/aimlapi/auth.mjs"
import { runAimlapiAutomaticOnboarding } from "./suites/aimlapi/automatic.mjs"
import { runAimlapiKeyParity } from "./suites/aimlapi/key-parity.mjs"
import { runAimlapiProbe } from "./suites/aimlapi/probe.mjs"
import { runAimlapiUiTest } from "./suites/aimlapi/ui.mjs"
import { loadLocalEnv } from "./utils/local-env.mjs"

export function parseArgs(args) {
  let siteUrl = process.env.AIMLAPI_SITE_URL || "https://aimlapi.com"
  let managementKey = process.env.AIMLAPI_MANAGEMENT_KEY || ""
  let apiKey = process.env.AIMLAPI_API_KEY || ""
  let suite = "all"
  let extensionPath = path.resolve(".output/chrome-mv3-dev")
  // Resolve the default port after the flag pass so `--isolate` is honored.
  applyIsolateFlag(args)
  let cdpUrl = process.env.CDP_URL || defaultCdpUrl()

  for (const arg of args) {
    if (arg.startsWith("--extension-path=")) {
      extensionPath = path.resolve(arg.slice(17))
    } else if (arg.startsWith("--url=")) {
      siteUrl = arg.slice(6)
    } else if (arg.startsWith("--management-key=")) {
      managementKey = arg.slice(17)
    } else if (arg.startsWith("--api-key=")) {
      apiKey = arg.slice(10)
    } else if (arg.startsWith("--suite=")) {
      suite = arg.slice(8).toLowerCase()
    } else if (arg.startsWith("--cdp=")) {
      cdpUrl = arg.slice(6)
    } else if (arg === "--help" || arg === "-h") {
      console.log(`
AI/ML API 现场端到端测试运行器 (CDP & Protocol Probe)

用法:
  node scripts/test-aimlapi-e2e-live.mjs [选项]
  pnpm e2e:cdp:aimlapi -- [选项]

选项:
  --url=<url>              目标控制台地址 (默认: https://aimlapi.com)
  --management-key=<key>   管理密钥；读取 AIMLAPI_MANAGEMENT_KEY
  --api-key=<key>          普通 API key（读余额/账单）；读取 AIMLAPI_API_KEY
  AIMLAPI_USER_ID          可选的账号身份，用于带真实管理密钥的临时 UI 夹具
  --suite=<type>           all (默认，包含以下全部套件), probe, ui, auth, keys (密钥编辑/重开/清理), automatic (会创建并清理连接密钥)
  --extension-path=<path>  CDP 套件精确构建路径；默认 .output/chrome-mv3-dev
  --cdp=<url>              CDP 调试端口地址 (默认: 共享模式 9222，隔离模式按 worktree 偏移)
  --help, -h               显示帮助说明

说明: all 包含 automatic，会创建并清理专用连接密钥，需要已登录控制台。
跳过场景或缺少前提将使验收以非零状态退出，不算完整通过。协议层只读；UI 套件需要管理密钥才能在密钥页创建/删除一次性密钥。
模型目录走公开接口，无凭据也能验证渲染。缺少的凭据会被显式跳过，不会退化成
其他认证方式。
`)
      process.exit(0)
    }
  }

  if (!["all", "probe", "ui", "auth", "automatic", "keys"].includes(suite)) {
    throw new Error(
      "Invalid suite; use all, probe, ui, auth, automatic, or keys",
    )
  }
  const parsedUrl = new URL(siteUrl)
  if (parsedUrl.protocol !== "https:") {
    throw new Error("Expected an https console URL")
  }
  if (!["aimlapi.com", "www.aimlapi.com"].includes(parsedUrl.hostname)) {
    throw new Error("Expected an AI/ML API console URL")
  }
  return {
    siteUrl: parsedUrl.origin,
    managementKey,
    apiKey,
    suite,
    cdpUrl,
    extensionPath,
  }
}

export async function main(args = process.argv.slice(2)) {
  const options = parseArgs(args)
  const runners = {
    probe: runAimlapiProbe,
    ui: runAimlapiUiTest,
    auth: runAimlapiAuthMatrix,
    automatic: runAimlapiAutomaticOnboarding,
    keys: runAimlapiKeyParity,
  }
  let dev
  const environment = {
    targetUrl: options.siteUrl,
    cdpUrl: options.cdpUrl,
    extensionPath: options.extensionPath,
  }
  return runScenarioWithCleanup({
    run: () =>
      runLiveSuites({
        suite: options.suite,
        environment,
        suites: Object.entries(runners).map(([id, run]) => ({
          id,
          covers: [`aimlapi.${id}`],
          run: async () => {
            if (id !== "probe" && !dev)
              dev = await connectWorktreeExtension(options)
            if (dev) environment.extensionId = dev.extensionId
            const detail = await run({ ...options, ...dev })
            if (Array.isArray(detail)) {
              const gaps = detail.filter((row) => row.status !== "passed")
              const reason = gaps
                .map(
                  (row) =>
                    `${row.name} (${row.status}): ${row.reason || "No passing evidence"}`,
                )
                .join(", ")
              if (gaps.some((row) => row.status === "failed"))
                throw new Error(reason)
              return { skipped: gaps.length > 0, reason }
            }
            if (id === "probe" && (!options.managementKey || !options.apiKey)) {
              return {
                ...detail,
                skipped: true,
                reason:
                  "Missing management-key or ordinary-key protocol credentials",
              }
            }
            return detail
          },
        })),
      }),
    finalizers: [
      async () => {
        if (dev) await dev.close()
      },
    ],
    cleanupMessage: "Live CDP connection cleanup failed",
    failureMessage: "Live suites and cleanup failed",
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
