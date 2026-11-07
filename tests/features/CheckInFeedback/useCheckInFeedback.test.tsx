import { act, renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { useCheckInFeedback } from "~/features/CheckInFeedback/useCheckInFeedback"

describe("useCheckInFeedback lifecycle", () => {
  it("retains the closing source until completion and ignores an old completion after reopening", () => {
    const { result } = renderHook(() => useCheckInFeedback())
    act(() => result.current.openFeedback({ accountId: "first" }))
    const first = result.current.feedbackDialog!.props.children.props
    act(() => first.onClose())
    expect(result.current.feedbackDialog).not.toBeNull()
    expect(result.current.feedbackDialog!.props.children.props.isOpen).toBe(
      false,
    )
    act(() => result.current.openFeedback({ accountId: "second" }))
    act(() => first.onClose())
    expect(result.current.feedbackDialog!.props.children.props.isOpen).toBe(
      true,
    )
    act(() => first.onCloseComplete())
    expect(
      result.current.feedbackDialog!.props.children.props.source.accountId,
    ).toBe("second")
    const second = result.current.feedbackDialog!.props.children.props
    act(() => second.onClose())
    act(() => second.onCloseComplete())
    expect(result.current.feedbackDialog).toBeNull()
  })
})
