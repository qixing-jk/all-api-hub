import { act, renderHook } from "@testing-library/react"
import { expect, it, vi } from "vitest"

import { useAccountKeyEditorSubmission } from "~/features/KeyManagement/resources/workflows/useAccountKeyEditorSubmission"

it("reports an unavailable submission context without dispatching a key mutation", async () => {
  const submit = vi.fn()
  const onFailure = vi.fn()
  const { result } = renderHook(() =>
    useAccountKeyEditorSubmission({
      editorState: {
        captureSubmission: () => ({
          nativeEditor: { submit },
          state: { editorId: 1 },
          boundary: { accountId: "a" },
        }),
      },
      requests: {},
      resolveContext: () => null,
      onFailure,
    } as any),
  )
  await act(async () => result.current(1, {}))
  expect(submit).not.toHaveBeenCalled()
  expect(onFailure).toHaveBeenCalledWith({ code: "unavailable" })
})
