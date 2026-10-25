import { tool } from "ai"
import { z } from "zod"

import { AGENT_TEST_TOOL_NAMES } from "~/services/verification/agentTest/constants"

/** Small, disposable workspace shared by the tools in one verification run. */
export type AgentTestFile = { path: string; content: string }
export type AgentTestCall = {
  toolName: string
  input: unknown
  output: unknown
}

const AGENT_TEST_LIMITS = {
  workspaceBytes: 64 * 1024 * 1024,
  outputChars: 64 * 1024,
  executionMs: 5000,
  maxExecutionMs: 60000,
  memoryMb: 128,
  minMemoryMb: 16,
  maxMemoryMb: 1024,
  stackBytes: 1024 * 1024,
} as const

const pathSchema = z.string().min(1)
const fileSchema = z.object({ path: pathSchema })

/** Resolve familiar absolute/relative paths inside the virtual workspace. */
function normalizePath(path: string): string {
  if (typeof path !== "string" || path.includes("\0") || path.includes("\\")) {
    throw new Error("Invalid virtual file path")
  }
  const parts: string[] = []
  for (const part of path.split("/")) {
    if (!part || part === ".") continue
    if (part === "..") {
      if (!parts.length)
        throw new Error("Path points outside the virtual workspace")
      parts.pop()
    } else parts.push(part)
  }
  if (!parts.length) throw new Error("A file path is required")
  return parts.join("/")
}

/** Returns JSON-safe feedback without exposing any host objects to guest code. */
async function executeJavaScript(
  code: string,
  files: AgentTestFile[],
  signal?: AbortSignal,
  options: { timeout_ms?: number; memory_mb?: number } = {},
) {
  signal?.throwIfAborted()
  const [{ newQuickJSWASMModuleFromVariant }, { default: variant }] =
    await Promise.all([
      import("quickjs-emscripten-core"),
      import("@jitl/quickjs-singlefile-browser-release-sync"),
    ])
  const engine = await newQuickJSWASMModuleFromVariant(variant)
  signal?.throwIfAborted()
  const runtime = engine.newRuntime()
  runtime.setMemoryLimit(
    (options.memory_mb ?? AGENT_TEST_LIMITS.memoryMb) * 1024 * 1024,
  )
  runtime.setMaxStackSize(AGENT_TEST_LIMITS.stackBytes)
  const deadline =
    Date.now() + (options.timeout_ms ?? AGENT_TEST_LIMITS.executionMs)
  runtime.setInterruptHandler(
    () => Boolean(signal?.aborted) || Date.now() > deadline,
  )
  const vm = runtime.newContext()
  try {
    // Data crosses this boundary as JSON only. Each execution has fresh globals;
    // files are committed by the host only after successful, bounded execution.
    const result = vm.evalCode(`(async () => {
      const files = new Map(${JSON.stringify(files.map(({ path, content }) => [path, content]))});
      const normalizePath = ${normalizePath.toString()};
      const logs = [];
      let truncated = false;
      let logChars = 0;
      const fs = Object.freeze({
        listFiles: () => [...files.keys()].sort(),
        readFile: (path) => { path = normalizePath(path); if (!files.has(path)) throw new Error("File not found: " + path); return files.get(path); },
        writeFile: (path, content) => {
          if (typeof path !== "string" || typeof content !== "string") throw new Error("path and content must be strings");
          files.set(normalizePath(path), content);
        }
      });
      const log = (...args) => {
        const line = args.map(value => typeof value === "string" ? value : JSON.stringify(value)).join(" ");
        const remaining = ${AGENT_TEST_LIMITS.outputChars} - logChars;
        if (line.length > remaining) truncated = true;
        if (remaining > 0) { const kept = line.slice(0, remaining); logs.push(kept); logChars += kept.length; }
      };
      const console = Object.freeze({ log, info: log, warn: log, error: log });
      const result = await (async function(fs, console) { "use strict";\n${code}\n})(fs, console);
      const encodedResult = JSON.stringify(result === undefined ? null : result);
      const resultTooLarge = encodedResult.length > ${AGENT_TEST_LIMITS.outputChars};
      const output = { logs, result: resultTooLarge ? encodedResult.slice(0, ${AGENT_TEST_LIMITS.outputChars}) : JSON.parse(encodedResult), ...((truncated || resultTooLarge) ? {truncated: true} : {}) };
      return JSON.stringify({ output, files: [...files].map(([path, content]) => ({path, content})) });
    })()`)
    if (result.error) {
      const error = vm.dump(result.error) as { message?: string }
      result.error.dispose()
      throw new Error(error?.message ?? "JavaScript execution failed")
    }
    try {
      while (true) {
        signal?.throwIfAborted()
        if (Date.now() > deadline)
          throw new Error(
            "JavaScript execution interrupted: time budget exceeded",
          )
        const jobs = runtime.executePendingJobs(1)
        if (jobs.error) {
          const error = vm.dump(jobs.error) as { message?: string }
          jobs.error.dispose()
          throw new Error(error?.message ?? "JavaScript execution failed")
        }
        const state = vm.getPromiseState(result.value)
        if (state.type === "fulfilled") {
          const serialized = vm.getString(state.value)
          state.value.dispose()
          return JSON.parse(serialized) as {
            output: { logs: string[]; result: unknown; truncated?: boolean }
            files: AgentTestFile[]
          }
        }
        if (state.type === "rejected") {
          const error = vm.dump(state.error) as { message?: string }
          state.error.dispose()
          throw new Error(error?.message ?? "JavaScript execution failed")
        }
        // Yield to the browser between promise jobs so Stop can be delivered.
        await new Promise<void>((resolve) => setTimeout(resolve, 0))
      }
    } finally {
      result.value.dispose()
    }
  } finally {
    vm.dispose()
    runtime.dispose()
  }
}

