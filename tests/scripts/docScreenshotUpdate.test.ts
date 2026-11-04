import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { PNG } from "pngjs"
import { afterEach, expect, it, vi } from "vitest"

const cli = path.resolve("scripts/update-doc-screenshots.mjs")
const roots: string[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(
    roots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  )
})

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "doc-update-test-"))
  roots.push(root)
  const imageDir = path.join(root, "docs/docs/static/image")
  await fs.mkdir(imageDir, { recursive: true })
  const png = new PNG({ width: 4, height: 4 })
  png.data.fill(255)
  const before = PNG.sync.write(png)
  await fs.writeFile(path.join(imageDir, "api-key-list.png"), before)
  await fs.writeFile(path.join(imageDir, "account-manage.png"), before)
  return { root, imageDir, before }
}

it("preserves the existing zh-CN language alias", async () => {
  const { updateDocScreenshots } = await import(pathToFileURL(cli).href)
  const { root, before } = await fixture()
  const result = await updateDocScreenshots(
    { root, pages: "keys", lang: "zh-CN" },
    {
      run: async (_command: string, args: string[]) => {
        if (!args[0]?.endsWith("generate-doc-screenshots.mjs")) return
        const output = args.find((arg) => arg.startsWith("--output="))!.slice(9)
        await fs.mkdir(output, { recursive: true })
        await fs.writeFile(path.join(output, "api-key-list.png"), before)
      },
    },
  )
  expect(result.images).toHaveLength(1)
  expect(result.images[0].lang).toBe("zh")
})

it("updates only selected pages in all three locales and retains before/after comparisons", async () => {
  const { updateDocScreenshots } = await import(pathToFileURL(cli).href)
  const { root, imageDir, before } = await fixture()
  const calls: string[][] = []
  const result = await updateDocScreenshots(
    { root, pages: "keys keys" },
    {
      run: async (_command: string, args: string[]) => {
        calls.push(args)
        if (!args[0]?.endsWith("generate-doc-screenshots.mjs")) return
        const output = args.find((arg) => arg.startsWith("--output="))!.slice(9)
        const png = new PNG({ width: 4, height: 4 })
        png.data.fill(100)
        for (const locale of ["", "en", "ja"]) {
          await fs.mkdir(path.join(output, locale), { recursive: true })
          await fs.writeFile(
            path.join(output, locale, "api-key-list.png"),
            PNG.sync.write(png),
          )
        }
      },
    },
  )
  expect(calls.some((args) => args.includes("build"))).toBe(true)
  expect(calls.some((args) => args[0]?.endsWith("e2e-build.mjs"))).toBe(false)
  expect(await fs.readFile(path.join(imageDir, "account-manage.png"))).toEqual(
    before,
  )
  expect(
    await fs.readFile(path.join(result.directory, "before/api-key-list.png")),
  ).toEqual(before)
  expect(result.images).toHaveLength(3)
  expect(result.images[0].status).toBe("same-dimensions")
  expect(result.images[1].status).toBe("missing-baseline")
  expect(await fs.readFile(result.report, "utf8")).toContain("comparison.png")
})

it("builds only the test extension for webpage captures and keeps originals when a capture is incomplete", async () => {
  const { updateDocScreenshots } = await import(pathToFileURL(cli).href)
  const { root, imageDir, before } = await fixture()
  await fs.writeFile(
    path.join(imageDir, "web-ai-api-check-trigger.png"),
    before,
  )
  const calls: string[][] = []
  await expect(
    updateDocScreenshots(
      { root, pages: "web-ai-api-check", lang: "zh" },
      {
        run: async (_command: string, args: string[]) => {
          calls.push(args)
          if (!args[0]?.endsWith("generate-doc-screenshots.mjs")) return
          const output = args
            .find((arg) => arg.startsWith("--output="))!
            .slice(9)
          await fs.mkdir(output, { recursive: true })
          await fs.writeFile(
            path.join(output, "web-ai-api-check-trigger.png"),
            before,
          )
        },
      },
    ),
  ).rejects.toThrow()
  expect(calls.some((args) => args.includes("build"))).toBe(false)
  expect(calls.some((args) => args[0]?.endsWith("e2e-build.mjs"))).toBe(true)
  expect(
    await fs.readFile(path.join(imageDir, "web-ai-api-check-trigger.png")),
  ).toEqual(before)
  const runs = await fs.readdir(
    path.join(root, ".scratch/docs-screenshot-updates"),
  )
  expect(runs).toHaveLength(1)
  expect(
    await fs.readFile(
      path.join(
        root,
        ".scratch/docs-screenshot-updates",
        runs[0]!,
        "failure.json",
      ),
      "utf8",
    ),
  ).toContain("ENOENT")
})

