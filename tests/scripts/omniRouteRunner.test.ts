import { spawnSync } from "node:child_process"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(
    tempDirs
      .splice(0)
      .map((dir) => fs.rm(dir, { recursive: true, force: true })),
  )
})

/**
 * Run only the CLI's missing-configuration path, without contacting a live service.
 * @param args Optional CLI overrides for the recovery path.
 * @returns Captured CLI output and exit status.
 */
function runWithoutCredentials(args: string[] = []) {
  return spawnSync(
    process.execPath,
    ["scripts/test-omniroute-e2e-live.mjs", "--suite=probe", ...args],
    {
      encoding: "utf8",
      windowsHide: true,
      env: {
        ...process.env,
        AAH_SHARED_ENV: "0",
        OMNIROUTE_BASE_URL: "",
        OMNIROUTE_ADMIN_TOKEN: "",
        AAH_E2E_OMNIROUTE_BASE_URL: "",
        AAH_E2E_OMNIROUTE_ADMIN_TOKEN: "",
      },
    },
  )
}

describe("OmniRoute runner configuration guidance", () => {
  it("identifies local configuration without printing undefined when no env-file is selected", () => {
    const result = runWithoutCredentials()
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("缺少 OmniRoute 连接参数")
    expect(result.stderr).toContain(".env")
    expect(result.stderr).not.toContain("undefined")
    expect(result.stderr).toContain("--base-url/--token")
  })

  it("keeps an explicitly selected env-file in the recovery guidance", async () => {
    const dir = await fs.mkdtemp(
      path.join(os.tmpdir(), "aah-omniroute-runner-"),
    )
    tempDirs.push(dir)
    const envFile = path.join(dir, "runner.env")
    await fs.writeFile(envFile, "# Configuration not supplied yet\n")
    const result = runWithoutCredentials([`--env-file=${envFile}`])
    expect(result.status).toBe(1)
    expect(result.stderr).toContain(envFile)
    expect(result.stderr).not.toContain("undefined")
  })
})
