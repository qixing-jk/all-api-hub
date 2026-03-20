/* eslint-disable jsdoc/require-jsdoc, jsdoc/require-param, jsdoc/require-returns */
import path from "node:path"

import {
  writeHistoryReport,
  writeSummaryReport,
} from "./lazy-loading-report-utils.mjs"

/**
 * Parse CLI flags for the lazy-loading report renderer.
 */
function parseArgs(argv) {
  const options = {
    rootDir: path.resolve("lazy-loading-compare-results"),
    summary: null,
  }

  for (const arg of argv) {
    if (arg.startsWith("--root-dir=")) {
      options.rootDir = path.resolve(arg.slice("--root-dir=".length))
      continue
    }

    if (arg.startsWith("--summary=")) {
      options.summary = path.resolve(arg.slice("--summary=".length))
    }
  }

  return options
}

async function main() {
  const options = parseArgs(process.argv.slice(2))

  if (options.summary) {
    const htmlPath = await writeSummaryReport(options.summary)
    console.log(`HTML report written to ${htmlPath}`)
    return
  }

  const historyReport = await writeHistoryReport(options.rootDir)
  console.log(
    `History index written to ${historyReport.indexPath} (${historyReport.count} report${historyReport.count === 1 ? "" : "s"})`,
  )
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
