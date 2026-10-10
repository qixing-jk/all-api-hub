import { execFileSync } from "node:child_process"
import { readFileSync, rmSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

import { atIndex } from "~~/tests/test-utils/indexedAccess"

function localRuns(category: string) {
  return JSON.parse(
    execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `
    import { buildRealSiteE2eRuns, filterRealSiteE2eMatrix } from './scripts/real-site-e2e-matrix.mjs';
    console.log(JSON.stringify(buildRealSiteE2eRuns(filterRealSiteE2eMatrix(${JSON.stringify(category)}))));
  `,
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ),
  ) as Array<{
    specs: string[]
    managed_site_target?: string
    env_prefix: string
  }>
}

function runMatrix(...args: string[]) {
  const scriptPath = path.resolve(
    process.cwd(),
    "scripts",
    "github-real-site-e2e-matrix.mjs",
  )
  const testEnv = { ...process.env }

  // GitHub Actions sets GITHUB_OUTPUT for every step; unset it so this test
  // exercises the script's stdout CLI contract instead of its workflow output.
  delete testEnv.GITHUB_OUTPUT

  return JSON.parse(
    execFileSync(process.execPath, [scriptPath, ...args], {
      encoding: "utf8",
      env: testEnv,
      stdio: ["ignore", "pipe", "pipe"],
    }),
  ) as { include: Array<Record<string, unknown>> }
}

function runMatrixWithOutput(...args: string[]) {
  const scriptPath = path.resolve(
    process.cwd(),
    "scripts",
    "github-real-site-e2e-matrix.mjs",
  )
  const outputPath = path.resolve(
    process.cwd(),
    ".scratch",
    `real-site-matrix-${process.pid}-${Date.now()}.txt`,
  )

  try {
    execFileSync(process.execPath, [scriptPath, ...args], {
      encoding: "utf8",
      env: { ...process.env, GITHUB_OUTPUT: outputPath },
      stdio: ["ignore", "pipe", "pipe"],
    })
    return Object.fromEntries(
      readFileSync(outputPath, "utf8")
        .trim()
        .split("\n")
        .map((line) => {
          const separatorIndex = line.indexOf("=")
          return [line.slice(0, separatorIndex), line.slice(separatorIndex + 1)]
        }),
    )
  } finally {
    rmSync(outputPath, { force: true })
  }
}

function selectedIds(matrix: ReturnType<typeof runMatrix>) {
  return matrix.include.map((entry) => entry.id)
}

