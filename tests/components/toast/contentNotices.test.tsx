import userEvent from "@testing-library/user-event"
import { afterEach, expect, it, vi } from "vitest"

import { ContentNotice } from "~/components/toast/ContentNotice"
import { RedemptionAccountSelectToast } from "~/entrypoints/content/redemptionAssist/components/RedemptionAccountSelectToast"
import { RedemptionBatchResultToast } from "~/entrypoints/content/redemptionAssist/components/RedemptionBatchResultToast"
import { RedemptionLoadingToast } from "~/entrypoints/content/redemptionAssist/components/RedemptionLoadingToast"
import { RedemptionPromptToast } from "~/entrypoints/content/redemptionAssist/components/RedemptionPromptToast"
import { TurnstileManualAssistToast } from "~/entrypoints/content/shieldBypassAssist/components/TurnstileManualAssistToast"
import { ApiCheckConfirmToast } from "~/features/WebAiApiCheck/content/notifications/ApiCheckConfirmToast"
import { render, screen } from "~~/tests/test-utils/render"

afterEach(() => vi.restoreAllMocks())

it("uses the supplied contextual title without adding an extension-name prefix", async () => {
  render(<ContentNotice title="Redemption results">Finished</ContentNotice>)
  expect(
    await screen.findByRole("region", {
      name: "Redemption results",
    }),
  ).toBeVisible()
  expect(screen.getByRole("heading")).toHaveTextContent(/^Redemption results$/)
})

it("dismisses the manual verification reminder from its close control without a duplicate footer", async () => {
  const onDismiss = vi.fn()
  const user = userEvent.setup()
  render(<TurnstileManualAssistToast onDismiss={onDismiss} />)
  const notice = await screen.findByRole("region")
  expect(notice.querySelector("footer")).toBeNull()
  expect(screen.getAllByRole("button")).toHaveLength(1)
  await user.click(screen.getByRole("button", { name: /close/i }))
  expect(onDismiss).toHaveBeenCalledOnce()
})

it("keeps redemption settings in the body and task actions in the footer", async () => {
  render(
    <RedemptionPromptToast
      message="Choose codes to redeem"
      codes={[]}
      onAction={vi.fn()}
    />,
  )
  const settings = await screen.findByRole("link")
  expect(settings.closest('[data-slot="notice-body"]')).not.toBeNull()
  expect(settings.closest("footer")).toBeNull()
  expect(
    screen.getByRole("button", { name: /cancel/i }).closest("footer"),
  ).not.toBeNull()
})

it("orders footer actions with secondary cancel before primary action consistently", async () => {
  render(
    <RedemptionPromptToast
      message="Choose codes to redeem"
      codes={[{ code: "ABC", preview: "ABC" }]}
      onAction={vi.fn()}
    />,
  )
  const buttons = await screen.findAllByRole("button")
  const footerButtons = buttons.filter((b) => b.closest("footer"))
  expect(footerButtons.map((b) => b.textContent)).toEqual([
    "common:actions.cancel",
    "redemptionAssist:actions.autoRedeem",
  ])
})

it("applies elevated shadow and allows custom icon styling on ContentNotice", async () => {
  render(
    <ContentNotice title="Elevated notice" iconClassName="text-amber-500">
      Body
    </ContentNotice>,
  )
  const notice = await screen.findByRole("region", { name: "Elevated notice" })
  expect(notice).toHaveClass("shadow-lg")
  expect(notice.querySelector("svg")).toHaveClass("text-amber-500")
})

it.each([
  ["manual verification", <TurnstileManualAssistToast onDismiss={vi.fn()} />],
  [
    "redemption prompt",
    <RedemptionPromptToast
      message="Choose codes to redeem"
      codes={[]}
      onAction={vi.fn()}
    />,
  ],
  [
    "account selection",
    <RedemptionAccountSelectToast accounts={[]} onSelect={vi.fn()} />,
  ],
  [
    "batch results",
    <RedemptionBatchResultToast
      results={[]}
      onRetry={vi.fn()}
      onClose={vi.fn()}
    />,
  ],
  ["loading", <RedemptionLoadingToast message="Redeeming selected codes" />],
  [
    "API detection",
    <ApiCheckConfirmToast onAction={vi.fn()} usesEnhancedResult />,
  ],
])(
  "%s preserves its contextual heading and the host page's focus",
  async (_name, element) => {
    const hostInput = document.createElement("input")
    document.body.append(hostInput)
    hostInput.focus()
    try {
      render(element)
      expect(await screen.findByRole("region")).toBeVisible()
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
      expect(document.activeElement).toBe(hostInput)
    } finally {
      hostInput.remove()
    }
  },
)

it("cancels API detection toast when close control is clicked", async () => {
  const onAction = vi.fn()
  const user = userEvent.setup()
  render(<ApiCheckConfirmToast onAction={onAction} />)
  const closeButton = await screen.findByRole("button", { name: /close/i })
  await user.click(closeButton)
  expect(onAction).toHaveBeenCalledWith("cancel")
})
