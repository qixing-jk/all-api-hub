/**
 * One-click "pelican test".
 *
 * The drawing is judged by eye. This module extracts SVG markup, reports shape
 * counts and flags unsafe content; it does not infer model identity or quality.
 */
import {
  createAgentTestEnvironment,
  type AgentTestCall,
  type AgentTestFile,
} from "~/services/verification/agentTest/environment"
import {
  createAgentTestInstructions,
  type AgentTestTask,
} from "~/services/verification/agentTest/instructions"
import { runProbeGeneration } from "~/services/verification/aiApiVerification/probes/probeGeneration"
import { createModel } from "~/services/verification/aiApiVerification/providers"
import {
  API_VERIFICATION_MODES,
  type ApiVerificationApiType,
  type ApiVerificationMode,
  type ApiVerificationRequestProfile,
} from "~/services/verification/aiApiVerification/types"
import {
  inferStructuredHttpStatus,
  isAbortError,
  toSanitizedErrorSummary,
} from "~/services/verification/aiApiVerification/utils"
import {
  AGENT_TEST_OUTCOMES,
  PELICAN_EXECUTION_MODES,
  type PelicanExecutionMode,
} from "~/services/verification/modelQuality/constants"

/** Built-in drawing prompt; users may replace it in the verification panel. */
export const PELICAN_TEST_PROMPT =
  "Generate an SVG of a pelican riding a bicycle"

const PELICAN_AGENT_TASK = {
  artifactPath: "pelican.svg",
} satisfies AgentTestTask

const SHAPE_TAGS = [
  "path",
  "circle",
  "ellipse",
  "rect",
  "polygon",
  "polyline",
  "line",
] as const

export type PelicanSvgAnalysis = {
  hasSvg: boolean
  /** False when the markup contains script-like or external content. */
  safe: boolean
  viewBox: string | null
  byteSize: number
  counts: Record<(typeof SHAPE_TAGS)[number], number> & {
    text: number
    group: number
  }
  shapeCount: number
  /** Circles and ellipses: the usual stand-in for the two wheels. */
  wheelClues: number
}

export type PelicanTestResult = {
  runAt: number
  latencyMs: number
  text: string
  svg: string | null
  analysis: PelicanSvgAnalysis
  agent?: {
    steps: number
    outcome: (typeof AGENT_TEST_OUTCOMES)[keyof typeof AGENT_TEST_OUTCOMES]
    files: AgentTestFile[]
    calls: AgentTestCall[]
  }
}

export type RunPelicanTestParams = {
  baseUrl: string
  apiKey: string
  requestHeaders?: Record<string, string>
  requestProfile?: ApiVerificationRequestProfile
  requestProfileEnhanced?: boolean
  apiType: ApiVerificationApiType
  modelId: string
  mode?: ApiVerificationMode
  executionMode?: PelicanExecutionMode
  /** Overrides the built-in drawing prompt when non-blank. */
  prompt?: string
  abortSignal?: AbortSignal
}

export type { PelicanExecutionMode } from "./constants"

const nowMs = () =>
  typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now()

/**
 * Pull the first complete `<svg>` element out of a model answer.
 *
 * Models often wrap the markup in fences or prose even when told not to, so the
 * element is located directly instead of requiring an exact response.
 */
export function extractPelicanSvg(text: unknown): string | null {
  if (typeof text !== "string") return null

  const start = text.search(/<svg[\s>]/i)
  if (start < 0) return null
  const end = text.toLowerCase().indexOf("</svg>", start)
  if (end < 0) return null

  return text.slice(start, end + "</svg>".length).trim()
}

