import { fireEvent, render, screen } from "@testing-library/react"
import { useState } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ThemeAwareToaster } from "~/components/ThemeAwareToaster"
import {
  ToasterPortalHost,
  ToasterPortalProvider,
} from "~/components/toast/ToasterPortal"

const {
  dismissMock,
  renderedToastState,
  resolvedThemeState,
  toasterPropsHistory,
} = vi.hoisted(() => ({
  dismissMock: vi.fn(),
  renderedToastState: {
    current: {
      id: "toast-1",
      type: "success",
    },
  },
  resolvedThemeState: {
    current: "light",
  },
  toasterPropsHistory: [] as Array<Record<string, unknown>>,
}))

vi.mock("~/contexts/ThemeContext", () => ({
  useTheme: () => ({
    resolvedTheme: resolvedThemeState.current,
  }),
}))

vi.mock("react-hot-toast", async () => {
  return {
    default: {
      dismiss: dismissMock,
    },
    Toaster: ({ children, ...props }: any) => {
      toasterPropsHistory.push(props)

      return (
        <div data-testid="mock-toaster">
          {typeof children === "function"
            ? children(renderedToastState.current)
            : children}
        </div>
      )
    },
    ToastBar: ({ toast, children }: any) => (
      <div data-testid={`toast-bar-${toast.id}`}>
        {typeof children === "function"
          ? children({
              icon: <span data-testid="toast-icon">icon</span>,
              message: <span data-testid="toast-message">message</span>,
            })
          : children}
      </div>
    ),
  }
})

