import path from "node:path"
import { fileURLToPath } from "node:url"

import { runScenarioWithCleanup } from "../e2e/utils/scenarioErrors.ts"
import { connectDevExtension, connectExtensionById } from "./cdp/client.mjs"
import { runLiveSuites } from "./cdp/live-suites.mjs"
import { runGptLoadProbe } from "./suites/gpt-load/probe.mjs"
import { runGptLoadUiTest } from "./suites/gpt-load/ui.mjs"
import { loadLocalEnv } from "./utils/local-env.mjs"

/**
 * Resolve CLI overrides and local environment defaults for a live run.
 * @param args Command-line options supplied by the operator.
 * @returns Connection settings for the gpt-load deployment.
 */
export function parseArgs(args) {
  const options = {
    suite: "ui",
    cdpUrl: undefined,
    allowWrite: false,
    envFile: undefined,
    baseUrl: undefined,
    managementKey: undefined,
    extensionId: undefined,
  }

  for (const arg of args) {
    if (arg.startsWith("--base-url=")) {
      options.baseUrl = arg.slice("--base-url=".length)
    } else if (arg.startsWith("--key=")) {
      options.managementKey = arg.slice("--key=".length)
    } else if (arg.startsWith("--management-key=")) {
      options.managementKey = arg.slice("--management-key=".length)
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
gpt-load 现场端到端测试运行器 (CDP & Protocol Probe)

用法:
  node scripts/test-gpt-load-e2e-live.mjs [选项]
  pnpm e2e:cdp:gpt-load -- [选项]

选项:
  --env-file=<path>   从指定 .env 文件读取 AAH_E2E_GPT_LOAD_* (默认: 统一 worktree 配置)
  --base-url=<url>    覆盖网关地址 (默认读 AAH_E2E_GPT_LOAD_BASE_URL)
  --key=<key>         覆盖管理密钥 AUTH_KEY (默认读 AAH_E2E_GPT_LOAD_MANAGEMENT_KEY)
  --suite=<type>      运行套件: 'ui' (默认), 'probe' (纯协议), 'all'
  --cdp=<url>         CDP 调试端口地址 (默认: http://127.0.0.1:9222)
  --extension-id=<id> 指定要驱动的扩展 ID (默认按当前 worktree 自动发现)
  --write            协议探测额外执行 创建→回读→删除 的写入轮 (默认只读)
  --help, -h         显示帮助说明

注意: UI 套件会真实创建/删除一个 AAH E2E 前缀的分组，并在结束时复原共享
dev profile 的扩展设置；协议探测默认完全只读。
`)
      process.exit(0)
    }
  }

  if (!["all", "probe", "ui"].includes(options.suite))
    throw new Error("Invalid suite; use all, probe, or ui")

  const { files } = loadLocalEnv({ envFile: options.envFile })
  options.envSources = files
  options.cdpUrl ??= process.env.CDP_URL || "http://127.0.0.1:9222"
  options.baseUrl =
    options.baseUrl ||
    process.env.GPT_LOAD_BASE_URL ||
    process.env.AAH_E2E_GPT_LOAD_BASE_URL
  options.managementKey =
    options.managementKey ||
    process.env.GPT_LOAD_MANAGEMENT_KEY ||
    process.env.AAH_E2E_GPT_LOAD_MANAGEMENT_KEY

  return options
}

/**
 * Connect to the live extension, retrying discovery while the browser boots.
 *
 * A freshly started debug browser needs a moment before its extension's service
 * worker registers, and a single discovery pass races that startup.
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

/** Validate configuration before executing the selected suites. */
export async function main(args = process.argv.slice(2)) {
  const options = parseArgs(args)
  const { suite, cdpUrl, baseUrl, managementKey, allowWrite } = options
  console.log("========================================================")
  console.log("  gpt-load 真实部署端到端实测 (协议 + 扩展 UI)")
  console.log("========================================================")
  console.log(`执行模式: [${suite.toUpperCase()}]`)
  console.log(`目标部署: ${baseUrl ?? "(未配置)"}`)

  if (!baseUrl || !managementKey) {
    const configSource =
      options.envFile ??
      (options.envSources.join(", ") || ".env.local（共享或当前 worktree）")
    console.error(
      `\n❌ 缺少 gpt-load 连接参数。请在 ${configSource} 中配置 AAH_E2E_GPT_LOAD_BASE_URL 与 AAH_E2E_GPT_LOAD_MANAGEMENT_KEY，或用 --base-url/--key 传入。`,
    )
    process.exit(1)
  }

  const environment = { cdpUrl, targetUrl: baseUrl }
  return runLiveSuites({
    suite,
    environment,
    suites: [
      {
        id: "probe",
        covers: ["protocol.contract"],
        run: () => runGptLoadProbe({ baseUrl, managementKey, allowWrite }),
      },
      {
        id: "ui",
        covers: ["extension.ui"],
        run: async () => {
          const dev = await connectLiveExtension(cdpUrl, options.extensionId)
          environment.extensionId = dev.extensionId
          return runScenarioWithCleanup({
            run: () => runGptLoadUiTest({ ...dev, baseUrl, managementKey }),
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
  main().catch((error) => {
    console.error("\n❌ 测试运行失败:", error.message)
    process.exit(1)
  })
}
