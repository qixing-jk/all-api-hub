import http from "node:http"

import { AGENT_TEST_TOOL_NAMES } from "~/services/verification/agentTest/constants"

const PELICAN_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 120"><circle cx="40" cy="90" r="18"/><circle cx="110" cy="90" r="18"/><path d="M20 60 L90 40"/><ellipse cx="150" cy="55" rx="18" ry="10"/></svg>'

type DrawingRequest = {
  model: string
  stream?: boolean
  tools?: Array<{ function: { name: string } }>
  messages: Array<{ role: string; content: unknown }>
}

/** Deterministic inference fixture; tools still execute inside the real extension. */
export function createDrawingServer() {
  const prompts: string[] = []
  const requests: DrawingRequest[] = []
  const server = http.createServer(async (request, response) => {
    if (request.method !== "POST") {
      response.writeHead(200, { "Content-Type": "application/json" })
      response.end(JSON.stringify({ data: [{ id: "gpt-quality" }] }))
      return
    }
    const chunks: Buffer[] = []
    for await (const chunk of request) chunks.push(chunk as Buffer)
    const body = JSON.parse(Buffer.concat(chunks).toString()) as DrawingRequest
    requests.push(body)
    prompts.push(
      String(
        [...body.messages].reverse().find((message) => message.role === "user")
          ?.content ?? "",
      ),
    )
    const agent = body.tools?.some(
      (tool) => tool.function.name === AGENT_TEST_TOOL_NAMES.ExecuteJs,
    )
    const call =
      agent && !body.messages.some((message) => message.role === "tool")
        ? {
            id: "drawing-js",
            type: "function",
            function: {
              name: AGENT_TEST_TOOL_NAMES.ExecuteJs,
              arguments: JSON.stringify({
                code: `fs.writeFile("/pelican.svg", await Promise.resolve(${JSON.stringify(PELICAN_SVG)})); console.log("workspace checked"); return { files: fs.listFiles(), network: typeof fetch, browser: typeof chrome };`,
              }),
            },
          }
        : null
    const text = call ? null : agent ? "Created pelican.svg." : PELICAN_SVG
    const finish = call ? "tool_calls" : "stop"
    if (body.stream) {
      const chunk = (
        delta: Record<string, unknown>,
        finish_reason: string | null,
      ) => ({
        id: "chatcmpl-drawing",
        object: "chat.completion.chunk",
        created: 0,
        model: body.model,
        choices: [{ index: 0, delta, finish_reason }],
      })
      response.writeHead(200, { "Content-Type": "text/event-stream" })
      response.end(
        [
          `data: ${JSON.stringify(chunk({ role: "assistant", ...(call ? { tool_calls: [{ index: 0, ...call }] } : { content: text }) }, null))}\n\n`,
          `data: ${JSON.stringify(chunk({}, finish))}\n\n`,
          "data: [DONE]\n\n",
        ].join(""),
      )
      return
    }
    response.writeHead(200, { "Content-Type": "application/json" })
    response.end(
      JSON.stringify({
        id: "chatcmpl-drawing",
        object: "chat.completion",
        created: 0,
        model: body.model,
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: text,
              ...(call ? { tool_calls: [call] } : {}),
            },
            finish_reason: finish,
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 40, total_tokens: 50 },
      }),
    )
  })
  return { server, prompts, requests }
}