const UNSAFE_MARKUP_PATTERNS = [
  /<script[\s>]/i,
  /<foreignObject[\s>]/i,
  /<iframe[\s>]/i,
  /<image[\s>]/i,
  /<object[\s>]/i,
  /\son[a-z]+\s*=/i,
  // Any reference that is not a same-document fragment could load remote content.
  /(?:xlink:)?href\s*=\s*["'](?!#)/i,
  /\burl\s*\(\s*["']?(?!data:)/i,
]

const countTag = (svg: string, tag: string) =>
  (svg.match(new RegExp(`<${tag}[\\s/>]`, "gi")) ?? []).length

/**
 * Report what the SVG contains and whether it is safe to inline.
 */
export function analyzePelicanSvg(svg: string | null): PelicanSvgAnalysis {
  const empty = {
    hasSvg: false,
    safe: true,
    viewBox: null,
    byteSize: 0,
    counts: {
      path: 0,
      circle: 0,
      ellipse: 0,
      rect: 0,
      polygon: 0,
      polyline: 0,
      line: 0,
      text: 0,
      group: 0,
    },
    shapeCount: 0,
    wheelClues: 0,
  } satisfies PelicanSvgAnalysis

  if (!svg) return empty

  const counts = { ...empty.counts }
  for (const tag of SHAPE_TAGS) counts[tag] = countTag(svg, tag)
  counts.text = countTag(svg, "text")
  counts.group = countTag(svg, "g")

  const shapeCount = SHAPE_TAGS.reduce((total, tag) => total + counts[tag], 0)
  const viewBox = svg.match(/viewBox\s*=\s*["']([^"']*)["']/i)?.[1] ?? null
  const safe = !UNSAFE_MARKUP_PATTERNS.some((pattern) => pattern.test(svg))

  return {
    hasSvg: true,
    safe,
    viewBox,
    byteSize: svg.length,
    counts,
    shapeCount,
    wheelClues: counts.circle + counts.ellipse,
  }
}

/**
 * Ask the model for a pelican SVG and return the markup plus its analysis.
 * @throws {DOMException} An `AbortError` when the caller stops the request.
 */
export async function runPelicanTest(
  params: RunPelicanTestParams,
): Promise<PelicanTestResult> {
  const mode = params.mode ?? API_VERIFICATION_MODES.NonStreaming
  const secretsToRedact = [
    params.apiKey,
    ...Object.values(params.requestHeaders ?? {}),
  ]

  params.abortSignal?.throwIfAborted()

  const startedAt = nowMs()
  const runAt = Date.now()

  try {
    const model = createModel({
      baseUrl: params.baseUrl,
      apiKey: params.apiKey,
      ...(params.requestHeaders
        ? { requestHeaders: params.requestHeaders }
        : {}),
      apiType: params.apiType,
      requestProfile: params.requestProfile,
      requestProfileEnhanced: params.requestProfileEnhanced,
      modelId: params.modelId,
    })

    const environment =
      params.executionMode === PELICAN_EXECUTION_MODES.Agent
        ? createAgentTestEnvironment(params.abortSignal)
        : null
    let steps = 0
    const result = await runProbeGeneration(
      {
        model,
        prompt: params.prompt?.trim() || PELICAN_TEST_PROMPT,
        ...(environment
          ? {
              system: createAgentTestInstructions(PELICAN_AGENT_TASK),
              tools: environment.tools,
              // Keep the SDK from applying its default single-step stop. The
              // model's final response or caller cancellation ends this run.
              stopWhen: () => false,
              toolCallConcurrency: 1,
              onStepEnd: () => {
                steps++
              },
            }
          : {}),
        abortSignal: params.abortSignal,
        maxRetries: 0,
      },
      mode,
    )
    const text = result.text ?? ""
    const files = environment?.snapshot()
    const svg = extractPelicanSvg(
      environment
        ? files?.find((file) => file.path === PELICAN_AGENT_TASK.artifactPath)
            ?.content
        : text,
    )

    return {
      runAt,
      latencyMs: Math.max(0, Math.round(nowMs() - startedAt)),
      text,
      svg,
      analysis: analyzePelicanSvg(svg),
      ...(environment
        ? {
            agent: {
              steps,
              outcome: svg
                ? AGENT_TEST_OUTCOMES.Completed
                : AGENT_TEST_OUTCOMES.NoArtifact,
              files: files!,
              calls: environment.calls,
            },
          }
        : {}),
    }
  } catch (error) {
    if (isAbortError(error, params.abortSignal)) {
      throw new DOMException("Aborted", "AbortError")
    }

    // Preserve actionable diagnostics for the caller while keeping secrets out.
    const status = inferStructuredHttpStatus(error)
    const summary = toSanitizedErrorSummary(error, secretsToRedact)
    const wrapped = new Error(
      status ? `HTTP ${status}: ${summary}` : summary,
    ) as Error & { status?: number }
    if (typeof status === "number") wrapped.status = status
    throw wrapped
  }
}
