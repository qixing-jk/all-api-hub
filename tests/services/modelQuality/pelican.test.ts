import { http, HttpResponse } from "msw"
import { describe, expect, it } from "vitest"

import { AGENT_TEST_TOOL_NAMES } from "~/services/verification/agentTest/constants"
import {
  AGENT_TEST_OUTCOMES,
  PELICAN_EXECUTION_MODES,
} from "~/services/verification/modelQuality/constants"
import {
  analyzePelicanSvg,
  extractPelicanSvg,
  runPelicanTest,
} from "~/services/verification/modelQuality/pelican"
import { server } from "~~/tests/msw/server"

type DrawingRequest = {
  messages: Array<{ role: string; content: unknown }>
  tools: Array<{ function: { name: string } }>
}

const baseUrl = "https://pelican.example.invalid"

const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 120"><circle cx="20" cy="90" r="15"/><circle cx="60" cy="90" r="15"/><path d="M30 40 L80 30"/><ellipse cx="100" cy="60" rx="20" ry="10"/></svg>'

const completion = (text: string) =>
  HttpResponse.json({
    id: "chatcmpl-pelican",
    object: "chat.completion",
    created: 0,
    model: "quality-model",
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: text },
        finish_reason: "stop",
      },
    ],
    usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
  })

const BASE_PARAMS = {
  baseUrl,
  apiKey: "test-key",
  apiType: "openai-compatible" as const,
  modelId: "quality-model",
  mode: "non-streaming" as const,
}

describe("drawing prompt delivery", () => {
  it.each([
    PELICAN_EXECUTION_MODES.Reply,
    PELICAN_EXECUTION_MODES.Agent,
  ] as const)(
    "sends the classic user prompt in %s mode",
    async (executionMode) => {
      const requests = mockAgentTurns([])
      await runPelicanTest({ ...BASE_PARAMS, executionMode })
      const messages = requests[0]!.messages
      expect(messages.filter((message) => message.role === "user")).toEqual([
        {
          role: "user",
          content: "Generate an SVG of a pelican riding a bicycle",
        },
      ])
      if (executionMode === PELICAN_EXECUTION_MODES.Agent) {
        const system = messages.find((message) => message.role === "system")
        expect(system?.content).toContain('"pelican.svg"')
        expect(system?.content).not.toMatch(
          /viewBox|brief summary|Draw a pelican/,
        )
      } else {
        expect(messages.some((message) => message.role === "system")).toBe(
          false,
        )
      }
    },
  )

  it.each([
    PELICAN_EXECUTION_MODES.Reply,
    PELICAN_EXECUTION_MODES.Agent,
  ] as const)(
    "keeps a custom drawing request separate from delivery instructions in %s mode",
    async (executionMode) => {
      const requests = mockAgentTurns([])
      await runPelicanTest({
        ...BASE_PARAMS,
        executionMode,
        prompt: "  Draw a blue bicycle  ",
      })
      expect(
        requests[0]!.messages.find((message) => message.role === "user")
          ?.content,
      ).toBe("Draw a blue bicycle")
    },
  )
})

const toolCompletion = (name: string, input: unknown, id = "call-1") =>
  HttpResponse.json({
    id: PELICAN_EXECUTION_MODES.Agent,
    object: "chat.completion",
    created: 0,
    model: "quality-model",
    choices: [
      {
        index: 0,
        finish_reason: "tool_calls",
        message: {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id,
              type: "function",
              function: { name, arguments: JSON.stringify(input) },
            },
          ],
        },
      },
    ],
  })

function mockAgentTurns(turns: Array<[string, unknown]>) {
  const requests: DrawingRequest[] = []
  server.use(
    http.post(`${baseUrl}/v1/chat/completions`, async ({ request }) => {
      requests.push((await request.json()) as DrawingRequest)
      const turn = turns[requests.length - 1]
      return turn
        ? toolCompletion(turn[0], turn[1], `call-${requests.length}`)
        : completion("Done")
    }),
  )
  return requests
}

describe("extractPelicanSvg", () => {
  it("returns raw svg markup untouched", () => {
    expect(extractPelicanSvg(SVG)).toBe(SVG)
  })

  it("strips markdown fences and surrounding prose", () => {
    expect(extractPelicanSvg(`Here you go:\n\`\`\`svg\n${SVG}\n\`\`\``)).toBe(
      SVG,
    )
    expect(extractPelicanSvg(`<p>${SVG}</p>`)).toBe(SVG)
  })

  it("returns null when the answer has no svg element", () => {
    for (const text of [
      undefined,
      null,
      42,
      "",
      "I cannot draw that.",
      "<svg xmlns='http://www.w3.org/2000/svg'></svg",
    ]) {
      expect({ text, svg: extractPelicanSvg(text) }).toEqual({
        text,
        svg: null,
      })
    }
  })
})