describe("GitHub real-site E2E matrix selection", () => {
  it("runs all managed targets in one local Playwright worker pool and builds only once", () => {
    const runs = localRuns("managed-site")
    expect(runs).toHaveLength(1)
    expect(runs[0]?.specs).toEqual([
      "e2e/realSite/managedSiteChannels.spec.ts",
      "e2e/realSite/cliProxyApiProviders.spec.ts",
      "e2e/realSite/gptLoadGroups.spec.ts",
      "e2e/realSite/magpieProviders.spec.ts",
    ])
    expect(runs[0]).not.toHaveProperty("managed_site_target")
  })

  it("keeps WebDAV runs separate because each selects a different provider environment", () => {
    const runs = localRuns("webdav")
    expect(runs.map((run) => run.env_prefix)).toEqual([
      "NUTSTORE_WEBDAV",
      "CTFILE_WEBDAV",
      "OPENCLOUD_WEBDAV",
    ])
    expect(runs.every((run) => run.specs.length === 1)).toBe(true)
  })
  it("registers gpt-load as an independent managed-site regression target", () => {
    expect(runMatrix("managed-site", "gpt-load-managed-site").include).toEqual([
      expect.objectContaining({
        id: "gpt-load-managed-site",
        env_prefix: "GPT_LOAD",
        managed_site_target: "gpt-load",
        spec: "e2e/realSite/gptLoadGroups.spec.ts",
      }),
    ])
    const output = runMatrixWithOutput("managed-site", "gpt-load-managed-site")
    expect(JSON.parse(atIndex(output, "matrix"))).toEqual(
      runMatrix("managed-site", "gpt-load-managed-site"),
    )
  })
  it("registers Magpie without requiring a separate account-test deployment", () => {
    expect(runMatrix("managed-site", "magpie-managed-site").include).toEqual([
      expect.objectContaining({
        id: "magpie-managed-site",
        env_prefix: "MAGPIE",
        managed_site_target: "magpie",
        spec: "e2e/realSite/magpieProviders.spec.ts",
      }),
    ])
    const output = runMatrixWithOutput("managed-site", "magpie-managed-site")
    expect(JSON.parse(atIndex(output, "matrix"))).toEqual(
      runMatrix("managed-site", "magpie-managed-site"),
    )
  })

  it("registers CLIProxyAPI as an independent managed-site target", () => {
    expect(runMatrix("managed-site", "cli-proxy-api").include).toEqual([
      expect.objectContaining({
        id: "cli-proxy-api",
        env_prefix: "CLI_PROXY_API",
        managed_site_target: "cli-proxy-api",
        spec: "e2e/realSite/cliProxyApiProviders.spec.ts",
      }),
    ])
  })
  it("selects one concrete target without expanding the account category", () => {
    const matrix = runMatrix("all", "new-api-account")

    expect(matrix.include).toHaveLength(1)
    expect(matrix.include[0]).toMatchObject({
      id: "new-api-account",
      label: "Account / New API",
      category: "account",
    })
  })

  it("keeps category selection unchanged when target is all", () => {
    const matrix = runMatrix("account", "all")
    const allTargets = runMatrix()
    const expectedAccountIds = allTargets.include
      .filter((entry) => entry.category === "account")
      .map((entry) => entry.id)

    expect(selectedIds(matrix)).toEqual(expectedAccountIds)
    expect(matrix.include.every((entry) => entry.category === "account")).toBe(
      true,
    )
  })

  it("registers OpenCloud without replacing the live provider response", () => {
    const matrix = runMatrix("webdav", "opencloud-webdav")

    expect(matrix.include).toEqual([
      expect.objectContaining({
        id: "opencloud-webdav",
        label: "WebDAV / OpenCloud",
        category: "webdav",
        env_prefix: "OPENCLOUD_WEBDAV",
      }),
    ])
    expect(matrix.include[0]).not.toHaveProperty("simulate_upload_readback_425")
  })

  it("registers Sub2API as an independently runnable managed-site target", () => {
    const matrix = runMatrix("managed-site", "sub2api-managed-site")

    expect(matrix.include).toEqual([
      expect.objectContaining({
        id: "sub2api-managed-site",
        label: "Managed Site / Sub2API Accounts",
        category: "managed-site",
        env_prefix: "SUB2API",
        managed_site_target: "sub2api",
      }),
    ])
  })

  it("registers GitHub Secret Gist as a cloud-sync target", () => {
    const matrix = runMatrix("cloud-sync", "github-gist-sync")

    expect(matrix.include).toEqual([
      expect.objectContaining({
        id: "github-gist-sync",
        label: "Cloud Sync / GitHub Secret Gist",
        category: "cloud-sync",
        env_prefix: "GITHUB_GIST",
        kind: "gist",
      }),
    ])
  })

  it("allows every target to run independently without source-account locks", () => {
    const matrix = runMatrix()
    for (const entry of matrix.include) {
      expect(entry).not.toHaveProperty("resource_group")
    }
  })

  it("emits one complete workflow matrix with no serialized partitions", () => {
    const output = runMatrixWithOutput()
    expect(Object.keys(output)).toEqual(["matrix"])
    expect(JSON.parse(atIndex(output, "matrix"))).toEqual(runMatrix())
  })

  it.each([
    "new-api-account",
    "sub2api-managed-site",
    "octopus-managed-site",
    "omniroute-managed-site",
  ])("keeps selected target %s in the common workflow matrix", (id) => {
    const output = runMatrixWithOutput("all", id)
    expect(selectedIds(JSON.parse(atIndex(output, "matrix")))).toEqual([id])
  })

  it("keeps the default all-category matrix unchanged", () => {
    const matrix = runMatrix()
    const expectedIds = [
      "account",
      "managed-site",
      "webdav",
      "cloud-sync",
    ].flatMap((category) => selectedIds(runMatrix(category, "all")))

    expect(selectedIds(matrix)).toEqual(expectedIds)
  })

  it("rejects a target from a different category", () => {
    expect(() => runMatrix("account", "new-api-managed-site")).toThrow(
      /does not belong to category account/,
    )
  })
})
