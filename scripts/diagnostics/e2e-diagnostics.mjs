/* eslint-disable jsdoc/require-jsdoc */
import { spawn } from "node:child_process"
import path from "node:path"

const repoRoot = process.cwd()

const commandRegistry = {
  memory: {
    snapshot: "scripts/diagnostics/collect-extension-memory.mjs",
    compare: "scripts/diagnostics/compare-extension-memory.mjs",
    report: "scripts/diagnostics/render-extension-memory-report.mjs",
  },
  lazy: {
    compare: "scripts/diagnostics/compare-lazy-loading.mjs",
    report: "scripts/diagnostics/render-lazy-loading-report.mjs",
  },
}

function printUsage() {
  console.log(`Usage:
  pnpm run e2e:diagnostics -- <tool> <action> [args...]

Tools:
  memory  snapshot | compare | report
  lazy    compare | report

Examples:
  pnpm run e2e:diagnostics -- memory snapshot
  pnpm run e2e:diagnostics -- memory compare --baseline=HEAD
  pnpm run e2e:diagnostics -- memory report
  pnpm run e2e:diagnostics -- lazy compare --baseline=origin/main
  pnpm run e2e:diagnostics -- lazy report
`)
}

function resolveScript(tool, action) {
  return commandRegistry[tool]?.[action] ?? null
}

async function runScript(scriptPath, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd: repoRoot,
      stdio: "inherit",
      shell: process.platform === "win32",
      env: process.env,
    })

    child.on("error", reject)
    child.on("exit", (code) => {
      if (code === 0) {
        resolve()
        return
      }

      reject(
        new Error(
          `Diagnostics command failed (${code ?? "unknown"}): ${path.basename(scriptPath)}`,
        ),
      )
    })
  })
}

async function main() {
  const [tool, action, ...args] = process.argv.slice(2)

  if (!tool || tool === "--help" || tool === "help") {
    printUsage()
    return
  }

  if (!action) {
    console.error("Missing diagnostics action.")
    printUsage()
    process.exitCode = 1
    return
  }

  const scriptPath = resolveScript(tool, action)
  if (!scriptPath) {
    console.error(`Unsupported diagnostics command: ${tool} ${action}`)
    printUsage()
    process.exitCode = 1
    return
  }

  await runScript(path.resolve(repoRoot, scriptPath), args)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
