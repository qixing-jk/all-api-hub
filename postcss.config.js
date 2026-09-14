import tailwindcss from "@tailwindcss/postcss"
import autoprefixer from "autoprefixer"

const allApiHubRewriteTwProperties = () => ({
  postcssPlugin: "all-api-hub-rewrite-tw-properties",
  Once(root) {
    const OLD_PREFIX = "--tw-"
    const NEW_PREFIX = "--all-api-hub-tw-"

    // 1) Rename @property --tw-* → --all-api-hub-tw-*
    root.walkAtRules("property", (atRule) => {
      if (
        typeof atRule.params === "string" &&
        atRule.params.includes(OLD_PREFIX)
      ) {
        atRule.params = atRule.params.replaceAll(OLD_PREFIX, NEW_PREFIX)
      }
    })

    // 2) Rename custom property declarations and usages
    root.walkDecls((decl) => {
      if (
        decl.prop === "--tw-ring-shadow" ||
        decl.prop === "--tw-ring-offset-shadow"
      ) {
        // Older Chromium rejects an empty fallback for registered properties,
        // even when --tw-ring-inset is set. A transparent zero-sized shadow
        // keeps the outer ring valid; an explicit inset still takes precedence.
        decl.value = decl.value.replace(
          /var\(--tw-ring-inset,\s*\)/gu,
          "var(--tw-ring-inset, 0 0 #0000,)",
        )
      }

      if (decl.prop?.startsWith(OLD_PREFIX)) {
        decl.prop = decl.prop.replace(OLD_PREFIX, NEW_PREFIX)
      }

      if (typeof decl.value === "string" && decl.value.includes(OLD_PREFIX)) {
        decl.value = decl.value.replaceAll(OLD_PREFIX, NEW_PREFIX)
      }
    })
  },
})

allApiHubRewriteTwProperties.postcss = true

export default {
  plugins: [
    // Tailwind v4 core
    tailwindcss(),

    // Rewrite Tailwind internal CSS variables to an extension-specific prefix
    allApiHubRewriteTwProperties(),

    // Vendor prefixes last
    autoprefixer(),
  ],
}
