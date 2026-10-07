import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, expect, it } from "vitest"

import { createE2eBuildInputHash } from "~~/e2e/utils/e2eBuildInputs.shared.js"

const directories: string[] = []
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true })
})
function fixture() {
  const cwd = mkdtempSync(path.join(os.tmpdir(), "e2e-inputs-"))
  directories.push(cwd)
  mkdirSync(path.join(cwd, "src"))
  writeFileSync(path.join(cwd, "src", "app.ts"), "export const app = 1")
  return cwd
}
it("ignores Git identity and files outside the build inputs", async () => {
  const cwd = fixture()
  const before = await createE2eBuildInputHash(cwd, ["src"])
  writeFileSync(path.join(cwd, "README.md"), "docs only")
  mkdirSync(path.join(cwd, ".git"))
  writeFileSync(path.join(cwd, ".git", "HEAD"), "different-head")
  expect(await createE2eBuildInputHash(cwd, ["src"])).toBe(before)
})
it.each(["edit", "add", "delete", "hidden"])(
  "invalidates on %s to an input directory",
  async (change) => {
    const cwd = fixture()
    const before = await createE2eBuildInputHash(cwd, ["src"])
    if (change === "delete") unlinkSync(path.join(cwd, "src", "app.ts"))
    else
      writeFileSync(
        path.join(
          cwd,
          "src",
          change === "edit"
            ? "app.ts"
            : change === "hidden"
              ? ".config"
              : "new.ts",
        ),
        "changed",
      )
    expect(await createE2eBuildInputHash(cwd, ["src"])).not.toBe(before)
  },
)
it.each(["node", "variant", "sourcemap", "public-env", "platform", "node-env"])(
  "invalidates on %s configuration changes",
  async (change) => {
    const cwd = fixture()
    const before = await createE2eBuildInputHash(cwd, ["src"], { env: {} })
    const options = {
      env:
        change === "variant"
          ? { AAH_E2E_BUILD_VARIANT: "dnr-required" }
          : change === "sourcemap"
            ? { AAH_BUILD_SOURCEMAP: "1" }
            : change === "public-env"
              ? { VITE_PUBLIC_POSTHOG_HOST: "https://different.example" }
              : change === "node-env"
                ? { NODE_ENV: "development" }
                : {},
      ...(change === "node" ? { nodeVersion: "999.0.0" } : {}),
      ...(change === "platform" ? { platform: "another-platform" } : {}),
    }
    expect(await createE2eBuildInputHash(cwd, ["src"], options)).not.toBe(
      before,
    )
  },
)
it("treats environment-file defaults and identical loaded values consistently", async () => {
  const cwd = fixture()
  writeFileSync(
    path.join(cwd, ".env"),
    "VITE_PUBLIC_POSTHOG_HOST=https://same.example",
  )
  expect(await createE2eBuildInputHash(cwd, ["src", ".env"], { env: {} })).toBe(
    await createE2eBuildInputHash(cwd, ["src", ".env"], {
      env: { VITE_PUBLIC_POSTHOG_HOST: "https://same.example" },
    }),
  )
})
it("invalidates when the input policy adds a previously unlisted path", async () => {
  const cwd = fixture()
  expect(await createE2eBuildInputHash(cwd, ["src"])).not.toBe(
    await createE2eBuildInputHash(cwd, ["src", "plugins"]),
  )
})
