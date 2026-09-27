import path from "node:path"
import postcss from "postcss"
import { describe, expect, it } from "vitest"

import { contentRemIsolation } from "~~/plugins/content-rem-isolation.mjs"

describe("content stylesheet isolation", () => {
  const css =
    '@media (min-width: 40rem) { .control { --gap: .25rem; font-size: 1.25rem; margin: calc(-.5rem + 1em); content: "1rem"; background: url(/1rem.png); } }'
  it("converts declaration dimensions, including variables, without rewriting media queries or strings", async () => {
    const result = await postcss([contentRemIsolation()]).process(css, {
      from: path.resolve("src/styles/content.css"),
    })
    expect(result.css).toContain("--gap: 4px")
    expect(result.css).toContain("font-size: 20px")
    expect(result.css).toContain("calc(-8px + 1em)")
    expect(result.css).toContain("(min-width: 40rem)")
    expect(result.css).toContain('content: "1rem"')
    expect(result.css).toContain("url(/1rem.png)")
  })
  it("leaves extension document styles unchanged", async () => {
    const result = await postcss([contentRemIsolation()]).process(css, {
      from: path.resolve("src/styles/style.css"),
    })
    expect(result.css).toBe(css)
  })
})
