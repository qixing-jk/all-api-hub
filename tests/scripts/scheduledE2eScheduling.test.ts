import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

function workflow(name: string) {
  return readFileSync(`.github/workflows/${name}.yml`, "utf8")
}

function job(source: string, name: string) {
  const body = source
    .split(new RegExp(`^  ${name}:\\r?$`, "m"))[1]
    ?.split(/^ {2}[\w-]+:\r?$/m)[0]
  if (!body) throw new Error(`Missing job ${name}`)
  return body
}

describe("scheduled E2E build reuse", () => {
  it("isolates performance measurements from concurrent browser contexts", () => {
    const source = workflow("e2e-browser-compat")
    expect(source).toContain('--grep-invert="major pages with"')
    const performance = source
      .split("      - name: Run isolated performance E2E")[1]
      ?.split("      - name:")[0]
    expect(performance).toBeDefined()
    expect(performance).toContain(
      "if: ${{ !cancelled() && matrix.shard == 2 }}",
    )
    expect(performance).toContain('AAH_E2E_WORKERS: "1"')
    expect(performance).toContain("e2e/multiAccountPerformance.spec.ts")
    expect(performance).not.toContain("--shard=")
    expect(performance).toContain(
      "PLAYWRIGHT_HTML_OUTPUT_DIR: playwright-report/performance",
    )
    expect(source).toContain(
      "PLAYWRIGHT_HTML_OUTPUT_DIR: playwright-report/compatibility",
    )
  })
  it("bounds compatibility file concurrency while retaining every version and shard", () => {
    const source = workflow("e2e-browser-compat")
    const tests = job(source, "chrome-compat")
    expect(tests).toContain("AAH_E2E_WORKERS: ${{ inputs.workers || '2' }}")
    expect(source).toContain('default: "2"')
    expect(source).toContain("type: choice")
    expect(source).toMatch(/options:\s*\n\s*- "2"\s*\n\s*- "4"/)
    expect(tests).toContain("shard: [1, 2, 3]")
    for (const version of [
      "114",
      "116",
      "120",
      "122",
      "144",
      "147",
      "148",
      "stable",
    ]) {
      expect(tests).toContain(`- "${version}"`)
    }
    expect(tests).toContain("--shard=${{ matrix.shard }}/3")
    expect(readFileSync("playwright.config.ts", "utf8")).not.toMatch(
      /fullyParallel:\s*true/,
    )
  })

  it.each([
    ["e2e-browser-compat", "e2e-build", "chrome-compat"],
    ["e2e-real-site", "e2e-build", "real-site-e2e"],
  ])(
    "%s builds once and transfers the complete extension",
    (name, producer, consumer) => {
      const source = workflow(name)
      const build = job(source, producer)
      const tests = job(source, consumer)
      expect(build).toContain("uses: ./.github/workflows/e2e-build.yml")
      expect(source).not.toContain("run: pnpm build:e2e")
      expect(tests.match(/^ {4}needs: (.+)$/m)?.[1]).toContain(producer)
      expect(tests).toContain("uses: actions/download-artifact@v7")
      expect(tests).toContain("name: e2e-extension-default")
      expect(tests).toContain("path: .output/chrome-mv3-test")
      expect(tests).toContain('AAH_SKIP_E2E_BUILD: "1"')
      expect(tests).not.toContain("run: pnpm build:e2e")
    },
  )

  it("provides independent inference credentials to the shared real-site matrix", () => {
    const source = workflow("e2e-real-site")
    const tests = job(source, "real-site-e2e")
    expect(tests).toContain("needs: [real-site-matrix, e2e-build]")
    for (const name of [
      "AAH_E2E_UPSTREAM_BASE_URL",
      "AAH_E2E_UPSTREAM_API_KEY",
    ]) {
      expect(tests).toContain(name + ": ${{ secrets." + name + " }}")
    }
    expect(source).not.toContain("AAH_E2E_WORKERS")
  })

  it("shares a variant-specific, content-addressed cache across workflows and queues producers", () => {
    const source = workflow("e2e-build")
    const build = job(source, "build")
    expect(build).toContain("queue: max")
    expect(build).toContain("cancel-in-progress: false")
    expect(build).toContain("${{ github.ref }}-${{ inputs.build_variant }}")
    expect(build).toContain("uses: actions/cache/restore@v5")
    expect(build).toContain("uses: actions/cache/save@v5")
    expect(build).toContain(
      "${{ runner.os }}-${{ runner.arch }}-${{ steps.variant.outputs.input_hash }}-${{ inputs.build_variant }}",
    )
    expect(build).not.toContain("github.sha")
    expect(build.indexOf("- name: Setup Node.js")).toBeLessThan(
      build.indexOf("- name: Resolve extension directory"),
    )
    expect(build).not.toContain("restore-keys:")
    expect(build).toContain("node scripts/e2e-ci-build-cache.mjs")
    for (const name of [
      "Setup pnpm",
      "Install dependencies",
      "Build E2E extension",
      "Save E2E build",
    ]) {
      const step = build
        .split(`      - name: ${name}`)[1]
        ?.split("      - name:")[0]
      expect(step).toContain("if: steps.cached_build.outputs.usable != 'true'")
    }
    expect(build).toContain("include-hidden-files: true")
    expect(build).toContain("if-no-files-found: error")
    const smokeBuild = job(workflow("e2e-smoke"), "e2e-build")
    expect(workflow("e2e-smoke").match(/- "\.nvmrc"/g)).toHaveLength(2)
    expect(workflow("e2e-smoke").match(/- "\.env\*"/g)).toHaveLength(2)
    expect(smokeBuild).toContain("uses: ./.github/workflows/e2e-build.yml")
    expect(smokeBuild).toContain("build_variant: ${{ matrix.build_variant }}")
    expect(smokeBuild).toContain("optional:")
    expect(build).toContain("continue-on-error: ${{ inputs.optional }}")
  })
})
