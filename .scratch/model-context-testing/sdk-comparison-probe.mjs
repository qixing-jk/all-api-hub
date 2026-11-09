/**
 * Read-only SDK selection experiment; does not contact model providers.
 * Prerequisites (from repo root):
 * Requires the repository's installed dev dependencies and Playwright Chromium.
 * npm install --prefix .scratch/model-context-testing/artifacts/sdk-comparison-20261109 --ignore-scripts --no-audit --no-fund --save-exact @mariozechner/pi-ai@0.73.1 @earendil-works/pi-ai@1.5.0 @opencode/ai@2.2.6
 * node .scratch/model-context-testing/sdk-comparison-probe.mjs
 * node .scratch/model-context-testing/sdk-comparison-probe.mjs --vite
 * Each run preserves its evidence in a separate runs/ directory.
 * Build/browser failures or attempted network requests fail the experiment.
 * Policy differences are observations, not proven SDK misclassifications.
 * Synthetic status/text conflicts have no established real-world provenance.
 * Output stays under the ignored artifacts directory. Full extension migration
 * and minimum-version browser compatibility are outside this experiment.
 */
import { execFileSync } from "node:child_process"
import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { gzipSync } from "node:zlib"
import { build, version as esbuildVersion } from "esbuild"
import { chromium } from "playwright"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const lab = path.join(
  root,
  ".scratch/model-context-testing/artifacts/sdk-comparison-20261109",
)
const useVite = process.argv.includes("--vite")
await mkdir(path.join(lab, "runs"), { recursive: true })
const runDir = await mkdtemp(
  path.join(lab, "runs", useVite ? "vite-" : "esbuild-"),
)
const out = path.join(runDir, "bundles")
await mkdir(out, { recursive: true })

