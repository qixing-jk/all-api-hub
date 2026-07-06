import assert from "node:assert/strict"
import test from "node:test"

import {
  getProviderIconSvg,
  PROVIDER_ICON_NAMES,
} from "../src/providerIcons.js"

test("renders local vendor SVGs for mapped New API channels", async () => {
  const svg = await getProviderIconSvg("openai")

  assert.equal(PROVIDER_ICON_NAMES.deepseek, "DeepSeek")
  assert.equal(PROVIDER_ICON_NAMES.zhipu, "Zhipu")
  assert.match(svg, /^<svg /)
  assert.match(svg, /<title>OpenAI<\/title>/)
  assert.match(svg, /<path d="M/)
})

test("uses the Zhipu platform mark instead of the ChatGLM model mark", async () => {
  const svg = await getProviderIconSvg("zhipu")

  assert.match(svg, /<title>Zhipu<\/title>/)
  assert.doesNotMatch(svg, /ChatGLM/)
})

test("keeps an explicit fallback for unverified compatibility services", async () => {
  assert.equal(await getProviderIconSvg("openai-max"), null)
  assert.equal(await getProviderIconSvg("custom"), null)
})
