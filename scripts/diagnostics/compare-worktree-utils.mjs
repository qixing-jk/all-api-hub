/* eslint-disable jsdoc/require-param, jsdoc/require-returns */
import { spawn } from "node:child_process"
import fs from "node:fs/promises"
import path from "node:path"

const repoRoot = process.cwd()

/**
 * Spawn a child process and stream output to the current terminal.
 */
export async function runCommand(command, args, options = {}) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? repoRoot,
      env: { ...process.env, ...(options.env ?? {}) },
      stdio: options.stdio ?? "inherit",
      shell: process.platform === "win32",
    })

    child.on("error", reject)
    child.on("exit", (code) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(
        new Error(
          `Command failed (${code ?? "unknown"}): ${command} ${args.join(" ")}`,
        ),
      )
    })
  })
}

/**
 * Spawn a child process and capture stdout/stderr for decision-making.
 */
export async function runCommandCapture(command, args, options = {}) {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? repoRoot,
      env: { ...process.env, ...(options.env ?? {}) },
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32",
    })

    let stdout = ""
    let stderr = ""

    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk)
    })
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk)
    })

    child.on("error", reject)
    child.on("exit", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr, code })
        return
      }
      reject(
        new Error(
          `Command failed (${code ?? "unknown"}): ${command} ${args.join(" ")}\n${stderr || stdout}`,
        ),
      )
    })
  })
}

/**
 * Recreate a directory from scratch.
 */
export async function ensureCleanDir(dir) {
  await fs.rm(dir, { recursive: true, force: true })
  await fs.mkdir(dir, { recursive: true })
}

/**
 * Check whether a path exists.
 */
export async function pathExists(targetPath) {
  try {
    await fs.access(targetPath)
    return true
  } catch {
    return false
  }
}

/**
 * Returns whether the current worktree has no tracked or untracked changes.
 */
export async function isWorktreeClean(cwd = repoRoot) {
  const result = await runCommandCapture("git", ["status", "--porcelain"], {
    cwd,
  })
  return result.stdout.trim() === ""
}

/**
 * Returns whether a git ref can be resolved locally.
 */
export async function gitRefExists(ref, cwd = repoRoot) {
  try {
    await runCommandCapture("git", ["rev-parse", "--verify", ref], { cwd })
    return true
  } catch {
    return false
  }
}

/**
 * Pick a baseline when the caller did not pass one explicitly.
 */
export async function resolveBaseline(options, cwd = repoRoot) {
  if (options.baselineExplicit && options.baseline) {
    console.log(`Using explicit baseline ref '${options.baseline}'.`)
    return options.baseline
  }

  const cleanWorktree = await isWorktreeClean(cwd)

  if (cleanWorktree && (await gitRefExists("origin/main", cwd))) {
    console.log(
      "No --baseline specified. Worktree is clean and 'origin/main' exists, so using 'origin/main'.",
    )
    return "origin/main"
  }

  if (cleanWorktree && (await gitRefExists("main", cwd))) {
    console.log(
      "No --baseline specified. Worktree is clean and 'origin/main' is unavailable, so using 'main'.",
    )
    return "main"
  }

  console.log(
    "No --baseline specified. Falling back to 'HEAD' for local self-comparison because the worktree is dirty or no mainline ref is available.",
  )
  return "HEAD"
}

/**
 * Export the baseline git ref into a temp source directory.
 */
export async function materializeBaselineSource({
  baselineRef,
  baselineSrcDir,
  tarPath,
  sourceRepoRoot = repoRoot,
}) {
  await ensureCleanDir(baselineSrcDir)
  await runCommand(
    "git",
    ["archive", "--format=tar", baselineRef, `--output=${tarPath}`],
    {
      cwd: sourceRepoRoot,
    },
  )
  await runCommand("tar", ["-xf", tarPath, "-C", baselineSrcDir], {
    cwd: sourceRepoRoot,
  })

  const baselineNodeModules = path.join(baselineSrcDir, "node_modules")
  await fs.rm(baselineNodeModules, { recursive: true, force: true })
  await fs.symlink(
    path.join(sourceRepoRoot, "node_modules"),
    baselineNodeModules,
    "junction",
  )
}

/**
 * Copy a small allow-list of files into a materialized baseline source tree.
 */
export async function copyFilesToDir(relativePaths, targetRoot, options = {}) {
  const sourceRoot = options.sourceRoot ?? repoRoot

  for (const relativePath of relativePaths) {
    const sourcePath = path.join(sourceRoot, relativePath)
    const targetPath = path.join(targetRoot, relativePath)

    await fs.mkdir(path.dirname(targetPath), { recursive: true })
    await fs.copyFile(sourcePath, targetPath)
  }
}