const cases = [
  {
    name: "original SSE",
    status: 400,
    code: 400,
    message:
      "This endpoint's maximum context length is 1000000 tokens. However, you requested about 1290675 tokens (1290547 of text input, 128 in the output).",
    expectedBound: true,
  },
  {
    name: "multiline SSE",
    status: 400,
    message:
      "This endpoint's maximum context length is 1000000 tokens.\nHowever, you requested about 1290675 tokens.",
    expectedBound: true,
  },
  {
    name: "symbolic code without HTTP status",
    code: "context_length_exceeded",
    message: "Request rejected",
    expectedBound: true,
  },
  {
    name: "explicit text without HTTP status",
    message: "prompt is too long: 213462 tokens > 200000 maximum",
    expectedBound: true,
  },
  {
    name: "Gemini input token limit",
    status: 400,
    message:
      "The input token count (1196265) exceeds the maximum number of tokens allowed (1048575)",
    expectedBound: true,
  },
  {
    name: "nested provider code",
    message: "Upstream rejected the request",
    rawBody:
      '{"error":{"code":"context_length_exceeded","message":"Request rejected"}}',
    expectedBound: true,
  },
  {
    name: "rate limit",
    status: 429,
    message: "Rate limit exceeded: too many tokens per minute",
    expectedBound: false,
  },
  {
    name: "HTTP 429 with context wording",
    status: 429,
    message: "maximum context length is 8192 tokens",
    expectedBound: false,
  },
  {
    name: "HTTP 500 with context wording",
    status: 500,
    message: "maximum context length is 8192 tokens",
    expectedBound: false,
  },
  {
    name: "unrelated context declaration",
    status: 400,
    message: "Invalid setting. The maximum context length is 8192 tokens.",
    expectedBound: false,
  },
  {
    name: "request byte limit",
    status: 413,
    code: "request_too_large",
    message: "Request exceeds the maximum size",
    expectedBound: false,
  },
  {
    name: "unknown provider empty 400",
    status: 400,
    message: "400 status code (no body)",
    expectedBound: false,
  },
  {
    name: "user field string limit",
    status: 400,
    message: "Invalid 'user': string too long",
    expectedBound: false,
  },
  {
    name: "output parameter limit",
    status: 400,
    message: "Too many tokens: max_tokens must be less than 4096",
    expectedBound: false,
  },
  {
    name: "HTTP 429 with explicit context code",
    status: 429,
    code: "context_length_exceeded",
    message: "Request rejected",
    expectedBound: false,
  },
  {
    name: "HTTP 401 with context wording",
    status: 401,
    message: "prompt is too long: 213462 tokens > 200000 maximum",
    expectedBound: false,
  },
  {
    name: "HTTP 403 with explicit context code",
    status: 403,
    code: "context_length_exceeded",
    message: "Request rejected",
    expectedBound: false,
  },
  {
    name: "Google nested invalid API key",
    status: 400,
    message: "Invalid argument",
    rawBody:
      '{"error":{"status":"INVALID_ARGUMENT","details":[{"reason":"API_KEY_INVALID"}]}}',
    expectedBound: false,
  },
  {
    name: "HTTP 429 account quota exhausted",
    status: 429,
    code: "insufficient_quota",
    message: "Account balance is insufficient",
    expectedBound: false,
  },
  {
    name: "statusless overloaded error",
    code: "overloaded_error",
    message: "Please retry later",
    expectedBound: false,
  },
  {
    name: "plain payload byte limit",
    status: 413,
    message: "Payload too large",
    expectedBound: false,
  },
  {
    name: "Z.ai Chinese prompt overflow",
    status: 400,
    code: "1261",
    message: "Prompt 超长",
    expectedBound: true,
  },
  {
    name: "Bedrock Nova input length",
    message: "number of input tokens exceeds maximum length",
    expectedBound: true,
  },
  {
    name: "Cloudflare explicit context overflow on 413",
    status: 413,
    message: "exceeded this model context window limit",
    expectedBound: true,
  },
  {
    name: "DeepInfra input length",
    status: 400,
    message: "requested input length 120000 exceeds maximum input length",
    expectedBound: true,
  },
  {
    name: "Copilot opaque formatted 413",
    message:
      'github-copilot API error (413): {"message":"failed to parse request","code":""}',
    expectedBound: false,
  },
  {
    name: "reported Groq output parameter limit (verbatim message)",
    status: 400,
    message:
      "`max_tokens` must be less than or equal to `16384`, the maximum value for `max_tokens` is less than the `context_window` for this model",
    source: "https://github.com/anomalyco/opencode/issues/1000",
    expectedBound: false,
  },
]

// The boolean in the original fixture list records the earlier conservative
// probe policy. It is not an oracle for provider behavior or SDK correctness.
const hypotheticalCases = new Set([
  "HTTP 429 with context wording",
  "HTTP 500 with context wording",
  "unrelated context declaration",
  "HTTP 429 with explicit context code",
  "HTTP 401 with context wording",
  "HTTP 403 with explicit context code",
])
for (const sample of cases) {
  sample.expectedUnderEarlierPolicy = sample.expectedBound
  delete sample.expectedBound
  sample.provenance = sample.source
    ? "public user report; verbatim message replay, not a live provider reproduction"
    : sample.name === "original SSE"
      ? "normalized user-reported response; status derived from SSE code, not observed HTTP headers"
      : hypotheticalCases.has(sample.name)
        ? "synthetic combination; real-world occurrence not established"
        : "constructed fixture or source-derived example; not a live provider response"
}

