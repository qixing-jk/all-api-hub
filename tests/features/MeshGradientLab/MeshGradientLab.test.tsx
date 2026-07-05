import { fireEvent, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import MeshGradientLab from "~/features/MeshGradientLab/MeshGradientLab"

const {
  mockDrawMeshGradientBackground,
  mockDrawShareSnapshotOverlay,
  mockCreateShareSnapshotSeed,
} = vi.hoisted(() => ({
  mockDrawMeshGradientBackground: vi.fn(),
  mockDrawShareSnapshotOverlay: vi.fn(),
  mockCreateShareSnapshotSeed: vi.fn(),
}))

vi.mock("~/services/sharing/shareSnapshots/meshGradient", () => ({
  MESH_GRADIENT_LAYOUT_COUNT: 2,
  MESH_GRADIENT_PALETTES: [
    { colors: ["#ff0000", "#00ff00"] },
    { colors: ["#0000ff", "#ffff00"] },
  ],
}))

vi.mock("~/services/sharing/shareSnapshots/meshGradientBackground", () => ({
  drawMeshGradientBackground: mockDrawMeshGradientBackground,
}))

vi.mock("~/services/sharing/shareSnapshots/shareSnapshotOverlay", () => ({
  drawShareSnapshotOverlay: mockDrawShareSnapshotOverlay,
}))

vi.mock("~/services/sharing/shareSnapshots/utils", () => ({
  createShareSnapshotSeed: mockCreateShareSnapshotSeed,
}))

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>()

  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string) => key,
    }),
  }
})

vi.mock("~/components/PageHeader", () => ({
  PageHeader: ({
    title,
    actions,
  }: {
    title: ReactNode
    actions?: ReactNode
  }) => (
    <header>
      <h1>{title}</h1>
      {actions}
    </header>
  ),
}))

vi.mock("~/components/ui", () => ({
  Button: ({
    children,
    onClick,
  }: {
    children: ReactNode
    onClick?: () => void
  }) => <button onClick={() => onClick?.()}>{children}</button>,
  Card: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CardContent: ({
    children,
    className,
  }: {
    children: ReactNode
    className?: string
  }) => <div className={className}>{children}</div>,
  Input: ({
    value,
    onChange,
    type,
    min,
    max,
  }: {
    value?: number
    onChange?: (event: { target: { value: string } }) => void
    type?: string
    min?: number
    max?: number
  }) => (
    <input
      aria-label={
        type === "number"
          ? `number-input-${min ?? "na"}-${max ?? "na"}`
          : "input"
      }
      type={type}
      value={value}
      onChange={(event) =>
        onChange?.({ target: { value: event.currentTarget.value } })
      }
    />
  ),
  Label: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  Switch: ({
    checked,
    onChange,
  }: {
    checked: boolean
    onChange?: (checked: boolean) => void
  }) => (
    <input
      aria-label="mesh-overlay-switch"
      type="checkbox"
      checked={checked}
      onChange={(event) => onChange?.(event.currentTarget.checked)}
    />
  ),
  ToggleButton: ({
    children,
    isActive,
    onClick,
  }: {
    children: ReactNode
    isActive?: boolean
    onClick?: () => void
  }) => (
    <button aria-pressed={isActive} onClick={() => onClick?.()}>
      {children}
    </button>
  ),
}))

describe("MeshGradientLab", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateShareSnapshotSeed.mockReturnValue(314)

    const fakeContext = {
      setTransform: vi.fn(),
      scale: vi.fn(),
      clearRect: vi.fn(),
      globalCompositeOperation: "source-over",
      globalAlpha: 1,
      filter: "none",
    }

    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      fakeContext as unknown as CanvasRenderingContext2D,
    )
    Object.defineProperty(window, "devicePixelRatio", {
      value: 2,
      configurable: true,
    })
  })

  it("renders palette previews by default and draws both background and overlay", () => {
    render(<MeshGradientLab />)

    expect(
      screen.getByRole("heading", { name: "meshGradientLab:title" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "meshGradientLab:view.palettes" }),
    ).toHaveAttribute("aria-pressed", "true")
    expect(
      screen.getByText(
        "meshGradientLab:summaryPalette · meshGradientLab:summaryLayout",
      ),
    ).toBeInTheDocument()

    expect(mockDrawMeshGradientBackground).toHaveBeenCalledTimes(2)
    expect(mockDrawMeshGradientBackground).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      expect.objectContaining({
        seed: 42,
        paletteIndex: 0,
        layoutIndex: 0,
        width: 220,
        height: 220,
      }),
    )
    expect(mockDrawShareSnapshotOverlay).toHaveBeenCalledTimes(2)
    expect(screen.getByTitle("#ff0000")).toBeInTheDocument()
    expect(screen.getByTitle("#0000ff")).toBeInTheDocument()
  })

  it("toggles overlay and switches to layouts view with clamped palette selection", () => {
    render(<MeshGradientLab />)

    mockDrawMeshGradientBackground.mockClear()
    mockDrawShareSnapshotOverlay.mockClear()

    fireEvent.click(screen.getByLabelText("mesh-overlay-switch"))

    expect(mockDrawMeshGradientBackground).toHaveBeenCalledTimes(2)
    expect(mockDrawShareSnapshotOverlay).not.toHaveBeenCalled()

    fireEvent.click(
      screen.getByRole("button", { name: "meshGradientLab:view.layouts" }),
    )
    fireEvent.change(screen.getByLabelText("number-input-0-1"), {
      target: { value: "99" },
    })

    expect(
      screen.getByRole("button", { name: "meshGradientLab:view.layouts" }),
    ).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByLabelText("number-input-0-1")).toHaveValue(1)
    expect(mockDrawMeshGradientBackground).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        paletteIndex: 1,
        layoutIndex: 1,
      }),
    )
  })

  it("shuffles the seed and normalizes invalid numeric input back to zero", () => {
    render(<MeshGradientLab />)

    mockDrawMeshGradientBackground.mockClear()

    fireEvent.click(
      screen.getByRole("button", {
        name: "meshGradientLab:actions.shuffleSeed",
      }),
    )

    expect(mockCreateShareSnapshotSeed).toHaveBeenCalledTimes(1)
    expect(mockDrawMeshGradientBackground).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      expect.objectContaining({
        seed: 314,
      }),
    )

    fireEvent.change(screen.getByLabelText("number-input-na-na"), {
      target: { value: "invalid" },
    })

    expect(screen.getByLabelText("number-input-na-na")).toHaveValue(0)
    expect(mockDrawMeshGradientBackground).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        seed: 0,
      }),
    )
  })
})
