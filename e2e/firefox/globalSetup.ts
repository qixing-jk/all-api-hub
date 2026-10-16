import { execFileSync } from "node:child_process"
import path from "node:path"

/** Build the Firefox artifact, independently of Chromium's build/cache. */
export default function buildFirefoxExtension() {
  if (process.env.AAH_SKIP_E2E_BUILD === "1") return
  execFileSync(
    process.execPath,
    [
      path.resolve("node_modules/wxt/bin/wxt.mjs"),
      "build",
      "-b",
      "firefox",
      "--mode",
      "test",
    ],
    { stdio: "inherit" },
  )
}