const current = `
import { APICallError, StreamProviderError } from "ai";
import { classifyContextError } from ${JSON.stringify(path.join(root, "src/services/verification/modelQuality/contextErrors.ts").replaceAll("\\", "/"))};
globalThis.sdkCompare = { classify(input) {
  const error = input.rawBody ? new APICallError({message: input.message, statusCode: input.status, responseBody: input.rawBody, url:"https://example.invalid", requestBodyValues:{}}) : new StreamProviderError({message:input.message,statusCode:input.status,code:input.code});
  const outcome = classifyContextError(error);
  return {overflow: outcome === "context-limit", classification: outcome};
}};
`
const pi = (module) => `
import { isContextOverflow } from ${JSON.stringify(module)};
globalThis.sdkCompare = { classify(input) {
  const overflow = isContextOverflow({stopReason:"error",errorMessage:[input.message,input.rawBody,input.code].filter(Boolean).join(" "),provider:"test"});
  return {overflow,classification:overflow?"overflow":"other"};
}};
`
const opencode = `
import { classifyProviderFailure } from "@opencode/ai/route";
globalThis.sdkCompare = { classify(input) {
  const reason = classifyProviderFailure({message:input.message,status:input.status,rawBody:input.rawBody,data: input.code === undefined ? undefined : {code: input.code}});
  return {overflow: reason._tag === "InvalidRequest" && reason.classification === "context-overflow",classification:reason.classification ?? reason._tag};
}};
`
const inferenceBaseline = `
import {generateText,streamText,tool,jsonSchema,Output} from "ai";
import {createOpenAI} from "@ai-sdk/openai";
import {createOpenAICompatible} from "@ai-sdk/openai-compatible";
import {createAnthropic} from "@ai-sdk/anthropic";
import {createGoogle} from "@ai-sdk/google";
globalThis.sdkSurface={generateText,streamText,tool,jsonSchema,Output,createOpenAI,createOpenAICompatible,createAnthropic,createGoogle};
`
const entries = {
  "current-classifier": current,
  "pi-legacy-root-classifier": pi("@mariozechner/pi-ai"),
  "pi-current-root-classifier": pi("@earendil-works/pi-ai"),
  "pi-current-utils-classifier": pi("@earendil-works/pi-ai/utils/overflow"),
  "opencode-route-classifier": opencode,
  "ai-sdk-inference-surface": inferenceBaseline,
  "ai-sdk-plus-pi-utils":
    inferenceBaseline + pi("@earendil-works/pi-ai/utils/overflow"),
  "ai-sdk-plus-opencode-route": inferenceBaseline + opencode,
}
const report = {
  head: execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim(),
  node: process.version,
  esbuild: esbuildVersion,
  bundler: useVite ? "vite" : "esbuild",
  target: ["chrome107", "edge107", "firefox104", "safari16"],
  condition: "browser",
  scope: "isolated minified browser IIFEs, not full extension bundle deltas",
  cases,
  results: [],
}
const vite = useVite ? await import("vite") : undefined
if (vite) report.vite = vite.version