it.each(["keyz", "", ","])(
  "rejects invalid pages %j before running any command or creating evidence",
  async (pages) => {
    const { updateDocScreenshots } = await import(pathToFileURL(cli).href)
    const { root } = await fixture()
    await expect(
      updateDocScreenshots(
        { root, pages },
        {
          run: async () => {
            throw new Error("Must not execute")
          },
        },
      ),
    ).rejects.toThrow("Unknown page")
    await expect(fs.stat(path.join(root, ".scratch"))).rejects.toThrow()
  },
)

it("restores existing assets and removes new assets when a later publication copy fails", async () => {
  const { updateDocScreenshots } = await import(pathToFileURL(cli).href)
  const { root, imageDir, before } = await fixture()
  const copyFile = fs.copyFile.bind(fs)
  let failed = false
  vi.spyOn(fs, "copyFile").mockImplementation(
    async (source, destination, ...args) => {
      if (
        String(source).includes(`${path.sep}after${path.sep}`) &&
        destination === path.join(imageDir, "account-manage.png") &&
        !failed
      ) {
        failed = true
        await fs.writeFile(destination, "partial copy")
        throw new Error("publication disk error")
      }
      return copyFile(source, destination, ...args)
    },
  )
  await expect(
    updateDocScreenshots(
      { root, pages: "keys,profiles,account", lang: "zh" },
      {
        run: async (_command: string, args: string[]) => {
          if (!args[0]?.endsWith("generate-doc-screenshots.mjs")) return
          const output = args
            .find((arg) => arg.startsWith("--output="))!
            .slice(9)
          await fs.mkdir(output, { recursive: true })
          const png = new PNG({ width: 4, height: 4 })
          png.data.fill(100)
          for (const name of [
            "api-key-list.png",
            "api-credential-profile-list.png",
            "account-manage.png",
          ])
            await fs.writeFile(path.join(output, name), PNG.sync.write(png))
        },
      },
    ),
  ).rejects.toThrow("publication disk error")
  expect(await fs.readFile(path.join(imageDir, "api-key-list.png"))).toEqual(
    before,
  )
  expect(await fs.readFile(path.join(imageDir, "account-manage.png"))).toEqual(
    before,
  )
  await expect(
    fs.stat(path.join(imageDir, "api-credential-profile-list.png")),
  ).rejects.toThrow()
  const runs = await fs.readdir(
    path.join(root, ".scratch/docs-screenshot-updates"),
  )
  expect(runs).toHaveLength(1)
  expect(
    await fs.readFile(
      path.join(
        root,
        ".scratch/docs-screenshot-updates",
        runs[0]!,
        "failure.json",
      ),
      "utf8",
    ),
  ).toContain("publication disk error")
})

it("keeps the publication error and reports rollback failures while restoring other assets", async () => {
  const { updateDocScreenshots } = await import(pathToFileURL(cli).href)
  const { root, imageDir, before } = await fixture()
  const copyFile = fs.copyFile.bind(fs)
  vi.spyOn(fs, "copyFile").mockImplementation(
    async (source, destination, ...args) => {
      if (
        String(source).includes(`${path.sep}after${path.sep}`) &&
        destination === path.join(imageDir, "account-manage.png")
      ) {
        await fs.writeFile(destination, "partial copy")
        throw new Error("publication disk error")
      }
      if (
        String(source).includes(`${path.sep}before${path.sep}`) &&
        destination === path.join(imageDir, "account-manage.png")
      )
        throw new Error("restore disk error")
      return copyFile(source, destination, ...args)
    },
  )
  await expect(
    updateDocScreenshots(
      { root, pages: "keys,account", lang: "zh" },
      {
        run: async (_command: string, args: string[]) => {
          if (!args[0]?.endsWith("generate-doc-screenshots.mjs")) return
          const output = args
            .find((arg) => arg.startsWith("--output="))!
            .slice(9)
          await fs.mkdir(output, { recursive: true })
          const png = new PNG({ width: 4, height: 4 })
          png.data.fill(100)
          for (const name of ["api-key-list.png", "account-manage.png"])
            await fs.writeFile(path.join(output, name), PNG.sync.write(png))
        },
      },
    ),
  ).rejects.toThrow("publication disk error")
  expect(await fs.readFile(path.join(imageDir, "api-key-list.png"))).toEqual(
    before,
  )
  const runs = await fs.readdir(
    path.join(root, ".scratch/docs-screenshot-updates"),
  )
  expect(runs).toHaveLength(1)
  const directory = path.join(
    root,
    ".scratch/docs-screenshot-updates",
    runs[0]!,
  )
  const failure = JSON.parse(
    await fs.readFile(path.join(directory, "failure.json"), "utf8"),
  )
  expect(failure.rollbackFailures).toEqual([
    {
      target: path.join(imageDir, "account-manage.png"),
      backup: path.join(directory, "before/account-manage.png"),
      message: "restore disk error",
    },
  ])
  expect(
    await fs.readFile(path.join(directory, "before/account-manage.png")),
  ).toEqual(before)
})
