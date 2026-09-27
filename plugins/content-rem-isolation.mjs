import path from "node:path"
import valueParser from "postcss-value-parser"

const CONTENT_STYLESHEET = path.resolve("src/styles/content.css")
const CONTENT_ROOT_SIZE = 16

/** Isolate content UI dimensions from the host root without changing document CSS. */
export function contentRemIsolation() {
  return {
    postcssPlugin: "all-api-hub-content-rem-isolation",
    OnceExit(root, { result }) {
      if (path.resolve(result.opts.from ?? "") !== CONTENT_STYLESHEET) return
      root.walkDecls((declaration) => {
        const parsed = valueParser(declaration.value)
        parsed.walk((node) => {
          if (node.type === "function" && node.value.toLowerCase() === "url")
            return false
          if (node.type !== "word") return
          const unit = valueParser.unit(node.value)
          if (unit && unit.unit.toLowerCase() === "rem")
            node.value = `${Number(unit.number) * CONTENT_ROOT_SIZE}px`
        })
        declaration.value = parsed.toString()
      })
    },
  }
}
