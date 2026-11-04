import { spawn, spawnSync } from "node:child_process"
import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"

import {
  DOC_SCREENSHOT_LANGUAGE_ALIASES,
  DOC_SCREENSHOT_LOCALES,
  DOC_SCREENSHOT_PAGES,
} from "./doc-screenshot-config.mjs"
import { loadLocalEnv } from "./utils/local-env.mjs"
import { compare } from "./visual-compare.mjs"

export { DOC_SCREENSHOT_PAGES } from "./doc-screenshot-config.mjs"

const repoRoot = fileURLToPath(new URL("../", import.meta.url))
const locales = DOC_SCREENSHOT_LOCALES

/** Rebuild, capture and validate the requested document assets before updating them. */
export async function updateDocScreenshots(options = {}, dependencies = {}) {
  const root = path.resolve(options.root ?? repoRoot)
  const pages =
    options.pages !== undefined
      ? [...new Set(options.pages.trim().split(/[,\s]+/))]
      : Object.keys(DOC_SCREENSHOT_PAGES)
  if (
    !pages.length ||
    pages.some((page) => !Object.hasOwn(DOC_SCREENSHOT_PAGES, page))
  )
    throw new Error("Unknown page. Use --list to see supported pages.")
  const requestedLanguage = (options.lang ?? "all").trim().toLowerCase()
  const language =
    DOC_SCREENSHOT_LANGUAGE_ALIASES[requestedLanguage] ?? requestedLanguage
  const languages = language === "all" ? Object.keys(locales) : [language]
  if (languages.some((lang) => !Object.hasOwn(locales, lang)))
    throw new Error("Unknown language; use all, zh, en or ja.")
  const parent = path.join(root, ".scratch/docs-screenshot-updates")
  await fs.mkdir(parent, { recursive: true })
  const lockPath = path.join(parent, "update.lock")
  const lock = await acquireLock(lockPath)
  let directory
  try {
    await lock.writeFile(`${process.pid}\n`)
    directory = await fs.mkdtemp(path.join(parent, "run-"))
    const destination = path.join(root, "docs/docs/static/image")
    const after = path.join(directory, "after")
    const images = languages.flatMap((lang) =>
      pages.flatMap((page) =>
        DOC_SCREENSHOT_PAGES[page].map((name) => ({
          page,
          lang,
          relative: path.join(locales[lang].output, name),
        })),
      ),
    )
    for (const image of images) {
      const before = path.join(directory, "before", image.relative)
      await fs.mkdir(path.dirname(before), { recursive: true })
      try {
        await fs.copyFile(path.join(destination, image.relative), before)
        image.before = before
      } catch (error) {
        if (error.code !== "ENOENT") throw error
      }
    }
    const gitHead =
      spawnSync("git", ["rev-parse", "HEAD"], {
        cwd: root,
        encoding: "utf8",
      }).stdout?.trim() || "unknown"
    const env = { ...process.env }
    loadLocalEnv({ cwd: root, env })
    env.AAH_E2E_BUILD_VARIANT = "default"
    env.AAH_EXTENSION_DIR = path.join(root, ".output/chrome-mv3-test")
    const execute = dependencies.run ?? run
    const command = async (args) =>
      execute(process.execPath, args, {
        cwd: root,
        env,
        log: path.join(directory, "update.log"),
      })
    if (pages.some((page) => page !== "web-ai-api-check"))
      await command([path.join(root, "node_modules/wxt/bin/wxt.mjs"), "build"])
    if (pages.includes("web-ai-api-check"))
      await command([path.join(root, "scripts/e2e-build.mjs")])
    await command([
      path.join(root, "scripts/generate-doc-screenshots.mjs"),
      `--pages=${pages.join(",")}`,
      `--lang=${language}`,
      `--output=${after}`,
    ])
    // All requested images must exist and decode before any tracked asset changes.
    for (const image of images) {
      const result = await compare({
        before: image.before,
        "before-source": image.before
          ? "pre-existing documentation asset; original build unknown"
          : undefined,
        after: path.join(after, image.relative),
        "after-source": `current checkout at ${gitHead}; current working-tree build`,
        context: `${image.page}; ${image.lang}; deterministic documentation demo; Chromium; light`,
        output: path.join(directory, "comparisons"),
        diff: true,
      })
      image.status = result.status
      image.comparison = path
        .relative(directory, result.directory)
        .replaceAll("\\", "/")
    }
    const report = path.join(directory, "report.md")
    await fs.writeFile(
      path.join(directory, "report.json"),
      JSON.stringify(
        { gitHead, pages, languages, images, review: "required" },
        null,
        2,
      ) + "\n",
    )
    await fs.writeFile(
      report,
      `# Documentation screenshot update\n\nPages: ${pages.join(", ")}. Languages: ${languages.join(", ")}.\n\nBefore images are pre-existing documentation assets; their original builds are unknown. After images use the current working tree. Pixel differences are evidence for human review, not acceptance thresholds.\n\n${images.map((image) => `## ${image.lang} / ${image.page}\n\nStatus: ${image.status}\n\n${image.before ? `![Before / After](${image.comparison}/comparison.png)` : `![After](${image.comparison}/after.png)`}\n\n[Comparison report](${image.comparison}/report.md)\n`).join("\n")}`,
    )
    // Prepare reports before changing assets. Restore every attempted target,
    // including a failed copy that may have truncated its destination.
    const attempted = []
    try {
      for (const image of images) {
        const target = path.join(destination, image.relative)
        await fs.mkdir(path.dirname(target), { recursive: true })
        attempted.push(image)
        await fs.copyFile(path.join(after, image.relative), target)
      }
    } catch (error) {
      const rollbackFailures = []
      for (const image of attempted.reverse()) {
        const target = path.join(destination, image.relative)
        try {
          if (image.before) await fs.copyFile(image.before, target)
          else await fs.rm(target, { force: true })
        } catch (rollbackError) {
          rollbackFailures.push({
            target,
            backup: image.before,
            message: rollbackError.message,
          })
        }
      }
      if (rollbackFailures.length) {
        const failure = new Error(
          `${error.message}\nRollback failed: ${rollbackFailures.map((item) => `${item.target}: ${item.message}`).join("; ")}`,
          { cause: error },
        )
        failure.rollbackFailures = rollbackFailures
        throw failure
      }
      throw error
    }
    return { directory, report, images }
  } catch (error) {
    if (directory)
      await fs.writeFile(
        path.join(directory, "failure.json"),
        JSON.stringify(
          { message: error.message, rollbackFailures: error.rollbackFailures },
          null,
          2,
        ) + "\n",
      )
    throw new Error(
      `${error.message}${directory ? `\nEvidence: ${directory}` : ""}`,
      { cause: error },
    )
  } finally {
    await lock.close()
    await fs.unlink(lockPath)
  }
}

