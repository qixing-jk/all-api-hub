import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import {
  mkdir,
  mkdtemp,
  open,
  readdir,
  readFile,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"

import {
  createE2eBuildInputHash,
  readE2eBuildInputPaths,
} from "../e2e/utils/e2eBuildInputs.shared.js"
import {
  getE2eExtensionDirName,
  readE2eBuildVariant,
} from "../e2e/utils/e2eBuildVariants.shared.js"
import { loadLocalEnv } from "./utils/local-env.mjs"

const root = fileURLToPath(new URL("../", import.meta.url))

const scenarios = [
  {
    id: "api-key-hint",
    spec: "e2e/sidepanelUserFlows.spec.ts",
    grep: "sidepanel receives apiCredential sponsor setup while already mounted$",
    fixture: "mounted-sponsor-api-credential-v1",
    checkpoints: ["hint-light-380", "hint-dark-320"],
  },
]

try {
  const { values } = parseArgs({
    options: {
      list: { type: "boolean" },
      help: { type: "boolean" },
      scenario: { type: "string" },
      spec: { type: "string" },
      grep: { type: "string" },
      fixture: { type: "string" },
      view: { type: "string", multiple: true },
      variant: { type: "string" },
      baseline: { type: "string" },
      diff: { type: "boolean", default: false },
    },
  })
  if (values.help)
    console.log(`Capture checkpoints from an existing asserted Playwright workflow:
  pnpm visual:capture --spec e2e/<flow>.spec.ts --grep '<test title>' --fixture <state-version>
    [--view light:380x700 --view dark:320x700] [--variant <build-variant>] [--baseline <prior-run>] [--diff]
Call captureVisualViews in the selected workflow.
Without --view, the helper uses its workflow defaults or captures the current view.
Build variant defaults to AAH_E2E_BUILD_VARIANT (otherwise default); --variant overrides it.
Supported variants: default, dnr-required, bookmarks-required. Baselines must match.
Registered shortcuts: --list; --scenario <id> [--baseline <prior-run>] [--diff]
Output is JSON containing report and artifact paths. No images are opened automatically.`)
  else if (values.list) console.log(JSON.stringify(scenarios))
  else {
    const scenario = values.spec
      ? await customWorkflow(values)
      : scenarios.find((entry) => entry.id === values.scenario)
    if (!scenario) throw new Error("Unknown capture scenario; use --list")
    if (!values.spec && (values.grep || values.fixture || values.view))
      throw new Error(
        "Custom --grep, --fixture and --view options require --spec",
      )
    loadLocalEnv({ cwd: root })
    scenario.buildVariant = readE2eBuildVariant({
      ...process.env,
      ...(values.variant ? { AAH_E2E_BUILD_VARIANT: values.variant } : {}),
    })
    const baseline = values.baseline
      ? await readBaseline(path.resolve(values.baseline), scenario)
      : null
    console.log(JSON.stringify(await capture(scenario, baseline, values.diff)))
  }
} catch (error) {
  console.error(`visual:capture: ${error.message}`)
  process.exitCode = 1
}

/** Run a maintained workflow in this checkout with private output and browser state. */
async function capture(scenario, baseline, diff) {
  const parent = path.join(root, ".scratch/visual-captures")
  await mkdir(parent, { recursive: true })
  const lockPath = path.join(parent, "active.lock")
  const lock = await open(lockPath, "wx").catch((error) => {
    if (error.code !== "EEXIST") throw error
    throw new Error(
      `Capture already active in this worktree; inspect ${lockPath} before retrying`,
    )
  })
  await lock.writeFile(
    JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }),
  )
  let directory
  try {
    directory = await mkdtemp(path.join(parent, "run-"))
    const log = await open(path.join(directory, "playwright.log"), "w")
    try {
      execFileSync(
        process.execPath,
        [
          path.join(root, "node_modules/@playwright/test/cli.js"),
          "test",
          scenario.spec,
          "--grep",
          scenario.grep,
          "--project=chromium",
          "--workers=1",
          "--retries=0",
          "--reporter=line",
          `--output=${path.join(directory, "playwright")}`,
        ],
        {
          cwd: root,
          stdio: ["ignore", log.fd, log.fd],
          env: {
            ...process.env,
            AAH_VISUAL_CAPTURE_DIR: directory,
            AAH_VISUAL_CAPTURE_VIEWS: JSON.stringify(scenario.views ?? null),
            AAH_SKIP_E2E_BUILD: "0",
            AAH_E2E_BUILD_VARIANT: scenario.buildVariant,
            AAH_EXTENSION_DIR: path.join(
              root,
              ".output",
              getE2eExtensionDirName(scenario.buildVariant),
            ),
            AAH_E2E_USER_DATA_DIR: "",
          },
        },
      )
    } catch (error) {
      throw new Error(
        `Capture workflow failed; see ${path.join(directory, "playwright.log")}`,
        { cause: error },
      )
    } finally {
      await log.close()
    }
    const inputHash = await createE2eBuildInputHash(
      root,
      await readE2eBuildInputPaths(root),
      { env: { ...process.env, AAH_E2E_BUILD_VARIANT: scenario.buildVariant } },
    )
    const ids =
      scenario.checkpoints ??
      (await readdir(directory))
        .filter((file) => file.endsWith(".json"))
        .map((file) => file.slice(0, -5))
        .sort()
    validateIds(ids)
    if (
      baseline &&
      JSON.stringify([...ids].sort()) !==
        JSON.stringify(
          baseline.capture.checkpoints.map((state) => state.id).sort(),
        )
    )
      throw new Error(
        "Capture checkpoints differ from baseline; retain both captures for manual review",
      )
    const checkpoints = []
    for (const id of ids) {
      const state = JSON.parse(
        await readFile(path.join(directory, `${id}.json`), "utf8"),
      )
      if (
        state.id !== id ||
        state.image !== `${id}.png` ||
        !state.environment ||
        !state.source?.gitHead
      )
        throw new Error(`Invalid capture checkpoint: ${id}`)
      if (state.source.inputHash !== inputHash)
        throw new Error(
          "Build inputs changed during capture; rerun the workflow",
        )
      if ((state.source.buildVariant ?? "default") !== scenario.buildVariant)
        throw new Error(`Capture build variant differs: ${id}`)
      const bytes = await readFile(path.join(directory, state.image))
      if (state.sha256 !== createHash("sha256").update(bytes).digest("hex"))
        throw new Error(`Capture hash mismatch: ${id}`)
      checkpoints.push(state)
    }
    await writeFile(
      path.join(directory, "capture.json"),
      JSON.stringify(
        {
          version: 1,
          status: "captured",
          scenario: scenario.id,
          fixture: scenario.fixture,
          workflow: {
            spec: scenario.spec,
            grep: scenario.grep,
            views: scenario.views ?? null,
          },
          checkout: root,
          capturedHead: execFileSync("git", ["rev-parse", "HEAD"], {
            cwd: root,
            encoding: "utf8",
          }).trim(),
          checkpoints,
        },
        null,
        2,
      ),
    )
    const comparisons = []
    if (baseline)
      for (const state of checkpoints) {
        const previous = baseline.capture.checkpoints.find(
          (entry) => entry.id === state.id,
        )
        if (
          JSON.stringify(previous.environment) !==
          JSON.stringify(state.environment)
        )
          throw new Error(
            `Capture context differs from baseline: ${state.id}; retain both captures for manual review`,
          )
        const source = (entry) =>
          `build ${entry.source.gitHead}; inputHash ${entry.source.inputHash}`
        comparisons.push(
          JSON.parse(
            execFileSync(
              process.execPath,
              [
                path.join(root, "scripts/visual-compare.mjs"),
                "--before",
                path.join(baseline.directory, previous.image),
                "--after",
                path.join(directory, state.image),
                "--before-source",
                source(previous),
                "--after-source",
                source(state),
                "--context",
                JSON.stringify(state.environment),
                "--output",
                path.join(directory, "comparisons"),
                ...(diff ? ["--diff"] : []),
              ],
              { cwd: root, encoding: "utf8" },
            ),
          ),
        )
      }
    await writeFile(
      path.join(directory, "capture.md"),
      `# ${scenario.id} capture\n\nWorkflow: ${scenario.spec}. Fixture: ${scenario.fixture} (caller-declared). Agents prioritize final results; baseline/comparison images are retained for developer review and need not be opened automatically.\n\n${checkpoints.map((state) => `[${state.id}](${state.image})`).join(" · ")}\n\n[Capture metadata](capture.json) · [Runner log](playwright.log)\n\n${comparisons.map((entry, index) => `[${checkpoints[index].id} comparison](${path.relative(directory, entry.report).split(path.sep).join("/")})`).join(" · ")}\n`,
    )
    return {
      directory,
      status: "captured",
      manifest: path.join(directory, "capture.json"),
      report: path.join(directory, "capture.md"),
      comparisons,
    }
  } catch (error) {
    if (directory)
      await writeFile(
        path.join(directory, "failure.json"),
        JSON.stringify({ status: "failed", message: error.message }),
      )
    throw error
  } finally {
    await lock.close()
    await unlink(lockPath)
  }
}