/** Create tools with the same workspace and bounded feedback for one test. */
export function createAgentTestEnvironment(signal?: AbortSignal) {
  const files = new Map<string, string>()
  const calls: AgentTestCall[] = []
  const snapshot = (): AgentTestFile[] =>
    [...files]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([path, content]) => ({ path, content }))
  const validateFiles = (next: AgentTestFile[]) => {
    let bytes = 0
    for (const file of next) {
      normalizePath(file.path)
      const size = new TextEncoder().encode(file.content).byteLength
      bytes += size
    }
    if (bytes > AGENT_TEST_LIMITS.workspaceBytes)
      throw new Error("Workspace size limit exceeded")
  }
  const writeFile = (path: string, content: string) => {
    const normalized = normalizePath(path)
    const next = new Map(files).set(normalized, content)
    validateFiles([...next].map(([path, content]) => ({ path, content })))
    files.set(normalized, content)
    return {
      path: normalized,
      bytes: new TextEncoder().encode(content).byteLength,
    }
  }
  const readFile = (path: string) => {
    const normalized = normalizePath(path)
    const content = files.get(normalized)
    if (content === undefined) throw new Error(`File not found: ${normalized}`)
    return content
  }
  const execute = async (
    toolName: string,
    input: unknown,
    action: () => unknown | Promise<unknown>,
  ) => {
    signal?.throwIfAborted()
    let output: unknown
    try {
      output = await action()
    } catch (error) {
      signal?.throwIfAborted()
      output = {
        error: error instanceof Error ? error.message : "Tool execution failed",
      }
    }
    signal?.throwIfAborted()
    calls.push({ toolName, input, output })
    return output
  }
  return {
    snapshot,
    calls,
    tools: {
      [AGENT_TEST_TOOL_NAMES.ListFiles]: tool({
        description: "List files in the virtual workspace.",
        inputSchema: z.object({}),
        execute: (input) =>
          execute(AGENT_TEST_TOOL_NAMES.ListFiles, input, () => ({
            files: [...files.keys()].sort(),
          })),
      }),
      [AGENT_TEST_TOOL_NAMES.ReadFile]: tool({
        description:
          "Read a UTF-8 virtual file. Absolute paths start at the virtual workspace root.",
        inputSchema: fileSchema,
        execute: (input) =>
          execute(AGENT_TEST_TOOL_NAMES.ReadFile, input, () => ({
            content: readFile(input.path),
          })),
      }),
      [AGENT_TEST_TOOL_NAMES.WriteFile]: tool({
        description: "Create or overwrite a UTF-8 virtual file.",
        inputSchema: fileSchema.extend({
          content: z.string(),
        }),
        execute: (input) =>
          execute(AGENT_TEST_TOOL_NAMES.WriteFile, input, () =>
            writeFile(input.path, input.content),
          ),
      }),
      [AGENT_TEST_TOOL_NAMES.EditFile]: tool({
        description:
          "Replace one unique exact text match in a virtual file. Ambiguous or missing matches fail without changing the file.",
        inputSchema: fileSchema.extend({
          old_text: z.string().min(1),
          new_text: z.string(),
        }),
        execute: (input) =>
          execute(AGENT_TEST_TOOL_NAMES.EditFile, input, () => {
            const content = readFile(input.path)
            const index = content.indexOf(input.old_text)
            if (index < 0 || content.indexOf(input.old_text, index + 1) >= 0)
              throw new Error("old_text must match exactly once")
            return writeFile(
              input.path,
              content.slice(0, index) +
                input.new_text +
                content.slice(index + input.old_text.length),
            )
          }),
      }),
      [AGENT_TEST_TOOL_NAMES.ExecuteJs]: tool({
        description:
          "Execute JavaScript in isolated QuickJS, including top-level await and Promises. Use fs.listFiles(), fs.readFile(path), fs.writeFile(path, content), console.log(), and return. Files persist within this test; writes commit on success. No browser, network, Node or module loader. Default budgets: 5 seconds and 128 MiB; request timeout_ms or memory_mb to adjust them. Verbose logs/return values are truncated without discarding files.",
        inputSchema: z.object({
          code: z.string(),
          timeout_ms: z
            .number()
            .int()
            .positive()
            .max(AGENT_TEST_LIMITS.maxExecutionMs)
            .optional(),
          memory_mb: z
            .number()
            .int()
            .min(AGENT_TEST_LIMITS.minMemoryMb)
            .max(AGENT_TEST_LIMITS.maxMemoryMb)
            .optional(),
        }),
        execute: (input) =>
          execute(AGENT_TEST_TOOL_NAMES.ExecuteJs, input, async () => {
            const result = await executeJavaScript(
              input.code,
              snapshot(),
              signal,
              input,
            )
            validateFiles(result.files)
            files.clear()
            for (const file of result.files) files.set(file.path, file.content)
            return result.output
          }),
      }),
    },
  }
}