for (const [name, source] of Object.entries(entries)) {
  // Vite confirms the maintained public entries and their incremental cost.
  if (
    useVite &&
    [
      "current-classifier",
      "pi-legacy-root-classifier",
      "pi-current-root-classifier",
    ].includes(name)
  )
    continue
  const entry = path.join(runDir, name + ".ts")
  await writeFile(entry, source)
  try {
    if (vite) {
      const result = await vite.build({
        root: runDir,
        configFile: false,
        logLevel: "silent",
        resolve: { conditions: ["browser", "module", "production"] },
        define: { "process.env.NODE_ENV": '"production"' },
        build: {
          write: false,
          target: report.target,
          minify: "oxc",
          sourcemap: false,
          lib: { entry, name: "SdkComparison", formats: ["iife"] },
        },
      })
      const outputs = Array.isArray(result) ? result : [result]
      const chunks = outputs
        .flatMap((item) => item.output)
        .filter((item) => item.type === "chunk")
      if (chunks.length !== 1)
        throw new Error(`Expected one IIFE chunk, received ${chunks.length}`)
      const js = chunks[0].code
      await writeFile(path.join(out, name + ".js"), js)
      report.results.push({
        name,
        build: "passed",
        bytes: Buffer.byteLength(js),
        gzipBytes: gzipSync(js).byteLength,
        inputs: Object.keys(chunks[0].modules).length,
      })
      continue
    }
    const result = await build({
      absWorkingDir: lab,
      entryPoints: [entry],
      outfile: path.join(out, name + ".js"),
      bundle: true,
      write: false,
      metafile: true,
      minify: true,
      legalComments: "none",
      platform: "browser",
      format: "iife",
      target: report.target,
      conditions: ["browser"],
      define: { "process.env.NODE_ENV": '"production"' },
      tsconfigRaw: { compilerOptions: { target: "ES2022" } },
      logLevel: "silent",
    })
    const js = result.outputFiles.find((file) =>
      file.path.endsWith(".js"),
    ).contents
    await writeFile(path.join(out, name + ".js"), js)
    await writeFile(
      path.join(out, name + ".meta.json"),
      JSON.stringify(result.metafile, null, 2),
    )
    report.results.push({
      name,
      build: "passed",
      bytes: js.byteLength,
      gzipBytes: gzipSync(js).byteLength,
      inputs: Object.keys(result.metafile.inputs).length,
      warnings: result.warnings.map((item) => item.text),
    })
  } catch (error) {
    report.results.push({
      name,
      build: "failed",
      error: String(error),
      errors: (error.errors ?? []).map((item) => ({
        text: item.text,
        file: item.location?.file,
      })),
    })
  }
}

let browser
try {
  browser = await chromium.launch({ headless: true })
  report.browser = browser.version()
  for (const result of report.results.filter(
    (item) => item.build === "passed",
  )) {
    const page = await browser.newPage()
    const unexpectedRequests = []
    await page.route("**/*", (route) => {
      unexpectedRequests.push(route.request().url())
      return route.abort()
    })
    const pageErrors = []
    page.on("pageerror", (error) => pageErrors.push(error.message))
    try {
      await page.addScriptTag({ path: path.join(out, result.name + ".js") })
      const observations = await page.evaluate((inputs) => {
        if (!globalThis.sdkCompare)
          return { surfaceExports: Object.keys(globalThis.sdkSurface ?? {}) }
        return inputs.map((input) => ({
          name: input.name,
          ...globalThis.sdkCompare.classify(input),
        }))
      }, cases)
      const expectedSurface = [
        "generateText",
        "streamText",
        "tool",
        "jsonSchema",
        "Output",
        "createOpenAI",
        "createOpenAICompatible",
        "createAnthropic",
        "createGoogle",
      ]
      const validObservations = Array.isArray(observations)
        ? observations.length === cases.length &&
          observations.every(
            (item, index) =>
              item.name === cases[index].name &&
              typeof item.overflow === "boolean",
          )
        : expectedSurface.every((name) =>
            observations.surfaceExports.includes(name),
          )
      result.browser = {
        status:
          pageErrors.length || unexpectedRequests.length || !validObservations
            ? "failed"
            : "passed",
        observations,
        errors: pageErrors,
        unexpectedRequests,
      }
      if (Array.isArray(observations))
        result.policyDifferences = observations
          .filter(
            (item, index) =>
              item.overflow !== cases[index].expectedUnderEarlierPolicy,
          )
          .map((item) => item.name)
    } catch (error) {
      result.browser = {
        status: "failed",
        error: String(error),
        errors: pageErrors,
        unexpectedRequests,
      }
    } finally {
      await page.close()
    }
  }
} catch (error) {
  report.browserError = String(error)
} finally {
  await browser?.close()
}

report.evidenceDirectory = path.relative(root, runDir).replaceAll("\\", "/")
report.passed =
  !report.browserError &&
  report.results.every(
    (result) =>
      result.build === "passed" && result.browser?.status === "passed",
  )
await writeFile(
  path.join(runDir, "comparison-results.json"),
  JSON.stringify(report, null, 2),
)
console.log(JSON.stringify(report, null, 2))
if (!report.passed) process.exitCode = 1
