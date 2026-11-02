import path from "node:path"

import { connectWorktreeExtension, defaultCdpUrl } from "./cdp/client.mjs"
import { applyIsolateFlag } from "./cdp/dev-profile.mjs"
import { runAimlapiUiTest } from "./suites/aimlapi/ui.mjs"
import { loadLocalEnv } from "./utils/local-env.mjs"

// Public pricing acceptance deliberately supplies no credentials: no remote writes.
await loadLocalEnv()
applyIsolateFlag(process.argv.slice(2))
const dev = await connectWorktreeExtension({
  cdpUrl: process.env.CDP_URL || defaultCdpUrl(),
  extensionPath: path.resolve(
    process.argv
      .find((arg) => arg.startsWith("--extension-path="))
      ?.slice(17) || ".output/chrome-mv3-dev",
  ),
})
try {
  await runAimlapiUiTest(dev)
} finally {
  await dev.close()
}
