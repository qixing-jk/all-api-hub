import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import {
  assertE2eBuildMetadataCurrent,
  createE2eBuildMetadata,
  getE2eBuildMetadataMismatches,
  isE2eBuildMetadataCurrent,
  writeE2eBuildMetadata,
} from "~~/e2e/utils/e2eBuildMetadata"

const tempDirs: string[] = []

async function createTempDir() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "aah-e2e-build-"))
  tempDirs.push(tempDir)
  await fs.mkdir(path.join(tempDir, "e2e"))
  await fs.writeFile(
    path.join(tempDir, "e2e", "e2e-build-inputs.json"),
    JSON.stringify(["source.txt"]),
  )
  return tempDir
}

describe("E2E build metadata", () => {
  afterEach(async () => {
    await Promise.all(
      tempDirs
        .splice(0)
        .map((tempDir) => fs.rm(tempDir, { recursive: true, force: true })),
    )
  })

  it("accepts metadata that matches the current build inputs", async () => {
    const cwd = await createTempDir()
    const extensionDir = path.join(cwd, ".output", "chrome-mv3-test")
    await fs.writeFile(path.join(cwd, "source.txt"), "initial\n")

    const metadata = await createE2eBuildMetadata({
      cwd,
      inputPaths: ["source.txt"],
    })
    await writeE2eBuildMetadata(extensionDir, metadata)

    await expect(
      assertE2eBuildMetadataCurrent(extensionDir, {
        cwd,
      }),
    ).resolves.toBeUndefined()
  })

  it("rejects a missing metadata file", async () => {
    const cwd = await createTempDir()
    const extensionDir = path.join(cwd, ".output", "chrome-mv3-test")

    await expect(
      assertE2eBuildMetadataCurrent(extensionDir, { cwd }),
    ).rejects.toThrow("Missing E2E build metadata")
  })

  it("checks the current input policy instead of trusting the cached path list", async () => {
    const cwd = await createTempDir()
    const extensionDir = path.join(cwd, ".output", "chrome-mv3-test")
    await fs.writeFile(path.join(cwd, "source.txt"), "initial")
    const metadata = await createE2eBuildMetadata({ cwd })
    await writeE2eBuildMetadata(extensionDir, metadata)
    await fs.writeFile(path.join(cwd, "plugin.txt"), "new dependency")
    await fs.writeFile(
      path.join(cwd, "e2e", "e2e-build-inputs.json"),
      JSON.stringify(["source.txt", "plugin.txt"]),
    )
    await expect(
      assertE2eBuildMetadataCurrent(extensionDir, { cwd }),
    ).rejects.toThrow("Build inputs have changed")
  })

  it("retains original provenance when accepting an unchanged build from another commit", async () => {
    const cwd = await createTempDir()
    const extensionDir = path.join(cwd, ".output", "chrome-mv3-test")
    await fs.writeFile(path.join(cwd, "source.txt"), "initial")
    const metadata = await createE2eBuildMetadata({ cwd })
    metadata.gitHead = "original-build-commit"
    await writeE2eBuildMetadata(extensionDir, metadata)
    await expect(
      assertE2eBuildMetadataCurrent(extensionDir, { cwd }),
    ).resolves.toBeUndefined()
    expect(
      JSON.parse(
        await fs.readFile(
          path.join(extensionDir, ".aah-e2e-build.json"),
          "utf8",
        ),
      ).gitHead,
    ).toBe("original-build-commit")
  })

  it("rejects metadata when tracked build inputs changed", async () => {
    const cwd = await createTempDir()
    const extensionDir = path.join(cwd, ".output", "chrome-mv3-test")
    await fs.writeFile(path.join(cwd, "source.txt"), "initial\n")

    const metadata = await createE2eBuildMetadata({
      cwd,
      inputPaths: ["source.txt"],
    })
    await writeE2eBuildMetadata(extensionDir, metadata)
    await fs.writeFile(path.join(cwd, "source.txt"), "changed\n")

    await expect(
      assertE2eBuildMetadataCurrent(extensionDir, {
        cwd,
      }),
    ).rejects.toThrow("Build inputs have changed")
  })

  it("rejects metadata with non-string input paths", async () => {
    const cwd = await createTempDir()
    const extensionDir = path.join(cwd, ".output", "chrome-mv3-test")
    await writeE2eBuildMetadata(extensionDir, {
      version: 1,
      gitHead: "head",
      inputHash: "hash",
      inputPaths: ["source.txt", 42] as string[],
      builtAt: "2026-05-18T00:00:00.000Z",
    })

    await expect(
      assertE2eBuildMetadataCurrent(extensionDir, {
        cwd,
      }),
    ).rejects.toThrow("inputPaths must contain only strings")
  })

  it("returns false when checking stale metadata without throwing", async () => {
    const cwd = await createTempDir()
    const extensionDir = path.join(cwd, ".output", "chrome-mv3-test")
    await fs.writeFile(path.join(cwd, "source.txt"), "initial\n")

    const metadata = await createE2eBuildMetadata({
      cwd,
      inputPaths: ["source.txt"],
    })
    await writeE2eBuildMetadata(extensionDir, metadata)
    await fs.writeFile(path.join(cwd, "source.txt"), "changed\n")

    await expect(
      isE2eBuildMetadataCurrent(extensionDir, {
        cwd,
      }),
    ).resolves.toBe(false)
  })

  it("accepts unchanged inputs from a different commit", () => {
    expect(
      getE2eBuildMetadataMismatches(
        {
          version: 1,
          gitHead: "old-head",
          inputHash: "same-hash",
          inputPaths: ["src"],
          builtAt: "2026-05-18T00:00:00.000Z",
        },
        {
          buildVariant: "default",
          gitHead: "new-head",
          inputHash: "same-hash",
          inputPaths: ["src"],
        },
      ),
    ).toEqual([])
  })

  it("reports input hash mismatches with matching commit metadata", () => {
    expect(
      getE2eBuildMetadataMismatches(
        {
          version: 1,
          gitHead: "same-head",
          inputHash: "old-hash",
          inputPaths: ["src"],
          builtAt: "2026-05-18T00:00:00.000Z",
        },
        {
          buildVariant: "default",
          gitHead: "same-head",
          inputHash: "new-hash",
          inputPaths: ["src"],
        },
      ),
    ).toEqual(["Build inputs have changed since the extension was built."])
  })

  it("rejects changed inputs even across commits", () => {
    expect(
      getE2eBuildMetadataMismatches(
        {
          version: 1,
          gitHead: "old-head",
          inputHash: "old-hash",
          inputPaths: ["src"],
          builtAt: "2026-05-18T00:00:00.000Z",
        },
        {
          buildVariant: "default",
          gitHead: "new-head",
          inputHash: "new-hash",
          inputPaths: ["src"],
        },
      ),
    ).toEqual(["Build inputs have changed since the extension was built."])
  })

  it("returns no mismatches for current metadata", () => {
    expect(
      getE2eBuildMetadataMismatches(
        {
          version: 1,
          gitHead: "same-head",
          inputHash: "same-hash",
          inputPaths: ["src"],
          builtAt: "2026-05-18T00:00:00.000Z",
        },
        {
          buildVariant: "default",
          gitHead: "same-head",
          inputHash: "same-hash",
          inputPaths: ["src"],
        },
      ),
    ).toEqual([])
  })
})
