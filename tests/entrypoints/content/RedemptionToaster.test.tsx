import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { RedemptionToaster } from "~/entrypoints/content/redemptionAssist/components/RedemptionToaster"
import { atIndex } from "~~/tests/test-utils/indexedAccess"

type ToastStackProps = {
  children: React.ReactNode
}

type ToastRegionProps = {
  children: React.ReactElement<ToastStackProps>
  onMouseEnter: () => void
  onMouseLeave: () => void
}

type ToastCardProps = {
  className?: string
  children?: React.ReactNode
}

const { useToasterMock } = vi.hoisted(() => ({
  useToasterMock: vi.fn(),
}))

vi.mock("react-hot-toast/headless", () => ({
  useToaster: useToasterMock,
}))

describe("RedemptionToaster", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns nothing when there are no visible toasts", () => {
    useToasterMock.mockReturnValue({
      toasts: [
        {
          id: "hidden",
          visible: false,
          type: "success",
          message: "Hidden toast",
          ariaProps: {},
        },
      ],
      handlers: {
        startPause: vi.fn(),
        endPause: vi.fn(),
      },
    })

    expect(RedemptionToaster({})).toBeNull()
  })

  it("renders custom and standard visible toasts and wires pause handlers", () => {
    const startPause = vi.fn()
    const endPause = vi.fn()

    useToasterMock.mockReturnValue({
      toasts: [
        {
          id: "hidden",
          visible: false,
          type: "success",
          message: "Hidden toast",
          ariaProps: {},
        },
        {
          id: "custom",
          visible: true,
          type: "custom",
          message: (toast: { id: string }) => `Custom ${toast.id}`,
          ariaProps: { role: "status" },
        },
        {
          id: "success",
          visible: true,
          type: "success",
          message: "Success toast",
          ariaProps: { role: "status" },
        },
        {
          id: "error",
          visible: true,
          type: "error",
          message: () => "Error toast",
          ariaProps: { role: "alert" },
        },
        {
          id: "neutral",
          visible: true,
          type: "blank",
          message: "Neutral toast",
          ariaProps: { role: "status" },
        },
      ],
      handlers: {
        startPause,
        endPause,
      },
    })

    const tree = RedemptionToaster({})

    expect(React.isValidElement(tree)).toBe(true)

    const toastRegion = tree as React.ReactElement<ToastRegionProps>
    const toastStack = toastRegion.props.children
    const visibleToasts = React.Children.toArray(
      toastStack.props.children,
    ) as React.ReactElement<ToastCardProps>[]

    expect(visibleToasts).toHaveLength(4)

    toastRegion.props.onMouseEnter()
    toastRegion.props.onMouseLeave()

    expect(startPause).toHaveBeenCalledTimes(1)
    expect(endPause).toHaveBeenCalledTimes(1)

    const destructuredSource0 = visibleToasts
    const [customToast, successToast, errorToast, neutralToast] = [
      atIndex(destructuredSource0, 0),
      atIndex(destructuredSource0, 1),
      atIndex(destructuredSource0, 2),
      atIndex(destructuredSource0, 3),
    ]

    expect(customToast.props.className).toContain("sm:w-[360px]")
    expect(customToast.props.children).toBe("Custom custom")

    expect(successToast.props.className).toContain("border-l-success-text")
    expect(successToast.props.className).toContain("text-success-text")
    expect(errorToast.props.className).toContain("border-l-destructive-text")
    expect(errorToast.props.className).toContain("text-destructive-text")
    expect(neutralToast.props.className).not.toContain("border-l-success-text")
    expect(neutralToast.props.className).not.toContain(
      "border-l-destructive-text",
    )
  })
})
