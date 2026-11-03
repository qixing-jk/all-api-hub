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
import { afterEach, describe, expect, it, vi } from "vitest"
import type { ConfigEnv } from "wxt"

import { deriveE2eBuildVariants } from "~~/e2e/utils/e2eBuildDerive.shared.js"
import { createE2eBuildInputHash } from "~~/e2e/utils/e2eBuildInputs.shared.js"
import {
  E2E_BUILD_VARIANTS,
  getE2eExtensionDirName,
  getE2eRequiredChromiumPermissions,
} from "~~/e2e/utils/e2eBuildVariants.shared.js"

const directories: string[] = []
afterEach(() => {
  vi.unstubAllEnvs()
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true })
})

const chromeEnv = {
  command: "build",
  browser: "chrome",
  manifestVersion: 3,
  mode: "test",
} as ConfigEnv

/** The manifest WXT would generate for a variant, from the real config factory. */
async function manifestFor(variant: string) {
  vi.stubEnv("AAH_E2E_BUILD_VARIANT", variant)
  vi.resetModules()
  const { default: config } = await import("~~/wxt.config")
  if (typeof config.manifest !== "function")
    throw new Error("Expected a manifest factory")
  return config.manifest(chromeEnv)
}

describe("variant manifest contract", () => {
  it.each([
    E2E_BUILD_VARIANTS.DnrRequired,
    E2E_BUILD_VARIANTS.BookmarksRequired,
  ])(
    "%s differs from the default manifest only by added required permissions",
    async (variant) => {
      const base = await manifestFor(E2E_BUILD_VARIANTS.Default)
      const target = await manifestFor(variant)

      const differing = Object.keys({ ...base, ...target }).filter(
        (key) =>
          JSON.stringify(base[key as keyof typeof base]) !==
          JSON.stringify(target[key as keyof typeof target]),
      )
      // Derivation copies the default build and rewrites these two lists only. Any
      // new variant-dependent field must either be handled here or stop derivation
      // from being valid — this assertion is what keeps that from going unnoticed.
      expect(differing).toEqual(["permissions", "optional_permissions"])

      const basePermissions = new Set(base.permissions ?? [])
      const promoted = (target.permissions ?? []).filter(
        (permission: string) => !basePermissions.has(permission),
      )
      expect(new Set(promoted)).toEqual(
        new Set(
          getE2eRequiredChromiumPermissions(variant).filter(
            (permission) => !basePermissions.has(permission),
          ),
        ),
      )
    },
  )
})

describe("deriving variants from the default build", () => {
  it("reproduces the manifest the config would have generated", async () => {
    const cwd = await createDefaultBuild()
    const derived = await deriveE2eBuildVariants({ cwd })
    expect(derived.map((entry) => entry.variant)).toEqual([
      E2E_BUILD_VARIANTS.DnrRequired,
      E2E_BUILD_VARIANTS.BookmarksRequired,
    ])

    for (const entry of derived) {
      const written = JSON.parse(
        readFileSync(
          path.join(cwd, ".output", entry.directory, "manifest.json"),
          "utf8",
        ),
      )
      const expected = await manifestFor(entry.variant)
      expect(written.permissions).toEqual(expected.permissions)
      expect(written.optional_permissions).toEqual(
        expected.optional_permissions,
      )
      expect(written.host_permissions).toEqual(expected.host_permissions)
    }
  })

  it("writes metadata the CI cache validator accepts for that variant", async () => {
    const cwd = await createDefaultBuild()
    await deriveE2eBuildVariants({ cwd })
    for (const variant of [
      E2E_BUILD_VARIANTS.DnrRequired,
      E2E_BUILD_VARIANTS.BookmarksRequired,
    ]) {
      const output = path.join(cwd, "github-output")
      writeFileSync(output, "")
      execFileSync(
        process.execPath,
        [path.resolve("scripts/e2e-ci-build-cache.mjs")],
        {
          cwd,
          env: {
            ...process.env,
            AAH_E2E_BUILD_VARIANT: variant,
            GITHUB_OUTPUT: output,
          },
        },
      )
      // A derived build must hit the same cache path a real variant build would.
      expect(readFileSync(output, "utf8")).toContain("usable=true")
    }
  })

  it.each([
    ["missing source", async () => tempDirectory()],
    [
      "source built for another variant",
      async () => {
        const cwd = await createDefaultBuild()
        const metadataPath = path.join(
          cwd,
          ".output",
          getE2eExtensionDirName(E2E_BUILD_VARIANTS.Default),
          ".aah-e2e-build.json",
        )
        const metadata = JSON.parse(readFileSync(metadataPath, "utf8"))
        writeFileSync(
          metadataPath,
          JSON.stringify({
            ...metadata,
            buildVariant: E2E_BUILD_VARIANTS.DnrRequired,
          }),
        )
        return cwd
      },
    ],
  ])("refuses to derive from a %s", async (_label, create) => {
    const cwd = await create()
    await expect(deriveE2eBuildVariants({ cwd })).rejects.toThrow(
      /Cannot derive E2E variants|Expected a 'default' build/,
    )
  })

  it("refuses to derive a variant from itself", async () => {
    const cwd = await createDefaultBuild()
    await expect(
      deriveE2eBuildVariants({ cwd, targetVariants: ["default"] }),
    ).rejects.toThrow(/from itself/)
  })
})

function tempDirectory() {
  const directory = mkdtempSync(path.join(tmpdir(), "aah-e2e-variant-"))
  directories.push(directory)
  return directory
}

/**
 * A minimal repository whose default build is real manifest-factory output, so the
 * derivation is compared against what a build would actually produce.
 */
async function createDefaultBuild() {
  const cwd = tempDirectory()
  mkdirSync(path.join(cwd, "e2e"), { recursive: true })
  writeFileSync(
    path.join(cwd, "e2e", "e2e-build-inputs.json"),
    JSON.stringify(["source.txt"]),
  )
  writeFileSync(path.join(cwd, "source.txt"), "built for the test")

  const directory = getE2eExtensionDirName(E2E_BUILD_VARIANTS.Default)
  const extension = path.join(cwd, ".output", directory)
  mkdirSync(extension, { recursive: true })
  // WXT adds `manifest_version` itself; the factory supplies everything else.
  const manifest = {
    manifest_version: 3,
    ...(await manifestFor(E2E_BUILD_VARIANTS.Default)),
  }
  writeFileSync(
    path.join(extension, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  )
  writeFileSync(path.join(extension, ".node-version"), "24.0.0\n")
  const env = { ...process.env, AAH_E2E_BUILD_VARIANT: "default" }
  writeFileSync(
    path.join(extension, ".aah-e2e-build.json"),
    JSON.stringify({
      version: 1,
      buildVariant: E2E_BUILD_VARIANTS.Default,
      gitHead: "test-commit",
      inputHash: await createE2eBuildInputHash(cwd, ["source.txt"], { env }),
      inputPaths: ["source.txt"],
      builtAt: "2026-01-01T00:00:00.000Z",
    }),
  )
  return cwd
}
