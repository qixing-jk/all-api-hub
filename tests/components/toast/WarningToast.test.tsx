import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { WarningToast } from "~/components/toast/WarningToast"

const createDeferred = () => {
  let resolve!: () => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })

  return { promise, reject, resolve }
}

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
  beforeEach(() => {
    vi.clearAllMocks()
  })

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

    fireEvent.click(screen.getByRole("button", { name: "Close notification" }))

    expect(dismissMock).toHaveBeenCalledTimes(1)
    expect(dismissMock).toHaveBeenCalledWith("warning-toast-id")
  })

  it("renders an action and runs it before dismissing the toast", async () => {
    const deferredAction = createDeferred()
    const actionMock = vi.fn(() => deferredAction.promise)

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
          pendingLabel: "Retrying...",
          onClick: actionMock,
        }}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "Retry failed only" }))

    const pendingAction = screen.getByRole("button", { name: "Retrying..." })
    expect(pendingAction).toBeDisabled()
    expect(pendingAction).toHaveAttribute("aria-busy", "true")
    const closeButton = screen.getByRole("button", {
      name: "Close notification",
    })
    expect(closeButton).toBeEnabled()
    expect(closeButton).not.toHaveAttribute("aria-busy")
    fireEvent.click(pendingAction)
    expect(actionMock).toHaveBeenCalledTimes(1)

    deferredAction.resolve()

    await waitFor(() => {
      expect(actionMock).toHaveBeenCalledTimes(1)
      expect(dismissMock).toHaveBeenCalledTimes(1)
      expect(dismissMock).toHaveBeenCalledWith("warning-toast-id")
    })
  })

  it("keeps the toast open and re-enables the action when the action rejects", async () => {
    const deferredAction = createDeferred()
    const actionMock = vi.fn(() => deferredAction.promise)

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

    const retryButton = screen.getByRole("button", {
      name: "Retry failed only",
    })

    fireEvent.click(retryButton)

    expect(retryButton).toBeDisabled()
    expect(retryButton).toHaveAttribute("aria-busy", "true")
    expect(retryButton).toHaveAccessibleName("Retry failed only")
    deferredAction.reject(new Error("retry failed"))

    await waitFor(() => {
      expect(actionMock).toHaveBeenCalledTimes(1)
      expect(retryButton).toBeEnabled()
      expect(retryButton).not.toHaveAttribute("aria-busy")
    })

    expect(dismissMock).not.toHaveBeenCalled()

    fireEvent.click(retryButton)

    await waitFor(() => {
      expect(actionMock).toHaveBeenCalledTimes(2)
    })
  })
})
