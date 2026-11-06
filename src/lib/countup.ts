import CountUpImport from "react-countup"

// Vite 8 uses Node's CJS default-import semantics for this ESM project.
// react-countup ships exports.default; Vitest exposes that component directly.
const countUpModule = CountUpImport as unknown as
  | typeof CountUpImport
  | { default: typeof CountUpImport }

const CountUp =
  "default" in countUpModule ? countUpModule.default : countUpModule

export default CountUp
