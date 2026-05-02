import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"

import { TokenListItem } from "~/features/KeyManagement/components/TokenListItem"
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
  KeyDisplay: () => <div>Key display</div>,
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
    TokenHeader: ({ token }: { token: { name: string } }) => (
      <div>{token.name}</div>
    ),
  }),
)

const renderTokenListItem = (props?: {
  isSelected?: boolean
  onSelectionChange?: (checked: boolean) => void
}) => {
  const account = createAccount({ id: "acc-1", name: "Account 1" })
  const token = createToken({
    id: 1,
    name: "Token 1",
    accountId: account.id,
    accountName: account.name,
  })

  return render(
    <TokenListItem
      token={token as any}
      displayTokenKey={token.key}
      visibleKeys={new Set()}
      isKeyVisibilityLoading={false}
      toggleKeyVisibility={vi.fn()}
      copyKey={vi.fn()}
      handleEditToken={vi.fn()}
      handleDeleteToken={vi.fn()}
      account={account as any}
      onOpenCCSwitchDialog={vi.fn()}
      isSelected={props?.isSelected}
      onSelectionChange={props?.onSelectionChange}
    />,
  )
}

describe("TokenListItem batch selection", () => {
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
})
