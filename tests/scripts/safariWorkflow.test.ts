import { readFileSync } from "node:fs"
import { expect, it } from "vitest"

const workflow = readFileSync(
  new URL("../../.github/workflows/safari-smoke.yml", import.meta.url),
  "utf8",
).replaceAll("\r\n", "\n")

it("runs daily and manually without adding Safari to pull request checks", () => {
  expect(workflow).toContain("schedule:")
  expect(workflow).toMatch(/cron: ["']\d+ \d+ \* \* \*["']/u)
  expect(workflow).toContain("workflow_dispatch:")
  expect(workflow).not.toContain("pull_request:")
})

it("retains native evidence even if smoke fails and runs Safari contract regressions", () => {
  expect(workflow).toContain(
    "tests/services/apiTransport/safariNativeCookie.test.ts",
  )
  expect(workflow).toContain("if: ${{ !cancelled() }}")
  expect(workflow).toContain("test-results/safari/*.json")
  const nativeStep = workflow
    .split("      - name: Run native Safari E2E\n")[1]
    ?.split(/^ {6}- /m)[0]
  expect(nativeStep).toBeDefined()
  expect(nativeStep).toContain("node e2e/safari/smoke.ts")
  expect(nativeStep).toContain(
    "node e2e/safariNativeCookie/verify.ts test-results/safari/observations.json",
  )
  expect(nativeStep).not.toMatch(
    /^ {8}if:\s*(?:false|\$\{\{\s*false\s*\}\})\s*$/m,
  )
})
