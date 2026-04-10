import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { WarningToast } from "~/components/toast/WarningToast"

const { dismissMock } = vi.hoisted(() => ({
  dismissMock: vi.fn(),
}))

vi.mock("~/contexts/ThemeContext", () => ({
  useTheme: () => ({
    resolvedTheme: "light",
  }),
}))

vi.mock("react-hot-toast", () => ({
  default: {
    dismiss: dismissMock,
  },
  ToastBar: ({ toast, children }: any) => (
    <div data-testid="toast-bar">
      {typeof children === "function"
        ? children({
            icon: toast.icon,
            message: <span data-testid="toast-message">{toast.message}</span>,
          })
        : children}
    </div>
  ),
}))

describe("WarningToast", () => {
  it("renders the message and dismisses when the close button is clicked", () => {
    render(
      <WarningToast
        toastInstance={{
          id: "warning-toast-id",
          type: "custom",
          visible: true,
          dismissed: false,
          height: 0,
          ariaProps: {
            role: "status",
            "aria-live": "polite",
          },
          message: "",
          createdAt: Date.now(),
          pauseDuration: 0,
          position: "bottom-center",
        }}
        message="Latest account data is stale"
      />,
    )

    expect(screen.getByText("Latest account data is stale")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button"))

    expect(dismissMock).toHaveBeenCalledWith("warning-toast-id")
  })

  it("renders an action and runs it before dismissing the toast", async () => {
    const actionMock = vi.fn().mockResolvedValue(undefined)

    render(
      <WarningToast
        toastInstance={{
          id: "warning-toast-id",
          type: "custom",
          visible: true,
          dismissed: false,
          height: 0,
          ariaProps: {
            role: "status",
            "aria-live": "polite",
          },
          message: "",
          createdAt: Date.now(),
          pauseDuration: 0,
          position: "bottom-center",
        }}
        message="Model sync finished with failed channels"
        action={{
          label: "Retry failed only",
          onClick: actionMock,
        }}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "Retry failed only" }))

    await waitFor(() => {
      expect(actionMock).toHaveBeenCalledTimes(1)
      expect(dismissMock).toHaveBeenCalledWith("warning-toast-id")
    })
  })
})
