import { execFileSync } from "node:child_process"
import path from "node:path"
import { describe, expect, it } from "vitest"

function runMatrix(...args: string[]) {
  const scriptPath = path.resolve(
    process.cwd(),
    "scripts",
    "github-real-site-e2e-matrix.mjs",
  )
  const testEnv = { ...process.env }

  // GitHub Actions sets GITHUB_OUTPUT for every step; unset it so this test
  // exercises the script's stdout CLI contract instead of its workflow output.
  delete testEnv.GITHUB_OUTPUT

  return JSON.parse(
    execFileSync(process.execPath, [scriptPath, ...args], {
      encoding: "utf8",
      env: testEnv,
      stdio: ["ignore", "pipe", "pipe"],
    }),
  ) as { include: Array<Record<string, unknown>> }
}

describe("GitHub real-site E2E matrix selection", () => {
  it("selects one concrete target without expanding the account category", () => {
    const matrix = runMatrix("all", "new-api-account")

    expect(matrix.include).toHaveLength(1)
    expect(matrix.include[0]).toMatchObject({
      id: "new-api-account",
      label: "Account / New API",
      category: "account",
    })
  })

  it("keeps category selection unchanged when target is all", () => {
    const matrix = runMatrix("account", "all")

    expect(matrix.include).toHaveLength(5)
    expect(matrix.include.every((entry) => entry.category === "account")).toBe(
      true,
    )
  })

  it("keeps the default all-category matrix unchanged", () => {
    const matrix = runMatrix()

    expect(matrix.include).toHaveLength(13)
  })

  it("rejects a target from a different category", () => {
    expect(() => runMatrix("account", "new-api-managed-site")).toThrow(
      /does not belong to category account/,
    )
  })
})
