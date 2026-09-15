import { execFileSync, spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  compareColorTokenBaseline,
  findColorTokenViolations,
} from "~~/scripts/utils/color-tokens.mjs"

const guardPath = fileURLToPath(
  new URL("../../scripts/check-color-tokens.mjs", import.meta.url),
)
const temporaryRepos: string[] = []

/** Create an isolated index without reading or changing the user's staged files. */
function createGuardRepository(baseline = {}) {
  // Git hooks export GIT_INDEX_FILE and other repository-local settings.
  // Neither fixture commands nor the guard subprocess may inherit them.
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !/^GIT_/i.test(key)),
  )
  const directory = mkdtempSync(
    path.join(os.tmpdir(), "all-api-hub-color-guard-"),
  )
  temporaryRepos.push(directory)
  mkdirSync(path.join(directory, "src"))
  mkdirSync(path.join(directory, "scripts"))
  writeFileSync(
    path.join(directory, "scripts/color-token-baseline.json"),
    JSON.stringify(baseline),
  )
  const git = (...args: string[]) =>
    execFileSync("git", ["-c", "core.autocrlf=false", ...args], {
      cwd: directory,
      env,
      stdio: "pipe",
    })
  git("init", "--quiet")
  const check = (...args: string[]) =>
    spawnSync(process.execPath, [guardPath, ...args], {
      cwd: directory,
      env,
      encoding: "utf8",
    })
  return { directory, git, check }
}

afterEach(() => {
  vi.unstubAllEnvs()
  // These are only the absolute directories allocated by mkdtemp above.
  for (const directory of temporaryRepos.splice(0))
    rmSync(directory, { recursive: true, force: true })
})