/** Reclaim a confirmed dead owner while serializing competing recovery attempts. */
async function acquireLock(lockPath) {
  const busy = () =>
    new Error(
      "A documentation screenshot update is already running or its owner cannot be verified. See .scratch/docs-screenshot-updates/update.lock.",
    )
  try {
    return await fs.open(lockPath, "wx")
  } catch (error) {
    if (error.code !== "EEXIST") throw error
  }
  const recoveryPath = `${lockPath}.recovery`
  let recovery
  try {
    recovery = await fs.open(recoveryPath, "wx")
  } catch (error) {
    if (error.code === "EEXIST") throw busy()
    throw error
  }
  try {
    await recovery.writeFile(`${process.pid}\n`)
    let owner
    try {
      owner = (await fs.readFile(lockPath, "utf8")).trim()
    } catch (error) {
      if (error.code === "ENOENT") return await fs.open(lockPath, "wx")
      throw busy()
    }
    const pid = Number(owner)
    if (!/^\d+$/.test(owner) || !Number.isSafeInteger(pid) || pid <= 0)
      throw busy()
    try {
      process.kill(pid, 0)
      throw busy()
    } catch (error) {
      if (error.code !== "ESRCH") throw busy()
    }
    // The recovery guard excludes another stale-owner decision; reread before deletion.
    if ((await fs.readFile(lockPath, "utf8")).trim() !== owner) throw busy()
    await fs.unlink(lockPath)
    return await fs.open(lockPath, "wx")
  } finally {
    await recovery.close()
    await fs.unlink(recoveryPath)
  }
}

/** Execute a local Node command without interpolating arguments through a shell. */
function run(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
    })
    const chunks = []
    for (const stream of [child.stdout, child.stderr])
      stream.on("data", (chunk) => {
        chunks.push(chunk)
        process.stdout.write(chunk)
      })
    child.on("error", reject)
    child.on("close", async (code) => {
      try {
        await fs.appendFile(options.log, Buffer.concat(chunks))
        if (code !== 0)
          throw new Error(`${path.basename(args[0])} exited with ${code}`)
        resolve()
      } catch (error) {
        reject(error)
      }
    })
  })
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const { values } = parseArgs({
      options: {
        pages: { type: "string" },
        lang: { type: "string" },
        list: { type: "boolean" },
        help: { type: "boolean" },
      },
    })
    if (values.help)
      console.log(
        "Usage: pnpm docs:screenshots --pages=keys,channels [--lang=all|zh|en|ja]\nOmit --pages for all pages. --list lists page names. Rebuilds required variants, updates assets and retains before/after comparisons under .scratch/docs-screenshot-updates/.",
      )
    else if (values.list)
      console.log(Object.keys(DOC_SCREENSHOT_PAGES).join("\n"))
    else {
      const result = await updateDocScreenshots(values)
      console.log(
        JSON.stringify(
          {
            directory: result.directory,
            report: result.report,
            updatedImages: result.images.length,
          },
          null,
          2,
        ),
      )
    }
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
