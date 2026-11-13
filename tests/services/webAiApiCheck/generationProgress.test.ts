import { expect, it, vi } from "vitest"

import type { VerificationGenerationProgress } from "~/services/verification/aiApiVerification/generationProgress"
import { subscribeGenerationProgress } from "~/services/verification/webAiApiCheck/generationProgress"

const transport = vi.hoisted(() => ({
  listen: vi.fn(),
  unsubscribe: vi.fn(),
}))
vi.mock("~/services/verification/webAiApiCheck/messaging", () => ({
  WebAiApiCheckMessageTypes: { GenerationProgress: "progress" },
  onWebAiApiCheckMessage: transport.listen,
  sendWebAiApiCheckMessage: vi.fn(),
}))

it("keeps a replacement subscription alive when the earlier owner unsubscribes", () => {
  let deliver!: (payload: {
    data: { runId: string; progress: VerificationGenerationProgress }
  }) => void
  transport.listen.mockImplementation((_type, handler) => {
    deliver = handler
    return transport.unsubscribe
  })
  const old = vi.fn()
  const current = vi.fn()
  const other = vi.fn()
  const disposeOld = subscribeGenerationProgress("run", old)
  const disposeCurrent = subscribeGenerationProgress("run", current)
  const disposeOther = subscribeGenerationProgress("other", other)
  try {
    disposeOld()
    const progress = {
      text: "current answer",
      reasoning: "",
      tools: [],
      step: 1,
    }
    deliver({ data: { runId: "run", progress } })
    expect(old).not.toHaveBeenCalled()
    expect(current).toHaveBeenCalledExactlyOnceWith(progress)
    expect(other).not.toHaveBeenCalled()
    disposeCurrent()
    expect(transport.unsubscribe).not.toHaveBeenCalled()
    deliver({ data: { runId: "run", progress } })
    expect(current).toHaveBeenCalledTimes(1)
  } finally {
    disposeCurrent()
    disposeOther()
  }
  expect(transport.unsubscribe).toHaveBeenCalledOnce()
})
