// eslint-disable-next-line jsdoc/check-tag-names
/** @type {import('prettier').Config & import('prettier-plugin-tailwindcss').PluginOptions} */
export default {
  printWidth: 80,
  proseWrap: "never",
  tabWidth: 2,
  useTabs: false,
  semi: false,
  singleQuote: false,
  endOfLine: "auto",
  bracketSpacing: true,
  bracketSameLine: false,
  plugins: [
    "@ianvs/prettier-plugin-sort-imports",
    "prettier-plugin-tailwindcss",
  ],
  importOrder: [
    "<BUILTIN_MODULES>", // Node.js built-in modules
    "<THIRD_PARTY_MODULES>", // Imports not matched by other special words or groups.
    "", // Empty line
    "^@plasmo/(.*)$",
    "",
    "^@plasmohq/(.*)$",
    "",
    "^~(.*)$",
    "",
    "^[./]",
  ],
}
