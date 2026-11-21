import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import type { Locator, Page } from "@playwright/test"

/** Capture an already asserted workflow checkpoint without opening image previews. */
async function captureVisualCheckpoint({
  page,
  ready,
  captureTarget,
  directory,
  id,
  extensionDir,
  animations = "disabled",
  isContext = false,
}: {
  page: Page
  ready: Locator
  captureTarget?: Locator
  directory: string
  id: string
  extensionDir: string
  animations?: "disabled" | "allow"
  isContext?: boolean
}) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/u.test(id))
    throw new Error("Visual checkpoint ID must be a safe filename")
  await ready.waitFor({ state: "visible" })
  await ready.scrollIntoViewIfNeeded()
  await page.evaluate(async () => {
    await document.fonts.ready
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    )
  })
  const environment = await page.evaluate(() => ({
    viewport: { width: innerWidth, height: innerHeight },
    deviceScaleFactor: devicePixelRatio,
    language: document.documentElement.lang || navigator.language,
    theme: document.documentElement.classList.contains("dark")
      ? "dark"
      : "light",
  }))
  const source = JSON.parse(
    await readFile(path.join(extensionDir, ".aah-e2e-build.json"), "utf8"),
  )
  await mkdir(directory, { recursive: true })
  // Dots are reserved for generated artifacts and cannot occur in caller IDs.
  const artifactId = isContext ? `${id}.context` : id
  const image = `${artifactId}.png`
  const bytes = await (captureTarget ?? page).screenshot({
    animations,
    caret: "hide",
    scale: "css",
  })
  // A broad grep must not silently overwrite another test's checkpoint.
  await writeFile(path.join(directory, image), bytes, { flag: "wx" })
  await writeFile(
    path.join(directory, `${artifactId}.json`),
    JSON.stringify(
      {
        id: artifactId,
        image,
        capturedAt: new Date().toISOString(),
        source,
        capture: captureTarget ? "element" : "viewport",
        environment: {
          ...environment,
          browser: page.context().browser()?.version() ?? "unknown",
        },
        sha256: createHash("sha256").update(bytes).digest("hex"),
      },
      null,
      2,
    ),
    { flag: "wx" },
  )
  if (captureTarget && process.env.AAH_VISUAL_CAPTURE_CONTEXT === "1") {
    await captureVisualCheckpoint({
      page,
      ready,
      directory,
      id,
      isContext: true,
      extensionDir,
      animations,
    })
  }
}

type VisualView = {
  id: string
  width: number
  height: number
  theme: "light" | "dark"
}

/** Opt-in capture matrix for any asserted extension workflow; normal tests do nothing. */
export async function captureVisualViews({
  page,
  ready,
  captureTarget,
  id,
  extensionDir,
  directory = process.env.AAH_VISUAL_CAPTURE_DIR,
  views,
  animations = "disabled",
}: {
  page: Page
  ready: Locator
  /** Focus an asserted panel while retaining the same build and environment evidence. */
  captureTarget?: Locator
  id: string
  extensionDir: string
  directory?: string
  views?: VisualView[]
  animations?: "disabled" | "allow"
}) {
  if (!directory) return
  const configured = process.env.AAH_VISUAL_CAPTURE_VIEWS
    ? (JSON.parse(process.env.AAH_VISUAL_CAPTURE_VIEWS) as VisualView[] | null)
    : null
  const originalViewport = page.viewportSize()
  const originalTheme = await page.evaluate(() =>
    document.documentElement.classList.contains("dark"),
  )
  const selected = configured ?? views
  if (!selected) {
    await captureVisualCheckpoint({
      page,
      ready,
      captureTarget,
      directory,
      id,
      extensionDir,
      animations,
    })
    return
  }
  if (
    !selected.length ||
    new Set(selected.map((view) => view.id)).size !== selected.length ||
    selected.some(
      (view) =>
        !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/u.test(view.id) ||
        !Number.isSafeInteger(view.width) ||
        view.width <= 0 ||
        !Number.isSafeInteger(view.height) ||
        view.height <= 0 ||
        !["light", "dark"].includes(view.theme),
    )
  )
    throw new Error(
      "Visual views require unique safe IDs, positive integer dimensions and light/dark themes",
    )
  try {
    for (const view of selected) {
      await page.setViewportSize({ width: view.width, height: view.height })
      await page.evaluate(
        (dark) => document.documentElement.classList.toggle("dark", dark),
        view.theme === "dark",
      )
      await captureVisualCheckpoint({
        page,
        ready,
        captureTarget,
        directory,
        id: `${id}-${view.id}`,
        extensionDir,
        animations,
      })
    }
  } finally {
    if (originalViewport) await page.setViewportSize(originalViewport)
    await page.evaluate(
      (dark) => document.documentElement.classList.toggle("dark", dark),
      originalTheme,
    )
  }
}
