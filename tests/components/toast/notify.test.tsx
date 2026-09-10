import {
  act,
  fireEvent,
  render as renderDom,
  screen,
  waitFor,
} from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactElement } from "react"
import { useToasterStore } from "react-hot-toast/headless"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ThemeAwareToaster } from "~/components/ThemeAwareToaster"
import {
  ToasterPortalHost,
  ToasterPortalProvider,
} from "~/components/toast/ToasterPortal"
import { RedemptionToaster } from "~/entrypoints/content/redemptionAssist/components/RedemptionToaster"
import notify from "~/lib/notify"
import contentNotify from "~/lib/notify/content"
import { testI18n } from "~~/tests/test-utils/i18n"

vi.mock("~/contexts/ThemeContext", () => ({
  useTheme: () => ({ resolvedTheme: "light" }),
}))

const render = (ui: ReactElement) =>
  renderDom(ui, {
    wrapper: ({ children }) => (
      <I18nextProvider i18n={testI18n}>{children}</I18nextProvider>
    ),
  })

beforeEach(() => {
  // JSDOM has no layout; toast visibility depends on measuring its card height.
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    height: 48,
    width: 320,
    x: 0,
    y: 0,
    top: 0,
    bottom: 48,
    left: 0,
    right: 320,
    toJSON: () => ({}),
  })
})