describe("analyzePelicanSvg", () => {
  it("counts the shapes a pelican-on-a-bicycle needs", () => {
    const analysis = analyzePelicanSvg(SVG)

    expect(analysis).toMatchObject({
      hasSvg: true,
      safe: true,
      viewBox: "0 0 200 120",
      counts: { circle: 2, ellipse: 1, path: 1 },
      wheelClues: 3,
      shapeCount: 4,
    })
    expect(analysis.byteSize).toBe(SVG.length)
  })

  it("reports an empty analysis when no svg was produced", () => {
    expect(analyzePelicanSvg(null)).toMatchObject({
      hasSvg: false,
      safe: true,
      shapeCount: 0,
      wheelClues: 0,
      viewBox: null,
    })
  })

  it("flags markup that must not be rendered", () => {
    for (const svg of [
      "<svg><script>alert(1)</script></svg>",
      '<svg onload="alert(1)"></svg>',
      "<svg><foreignObject><body/></foreignObject></svg>",
      '<svg><image href="https://tracker.example/x.png"/></svg>',
    ]) {
      expect({ svg, safe: analyzePelicanSvg(svg).safe }).toEqual({
        svg,
        safe: false,
      })
    }
  })
})

describe("runPelicanTest", () => {
  it("cancels pending async JavaScript without issuing another inference request", async () => {
    const controller = new AbortController()
    let requests = 0
    server.use(
      http.post(`${baseUrl}/v1/chat/completions`, () => {
        requests++
        setTimeout(() => controller.abort(), 50)
        return toolCompletion(AGENT_TEST_TOOL_NAMES.ExecuteJs, {
          code: "await new Promise(() => {});",
        })
      }),
    )
    await expect(
      runPelicanTest({
        ...BASE_PARAMS,
        executionMode: PELICAN_EXECUTION_MODES.Agent,
        abortSignal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" })
    expect(requests).toBe(1)
  })

  it("shares normal virtual paths and more than sixteen files with JavaScript", async () => {
    mockAgentTurns([
      [
        AGENT_TEST_TOOL_NAMES.ExecuteJs,
        {
          code: `for (let i = 0; i < 20; i++) fs.writeFile("/目录/file " + i + ".txt", String(i)); return fs.readFile("./目录/file 19.txt");`,
        },
      ],
      [AGENT_TEST_TOOL_NAMES.ReadFile, { path: "/目录/../目录/file 19.txt" }],
    ])
    const result = await runPelicanTest({
      ...BASE_PARAMS,
      executionMode: PELICAN_EXECUTION_MODES.Agent,
    })
    expect(result.agent?.files).toHaveLength(20)
    expect(result.agent?.calls[0]?.output).toEqual({ logs: [], result: "19" })
    expect(result.agent?.calls[1]?.output).toEqual({ content: "19" })
  })

  it("cancels between agent turns without sending another model request", async () => {
    const controller = new AbortController()
    let requests = 0
    server.use(
      http.post(`${baseUrl}/v1/chat/completions`, () => {
        requests++
        controller.abort()
        return toolCompletion(AGENT_TEST_TOOL_NAMES.ListFiles, {})
      }),
    )
    await expect(
      runPelicanTest({
        ...BASE_PARAMS,
        executionMode: PELICAN_EXECUTION_MODES.Agent,
        abortSignal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" })
    expect(requests).toBe(1)
  })

  it("keeps successful writes when later edits or JavaScript transactions fail", async () => {
    mockAgentTurns([
      [AGENT_TEST_TOOL_NAMES.WriteFile, { path: "pelican.svg", content: SVG }],
      [
        AGENT_TEST_TOOL_NAMES.EditFile,
        { path: "pelican.svg", old_text: "circle", new_text: "ellipse" },
      ],
      [
        AGENT_TEST_TOOL_NAMES.ExecuteJs,
        {
          code: `fs.writeFile("pelican.svg", "bad"); throw new Error("check failed")`,
        },
      ],
      [AGENT_TEST_TOOL_NAMES.ReadFile, { path: "pelican.svg" }],
    ])
    const result = await runPelicanTest({
      ...BASE_PARAMS,
      executionMode: PELICAN_EXECUTION_MODES.Agent,
    })
    expect(result.svg).toBe(SVG)
    expect(result.agent?.calls[1]?.output).toEqual({
      error: "old_text must match exactly once",
    })
    expect(result.agent?.calls[2]?.output).toEqual({ error: "check failed" })
    expect(result.agent?.calls[3]?.output).toEqual({ content: SVG })
  })

  it("lets the model recover from file errors, edit its artifact and inspect it with isolated JS", async () => {
    mockAgentTurns([
      [AGENT_TEST_TOOL_NAMES.ReadFile, { path: "missing.svg" }],
      [
        AGENT_TEST_TOOL_NAMES.WriteFile,
        { path: "pelican.svg", content: SVG.replace("200 120", "200 100") },
      ],
      [
        AGENT_TEST_TOOL_NAMES.EditFile,
        { path: "pelican.svg", old_text: "200 100", new_text: "200 120" },
      ],
      [
        AGENT_TEST_TOOL_NAMES.ExecuteJs,
        {
          code: `console.log(typeof window, typeof fetch, typeof process, typeof chrome); return fs.readFile("pelican.svg").includes("200 120");`,
        },
      ],
    ])
    const result = await runPelicanTest({
      ...BASE_PARAMS,
      executionMode: PELICAN_EXECUTION_MODES.Agent,
    })
    expect(result.svg).toBe(SVG)
    expect(result.agent?.calls[0]?.output).toEqual({
      error: "File not found: missing.svg",
    })
    expect(result.agent?.calls[3]?.output).toEqual({
      logs: ["undefined undefined undefined undefined"],
      result: true,
    })
    expect(result.agent?.outcome).toBe("completed")
  })

  it("does not accept SVG in a final reply as an agent artifact or reuse another run's files", async () => {
    mockAgentTurns([
      [AGENT_TEST_TOOL_NAMES.WriteFile, { path: "pelican.svg", content: SVG }],
    ])
    expect(
      (
        await runPelicanTest({
          ...BASE_PARAMS,
          executionMode: PELICAN_EXECUTION_MODES.Agent,
        })
      ).svg,
    ).toBe(SVG)
    server.use(
      http.post(`${baseUrl}/v1/chat/completions`, () => completion(SVG)),
    )
    const result = await runPelicanTest({
      ...BASE_PARAMS,
      executionMode: PELICAN_EXECUTION_MODES.Agent,
    })
    expect(result.svg).toBeNull()
    expect(result.agent).toMatchObject({
      outcome: AGENT_TEST_OUTCOMES.NoArtifact,
      files: [],
      calls: [],
    })
  })

  it.each([
    ["while (true) {}", "interrupted"],
    ["fs.writeFile('../escape.svg', 'bad')", "outside the virtual workspace"],
    ["return new Uint8Array(256 * 1024 * 1024)", "out of memory"],
  ])("returns bounded JS failures to the model: %s", async (code, message) => {
    const requests = mockAgentTurns([
      [AGENT_TEST_TOOL_NAMES.ExecuteJs, { code, timeout_ms: 50 }],
    ])
    const result = await runPelicanTest({
      ...BASE_PARAMS,
      executionMode: PELICAN_EXECUTION_MODES.Agent,
    })
    expect(result.agent?.calls[0]?.output).toEqual({
      error: expect.stringContaining(message),
    })
    expect(result.agent?.files).toEqual([])
    expect(requests).toHaveLength(2)
  })

  it("continues past the former turn and tool limits until the model finishes", async () => {
    const requests = mockAgentTurns([
      ...Array.from({ length: 40 }, (): [string, unknown] => [
        AGENT_TEST_TOOL_NAMES.ListFiles,
        {},
      ]),
      [AGENT_TEST_TOOL_NAMES.WriteFile, { path: "pelican.svg", content: SVG }],
    ])
    const result = await runPelicanTest({
      ...BASE_PARAMS,
      executionMode: PELICAN_EXECUTION_MODES.Agent,
    })
    expect(requests).toHaveLength(42)
    expect(result.agent?.calls).toHaveLength(41)
    expect(result.svg).toBe(SVG)
    expect(result.agent?.outcome).toBe("completed")
  })

  it("supports async JavaScript and larger files without failing on verbose logs", async () => {
    mockAgentTurns([
      [
        AGENT_TEST_TOOL_NAMES.ExecuteJs,
        {
          code: `
      const content = await Promise.resolve("x".repeat(200000));
      fs.writeFile("large.txt", content);
      console.log("x".repeat(100000));
      return await Promise.resolve(fs.readFile("large.txt").length);
    `,
        },
      ],
    ])
    const result = await runPelicanTest({
      ...BASE_PARAMS,
      executionMode: PELICAN_EXECUTION_MODES.Agent,
    })
    expect(
      result.agent?.files.map((file) => ({
        path: file.path,
        length: file.content.length,
      })),
    ).toEqual([{ path: "large.txt", length: 200000 }])
    expect(result.agent?.calls[0]?.output).toMatchObject({
      result: 200000,
      truncated: true,
    })
  })

  it("runs tools across turns and previews the file written by JavaScript, not the final reply", async () => {
    const requests: DrawingRequest[] = []
    server.use(
      http.post(`${baseUrl}/v1/chat/completions`, async ({ request }) => {
        const body = (await request.json()) as DrawingRequest
        requests.push(body)
        if (requests.length === 1) {
          return HttpResponse.json({
            id: "agent-1",
            object: "chat.completion",
            created: 0,
            model: "quality-model",
            choices: [
              {
                index: 0,
                finish_reason: "tool_calls",
                message: {
                  role: "assistant",
                  content: null,
                  tool_calls: [
                    {
                      id: "write-1",
                      type: "function",
                      function: {
                        name: AGENT_TEST_TOOL_NAMES.ExecuteJs,
                        arguments: JSON.stringify({
                          code: `fs.writeFile("pelican.svg", ${JSON.stringify(SVG)}); console.log(fs.readFile("pelican.svg").includes("viewBox")); return fs.listFiles();`,
                        }),
                      },
                    },
                  ],
                },
              },
            ],
          })
        }
        return completion("Finished. This reply deliberately contains no SVG.")
      }),
    )

    const result = await runPelicanTest({
      ...BASE_PARAMS,
      executionMode: PELICAN_EXECUTION_MODES.Agent,
    })

    expect(requests).toHaveLength(2)
    expect(requests[0]!.tools.map((tool) => tool.function.name)).toEqual(
      expect.arrayContaining([
        AGENT_TEST_TOOL_NAMES.ListFiles,
        AGENT_TEST_TOOL_NAMES.ReadFile,
        AGENT_TEST_TOOL_NAMES.WriteFile,
        AGENT_TEST_TOOL_NAMES.EditFile,
        AGENT_TEST_TOOL_NAMES.ExecuteJs,
      ]),
    )
    expect(
      requests[1]!.messages.find((message) => message.role === "tool")?.content,
    ).toContain("true")
    expect(result.svg).toBe(SVG)
    expect(result.agent).toMatchObject({
      steps: 2,
      outcome: "completed",
      files: [{ path: "pelican.svg", content: SVG }],
      calls: [
        {
          toolName: AGENT_TEST_TOOL_NAMES.ExecuteJs,
          output: { logs: ["true"], result: ["pelican.svg"] },
        },
      ],
    })
    expect(result.text).toContain("Finished")
  })

  it("returns the svg and its analysis", async () => {
    const prompts: string[] = []
    server.use(
      http.post(`${baseUrl}/v1/chat/completions`, async ({ request }) => {
        const body = (await request.json()) as {
          messages: Array<{ role: string; content: string }>
        }
        prompts.push(body.messages.at(-1)!.content)
        return completion(`\`\`\`svg\n${SVG}\n\`\`\``)
      }),
    )

    const result = await runPelicanTest(BASE_PARAMS)

    expect(prompts[0]).toContain("pelican")
    expect(result.svg).toBe(SVG)
    expect(result.analysis.hasSvg).toBe(true)
    expect(result.analysis.safe).toBe(true)
    expect(result.latencyMs).toBeGreaterThanOrEqual(0)
    expect(result.text).toContain("<svg")
  })

  it("keeps the raw answer when the model ignores the svg contract", async () => {
    server.use(
      http.post(`${baseUrl}/v1/chat/completions`, () =>
        completion("Sorry, I can only describe it in words."),
      ),
    )

    const result = await runPelicanTest(BASE_PARAMS)

    expect(result.svg).toBeNull()
    expect(result.analysis.hasSvg).toBe(false)
    expect(result.text).toContain("Sorry")
  })

  it("propagates caller aborts", async () => {
    const controller = new AbortController()
    controller.abort()
    server.use(
      http.post(`${baseUrl}/v1/chat/completions`, () => completion(SVG)),
    )

    await expect(
      runPelicanTest({ ...BASE_PARAMS, abortSignal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" })
  })
})
