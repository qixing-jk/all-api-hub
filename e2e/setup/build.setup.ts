import { execFileSync } from "node:child_process"
import path from "node:path"
import { test as setup } from "@playwright/test"

import { isE2eBuildCurrent } from "~~/e2e/utils/e2eBuildMetadata"

setup("build extension for e2e", async () => {
  if (process.env.AAH_SKIP_E2E_BUILD === "1") {
    setup.skip(true, "AAH_SKIP_E2E_BUILD=1")
  }

  if (await isE2eBuildCurrent(path.resolve(".output", "chrome-mv3-test"))) {
    return
  }

  execFileSync(process.execPath, [path.join("scripts", "e2e-build.mjs")], {
    cwd: process.cwd(),
    stdio: "inherit",
  })
})