/** Validate retained baseline identity and original bytes before launching another run. */
async function readBaseline(directory, scenario) {
  const capture = JSON.parse(
    await readFile(path.join(directory, "capture.json"), "utf8"),
  )
  if (
    capture.version !== 1 ||
    capture.status !== "captured" ||
    capture.scenario !== scenario.id ||
    capture.fixture !== scenario.fixture ||
    !Array.isArray(capture.checkpoints) ||
    !capture.checkpoints.length ||
    (scenario.checkpoints &&
      capture.checkpoints.length !== scenario.checkpoints.length)
  )
    throw new Error("Incompatible baseline capture")
  const ids =
    scenario.checkpoints ?? capture.checkpoints.map((state) => state.id)
  validateIds(ids)
  for (const id of ids) {
    const state = capture.checkpoints.find((entry) => entry.id === id)
    if (
      !state ||
      state.image !== `${id}.png` ||
      !state.environment ||
      !state.source?.inputHash ||
      !state.source?.gitHead
    )
      throw new Error(`Incompatible baseline capture: ${id}`)
    if ((state.source.buildVariant ?? "default") !== scenario.buildVariant)
      throw new Error(`Baseline build variant differs: ${id}`)
    const bytes = await readFile(path.join(directory, state.image))
    if (createHash("sha256").update(bytes).digest("hex") !== state.sha256)
      throw new Error(`Baseline image hash mismatch: ${id}`)
  }
  return { directory, capture }
}

