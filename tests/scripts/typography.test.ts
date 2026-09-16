import { describe, expect, it } from "vitest"

import { findTypographyViolations } from "~~/scripts/utils/typography.mjs"

describe("typography guard", () => {
  it("detects arbitrary responsive sizes, inline styles, CSS and Canvas fonts", () => {
    expect(
      findTypographyViolations(
        "src/example.tsx",
        'const a = <p className="sm:text-[11px]" style={{fontSize: 12}} />',
      ),
    ).toHaveLength(2)
    expect(
      findTypographyViolations(
        "src/example.css",
        ".text { font-size: 12px; font: 14px Arial }",
      ),
    ).toHaveLength(2)
    expect(
      findTypographyViolations("src/example.ts", 'context.font = "14px Arial"'),
    ).toHaveLength(1)
    expect(
      findTypographyViolations(
        "src/example.html",
        '<p style="font-size:10px">Text</p>',
      ),
    ).toHaveLength(1)
    expect(
      findTypographyViolations(
        "src/example.tsx",
        "const a = <p style={{fontSize}} />",
      ),
    ).toHaveLength(1)
    expect(
      findTypographyViolations(
        "src/example.ts",
        'el.style.setProperty("font-size", "12px")',
      ),
    ).toHaveLength(1)
    expect(
      findTypographyViolations(
        "src/example.ts",
        'el.style.setProperty("font-size", "var(--font-size-sm)")',
      ),
    ).toEqual([])
  })
  it("accepts shared utilities, relative sizes and specifically declared artwork exceptions", () => {
    const source =
      'const a = "text-2xs text-sm sm:text-xs text-[0.85em] text-[length:calc(0.8rem+var(--text-size-increment))] text-[var(--foreground)]"'
    expect(findTypographyViolations("src/example.ts", source)).toEqual([])
    expect(
      findTypographyViolations(
        "src/components/icons/InitialsIcon.tsx",
        'const a = "text-[8px] text-[9px]"',
      ),
    ).toEqual([])
    expect(
      findTypographyViolations(
        "src/components/icons/InitialsIcon.tsx",
        'const a = "text-[10px]"',
      ),
    ).toHaveLength(1)
    expect(
      findTypographyViolations(
        "src/example.css",
        ".text { font-size: var(--font-size-sm); font: inherit }",
      ),
    ).toEqual([])
  })
})
