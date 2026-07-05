import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import React, { createContext, useContext } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { LanguageSwitcher } from "~/components/LanguageSwitcher"

const { changeLanguageMock, setLanguageMock, translationState } = vi.hoisted(
  () => ({
    changeLanguageMock: vi.fn().mockResolvedValue(undefined),
    setLanguageMock: vi.fn().mockResolvedValue(undefined),
    translationState: {
      language: "en",
      resolvedLanguage: "en",
    },
  }),
)

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>()

  return {
    ...actual,
    useTranslation: () => ({
      i18n: {
        language: translationState.language,
        resolvedLanguage: translationState.resolvedLanguage,
        changeLanguage: changeLanguageMock,
      },
      t: (key: string, options?: Record<string, unknown>) => {
        if (key === "appearanceLanguage.switcher.currentLanguage") {
          return `Current: ${options?.language}`
        }
        if (key === "appearanceLanguage.switcher.switchToLanguage") {
          return `Switch to ${options?.language}`
        }
        if (key === "appearanceLanguage.switcher.groupLabel") {
          return "Language"
        }

        return key
      },
    }),
  }
})

vi.mock("~/services/preferences/userPreferences", () => ({
  userPreferences: {
    setLanguage: (...args: unknown[]) => setLanguageMock(...args),
  },
}))

const selectContext = createContext<{
  onValueChange?: (value: string) => void
} | null>(null)
const radioContext = createContext<{
  onValueChange?: (value: string) => void
  value?: string
} | null>(null)

vi.mock("~/components/ui", () => ({
  IconButton: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
  Select: ({
    children,
    onValueChange,
  }: {
    children: React.ReactNode
    onValueChange?: (value: string) => void
  }) => (
    <selectContext.Provider value={{ onValueChange }}>
      <div>{children}</div>
    </selectContext.Provider>
  ),
  SelectContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SelectItem: ({
    children,
    onPointerUp,
    value,
  }: {
    children: React.ReactNode
    onPointerUp?: () => void
    value: string
  }) => {
    const context = useContext(selectContext)

    return (
      <button
        type="button"
        onClick={() => context?.onValueChange?.(value)}
        onPointerUp={onPointerUp}
      >
        {children}
      </button>
    )
  },
  SelectTrigger: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
  SelectValue: () => <span>value</span>,
  ToggleButton: ({
    children,
    isActive,
    showActiveIndicator,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    isActive?: boolean
    showActiveIndicator?: boolean
  }) => (
    <button type="button" data-active={String(Boolean(isActive))} {...props}>
      {showActiveIndicator ? <span data-testid="active-indicator" /> : null}
      {children}
    </button>
  ),
}))

vi.mock("~/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuRadioGroup: ({
    children,
    onValueChange,
    value,
  }: {
    children: React.ReactNode
    onValueChange?: (value: string) => void
    value?: string
  }) => (
    <radioContext.Provider value={{ onValueChange, value }}>
      <div>{children}</div>
    </radioContext.Provider>
  ),
  DropdownMenuRadioItem: ({
    children,
    value,
  }: {
    children: React.ReactNode
    value: string
  }) => {
    const context = useContext(radioContext)
    return (
      <button
        type="button"
        data-checked={String(context?.value === value)}
        onClick={() => context?.onValueChange?.(value)}
      >
        {children}
      </button>
    )
  },
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}))

