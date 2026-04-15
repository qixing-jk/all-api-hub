import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import { loadPlaywrightEnvFiles } from "~~/e2e/utils/playwrightEnv"

const tempDirs: string[] = []

async function createTempDir() {
  const tempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "aah-playwright-env-"),
  )
  tempDirs.push(tempDir)
  return tempDir
}

describe("loadPlaywrightEnvFiles", () => {
  afterEach(async () => {
    await Promise.all(
      tempDirs
        .splice(0)
        .map((tempDir) => fs.rm(tempDir, { recursive: true, force: true })),
    )
  })

  it("lets .env.local override .env entries loaded during the same run", async () => {
    const tempDir = await createTempDir()
    const env = {} as NodeJS.ProcessEnv

    await fs.writeFile(
      path.join(tempDir, ".env"),
      "AAH_E2E_BASE_URL=https://shared.example.com\nAAH_E2E_LABEL=shared\n",
    )
    await fs.writeFile(
      path.join(tempDir, ".env.local"),
      "AAH_E2E_BASE_URL=https://local.example.com\n",
    )

    loadPlaywrightEnvFiles({ cwd: tempDir, env })

    expect(env.AAH_E2E_BASE_URL).toBe("https://local.example.com")
    expect(env.AAH_E2E_LABEL).toBe("shared")
  })

  it("preserves environment variables that already existed before file loading", async () => {
    const tempDir = await createTempDir()
    const env = {
      AAH_E2E_BASE_URL: "https://process.example.com",
    } as NodeJS.ProcessEnv

    await fs.writeFile(
      path.join(tempDir, ".env"),
      "AAH_E2E_BASE_URL=https://shared.example.com\n",
    )
    await fs.writeFile(
      path.join(tempDir, ".env.local"),
      "AAH_E2E_BASE_URL=https://local.example.com\n",
    )

    loadPlaywrightEnvFiles({ cwd: tempDir, env })

    expect(env.AAH_E2E_BASE_URL).toBe("https://process.example.com")
  })
})
