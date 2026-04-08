import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { TempWindowFallbackReminderDialog } from "~/features/AccountManagement/components/TempWindowFallbackReminderDialog"
import { TEMP_WINDOW_HEALTH_STATUS_CODES } from "~/types"

const {
  getProtectionBypassUiVariantMock,
  openSettingsTabMock,
  protectionBypassVariants,
} = vi.hoisted(() => ({
  getProtectionBypassUiVariantMock: vi.fn(),
  openSettingsTabMock: vi.fn().mockResolvedValue(undefined),
  protectionBypassVariants: {
    TempWindowOnly: "temp-window-only",
    TempWindowWithCookieInterceptor: "temp-window-cookie-interceptor",
  },
}))

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>()

  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, options?: Record<string, unknown>) =>
        JSON.stringify({
          key,
          options,
        }),
    }),
  }
})

vi.mock("~/components/ui", () => ({
  Button: ({
    children,
    onClick,
    variant,
  }: {
    children: React.ReactNode
    onClick?: () => void
    variant?: string
  }) => (
    <button type="button" data-variant={variant} onClick={onClick}>
      {children}
    </button>
  ),
  WorkflowTransitionButton: ({
    children,
    onClick,
    variant,
  }: {
    children: React.ReactNode
    onClick?: () => void
    variant?: string
  }) => (
    <button type="button" data-variant={variant} onClick={onClick}>
      {children}
    </button>
  ),
  Heading4: ({ children }: { children: React.ReactNode }) => (
    <h4>{children}</h4>
  ),
  Modal: ({
    children,
    footer,
    header,
    isOpen,
    onClose,
  }: {
    children: React.ReactNode
    footer?: React.ReactNode
    header?: React.ReactNode
    isOpen: boolean
    onClose?: () => void
  }) => (
    <section data-open={String(isOpen)}>
      <button type="button" onClick={onClose}>
        modal close
      </button>
      <div>{header}</div>
      <div>{children}</div>
      <div>{footer}</div>
    </section>
  ),
}))

vi.mock("~/utils/browser/protectionBypass", () => ({
  getProtectionBypassUiVariant: () => getProtectionBypassUiVariantMock(),
  ProtectionBypassUiVariants: protectionBypassVariants,
}))

vi.mock("~/utils/navigation", () => ({
  openSettingsTab: (...args: unknown[]) => openSettingsTabMock(...args),
}))

describe("TempWindowFallbackReminderDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getProtectionBypassUiVariantMock.mockReturnValue(
      protectionBypassVariants.TempWindowOnly,
    )
  })

  it("renders the permission-required copy for the cookie-interceptor variant and opens settings", async () => {
    const onClose = vi.fn()
    getProtectionBypassUiVariantMock.mockReturnValue(
      protectionBypassVariants.TempWindowWithCookieInterceptor,
    )

    render(
      <TempWindowFallbackReminderDialog
        isOpen
        issue={{
          code: TEMP_WINDOW_HEALTH_STATUS_CODES.PERMISSION_REQUIRED,
          accountId: "acc-1",
          accountName: "Relay",
          settingsTab: "permissions",
        }}
        onClose={onClose}
        onNeverRemind={vi.fn()}
      />,
    )

    expect(
      screen.getByText(
        JSON.stringify({
          key: "ui:dialog.tempWindowFallbackReminder.titleWithCookieInterceptor",
        }),
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        JSON.stringify({
          key: "ui:dialog.tempWindowFallbackReminder.descriptionPermissionWithCookieInterceptor",
          options: { accountName: "Relay" },
        }),
      ),
    ).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole("button", {
        name: JSON.stringify({
          key: "ui:dialog.tempWindowFallbackReminder.actions.openSettings",
        }),
      }),
    )

    await waitFor(() => {
      expect(openSettingsTabMock).toHaveBeenCalledWith("permissions", {
        preserveHistory: true,
      })
    })
    expect(onClose).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole("button", { name: "modal close" }))

    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it("renders the disabled temp-window-only copy and closes after never-remind resolves", async () => {
    const onClose = vi.fn()
    const onNeverRemind = vi.fn().mockResolvedValue(undefined)

    render(
      <TempWindowFallbackReminderDialog
        isOpen
        issue={{
          code: TEMP_WINDOW_HEALTH_STATUS_CODES.DISABLED,
          accountId: "acc-2",
          accountName: "Blocked account",
          settingsTab: "refresh",
        }}
        onClose={onClose}
        onNeverRemind={onNeverRemind}
      />,
    )

    expect(
      screen.getByText(
        JSON.stringify({
          key: "ui:dialog.tempWindowFallbackReminder.titleTempWindowOnly",
        }),
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        JSON.stringify({
          key: "ui:dialog.tempWindowFallbackReminder.descriptionDisabledTempWindowOnly",
          options: { accountName: "Blocked account" },
        }),
      ),
    ).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole("button", {
        name: JSON.stringify({
          key: "ui:dialog.tempWindowFallbackReminder.actions.notNow",
        }),
      }),
    )

    expect(onClose).toHaveBeenCalledTimes(1)

    fireEvent.click(
      screen.getByRole("button", {
        name: JSON.stringify({
          key: "ui:dialog.tempWindowFallbackReminder.actions.neverRemind",
        }),
      }),
    )

    await waitFor(() => {
      expect(onNeverRemind).toHaveBeenCalledTimes(1)
    })
    expect(onClose).toHaveBeenCalledTimes(2)
    expect(openSettingsTabMock).not.toHaveBeenCalled()
  })

  it.each([
    {
      issueCode: TEMP_WINDOW_HEALTH_STATUS_CODES.PERMISSION_REQUIRED,
      variant: protectionBypassVariants.TempWindowOnly,
      titleKey: "ui:dialog.tempWindowFallbackReminder.titleTempWindowOnly",
      descriptionKey:
        "ui:dialog.tempWindowFallbackReminder.descriptionPermissionTempWindowOnly",
    },
    {
      issueCode: TEMP_WINDOW_HEALTH_STATUS_CODES.DISABLED,
      variant: protectionBypassVariants.TempWindowWithCookieInterceptor,
      titleKey:
        "ui:dialog.tempWindowFallbackReminder.titleWithCookieInterceptor",
      descriptionKey:
        "ui:dialog.tempWindowFallbackReminder.descriptionDisabledWithCookieInterceptor",
    },
  ])(
    "renders the expected copy for $descriptionKey",
    ({ descriptionKey, issueCode, titleKey, variant }) => {
      getProtectionBypassUiVariantMock.mockReturnValue(variant)

      render(
        <TempWindowFallbackReminderDialog
          isOpen
          issue={{
            code: issueCode,
            accountId: "acc-3",
            accountName: "Variant account",
            settingsTab:
              issueCode === TEMP_WINDOW_HEALTH_STATUS_CODES.PERMISSION_REQUIRED
                ? "permissions"
                : "refresh",
          }}
          onClose={vi.fn()}
          onNeverRemind={vi.fn()}
        />,
      )

      expect(
        screen.getByText(
          JSON.stringify({
            key: titleKey,
          }),
        ),
      ).toBeInTheDocument()
      expect(
        screen.getByText(
          JSON.stringify({
            key: descriptionKey,
            options: { accountName: "Variant account" },
          }),
        ),
      ).toBeInTheDocument()
    },
  )
})
