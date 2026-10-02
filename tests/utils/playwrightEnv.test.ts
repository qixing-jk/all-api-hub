import { execFileSync } from "node:child_process"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { afterEach, describe, expect, it, vi } from "vitest"

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
    vi.unstubAllEnvs()
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

  async function createWorktrees() {
    const root = await createTempDir()
    const primary = path.join(root, "primary checkout")
    const linked = path.join(root, "linked checkout")
    await fs.mkdir(primary)
    const gitEnv = { ...process.env }
    for (const key of execFileSync("git", ["rev-parse", "--local-env-vars"], {
      encoding: "utf8",
    })
      .trim()
      .split(/\r?\n/u)) {
      delete gitEnv[key]
    }
    const git = (...args: string[]) =>
      execFileSync("git", ["-C", primary, ...args], {
        stdio: "pipe",
        env: gitEnv,
      })
    git("init", "-b", "trunk")
    git(
      "-c",
      "user.name=Env Test",
      "-c",
      "user.email=env@example.com",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "--allow-empty",
      "-m",
      "fixture",
    )
    git("worktree", "add", "-b", "feature", linked)
    await fs.writeFile(
      path.join(primary, ".env"),
      "PRIMARY_BRANCH_ONLY=wrong\n",
    )
    await fs.writeFile(
      path.join(primary, ".env.local"),
      "SHARED_TOKEN=shared\nLABEL=shared\nDISABLED=shared\nWXT_SECRET=hidden\nVITE_SECRET=hidden\n",
    )
    return { primary, linked }
  }

  it("discovers the primary checkout independently of its branch and merges only local shared values", async () => {
    const { linked } = await createWorktrees()
    await fs.writeFile(path.join(linked, ".env"), "LABEL=branch\n")
    await fs.writeFile(
      path.join(linked, ".env.local"),
      "LABEL=local\nDISABLED=\n",
    )
    const env = { SHARED_TOKEN: "shell" } as NodeJS.ProcessEnv
    loadPlaywrightEnvFiles({ cwd: linked, env })
    expect(env).toMatchObject({
      SHARED_TOKEN: "shell",
      LABEL: "local",
      DISABLED: "",
    })
    expect(env.PRIMARY_BRANCH_ONLY).toBeUndefined()
    expect(env.WXT_SECRET).toBeUndefined()
    expect(env.VITE_SECRET).toBeUndefined()
    const sharedEnv = {} as NodeJS.ProcessEnv
    loadPlaywrightEnvFiles({ cwd: linked, env: sharedEnv })
    expect(sharedEnv.SHARED_TOKEN).toBe("shared")
  })

  it.each([{ CI: "true" }, { AAH_SHARED_ENV: "0" }])(
    "does not read shared credentials with %j",
    async (settings) => {
      const { primary, linked } = await createWorktrees()
      const env = {
        ...settings,
        AAH_SHARED_ENV_DIR: primary,
      } as NodeJS.ProcessEnv
      loadPlaywrightEnvFiles({ cwd: linked, env })
      expect(env.SHARED_TOKEN).toBeUndefined()
    },
  )

  it("uses an explicit shared directory outside a Git checkout with local values winning", async () => {
    const cwd = await createTempDir()
    await fs.mkdir(path.join(cwd, "shared"))
    await fs.writeFile(
      path.join(cwd, "shared", ".env.local"),
      "SHARED_TOKEN=shared\nLABEL=shared\n",
    )
    await fs.writeFile(path.join(cwd, ".env"), "LABEL=branch\n")
    const env = { AAH_SHARED_ENV_DIR: "shared" } as NodeJS.ProcessEnv
    loadPlaywrightEnvFiles({ cwd, env })
    expect(env.SHARED_TOKEN).toBe("shared")
    expect(env.LABEL).toBe("branch")
  })

  it("reports an explicitly selected missing shared file", async () => {
    const cwd = await createTempDir()
    const env = { AAH_SHARED_ENV_DIR: "missing" } as NodeJS.ProcessEnv
    expect(() => loadPlaywrightEnvFiles({ cwd, env })).toThrow(/shared.*env/i)
  })

  it("loads an explicitly selected runner file above checkout values but below shell values", async () => {
    const cwd = await createTempDir()
    await fs.writeFile(
      path.join(cwd, ".env.local"),
      "LABEL=checkout\nTOKEN=checkout\n",
    )
    await fs.writeFile(
      path.join(cwd, "runner.env"),
      "LABEL=runner\nTOKEN=runner\n",
    )
    const env = { TOKEN: "shell" } as NodeJS.ProcessEnv
    loadPlaywrightEnvFiles({ cwd, env, envFile: "runner.env" })
    expect(env).toMatchObject({ LABEL: "runner", TOKEN: "shell" })
    expect(() =>
      loadPlaywrightEnvFiles({ cwd, env, envFile: "missing.env" }),
    ).toThrow(/env file/i)
  })

  it("uses Node dotenv syntax for comments, export, quoted hashes and multiline values", async () => {
    const cwd = await createTempDir()
    await fs.writeFile(
      path.join(cwd, ".env.local"),
      'export LABEL=local # comment\nTOKEN="secret#hash"\nMULTILINE="first\nsecond"\n',
    )
    const env = {} as NodeJS.ProcessEnv
    loadPlaywrightEnvFiles({ cwd, env })
    expect(env).toMatchObject({
      LABEL: "local",
      TOKEN: "secret#hash",
      MULTILINE: "first\nsecond",
    })
  })

  it("loads a primary checkout normally and tolerates absent optional env files", async () => {
    const { primary } = await createWorktrees()
    const env = {} as NodeJS.ProcessEnv
    loadPlaywrightEnvFiles({ cwd: primary, env })
    expect(env.SHARED_TOKEN).toBe("shared")
    expect(env.WXT_SECRET).toBe("hidden")
    expect(loadPlaywrightEnvFiles({ cwd: primary, env: {} }).files).toEqual([
      path.join(primary, ".env"),
      path.join(primary, ".env.local"),
    ])
    const empty = {} as NodeJS.ProcessEnv
    loadPlaywrightEnvFiles({ cwd: await createTempDir(), env: empty })
    expect(empty).toEqual({})
  })

  it("tolerates an absent auto-discovered shared file without reading primary branch defaults", async () => {
    const { primary, linked } = await createWorktrees()
    await fs.unlink(path.join(primary, ".env.local"))
    const env = {} as NodeJS.ProcessEnv
    expect(loadPlaywrightEnvFiles({ cwd: linked, env }).files).toEqual([])
    expect(env).toEqual({})
  })

  it("works in native Node and reports paths without parsed credentials", async () => {
    const { primary, linked } = await createWorktrees()
    const moduleUrl = pathToFileURL(
      path.resolve("scripts/utils/local-env.mjs"),
    ).href
    const output = execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `import { loadLocalEnv } from ${JSON.stringify(moduleUrl)}; console.log(JSON.stringify(loadLocalEnv({ cwd: ${JSON.stringify(linked)}, env: {} })))`,
      ],
      { encoding: "utf8", windowsHide: true },
    )
    expect(JSON.parse(output)).toEqual({
      files: [path.join(primary, ".env.local")],
      sharedDir: primary,
    })
    expect(output).not.toContain("SHARED_TOKEN")
    expect(output).not.toContain("hidden")
  })

  it("ignores another repository's Git hook environment when locating this checkout", async () => {
    const { primary, linked } = await createWorktrees()
    vi.stubEnv("GIT_DIR", path.join(primary, "nonexistent-git-directory"))
    vi.stubEnv("GIT_WORK_TREE", primary)
    vi.stubEnv("GIT_INDEX_FILE", path.join(primary, "foreign-index"))
    const env = {} as NodeJS.ProcessEnv
    loadPlaywrightEnvFiles({ cwd: linked, env })
    expect(env.SHARED_TOKEN).toBe("shared")
  })

  it("loads the Playwright adapter in Node tooling without tsconfig aliases", async () => {
    const cwd = await createTempDir()
    await fs.writeFile(path.join(cwd, ".env.local"), "LABEL=local\n")
    const moduleUrl = pathToFileURL(
      path.resolve("e2e/utils/playwrightEnv.ts"),
    ).href
    const output = execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `import { loadPlaywrightEnvFiles } from ${JSON.stringify(moduleUrl)}; const env = {}; loadPlaywrightEnvFiles({ cwd: ${JSON.stringify(cwd)}, env }); console.log(env.LABEL)`,
      ],
      {
        encoding: "utf8",
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      },
    )
    expect(output.trim()).toBe("local")
  })
})
