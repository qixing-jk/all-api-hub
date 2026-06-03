import { execFileSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { test as setup } from "@playwright/test"

import { isE2eBuildCurrent } from "~~/e2e/utils/e2eBuildMetadata"
import { getE2eExtensionDirName } from "~~/e2e/utils/e2eBuildVariants"

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
)
const extensionDir = path.join(rootDir, ".output", getE2eExtensionDirName())

setup("build extension for e2e", async () => {
  if (process.env.AAH_SKIP_E2E_BUILD === "1") {
    setup.skip(true, "AAH_SKIP_E2E_BUILD=1")
  }

  if (await isE2eBuildCurrent(extensionDir, { cwd: rootDir })) {
    return
  }

  execFileSync(
    process.execPath,
    [path.join(rootDir, "scripts", "e2e-build.mjs")],
    {
      cwd: rootDir,
      stdio: "inherit",
    },
  )
})