afterEach(async () => {
  // Pointer interactions pause the vendor store globally; leave before unmount.
  document
    .querySelectorAll(".notification-test-host")
    .forEach((host) => fireEvent.mouseLeave(host))
  await act(async () => {
    notify.remove()
    contentNotify.remove()
  })
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe("notification facade", () => {
  it.each(["success", "error", "loading"] as const)(
    "applies shared %s lifetimes before a renderer mounts and preserves overrides",
    async (kind) => {
      const durations = { success: 3000, error: 5000, loading: Infinity }
      const Probe = () => {
        const { toasts } = useToasterStore()
        return (
          <output>
            {toasts.map((toast) => `${toast.id}:${toast.duration}`).join(",")}
          </output>
        )
      }
      let standard = ""
      let override = ""
      act(() => {
        standard = contentNotify[kind]("Default")
        override = contentNotify[kind]("Override", { duration: 9000 })
      })
      render(<Probe />)
      expect(screen.getByRole("status")).toHaveTextContent(
        `${standard}:${durations[kind]}`,
      )
      expect(screen.getByRole("status")).toHaveTextContent(`${override}:9000`)
    },
  )

  it.each(["success", "error"] as const)(
    "applies promise %s lifetimes and prioritizes per-state overrides",
    async (kind) => {
      const Probe = () => {
        const { toasts } = useToasterStore()
        return (
          <output>
            {toasts
              .map((toast) => `${toast.message}:${toast.duration}`)
              .join(",")}
          </output>
        )
      }
      render(<Probe />)
      for (const [label, options] of [
        ["Default", undefined],
        ["Global", { duration: 8000 }],
        ["State", { duration: 8000, [kind]: { duration: 9000 } }],
      ] as const) {
        await act(async () => {
          await contentNotify
            .promise(
              kind === "success"
                ? Promise.resolve()
                : Promise.reject(new Error("failed")),
              { loading: "Working", success: label, error: label },
              options,
            )
            .catch(() => undefined)
        })
      }
      expect(screen.getByRole("status")).toHaveTextContent(
        `Default:${kind === "success" ? 3000 : 5000}`,
      )
      expect(screen.getByRole("status")).toHaveTextContent("Global:8000")
      expect(screen.getByRole("status")).toHaveTextContent("State:9000")
    },
  )

  it.each([
    ["success", "circle-check"],
    ["error", "circle-x"],
    ["loading", "loader-circle"],
  ] as const)(
    "renders a default content %s icon and preserves custom icons",
    (kind, icon) => {
      render(<RedemptionToaster />)
      act(() => {
        contentNotify[kind]("Default icon")
      })
      expect(
        screen.getByRole("status").querySelector(`.lucide-${icon}`),
      ).not.toBeNull()
      act(() => {
        contentNotify.remove()
        contentNotify[kind]("Custom icon", { icon: <span>Custom marker</span> })
      })
      expect(screen.getByText("Custom marker")).toBeVisible()
      expect(
        screen.getByRole("status").querySelector(`.lucide-${icon}`),
      ).toBeNull()
    },
  )

  it.each(["info", "warning"] as const)(
    "normalizes %s text and skips empty notices without replacing an existing toast",
    async (kind) => {
      render(<ThemeAwareToaster containerClassName="notification-test-host" />)
      let id: string | undefined
      await act(async () => {
        id = notify[kind]("  Review this  ")
      })
      expect(id).toEqual(expect.any(String))
      expect(screen.getByText("Review this")).toBeVisible()
      await act(async () => {
        expect(notify[kind]("   ", { id })).toBeUndefined()
      })
      expect(screen.getAllByRole("status")).toHaveLength(1)
      expect(screen.getByText("Review this")).toBeVisible()
    },
  )

  it("keeps JSX and renderer notices usable", async () => {
    render(<ThemeAwareToaster containerClassName="notification-test-host" />)
    await act(async () => {
      notify.info(<strong>Details available</strong>)
      notify.warning(() => <span>Review details</span>)
    })
    expect(screen.getByText("Details available")).toBeVisible()
    expect(screen.getByText("Review details")).toBeVisible()
  })

  it("renders every completed severity through the same dismissible card", async () => {
    const user = userEvent.setup()
    render(<ThemeAwareToaster containerClassName="notification-test-host" />)
    act(() => {
      notify.success("Saved")
      notify.error("Failed")
      notify.info("No changes")
      notify.warning("Partial success")
    })
    expect(screen.getAllByRole("status")).toHaveLength(4)
    const closeButtons = screen.getAllByRole("button", {
      name: "common:actions.close",
    })
    expect(closeButtons).toHaveLength(4)
    await user.click(closeButtons[0])
    await waitFor(() => expect(screen.getAllByRole("status")).toHaveLength(3), {
      timeout: 2000,
    })
  })

  it("keeps loading until the same ID is updated, without adding another card", async () => {
    vi.useFakeTimers()
    render(<ThemeAwareToaster containerClassName="notification-test-host" />)
    let id = ""
    await act(async () => {
      id = notify.loading("Working")
    })
    await act(async () => {
      vi.advanceTimersByTime(10000)
    })
    expect(screen.getByText("Working")).toBeVisible()
    expect(
      screen.queryByRole("button", { name: "common:actions.close" }),
    ).not.toBeInTheDocument()
    await act(async () => {
      notify.warning("Some items failed", { id })
    })
    expect(screen.queryByText("Working")).not.toBeInTheDocument()
    expect(screen.getAllByRole("status")).toHaveLength(1)
    expect(screen.getByText("Some items failed")).toBeVisible()
  })

  it.each(["success", "promise"])(
    "resets a persistent warning when the same ID completes via %s",
    async (method) => {
      vi.useFakeTimers()
      render(<ThemeAwareToaster containerClassName="notification-test-host" />)
      let id: string | undefined
      await act(async () => {
        id = notify.warning("Needs attention", { duration: Infinity })
      })
      await act(async () => {
        if (method === "promise") {
          await notify.promise(
            Promise.resolve(),
            { loading: "Retrying", success: "Recovered", error: "Failed" },
            { id },
          )
        } else {
          notify.success("Recovered", { id })
        }
      })
      expect(screen.queryByText("Needs attention")).not.toBeInTheDocument()
      expect(screen.getByText("Recovered")).toBeVisible()
      expect(
        screen
          .getByRole("status")
          .parentElement?.querySelector(".lucide-triangle-alert"),
      ).toBeNull()
      await act(async () => {
        vi.advanceTimersByTime(3000)
      })
      await act(async () => {
        vi.advanceTimersByTime(1000)
      })
      expect(screen.queryByText("Recovered")).not.toBeInTheDocument()
    },
  )

  it("prevents duplicate actions, retains rejected actions for retry and dismisses on success", async () => {
    const user = userEvent.setup()
    let reject!: (reason?: unknown) => void
    const action = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((_resolve, rejectPromise) => {
            reject = rejectPromise
          }),
      )
      .mockResolvedValueOnce(undefined)
    render(<ThemeAwareToaster containerClassName="notification-test-host" />)
    act(() => {
      notify.warning("Partial sync", {
        duration: Infinity,
        action: { label: "Retry", pendingLabel: "Retrying", onClick: action },
      })
    })
    await user.click(screen.getByRole("button", { name: "Retry" }))
    const pending = screen.getByRole("button", { name: "Retrying" })
    expect(pending).toBeDisabled()
    await user.click(pending)
    expect(action).toHaveBeenCalledTimes(1)
    await act(async () => {
      reject(new Error("offline"))
    })
    expect(screen.getByRole("button", { name: "Retry" })).toBeEnabled()
    await user.click(screen.getByRole("button", { name: "Retry" }))
    await waitFor(
      () => expect(screen.queryByText("Partial sync")).not.toBeInTheDocument(),
      { timeout: 2000 },
    )
    expect(action).toHaveBeenCalledTimes(2)
  })

  it("renders warning and info inside the active modal host", () => {
    render(
      <ToasterPortalProvider>
        <ToasterPortalHost />
        <ThemeAwareToaster containerClassName="notification-test-host" />
      </ToasterPortalProvider>,
    )
    act(() => {
      notify.warning("Review changes")
      notify.info("Already current")
    })
    expect(
      screen
        .getByText("Review changes")
        .closest('[data-slot="toaster-portal-host"]'),
    ).not.toBeNull()
    expect(
      screen
        .getByText("Already current")
        .closest('[data-slot="toaster-portal-host"]'),
    ).not.toBeNull()
  })

  it("preserves promise results and replaces loading with the completion message", async () => {
    render(<ThemeAwareToaster containerClassName="notification-test-host" />)
    const work = Promise.resolve(42)
    await act(async () => {
      expect(
        await notify.promise(work, {
          loading: "Running",
          success: "Complete",
          error: "Failed",
        }),
      ).toBe(42)
    })
    expect(screen.getByText("Complete")).toBeVisible()
    expect(screen.queryByText("Running")).not.toBeInTheDocument()
  })

  it("keeps content notifications in their own store and preserves custom interactions", async () => {
    const user = userEvent.setup()
    const view = render(
      <ThemeAwareToaster containerClassName="notification-test-host" />,
    )
    act(() => {
      contentNotify.custom((instance) => (
        <button onClick={() => contentNotify.dismiss(instance.id)}>
          Finish content prompt
        </button>
      ))
    })
    expect(screen.queryByText("Finish content prompt")).not.toBeInTheDocument()
    view.rerender(
      <>
        <ThemeAwareToaster containerClassName="notification-test-host" />
        <RedemptionToaster />
      </>,
    )
    await user.click(
      screen.getByRole("button", { name: "Finish content prompt" }),
    )
    expect(screen.queryByText("Finish content prompt")).not.toBeInTheDocument()
  })
})
