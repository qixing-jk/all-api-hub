import { execFileSync } from "node:child_process"
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, expect, it } from "vitest"

import { createE2eBuildInputHash } from "~~/e2e/utils/e2eBuildInputs.shared.js"

const directories: string[] = []
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true })
})

it.each([
  ["default", "chrome-mv3-test"],
  ["dnr-required", "chrome-mv3-test-dnr-required"],
  ["bookmarks-required", "chrome-mv3-test-bookmarks-required"],
])(
  "accepts a complete content-matched %s build",
  async (variant, directory) => {
    expect(await probe({ variant, directory })).toContain("usable=true")
  },
)

it.each([
  "missing-metadata",
  "missing-manifest",
  "corrupt-metadata",
  "corrupt-manifest",
  "changed-source",
  "wrong-variant",
  "wrong-version",
  "missing-hash",
])("rebuilds on %s", async (fault) => {
  expect(await probe({ fault })).toContain("usable=false")
})

async function probe({
  variant = "default",
  directory = "chrome-mv3-test",
  fault = "",
} = {}) {
  const cwd = mkdtempSync(path.join(tmpdir(), "e2e-ci-cache-"))
  directories.push(cwd)
  mkdirSync(path.join(cwd, "e2e"))
  writeFileSync(
    path.join(cwd, "e2e", "e2e-build-inputs.json"),
    JSON.stringify(["source.txt"]),
  )
  writeFileSync(path.join(cwd, "source.txt"), "initial")
  const env = { ...process.env, AAH_E2E_BUILD_VARIANT: variant }
  const inputHash = await createE2eBuildInputHash(cwd, ["source.txt"], { env })
  const output = path.join(cwd, "outputs")
  const extension = path.join(cwd, ".output", directory)
  mkdirSync(extension, { recursive: true })
  if (fault !== "missing-manifest")
    writeFileSync(
      path.join(extension, "manifest.json"),
      fault === "corrupt-manifest"
        ? "{"
        : JSON.stringify({ manifest_version: 3 }),
    )
  if (fault !== "missing-metadata")
    writeFileSync(
      path.join(extension, ".aah-e2e-build.json"),
      fault === "corrupt-metadata"
        ? "{"
        : JSON.stringify({
            version: fault === "wrong-version" ? 2 : 1,
            gitHead: fault === "wrong-sha" ? "another-commit" : "test-commit",
            buildVariant: fault === "wrong-variant" ? "other-variant" : variant,
            inputHash: fault === "missing-hash" ? undefined : inputHash,
            inputPaths: ["source.txt"],
          }),
    )
  if (fault === "changed-source")
    writeFileSync(path.join(cwd, "source.txt"), "changed")
  execFileSync(
    process.execPath,
    [path.resolve("scripts/e2e-ci-build-cache.mjs")],
    {
      cwd,
      env: {
        ...env,
        AAH_E2E_BUILD_VARIANT: variant,
        GITHUB_SHA: "test-commit",
        GITHUB_OUTPUT: output,
      },
    },
  )
  const result = readFileSync(output, "utf8")
  expect(result).toContain(`extension_dir=${directory}`)
  return result
}

it("accepts identical content from a different commit without rewriting provenance", async () => {
  expect(await probe({ fault: "wrong-sha" })).toContain("usable=true")
})