describe("color token guard", () => {
  it("isolates fixture repositories from the Git environment exported by hooks", () => {
    const outer = createGuardRepository()
    writeFileSync(
      path.join(outer.directory, "src/outer.ts"),
      'const css = "text-foreground"',
    )
    outer.git("add", ".")
    const originalTree = outer.git("write-tree").toString()
    vi.stubEnv("GIT_DIR", path.join(outer.directory, ".git"))
    vi.stubEnv("GIT_WORK_TREE", outer.directory)
    vi.stubEnv("GIT_INDEX_FILE", path.join(outer.directory, ".git/index"))

    const inner = createGuardRepository()
    writeFileSync(
      path.join(inner.directory, "src/inner.ts"),
      'const css = "text-success-text"',
    )
    inner.git("add", ".")
    expect(
      path.resolve(inner.git("rev-parse", "--show-toplevel").toString().trim()),
    ).toBe(inner.directory)
    expect(inner.check("--staged").status).toBe(0)
    expect(outer.git("write-tree").toString()).toBe(originalTree)
  })

  it("finds palette utilities in variants, directional borders and template branches", () => {
    const quote = String.fromCharCode(96)
    const source =
      "const css = " +
      quote +
      'hover:bg-sky-600 border-l-rose-400 ${active ? "ring-emerald-500" : "text-stone-700"}' +
      quote
    expect(
      findColorTokenViolations("src/example.ts", source).map(
        (item) => item.token,
      ),
    ).toEqual([
      "bg-sky-600",
      "border-l-rose-400",
      "ring-emerald-500",
      "text-stone-700",
    ])
  })

  it("rejects arbitrary colors and bare palette variables in shared components", () => {
    const source =
      'const style = { color: "#ff0033", background: "rgba(1, 2, 3, .5)", border: "hsl(30 40% 50%)", fill: "var(--color-blue-600)" }'
    expect(
      findColorTokenViolations("src/components/ui/Notice.tsx", source).map(
        (item) => item.token,
      ),
    ).toEqual([
      "#ff0033",
      "rgba(1, 2, 3, .5)",
      "hsl(30 40% 50%)",
      "--color-blue-600",
    ])
  })

  it("ignores anchors and ordinary data strings without hiding style colors", () => {
    const source = [
      'const reference = "#123456";',
      'const record = { reference: "#abcdef", description: "rgb(1, 2, 3)" };',
      'const view = <a href="#abc" aria-label="#def" style={{ color: "#123" }}>Jump</a>;',
      'const foregroundColor = active ? "#456" : "#789";',
      'const axis = "#aabbcc";',
      'const chartOptions = { xAxis: { axisLine: { lineStyle: { color: "#ddeeff" } } } };',
      'context.fillStyle = "#112233";',
      'element.style.setProperty("color", "#445566");',
    ].join("\n")
    expect(
      findColorTokenViolations("src/example.tsx", source).map(
        (item) => item.token,
      ),
    ).toEqual([
      "#123",
      "#456",
      "#789",
      "#aabbcc",
      "#ddeeff",
      "#112233",
      "#445566",
    ])
  })

  it("checks arbitrary utility colors in standalone constants and template branches", () => {
    const source = [
      'const selected = "hover:bg-[#abc]";',
      'const view = <div className={`text-[#123456] ${active ? "border-[#def]" : "ring-[#fed]"}`} />;',
      'const svg = <svg fill={active ? "#456" : "#789"} />;',
    ].join("\n")
    expect(
      findColorTokenViolations("src/example.tsx", source).map(
        (item) => item.token,
      ),
    ).toEqual(["#abc", "#123456", "#def", "#fed", "#456", "#789"])
  })

  it("keeps selectors and conditions separate from the style values they choose", () => {
    const source = [
      'const style = document.querySelector("#abc");',
      'const color = palette["#123456"];',
      'const view = <div style={{ color: reference === "#def" ? "#456" : "#789" }} />;',
    ].join("\n")
    expect(
      findColorTokenViolations("src/example.tsx", source).map(
        (item) => item.token,
      ),
    ).toEqual(["#456", "#789"])
  })

  it("checks wrapped style literals without treating selector arguments as colors", () => {
    const source = [
      'const view = <div style={{ color: normalize("#fff"), borderColor: normalize("rgb(1 2 3)") }} />;',
      'const style = document.querySelector("#abc");',
      'const record = { id: normalize("#def") };',
    ].join("\n")
    expect(
      findColorTokenViolations("src/example.tsx", source).map(
        (item) => item.token,
      ),
    ).toEqual(["#fff", "rgb(1 2 3)"])
  })

  it.each([
    "oklch(60% 0.2 250)",
    "oklab(60% 0.1 0.1)",
    "lch(60% 40 250)",
    "lab(60% 20 30)",
    "hwb(250 10% 20%)",
    "color(display-p3 1 0 0)",
    "color(srgb-linear 0.1 0.2 0.3)",
  ])("finds modern color literal %s in JSX and CSS", (color) => {
    for (const [file, source] of [
      ["src/example.tsx", `<div style={{ color: "${color}" }} />`],
      ["src/example.css", `.label { color: ${color}; }`],
    ]) {
      expect(
        findColorTokenViolations(file, source).map((item) => item.token),
      ).toEqual([color])
    }
  })

  it("rejects white and black palette variables without matching longer role names", () => {
    const source =
      'const style = { color: "var(--color-white)", background: "var(--color-black)", borderColor: "var(--color-white-label)" }'
    expect(
      findColorTokenViolations("src/example.ts", source).map(
        (item) => item.token,
      ),
    ).toEqual(["--color-white", "--color-black"])
  })

  it("allows role-derived modern colors and URL fragments in styles", () => {
    const values = [
      "rgb(var(--foreground))",
      "oklch(var(--foreground))",
      "color(srgb var(--foreground))",
      "color-mix(in oklab, var(--foreground), var(--background))",
      "rgb(from var(--foreground) r g b / .5)",
      "url(#abc)",
    ]
    for (const value of values) {
      expect(
        findColorTokenViolations("src/example.tsx", `<svg fill="${value}" />`),
      ).toEqual([])
      expect(
        findColorTokenViolations(
          "src/example.css",
          `.label { background: ${value}; }`,
        ),
      ).toEqual([])
    }
  })

  it("ignores comments and supports role utilities and variable-based colors", () => {
    const source =
      '// issue #204, formerly bg-red-500\nconst css = "text-success-text bg-primary text-primary-foreground focus:ring-ring"; const color = "rgb(var(--foreground))"'
    expect(findColorTokenViolations("src/example.tsx", source)).toEqual([])
  })

  it("checks HTML attributes and CSS declarations without counting comments", () => {
    const html =
      '<!-- <b class="bg-red-500">#204</b> --><style>/* #fff */ p { color: #123456; }</style><div class="text-white" style="color: rgb(1,2,3)"></div>'
    expect(
      findColorTokenViolations("src/entrypoints/popup/index.html", html).map(
        (item) => item.token,
      ),
    ).toEqual(["#123456", "text-white", "rgb(1,2,3)"])
    expect(
      findColorTokenViolations(
        "src/feature.css",
        "/* #123 */ .field { color: #abc; @apply ring-blue-500; }",
      ).map((item) => item.token),
    ).toEqual(["#abc", "ring-blue-500"])
  })

  it("limits exemptions to definition owners and brand assets", () => {
    expect(
      findColorTokenViolations(
        "src/styles/colors.css",
        ":root { --success: #123456 }",
      ),
    ).toEqual([])
    expect(
      findColorTokenViolations("src/assets/brand.svg", '<svg fill="#123456"/>'),
    ).toEqual([])
    expect(
      findColorTokenViolations(
        "src/features/UsageAnalytics/charts/echartsOptions.ts",
        'const axis = "#123456"',
      ),
    ).toHaveLength(1)
  })

  it("rejects added occurrences and requires removed debt to leave the baseline", () => {
    const baseline = { "src/example.ts": { tokens: { "#123456": 1 } } }
    const one = findColorTokenViolations(
      "src/example.ts",
      'const color = "#123456"',
    )
    expect(compareColorTokenBaseline("src/example.ts", one, baseline)).toEqual(
      [],
    )
    expect(
      compareColorTokenBaseline("src/example.ts", [...one, ...one], baseline),
    ).toHaveLength(1)
    expect(compareColorTokenBaseline("src/new.ts", one, baseline)).toHaveLength(
      1,
    )
    expect(compareColorTokenBaseline("src/example.ts", [], baseline)).toEqual([
      "src/example.ts: Remove the unused baseline allowance for #123456.",
    ])
  })

  it("checks the index independently of unstaged source and baseline edits", () => {
    const { directory, git, check } = createGuardRepository()
    const source = path.join(directory, "src/example.ts")
    writeFileSync(source, 'const css = "text-success-text"')
    git("add", ".")
    writeFileSync(source, 'const css = "text-red-600"')
    expect(check("--staged").status).toBe(0)
    expect(check().stderr).toContain("Use a color role instead of text-red-600")
    git("add", "src/example.ts")
    // An unstaged exception cannot hide an invalid staged color.
    writeFileSync(
      path.join(directory, "scripts/color-token-baseline.json"),
      JSON.stringify({ "src/example.ts": { tokens: { "text-red-600": 1 } } }),
    )
    const staged = check("--staged")
    expect(staged.status).toBe(1)
    expect(staged.stderr).toContain("Use a color role instead of text-red-600")
  })

  it("reads indexed UTF-8 contents with spaced paths, shared blobs and empty files", () => {
    const { directory, git, check } = createGuardRepository()
    const shared = 'const label = "图表 🎨";\r\nconst color = "#123456"'
    for (const file of ["src/共享 colors.ts", "src/copy colors.ts"]) {
      writeFileSync(path.join(directory, file), shared)
    }
    writeFileSync(path.join(directory, "src/empty.ts"), "")
    writeFileSync(
      path.join(directory, "src/next.ts"),
      'const color = "rgb(1, 2, 3)"',
    )
    // Report mode also works without an indexed baseline.
    git("add", "src")
    writeFileSync(
      path.join(directory, "src/共享 colors.ts"),
      'const color = "var(--foreground)"',
    )

    const result = check("--staged", "--report")
    expect(result.stderr).toBe("")
    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout)).toEqual({
      "src/共享 colors.ts": [{ token: "#123456", line: 2, column: 16 }],
      "src/copy colors.ts": [{ token: "#123456", line: 2, column: 16 }],
      "src/next.ts": [{ token: "rgb(1, 2, 3)", line: 1, column: 16 }],
    })
  })

  it("rechecks unchanged indexed sources when the guard changes", () => {
    const { directory, git, check } = createGuardRepository()
    writeFileSync(
      path.join(directory, "src/unchanged.ts"),
      'const color = "#123456"',
    )
    git("add", ".")
    git(
      "-c",
      "user.name=Color guard test",
      "-c",
      "user.email=color-guard@example.invalid",
      "-c",
      "commit.gpgsign=false",
      "-c",
      "core.hooksPath=.git/hooks",
      "commit",
      "--quiet",
      "-m",
      "fixture",
    )
    writeFileSync(
      path.join(directory, "src/changed.ts"),
      'const css = "text-foreground"',
    )
    git("add", "src/changed.ts")
    expect(JSON.parse(check("--staged", "--report").stdout)).toEqual({})
    writeFileSync(
      path.join(directory, "scripts/check-color-tokens.mjs"),
      "// Updated guard\n",
    )
    git("add", "scripts/check-color-tokens.mjs")
    expect(JSON.parse(check("--staged", "--report").stdout)).toEqual({
      "src/unchanged.ts": [{ token: "#123456", line: 1, column: 16 }],
    })
  })

  it("requires the baseline to shrink when a source file is deleted", () => {
    const { directory, git, check } = createGuardRepository({
      "src/example.ts": { tokens: { "#123456": 1 } },
    })
    writeFileSync(
      path.join(directory, "src/example.ts"),
      'const color = "#123456"',
    )
    git("add", ".")
    expect(check("--staged").status).toBe(0)
    git("rm", "--force", "src/example.ts")
    expect(check("--staged").stderr).toContain(
      "Remove the unused baseline allowance for #123456",
    )
    expect(check().stderr).toContain(
      "Remove the unused baseline allowance for #123456",
    )
  })
})
