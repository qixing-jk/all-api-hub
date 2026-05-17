import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import ThemeToggle from "~/entrypoints/options/components/ThemeToggle"

const { themeState } = vi.hoisted(() => ({
  themeState: {
    current: {
      resolvedTheme: "light" as "light" | "dark",
      setThemeMode: vi.fn(),
      themeMode: "light" as "light" | "dark" | "system",
    },
  },
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key}:${JSON.stringify(options)}` : key,
  }),
}))

vi.mock("~/contexts/ThemeContext", () => ({
  useTheme: () => themeState.current,
}))

vi.mock("~/components/ui", () => ({
  Caption: ({
    children,
    className,
  }: {
    children: React.ReactNode
    className?: string
  }) => (
    <div data-testid="caption" className={className}>
      {children}
    </div>
  ),
  CardItem: ({
    description,
    leftContent,
    rightContent,
    title,
  }: {
    description: React.ReactNode
    leftContent: React.ReactNode
    rightContent: React.ReactNode
    title: React.ReactNode
  }) => (
    <section>
      <h2>{title}</h2>
      <p>{description}</p>
      <div data-testid="left-content">{leftContent}</div>
      <div data-testid="right-content">{rightContent}</div>
    </section>
  ),
  ToggleButton: ({
    children,
    className,
    onClick,
    title,
    "aria-label": ariaLabel,
  }: {
    children: React.ReactNode
    className?: string
    onClick: () => void
    title?: string
    "aria-label"?: string
  }) => (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={ariaLabel}
      className={className}
    >
      {children}
    </button>
  ),
}))

describe("ThemeToggle", () => {
  beforeEach(() => {
    themeState.current = {
      resolvedTheme: "light",
      setThemeMode: vi.fn(),
      themeMode: "light",
    }
  })

  it("renders the active theme state, highlights the selected option, and switches modes", () => {
    themeState.current.resolvedTheme = "dark"

    render(<ThemeToggle />)

    expect(screen.getByText("theme.appearance")).toBeInTheDocument()
    expect(screen.getByText("theme.selectTheme")).toBeInTheDocument()
    expect(screen.getByTestId("caption")).toHaveTextContent(
      'theme.currentTheme:{"theme":"settings:theme.light","resolvedTheme":"theme.dark"}',
    )

    const lightButton = screen.getByRole("button", {
      name: 'theme.switchTo:{"theme":"settings:theme.light","description":"settings:theme.useLightTheme"}',
    })
    const darkButton = screen.getByRole("button", {
      name: 'theme.switchTo:{"theme":"settings:theme.dark","description":"settings:theme.useDarkTheme"}',
    })
    const systemButton = screen.getByRole("button", {
      name: 'theme.switchTo:{"theme":"settings:theme.followSystem","description":"settings:theme.followSystemTheme"}',
    })

    expect(lightButton.querySelector("svg")).toHaveClass("text-blue-500")
    expect(darkButton.querySelector("svg")).toHaveClass("text-gray-500")
    expect(systemButton.querySelector("svg")).toHaveClass("text-gray-500")

    fireEvent.click(darkButton)
    fireEvent.click(systemButton)

    expect(themeState.current.setThemeMode).toHaveBeenNthCalledWith(1, "dark")
    expect(themeState.current.setThemeMode).toHaveBeenNthCalledWith(2, "system")
  })

  it("shows the resolved light label when following the system theme", () => {
    themeState.current.themeMode = "system"

    render(<ThemeToggle />)

    expect(screen.getByTestId("caption")).toHaveTextContent(
      'theme.currentTheme:{"theme":"settings:theme.followSystem","resolvedTheme":"theme.light"}',
    )

    const systemButton = screen.getByRole("button", {
      name: 'theme.switchTo:{"theme":"settings:theme.followSystem","description":"settings:theme.followSystemTheme"}',
    })
    const lightButton = screen.getByRole("button", {
      name: 'theme.switchTo:{"theme":"settings:theme.light","description":"settings:theme.useLightTheme"}',
    })

    expect(systemButton.querySelector("svg")).toHaveClass("text-blue-500")
    expect(lightButton.querySelector("svg")).toHaveClass("text-gray-500")

    fireEvent.click(lightButton)

    expect(themeState.current.setThemeMode).toHaveBeenCalledWith("light")
  })

  it("lets theme options wrap cleanly inside narrow settings cards", () => {
    render(<ThemeToggle />)

    const rightContent = screen.getByTestId("right-content")
    const optionGroup = rightContent.firstElementChild

    expect(optionGroup).toHaveClass(
      "flex",
      "w-full",
      "flex-wrap",
      "[@container(min-width:42rem)]:w-auto",
    )

    expect(
      screen.getByRole("button", {
        name: 'theme.switchTo:{"theme":"settings:theme.followSystem","description":"settings:theme.followSystemTheme"}',
      }),
    ).toHaveClass(
      "min-w-fit",
      "flex-1",
      "[@container(min-width:42rem)]:flex-none",
    )
  })
})
