import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { TokenListItem } from "~/features/KeyManagement/components/TokenListItem"
import type { AccountToken, DisplaySiteData } from "~/types"
import { render, screen } from "~~/tests/test-utils/render"
import {
  createAccount,
  createToken,
} from "~~/tests/utils/keyManagementFactories"

vi.mock("~/components/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/components/ui")>()

  return {
    ...actual,
    Card: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    CardContent: ({ children }: { children: ReactNode }) => (
      <div>{children}</div>
    ),
    Checkbox: ({
      checked,
      "aria-label": ariaLabel,
      onCheckedChange,
    }: {
      checked?: boolean
      "aria-label"?: string
      onCheckedChange?: (checked: boolean | "indeterminate" | undefined) => void
    }) => (
      <div>
        <button
          type="button"
          role="checkbox"
          aria-checked={checked === true}
          aria-label={ariaLabel}
          onClick={() => onCheckedChange?.(!checked)}
        />
        <button
          type="button"
          aria-label="emit indeterminate selection"
          onClick={() => onCheckedChange?.("indeterminate")}
        />
      </div>
    ),
  }
})

vi.mock("~/features/KeyManagement/components/TokenListItem/KeyDisplay", () => ({
  KeyDisplay: ({
    toggleKeyVisibility,
  }: {
    toggleKeyVisibility?: () => void
  }) => (
    <div>
      <div>Key display</div>
      <button type="button" onClick={toggleKeyVisibility}>
        Toggle key visibility
      </button>
    </div>
  ),
}))

vi.mock(
  "~/features/KeyManagement/components/TokenListItem/TokenDetails",
  () => ({
    TokenDetails: () => <div>Token details</div>,
  }),
)

vi.mock(
  "~/features/KeyManagement/components/TokenListItem/TokenHeader",
  () => ({
    TokenHeader: ({
      token,
      onOpenCCSwitchDialog,
    }: {
      token: { name: string }
      onOpenCCSwitchDialog?: () => void
    }) => (
      <div>
        <div>{token.name}</div>
        <button type="button" onClick={onOpenCCSwitchDialog}>
          Open CC Switch
        </button>
      </div>
    ),
  }),
)

const renderTokenListItem = (props?: {
  isSelected?: boolean
  onSelectionChange?: (checked: boolean) => void
  tokenGroup?: string
  toggleKeyVisibility?: (
    account: DisplaySiteData,
    token: AccountToken,
  ) => Promise<void>
  onOpenCCSwitchDialog?: (token: AccountToken, account: DisplaySiteData) => void
}) => {
  const account = createAccount({ id: "acc-1", name: "Account 1" })
  const token = createToken({
    id: 1,
    name: "Token 1",
    accountId: account.id,
    accountName: account.name,
    group: props?.tokenGroup,
  })

  return render(
    <TokenListItem
      token={token as any}
      displayTokenKey={token.key}
      visibleKeys={new Set()}
      isKeyVisibilityLoading={false}
      toggleKeyVisibility={props?.toggleKeyVisibility ?? (async () => {})}
      copyKey={vi.fn()}
      handleEditToken={vi.fn()}
      handleDeleteToken={vi.fn()}
      account={account as any}
      onOpenCCSwitchDialog={props?.onOpenCCSwitchDialog ?? (() => {})}
      isSelected={props?.isSelected}
      onSelectionChange={props?.onSelectionChange}
    />,
  )
}

describe("TokenListItem batch selection", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("reflects the selected state and emits boolean checkbox changes", async () => {
    const user = userEvent.setup()
    const onSelectionChange = vi.fn()
    const { rerender } = renderTokenListItem({
      isSelected: false,
      onSelectionChange,
    })

    const checkbox = await screen.findByRole("checkbox", {
      name: "keyManagement:batchManagedSiteExport.selection.rowLabel",
    })
    expect(checkbox).toHaveAttribute("aria-checked", "false")

    await user.click(checkbox)
    expect(onSelectionChange).toHaveBeenLastCalledWith(true)

    rerender(
      <TokenListItem
        token={
          createToken({
            id: 1,
            name: "Token 1",
            accountId: "acc-1",
            accountName: "Account 1",
          }) as any
        }
        displayTokenKey="test-key"
        visibleKeys={new Set()}
        isKeyVisibilityLoading={false}
        toggleKeyVisibility={vi.fn()}
        copyKey={vi.fn()}
        handleEditToken={vi.fn()}
        handleDeleteToken={vi.fn()}
        account={createAccount({ id: "acc-1", name: "Account 1" }) as any}
        onOpenCCSwitchDialog={vi.fn()}
        isSelected={true}
        onSelectionChange={onSelectionChange}
      />,
    )

    expect(
      await screen.findByRole("checkbox", {
        name: "keyManagement:batchManagedSiteExport.selection.rowLabel",
      }),
    ).toHaveAttribute("aria-checked", "true")

    await user.click(
      screen.getByRole("checkbox", {
        name: "keyManagement:batchManagedSiteExport.selection.rowLabel",
      }),
    )
    expect(onSelectionChange).toHaveBeenLastCalledWith(false)
  })

  it("coerces non-checked values to false", async () => {
    const user = userEvent.setup()
    const onSelectionChange = vi.fn()
    renderTokenListItem({
      isSelected: true,
      onSelectionChange,
    })

    await user.click(
      await screen.findByRole("button", {
        name: "emit indeterminate selection",
      }),
    )

    expect(onSelectionChange).toHaveBeenCalledWith(false)
  })

  it("passes wrapped header and key-display callbacks through to child components", async () => {
    const user = userEvent.setup()
    const onOpenCCSwitchDialog = vi.fn()
    const toggleKeyVisibility = vi.fn()

    renderTokenListItem({
      onOpenCCSwitchDialog,
      onSelectionChange: vi.fn(),
      toggleKeyVisibility,
    })

    expect(await screen.findByText("Token 1")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Open CC Switch" }))
    expect(onOpenCCSwitchDialog).toHaveBeenCalledTimes(1)

    await user.click(
      screen.getByRole("button", { name: "Toggle key visibility" }),
    )
    expect(toggleKeyVisibility).toHaveBeenCalledWith(
      expect.objectContaining({ id: "acc-1" }),
      expect.objectContaining({ id: 1 }),
    )
  })

  it("omits the selection checkbox when batch selection is unavailable", async () => {
    renderTokenListItem({
      tokenGroup: "managed-sites",
    })

    expect(await screen.findByText("Token 1")).toBeInTheDocument()
    expect(
      screen.queryByRole("checkbox", {
        name: "keyManagement:batchManagedSiteExport.selection.rowLabel",
      }),
    ).toBeNull()
  })
})
