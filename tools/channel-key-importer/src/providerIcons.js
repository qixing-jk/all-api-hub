import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const LOBE_ICON_ROOT = fileURLToPath(
  new URL("../../../node_modules/@lobehub/icons/es/", import.meta.url),
)

// Channel ids map only to the vendor represented by that channel. Third-party
// OpenAI-compatible services intentionally keep their letter fallback.
export const PROVIDER_ICON_NAMES = Object.freeze({
  openai: "OpenAI",
  midjourney: "Midjourney",
  azure: "Azure",
  ollama: "Ollama",
  "midjourney-plus": "Midjourney",
  palm: "PaLM",
  anthropic: "Anthropic",
  baidu: "Baidu",
  zhipu: "Zhipu",
  ali: "AlibabaCloud",
  xunfei: "IFlyTekCloud",
  360: "Ai360",
  openrouter: "OpenRouter",
  fastgpt: "FastGPT",
  tencent: "Hunyuan",
  gemini: "Gemini",
  moonshot: "Moonshot",
  "zhipu-v4": "Zhipu",
  perplexity: "Perplexity",
  aws: "Bedrock",
  cohere: "Cohere",
  minimax: "Minimax",
  suno: "Suno",
  dify: "Dify",
  jina: "Jina",
  cloudflare: "Cloudflare",
  siliconflow: "SiliconCloud",
  "vertex-ai": "VertexAI",
  mistral: "Mistral",
  deepseek: "DeepSeek",
  volcengine: "ByteDance",
  "baidu-v2": "BaiduCloud",
  xai: "Grok",
  coze: "Coze",
  kling: "Kling",
  jimeng: "Jimeng",
  vidu: "Vidu",
  submodel: "SubModel",
  "doubao-video": "Doubao",
  sora: "OpenAI",
  replicate: "Replicate",
  codex: "OpenAI",
})

const svgCache = new Map()

export async function getProviderIconSvg(providerId) {
  const iconName = PROVIDER_ICON_NAMES[providerId]
  if (!iconName) return null
  if (svgCache.has(iconName)) return svgCache.get(iconName)

  // @lobehub/icons is already the app's MIT-licensed icon source. Its Mono
  // component contains the canonical 24px SVG paths, which are served locally.
  const source = await readFile(
    join(LOBE_ICON_ROOT, iconName, "components", "Mono.js"),
    "utf8",
  )
  const viewBox = source.match(/viewBox: "([^"]+)"/)?.[1] || "0 0 24 24"
  const paths = [...source.matchAll(/\bd: "([^"]+)"/g)].map((match) => match[1])
  if (paths.length === 0) return null
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" fill="#2457d6" fill-rule="evenodd">`,
    `<title>${iconName}</title>`,
    ...paths.map((path) => `<path d="${path}"/>`),
    "</svg>",
  ].join("")
  svgCache.set(iconName, svg)
  return svg
}