describe("LanguageSwitcher", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    translationState.language = "en"
    translationState.resolvedLanguage = "en"
  })

  it("persists active inline clicks and changes language for inactive inline options", async () => {
    translationState.language = "fr"
    translationState.resolvedLanguage = "fr"

    render(<LanguageSwitcher />)

    const activeButton = screen.getByRole("button", {
      name: "Current: settings:appearanceLanguage.switcher.options.zh-CN.name",
    })
    const nextButton = screen.getByRole("button", {
      name: "Switch to settings:appearanceLanguage.switcher.options.ja.name",
    })

    expect(activeButton).toHaveAttribute("aria-pressed", "true")

    fireEvent.click(activeButton)

    await waitFor(() => {
      expect(setLanguageMock).toHaveBeenCalledWith("zh-CN")
    })

    fireEvent.click(nextButton)

    expect(changeLanguageMock).toHaveBeenCalledTimes(1)
    expect(changeLanguageMock).toHaveBeenCalledWith("ja")
    await waitFor(() => {
      expect(setLanguageMock).toHaveBeenCalledTimes(2)
    })
    expect(setLanguageMock).toHaveBeenNthCalledWith(1, "zh-CN")
    expect(setLanguageMock).toHaveBeenNthCalledWith(2, "ja")
  })

  it("allows inline language options to wrap inside narrow settings cards", () => {
    render(<LanguageSwitcher />)

    const group = screen.getByRole("group", { name: "Language" })
    const activeButton = screen.getByRole("button", {
      name: "Current: settings:appearanceLanguage.switcher.options.en.name",
    })

    expect(group.parentElement).toHaveClass("w-full")
    expect(group).toHaveClass(
      "flex",
      "w-full",
      "flex-wrap",
      "[@container(min-width:42rem)]:w-auto",
    )
    expect(activeButton).toHaveClass(
      "min-w-[3rem]",
      "flex-1",
      "[@container(min-width:42rem)]:flex-none",
    )
  })

  it("uses the select variant trigger label and persists the already-active language from pointer-up", () => {
    render(<LanguageSwitcher variant="select" compact showIcon={false} />)

    expect(
      screen.getByRole("button", {
        name: "Current: settings:appearanceLanguage.switcher.options.en.name",
      }),
    ).toBeInTheDocument()

    const activeSelectItem = screen.getByRole("button", {
      name: "settings:appearanceLanguage.switcher.options.en.name",
    })

    fireEvent.pointerUp(activeSelectItem)

    expect(changeLanguageMock).not.toHaveBeenCalled()
    expect(setLanguageMock).toHaveBeenCalledWith("en")
  })

  it("changes language from the select variant when a different option is chosen", async () => {
    render(<LanguageSwitcher variant="select" />)

    fireEvent.click(
      screen.getByRole("button", {
        name: "settings:appearanceLanguage.switcher.options.ja.name",
      }),
    )

    expect(changeLanguageMock).toHaveBeenCalledWith("ja")
    await waitFor(() => {
      expect(setLanguageMock).toHaveBeenCalledWith("ja")
    })
  })

  it("shows and persists Vietnamese from the select variant", async () => {
    render(<LanguageSwitcher variant="select" />)

    fireEvent.click(
      screen.getByRole("button", {
        name: "settings:appearanceLanguage.switcher.options.vi.name",
      }),
    )

    expect(changeLanguageMock).toHaveBeenCalledWith("vi")
    await waitFor(() => {
      expect(setLanguageMock).toHaveBeenCalledWith("vi")
    })
  })

  it("shows and persists latin american spanish from the select variant", async () => {
    render(<LanguageSwitcher variant="select" />)

    fireEvent.click(
      screen.getByRole("button", {
        name: "settings:appearanceLanguage.switcher.options.es-419.name",
      }),
    )

    expect(changeLanguageMock).toHaveBeenCalledWith("es-419")
    await waitFor(() => {
      expect(setLanguageMock).toHaveBeenCalledWith("es-419")
    })
  })

  it("renders the icon-dropdown trigger label and changes language from the radio menu", () => {
    render(<LanguageSwitcher variant="icon-dropdown" />)

    expect(
      screen.getByRole("button", {
        name: "Language: Current: settings:appearanceLanguage.switcher.options.en.name",
      }),
    ).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole("button", {
        name: "settings:appearanceLanguage.switcher.options.ja.name",
      }),
    )

    expect(changeLanguageMock).toHaveBeenCalledWith("ja")
    return waitFor(() => {
      expect(setLanguageMock).toHaveBeenCalledWith("ja")
    })
  })
})