describe("ThemeAwareToaster", () => {
  beforeEach(() => {
    dismissMock.mockReset()
    renderedToastState.current = {
      id: "toast-1",
      type: "success",
    }
    resolvedThemeState.current = "light"
    toasterPropsHistory.length = 0
  })

  it("uses default props and light theme styling for dismissible toasts", () => {
    render(<ThemeAwareToaster />)

    const toasterProps = toasterPropsHistory.at(-1)

    expect(toasterProps).toMatchObject({
      position: "bottom-center",
      reverseOrder: false,
      gutter: 8,
      containerClassName: "",
      containerStyle: undefined,
      toastOptions: expect.objectContaining({
        style: {
          background: "#fff",
          color: "#363636",
          border: "1px solid #e5e7eb",
        },
        success: {
          duration: 3000,
          iconTheme: {
            primary: "#059669",
            secondary: "#fff",
          },
        },
        error: {
          duration: 5000,
          iconTheme: {
            primary: "#dc2626",
            secondary: "#fff",
          },
        },
        loading: {
          iconTheme: {
            primary: "#2563eb",
            secondary: "#fff",
          },
        },
      }),
    })
    expect(screen.getByTestId("toast-icon")).toBeInTheDocument()
    expect(screen.getByTestId("toast-message")).toBeInTheDocument()

    const dismissButton = screen.getByRole("button", {
      name: "common:actions.close",
    })
    expect(dismissButton).toHaveAttribute("type", "button")

    fireEvent.click(dismissButton)

    expect(dismissMock).toHaveBeenCalledWith("toast-1")
  })

  it("applies custom props and dark theme colors", () => {
    renderedToastState.current = {
      id: "toast-2",
      type: "error",
    }
    resolvedThemeState.current = "dark"

    render(
      <ThemeAwareToaster
        reverseOrder
        position="top-right"
        containerClassName="toast-shell"
        containerStyle={{ zIndex: 99 }}
      />,
    )

    const toasterProps = toasterPropsHistory.at(-1)

    expect(toasterProps).toMatchObject({
      position: "top-right",
      reverseOrder: true,
      containerClassName: "toast-shell",
      containerStyle: { zIndex: 99 },
    })

    expect(toasterProps?.toastOptions).toMatchObject({
      style: {
        background: "#1e293b",
        color: "#f1f5f9",
        border: "1px solid #334155",
      },
      success: {
        iconTheme: {
          primary: "#10b981",
          secondary: "#1e293b",
        },
      },
      error: {
        iconTheme: {
          primary: "#ef4444",
          secondary: "#1e293b",
        },
      },
      loading: {
        iconTheme: {
          primary: "#3b82f6",
          secondary: "#1e293b",
        },
      },
    })
  })

  it("does not render a dismiss button for loading toasts", () => {
    renderedToastState.current = {
      id: "toast-loading",
      type: "loading",
    }

    render(<ThemeAwareToaster />)

    expect(screen.queryByRole("button")).not.toBeInTheDocument()
    expect(dismissMock).not.toHaveBeenCalled()
  })

  it("moves the global toaster into the active modal portal host", () => {
    function Harness() {
      const [isModalOpen, setIsModalOpen] = useState(false)

      return (
        <ToasterPortalProvider>
          <button type="button" onClick={() => setIsModalOpen(true)}>
            Open modal
          </button>
          <button type="button" onClick={() => setIsModalOpen(false)}>
            Close modal
          </button>
          <div data-testid="layout-toaster-slot">
            <ThemeAwareToaster />
          </div>
          {isModalOpen ? (
            <div data-testid="modal-shell">
              <ToasterPortalHost />
            </div>
          ) : null}
        </ToasterPortalProvider>
      )
    }

    render(<Harness />)

    expect(screen.getByTestId("layout-toaster-slot")).toContainElement(
      screen.getByTestId("mock-toaster"),
    )

    fireEvent.click(screen.getByRole("button", { name: "Open modal" }))

    expect(screen.getByTestId("modal-shell")).toContainElement(
      screen.getByTestId("mock-toaster"),
    )
    expect(screen.getByTestId("layout-toaster-slot")).not.toContainElement(
      screen.getByTestId("mock-toaster"),
    )

    fireEvent.click(screen.getByRole("button", { name: "Close modal" }))

    expect(screen.getByTestId("layout-toaster-slot")).toContainElement(
      screen.getByTestId("mock-toaster"),
    )
    expect(screen.queryByTestId("modal-shell")).not.toBeInTheDocument()
  })

  it("returns the toaster to the previous modal host when the top host closes", () => {
    function Harness() {
      const [isFirstModalOpen, setIsFirstModalOpen] = useState(false)
      const [isSecondModalOpen, setIsSecondModalOpen] = useState(false)

      return (
        <ToasterPortalProvider>
          <div data-testid="layout-toaster-slot">
            <ThemeAwareToaster />
          </div>
          <button type="button" onClick={() => setIsFirstModalOpen(true)}>
            Open first modal
          </button>
          <button type="button" onClick={() => setIsSecondModalOpen(true)}>
            Open second modal
          </button>
          <button type="button" onClick={() => setIsSecondModalOpen(false)}>
            Close second modal
          </button>
          <button type="button" onClick={() => setIsFirstModalOpen(false)}>
            Close first modal
          </button>
          {isFirstModalOpen ? (
            <div data-testid="first-modal-shell">
              <ToasterPortalHost />
            </div>
          ) : null}
          {isSecondModalOpen ? (
            <div data-testid="second-modal-shell">
              <ToasterPortalHost />
            </div>
          ) : null}
        </ToasterPortalProvider>
      )
    }

    render(<Harness />)

    fireEvent.click(screen.getByRole("button", { name: "Open first modal" }))

    expect(screen.getByTestId("first-modal-shell")).toContainElement(
      screen.getByTestId("mock-toaster"),
    )

    fireEvent.click(screen.getByRole("button", { name: "Open second modal" }))

    expect(screen.getByTestId("second-modal-shell")).toContainElement(
      screen.getByTestId("mock-toaster"),
    )

    fireEvent.click(screen.getByRole("button", { name: "Close second modal" }))

    expect(screen.getByTestId("first-modal-shell")).toContainElement(
      screen.getByTestId("mock-toaster"),
    )

    fireEvent.click(screen.getByRole("button", { name: "Close first modal" }))

    expect(screen.getByTestId("layout-toaster-slot")).toContainElement(
      screen.getByTestId("mock-toaster"),
    )
    expect(screen.queryByTestId("first-modal-shell")).not.toBeInTheDocument()
  })
})