function validateIds(ids) {
  if (
    !ids.length ||
    new Set(ids).size !== ids.length ||
    ids.some(
      (id) =>
        typeof id !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/u.test(id),
    )
  )
    throw new Error(
      "Capture requires unique safe checkpoint IDs; call captureVisualViews in the selected workflow",
    )
}

/** Existing asserted workflows can opt in without a scenario registry entry. */
async function customWorkflow(values) {
  if (values.scenario || !values.grep?.trim() || !values.fixture?.trim())
    throw new Error("Use --spec with --grep and --fixture, without --scenario")
  const spec = path
    .relative(root, path.resolve(root, values.spec))
    .split(path.sep)
    .join("/")
  if (
    !spec.startsWith("e2e/") ||
    spec.includes("../") ||
    !spec.endsWith(".spec.ts") ||
    !(await stat(path.join(root, spec))).isFile()
  )
    throw new Error("--spec must name an existing e2e/*.spec.ts workflow")
  new RegExp(values.grep, "u")
  const views = values.view?.map((value) => {
    const match = /^(light|dark):([1-9]\d*)x([1-9]\d*)$/u.exec(value)
    if (
      !match ||
      !Number.isSafeInteger(Number(match[2])) ||
      !Number.isSafeInteger(Number(match[3]))
    )
      throw new Error(
        "--view must be light:WIDTHxHEIGHT or dark:WIDTHxHEIGHT with positive integer dimensions",
      )
    return {
      id: `${match[1]}-${match[2]}x${match[3]}`,
      theme: match[1],
      width: Number(match[2]),
      height: Number(match[3]),
    }
  })
  if (views) validateIds(views.map((view) => view.id))
  return {
    id: `workflow-${createHash("sha256")
      .update(JSON.stringify([spec, values.grep]))
      .digest("hex")
      .slice(0, 16)}`,
    spec,
    grep: values.grep,
    fixture: values.fixture,
    checkpoints: null,
    views,
  }
}
