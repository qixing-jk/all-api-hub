import "./copyKeyDialogMocks"

import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import CopyKeyDialog from "~/features/AccountManagement/components/CopyKeyDialog"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"
import { act, render, screen, within } from "~~/tests/test-utils/render"

import {
  fetchAccountTokensMock,
  listAccountKeyResourcesMock,
  openKeysPageMock,
} from "./copyKeyDialogMocks"
import {
  ACCOUNT,
  AIHUBMIX_ACCOUNT,
  createDeferred,
  OPENROUTER_ACCOUNT,
  OPENROUTER_KEY_FACTS,
  setupCopyKeyDialogTestDefaults,
  TOKEN,
} from "./copyKeyDialogTestSupport"

describe("CopyKeyDialog inventory", () => {
  beforeEach(() => {
    setupCopyKeyDialogTestDefaults()
  })

  it("keeps AIHubMix saved keys visible without secret-dependent actions", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([
      {
        ...TOKEN,
        key: "sk-created********masked",
        name: "Saved masked key",
      },
    ])

    const user = userEvent.setup()

    render(
      <CopyKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={AIHUBMIX_ACCOUNT}
      />,
    )

    expect(await screen.findByText("Saved masked key")).toBeVisible()
    expect(
      screen.getByText("keyManagement:keyDetails.createResponseOnlySecret"),
    ).toBeVisible()
    const detailsButton = screen.getByRole("button", {
      name: "keyManagement:actions.detailsFor",
    })
    expect(detailsButton).toHaveAttribute("aria-expanded", "false")

    await user.click(detailsButton)

    expect(detailsButton).toHaveAttribute("aria-expanded", "true")
    expect(
      screen.getByText("keyManagement:keyDetails.createResponseOnlySecret"),
    ).toBeVisible()
    expect(
      screen.queryByRole("button", { name: "ui:dialog.copyKey.copy" }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "common:actions.export" }),
    ).not.toBeInTheDocument()
  })

  it("renders an AIHubMix key without inventing a masked secret", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([
      {
        ...TOKEN,
        key: "",
        name: "Saved key without a preview",
      },
    ])
    const user = userEvent.setup()

    render(
      <CopyKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={AIHUBMIX_ACCOUNT}
      />,
    )

    await user.click(
      await screen.findByRole("button", {
        name: "keyManagement:actions.detailsFor",
      }),
    )

    expect(screen.getByText("Saved key without a preview")).toBeVisible()
    expect(
      screen.getByText("keyManagement:keyDetails.createResponseOnlySecret"),
    ).toBeVisible()
    expect(
      screen.queryByRole("button", { name: "ui:dialog.copyKey.copy" }),
    ).not.toBeInTheDocument()
  })

  it("shows OpenRouter native keys read-only and links to full key management", async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()

    render(
      <CopyKeyDialog
        isOpen={true}
        onClose={onClose}
        account={OPENROUTER_ACCOUNT}
      />,
    )

    expect(await screen.findByText("Example native key")).toBeVisible()
    expect(screen.getByText("Default workspace")).toBeVisible()
    expect(screen.queryByText("sk-or-v1-...example")).not.toBeInTheDocument()
    expect(
      screen.getByText("keyManagement:keyDetails.createResponseOnlySecret"),
    ).toBeVisible()
    expect(fetchAccountTokensMock).not.toHaveBeenCalled()
    expect(
      screen.queryByRole("button", { name: "ui:dialog.copyKey.copy" }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "common:actions.export" }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", {
        name: "keyManagement:openRouter.list.actions.edit",
      }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", {
        name: "keyManagement:openRouter.list.actions.delete",
      }),
    ).not.toBeInTheDocument()

    const detailsButton = screen.getByRole("button", {
      name: "keyManagement:actions.detailsFor",
    })
    expect(detailsButton).toHaveAttribute("aria-expanded", "false")
    await user.click(detailsButton)

    expect(detailsButton).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByText("sk-or-v1-...example")).toBeVisible()
    expect(
      screen.getByText("keyManagement:keyDetails.createResponseOnlySecret"),
    ).toBeVisible()

    await user.click(
      screen.getByRole("button", { name: "account:actions.keyManagement" }),
    )

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(openKeysPageMock).toHaveBeenCalledWith(OPENROUTER_ACCOUNT.id)
  })

  it("offers account-level key management from the footer for regular accounts", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([TOKEN])
    const user = userEvent.setup()
    const onClose = vi.fn()

    render(<CopyKeyDialog isOpen={true} onClose={onClose} account={ACCOUNT} />)

    expect(
      screen.queryByText("keyManagement:keyDetails.createResponseOnlySecret"),
    ).not.toBeInTheDocument()

    const footer = await screen.findByTestId(
      ACCOUNT_MANAGEMENT_TEST_IDS.copyKeyDialogFooter,
    )
    await user.click(
      within(footer).getByRole("button", {
        name: "account:actions.keyManagement",
      }),
    )

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(openKeysPageMock).toHaveBeenCalledWith(ACCOUNT.id)
  })

  it("offers full key management instead of legacy create actions for an empty OpenRouter inventory", async () => {
    listAccountKeyResourcesMock.mockResolvedValueOnce({ items: [] })

    render(
      <CopyKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={OPENROUTER_ACCOUNT}
      />,
    )

    expect(await screen.findByText("ui:dialog.copyKey.noKeys")).toBeVisible()
    expect(
      screen.getByRole("button", { name: "account:actions.keyManagement" }),
    ).toBeEnabled()
    expect(
      screen.queryByRole("button", {
        name: "ui:dialog.copyKey.createKey",
      }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", {
        name: "ui:dialog.copyKey.createCustomKey",
      }),
    ).not.toBeInTheDocument()
  })

  it("keeps OpenRouter inventory load failures retryable", async () => {
    listAccountKeyResourcesMock
      .mockRejectedValueOnce(new Error("inventory unavailable"))
      .mockResolvedValueOnce({ items: [OPENROUTER_KEY_FACTS] })
    const user = userEvent.setup()

    render(
      <CopyKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={OPENROUTER_ACCOUNT}
      />,
    )

    expect(
      await screen.findByText("ui:dialog.copyKey.loadFailed"),
    ).toBeVisible()
    await user.click(
      screen.getByRole("button", { name: "ui:dialog.copyKey.retry" }),
    )

    expect(await screen.findByText("Example native key")).toBeVisible()
    expect(listAccountKeyResourcesMock).toHaveBeenCalledTimes(2)
  })

  it("shows a load error when the initial runtime-key inventory request fails", async () => {
    fetchAccountTokensMock.mockRejectedValueOnce(new Error("load failed"))

    render(<CopyKeyDialog isOpen={true} onClose={() => {}} account={ACCOUNT} />)

    expect(
      await screen.findByText("ui:dialog.copyKey.loadFailed"),
    ).toBeInTheDocument()
  })

  it("shows a load error when the initial runtime-key inventory is malformed", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce(null)

    render(<CopyKeyDialog isOpen={true} onClose={() => {}} account={ACCOUNT} />)

    expect(
      await screen.findByText("ui:dialog.copyKey.loadFailed"),
    ).toBeInTheDocument()
    expect(screen.queryByText("invalid_token_payload")).not.toBeInTheDocument()
    expect(screen.queryByText("default")).not.toBeInTheDocument()
  })

  it("clears loaded tokens when the selected account loses manageable credentials", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([TOKEN])

    const { rerender } = render(
      <CopyKeyDialog isOpen={true} onClose={() => {}} account={ACCOUNT} />,
    )

    expect(await screen.findByText("default")).toBeInTheDocument()

    rerender(
      <CopyKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={{ ...ACCOUNT, token: "", cookieAuthSessionCookie: "" }}
      />,
    )

    expect(
      await screen.findByRole("button", {
        name: "ui:dialog.copyKey.createKey",
      }),
    ).toBeDisabled()
    expect(screen.queryByText("default")).not.toBeInTheDocument()
    expect(fetchAccountTokensMock).toHaveBeenCalledTimes(1)
  })

  it("ignores stale token fetch completions after the selected account loses manageable credentials", async () => {
    const pendingTokens = createDeferred<(typeof TOKEN)[]>()
    fetchAccountTokensMock.mockReturnValueOnce(pendingTokens.promise)

    const { rerender } = render(
      <CopyKeyDialog isOpen={true} onClose={() => {}} account={ACCOUNT} />,
    )

    await screen.findByText("ui:dialog.copyKey.loading")

    rerender(
      <CopyKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={{ ...ACCOUNT, token: "", cookieAuthSessionCookie: "" }}
      />,
    )

    expect(
      await screen.findByRole("button", {
        name: "ui:dialog.copyKey.createKey",
      }),
    ).toBeDisabled()

    await act(async () => {
      pendingTokens.resolve([TOKEN])
      await pendingTokens.promise
    })

    expect(screen.queryByText("default")).not.toBeInTheDocument()
    expect(fetchAccountTokensMock).toHaveBeenCalledTimes(1)
  })

  it("ignores rejected token fetches after the request is cancelled", async () => {
    const pendingTokens = createDeferred<(typeof TOKEN)[]>()
    fetchAccountTokensMock.mockReturnValueOnce(pendingTokens.promise)

    const { rerender } = render(
      <CopyKeyDialog isOpen={true} onClose={() => {}} account={ACCOUNT} />,
    )

    await screen.findByText("ui:dialog.copyKey.loading")
    rerender(
      <CopyKeyDialog isOpen={false} onClose={() => {}} account={ACCOUNT} />,
    )

    await act(async () => {
      pendingTokens.reject(new Error("cancelled request failed late"))
      await pendingTokens.promise.catch(() => undefined)
    })

    expect(
      screen.queryByText("ui:dialog.copyKey.loadFailed"),
    ).not.toBeInTheDocument()
  })

  it("keeps short secrets masked in the expanded preview", async () => {
    const shortSecret = "abcdefghijklmnopqrstuv"
    fetchAccountTokensMock.mockResolvedValueOnce([
      {
        ...TOKEN,
        key: shortSecret,
      },
    ])

    const user = userEvent.setup()

    render(<CopyKeyDialog isOpen={true} onClose={() => {}} account={ACCOUNT} />)

    await user.click(
      await screen.findByRole("button", {
        name: "keyManagement:actions.detailsFor",
      }),
    )

    expect(screen.queryByText(shortSecret)).not.toBeInTheDocument()
    expect(screen.getByText("abcdefgh****************stuv")).toBeInTheDocument()
  })

  it("renders disabled token state and toggles shared key details", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([
      {
        ...TOKEN,
        status: 2,
        remain_quota: 2000000,
        unlimited_quota: false,
      },
    ])

    const user = userEvent.setup()

    render(<CopyKeyDialog isOpen={true} onClose={() => {}} account={ACCOUNT} />)

    expect(await screen.findByText("default")).toBeInTheDocument()
    expect(screen.getByText("common:status.disabled")).toBeInTheDocument()
    expect(
      screen.queryByText("keyManagement:keyDetails.usedQuota"),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "ui:dialog.copyKey.copy" }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText("keyManagement:keyDetails.quotaPolicy"),
    ).not.toBeInTheDocument()

    const detailsButton = screen.getByRole("button", {
      name: "keyManagement:actions.detailsFor",
    })
    expect(detailsButton).toHaveAttribute("aria-expanded", "false")
    await user.click(detailsButton)

    expect(detailsButton).toHaveAttribute("aria-expanded", "true")
    expect(
      screen.getByRole("region", {
        name: "keyManagement:actions.detailsFor",
      }),
    ).toBeVisible()
    expect(screen.getByText("keyManagement:keyDetails.usedQuota")).toBeVisible()
    expect(
      screen.getByRole("button", { name: "ui:dialog.copyKey.copy" }),
    ).toBeVisible()
    expect(
      screen.getByText("keyManagement:keyDetails.quotaPolicy"),
    ).toBeVisible()

    await user.click(detailsButton)
    expect(detailsButton).toHaveAttribute("aria-expanded", "false")
    expect(
      screen.queryByText("keyManagement:keyDetails.quotaPolicy"),
    ).not.toBeInTheDocument()
  })
})
