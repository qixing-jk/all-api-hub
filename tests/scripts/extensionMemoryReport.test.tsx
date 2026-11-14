import { mkdtemp, readFile, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, expect, it } from "vitest"

// @ts-expect-error This Node diagnostic utility does not publish declarations.
import { writeSummaryReport } from "~~/scripts/diagnostics/extension-memory-report-utils.mjs"

let outputDir: string | undefined
afterEach(async () => {
  if (outputDir) await rm(outputDir, { recursive: true, force: true })
})

it.each([false, true])(
  "renders heap metrics and tolerates reports without worker/sidepanel data (extended: %s)",
  async (extended) => {
    const metric = { baseline: 1024, current: 2048, delta: 1024 }
    const heap = {
      runtimeUsedSize: metric,
      embedderHeapUsedSize: { baseline: 1024, current: 512, delta: -512 },
      backingStorageSize: { baseline: null, current: null, delta: null },
    }
    const page = {
      ...heap,
      startupJsBytes: metric,
      startupCssBytes: metric,
      localResourceCount: metric,
      externalRequestCount: metric,
      perfUsedJSHeapSize: metric,
      nodes: metric,
      jsEventListeners: metric,
      addedResources: ["<synthetic>.js"],
      removedResources: [],
      addedExternalRequests: [],
      removedExternalRequests: [],
    }
    outputDir = await mkdtemp(path.join(os.tmpdir(), "aah-memory-report-"))
    const htmlPath = await writeSummaryReport(
      path.join(outputDir, "summary.json"),
      {
        comparison: {
          popup: page,
          options: page,
          ...(extended ? { sidepanel: page, background: heap } : {}),
          buildArtifacts: {
            backgroundBundleBytes: metric,
            contentScriptBundleBytes: metric,
          },
          contentScriptImpact: {
            targetUrl: "https://example.invalid",
            runtimeUsedSizeDelta: metric,
            embedderHeapUsedSizeDelta: metric,
            backingStorageSizeDelta: metric,
            perfUsedJSHeapSizeDelta: metric,
            nodesDelta: metric,
            jsEventListenersDelta: metric,
          },
        },
      },
    )
    const document = new DOMParser().parseFromString(
      await readFile(htmlPath, "utf8"),
      "text/html",
    )
    const sections = [...document.querySelectorAll("article")]
    const headings = sections.map(
      (section) => section.querySelector("h3")?.textContent,
    )
    expect(headings.includes("Background after popup ready")).toBe(extended)
    expect(headings.includes("Sidepanel startup")).toBe(extended)
    for (const section of sections.filter((section) =>
      /^(Popup startup|Options startup|Sidepanel startup|Background after popup ready)$/.test(
        section.querySelector("h3")?.textContent ?? "",
      ),
    )) {
      const rows = [...section.querySelectorAll("tbody tr")].map((row) =>
        [...row.querySelectorAll("td")].map((cell) => cell.textContent?.trim()),
      )
      expect(rows).toEqual(
        expect.arrayContaining([
          ["Runtime heap", "1.00 KB", "2.00 KB", "+1.00 KB"],
          ["Embedder heap", "1.00 KB", "512 B", "-512 B"],
          ["Backing storage", "n/a", "n/a", "n/a"],
        ]),
      )
    }
    expect(document.body.textContent).toContain("<synthetic>.js")
    expect(document.querySelector("synthetic")).toBeNull()
  },
)
