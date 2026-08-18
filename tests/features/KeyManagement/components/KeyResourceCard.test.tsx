import userEvent from "@testing-library/user-event"
import { useState, type ReactElement } from "react"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import {
  KEY_RESOURCE_CONTENT_LAYOUTS,
  KeyResourceActionGroup,
  KeyResourceCard,
  KeyResourceCardHeader,
  KeyResourceFactList,
  KeyResourceSecretDisplay,
} from "~/features/KeyManagement/components/KeyResourceCard"
import type { KeyResourceCardPresentation } from "~/features/KeyManagement/presentation/keyResourceCard"
import { KEY_MANAGEMENT_TEST_IDS } from "~/features/KeyManagement/testIds"
import enCommon from "~/locales/en/common.json"
import enKeyManagement from "~/locales/en/keyManagement.json"
import { testI18n } from "~~/tests/test-utils/i18n"
import { render, screen, within } from "~~/tests/test-utils/render"

const presentation: KeyResourceCardPresentation = {
  id: "key-example",
  title: "Example key",
  accountLabel: "Account example",
  status: "active",
  statusLabel: "Active",
  secretAvailability: "recoverable",
  secretAvailabilityMessage:
    "This site provides only a masked value after creation, so the full key cannot be viewed again.",
  maskedLabel: "sk-example...",
  summaryFacts: [
    { id: "remaining-quota", label: "Remaining quota", value: "100" },
  ],
  detailFacts: [{ id: "ip-limits", label: "IP limits", value: "192.0.2.10" }],
  actions: {
    copySecret: true,
    revealSecret: true,
    verifySecret: true,
    exportSecret: true,
    edit: true,
    delete: true,
    batchSelect: true,
  },
}

function renderKeyResourceCard(ui: ReactElement) {
  return render(ui, {
    withThemeProvider: false,
    withUserPreferencesProvider: false,
  })
}

describe("KeyResourceCard", () => {
  beforeAll(() => {
    testI18n.addResourceBundle(
      "en",
      "keyManagement",
      enKeyManagement,
      true,
      true,
    )
    testI18n.addResourceBundle("en", "common", enCommon, true, true)
  })

  afterAll(() => {
    testI18n.removeResourceBundle("en", "keyManagement")
    testI18n.removeResourceBundle("en", "common")
  })

  it("renders the common hierarchy and expands safe details", async () => {
    const user = userEvent.setup()
    function Harness() {
      const [isExpanded, setIsExpanded] = useState(false)
      return (
        <KeyResourceCard
          presentation={presentation}
          secret={<code>sk-example</code>}
          actions={<button type="button">Edit</button>}
          details={{ status: "ready", facts: presentation.detailFacts }}
          isDetailsExpanded={isExpanded}
          onDetailsExpandedChange={setIsExpanded}
        />
      )
    }
    renderKeyResourceCard(<Harness />)

    expect(screen.getByRole("heading", { name: "Example key" })).toBeVisible()
    expect(screen.getByText("Account example")).toBeVisible()
    expect(screen.getByText("Remaining quota")).toBeVisible()
    expect(screen.getByText("Key:")).toBeVisible()
    expect(screen.getByText("sk-example")).toBeVisible()
    expect(screen.getByRole("note")).toHaveTextContent(
      "This site provides only a masked value after creation, so the full key cannot be viewed again.",
    )
    expect(
      within(
        screen.getByTestId(KEY_MANAGEMENT_TEST_IDS.keyResourceSecretDisplay),
      ).getByText("sk-example"),
    ).toBeVisible()
    expect(screen.queryByText("IP limits")).toBeNull()
    expect(
      screen
        .getByTestId(KEY_MANAGEMENT_TEST_IDS.keyResourceSecretDisplay)
        .compareDocumentPosition(
          screen.getByTestId(KEY_MANAGEMENT_TEST_IDS.keyResourceSummaryFacts),
        ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()

    await user.click(
      screen.getByRole("button", { name: "View details for Example key" }),
    )

    expect(screen.getByText("IP limits")).toBeVisible()
    expect(screen.getByText("192.0.2.10")).toBeVisible()
    expect(
      screen
        .getByText("Remaining quota")
        .compareDocumentPosition(screen.getByText("IP limits")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(screen.getAllByRole("note")).toHaveLength(1)
  })

  it("exposes a focusable stable target for deep-link navigation", () => {
    renderKeyResourceCard(
      <KeyResourceCard
        presentation={presentation}
        targetId="credential-association-example"
        isNavigationTarget
        isDetailsExpanded={false}
        onDetailsExpandedChange={vi.fn()}
      />,
    )

    const target = document.getElementById("credential-association-example")
    expect(target).toHaveAttribute("tabindex", "-1")
    expect(target).toHaveAttribute("data-navigation-target", "true")
  })

  it("renders a linked credential as one icon-only identity control", async () => {
    const user = userEvent.setup()
    const onOpen = vi.fn()
    const onAssociate = vi.fn()
    const onUnlink = vi.fn()

    renderKeyResourceCard(
      <KeyResourceCard
        presentation={presentation}
        association={{
          status: "linked",
          label: "Saved in credential library",
          actionLabel: "View linked credential",
          associateLabel: "Link another API credential",
          onAssociate,
          onOpen,
          onUnlink,
          unlinkLabel: "Remove linked credential",
        }}
        isDetailsExpanded={false}
        onDetailsExpandedChange={vi.fn()}
      />,
    )

    expect(
      screen.queryByText("Saved in credential library"),
    ).not.toBeInTheDocument()
    expect(
      within(
        screen.getByRole("group", {
          name: "API credential",
        }),
      ).getByTestId(KEY_MANAGEMENT_TEST_IDS.apiCredentialAssociationButton),
    ).toBeVisible()
    const openButton = screen.getByTestId(
      KEY_MANAGEMENT_TEST_IDS.apiCredentialAssociationButton,
    )
    expect(openButton).not.toHaveTextContent("Saved in credential library")
    expect(openButton).not.toHaveAttribute("title")
    expect(openButton.querySelector(".lucide-link-2")).not.toBeNull()

    await user.hover(openButton)
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "API credential",
    )

    await user.click(openButton)
    expect(
      within(screen.getByRole("menu"))
        .getAllByRole("menuitem")
        .map((item) => item.textContent),
    ).toEqual([
      "View linked credential",
      "Link another API credential",
      "Remove linked credential",
    ])
    await user.click(
      screen.getByRole("menuitem", { name: "View linked credential" }),
    )
    expect(onOpen).toHaveBeenCalledOnce()
    await user.click(openButton)
    await user.click(
      screen.getByRole("menuitem", { name: "Remove linked credential" }),
    )
    expect(onUnlink).toHaveBeenCalledOnce()
  })

  it("offers one explicit review action for an unresolved association", async () => {
    const user = userEvent.setup()
    const onOpen = vi.fn()
    const onAssociate = vi.fn()

    renderKeyResourceCard(
      <KeyResourceCard
        presentation={presentation}
        association={{
          status: "needs-confirmation",
          label: "Association needs confirmation",
          actionLabel: "Review credential association",
          onOpen,
          associateLabel: "Associate a saved API credential with this key",
          onAssociate,
        }}
        isDetailsExpanded={false}
        onDetailsExpandedChange={vi.fn()}
      />,
    )

    expect(
      screen.queryByText("Association needs confirmation"),
    ).not.toBeInTheDocument()
    const reviewButton = screen.getByTestId(
      KEY_MANAGEMENT_TEST_IDS.apiCredentialAssociationButton,
    )
    expect(reviewButton.querySelector(".lucide-circle-alert")).not.toBeNull()
    await user.click(reviewButton)
    await user.click(
      screen.getByRole("menuitem", { name: "Review credential association" }),
    )
    expect(onOpen).toHaveBeenCalledOnce()

    await user.click(reviewButton)
    await user.click(
      screen.getByRole("menuitem", {
        name: "Associate a saved API credential with this key",
      }),
    )
    expect(onAssociate).toHaveBeenCalledOnce()
  })

  it("offers the existing-credential action for an unlinked resource", async () => {
    const user = userEvent.setup()
    const onAssociate = vi.fn()

    renderKeyResourceCard(
      <KeyResourceCard
        presentation={presentation}
        association={{
          status: "unlinked",
          label: "No API credential linked",
          actionLabel: "Associate a saved API credential with this key",
          associateLabel: "Associate a saved API credential with this key",
          onAssociate,
        }}
        isDetailsExpanded={false}
        onDetailsExpandedChange={vi.fn()}
      />,
    )

    const linkButton = screen.getByTestId(
      KEY_MANAGEMENT_TEST_IDS.apiCredentialAssociationButton,
    )
    expect(linkButton.querySelector(".lucide-link-2-off")).not.toBeNull()

    await user.click(linkButton)
    expect(onAssociate).toHaveBeenCalledOnce()
    expect(screen.queryByRole("menu")).not.toBeInTheDocument()
  })

  it("lets callers use the shared header without a detail trigger", () => {
    renderKeyResourceCard(
      <KeyResourceCardHeader
        presentation={presentation}
        actions={<button type="button">Edit header</button>}
      />,
    )

    expect(screen.getByRole("heading", { name: "Example key" })).toBeVisible()
    expect(screen.getByText("Account example")).toBeVisible()
    expect(screen.getByText("Active")).toBeVisible()
    expect(screen.getAllByRole("button", { name: "Edit header" })).toHaveLength(
      1,
    )
  })

  it("renders inactive and unknown provider statuses", () => {
    renderKeyResourceCard(
      <>
        <KeyResourceCardHeader
          presentation={{
            ...presentation,
            id: "inactive-key",
            title: "Inactive key",
            status: "inactive",
            statusLabel: "Inactive",
          }}
        />
        <KeyResourceCardHeader
          presentation={{
            ...presentation,
            id: "unknown-key",
            title: "Unknown key",
            status: "unknown",
            statusLabel: "Unknown",
          }}
        />
      </>,
    )

    expect(screen.getByText("Inactive")).toBeVisible()
    expect(screen.getByText("Unknown")).toBeVisible()
  })

  it("lets callers compose one authoritative header with generated controls", () => {
    renderKeyResourceCard(
      <KeyResourceCard
        presentation={presentation}
        actions={<button type="button">Edit composed key</button>}
        details={{ status: "ready", facts: presentation.detailFacts }}
        isDetailsExpanded={false}
        onDetailsExpandedChange={vi.fn()}
        renderHeader={(headerProps) => (
          <KeyResourceCardHeader
            {...headerProps}
            providerBadges={<span>Provider badge</span>}
          />
        )}
      />,
    )

    expect(
      screen.getAllByRole("heading", { name: "Example key" }),
    ).toHaveLength(1)
    expect(screen.getAllByText("Account example")).toHaveLength(1)
    expect(screen.getAllByText("Active")).toHaveLength(1)
    expect(screen.getAllByText("Provider badge")).toHaveLength(1)
    expect(
      screen.getAllByRole("button", { name: "View details for Example key" }),
    ).toHaveLength(1)
    expect(
      screen.getAllByRole("button", { name: "Edit composed key" }),
    ).toHaveLength(1)
  })

  it("renders caller-owned secret controls once while collapsed", () => {
    renderKeyResourceCard(
      <KeyResourceCard
        presentation={presentation}
        secret={<span>sk-summary-example</span>}
        secretControls={<button type="button">Copy summary secret</button>}
        isDetailsExpanded={false}
        onDetailsExpandedChange={vi.fn()}
      />,
    )

    expect(screen.getAllByText("sk-summary-example")).toHaveLength(1)
    expect(
      screen.getAllByRole("button", { name: "Copy summary secret" }),
    ).toHaveLength(1)
  })

  it("supports the adaptive content layout used by quick key cards", () => {
    renderKeyResourceCard(
      <>
        <KeyResourceSecretDisplay
          label="Key"
          secret={<code>sk-example</code>}
          controls={<button type="button">Copy key</button>}
          layout={KEY_RESOURCE_CONTENT_LAYOUTS.Adaptive}
        />
        <KeyResourceFactList
          facts={presentation.summaryFacts}
          layout={KEY_RESOURCE_CONTENT_LAYOUTS.Adaptive}
          testId="adaptive-facts"
        />
      </>,
    )

    expect(
      screen.getByTestId(KEY_MANAGEMENT_TEST_IDS.keyResourceSecretDisplay),
    ).toHaveClass("grid", "sm:grid-cols-[minmax(0,1fr)_auto]")
    expect(screen.getByTestId("adaptive-facts")).toHaveClass(
      "grid-cols-[repeat(auto-fit,minmax(11rem,1fr))]",
    )
  })

  it("forwards a stable selector to an action group", () => {
    renderKeyResourceCard(
      <KeyResourceActionGroup label="Profile actions" testId="profile-actions">
        <button type="button">Edit profile</button>
      </KeyResourceActionGroup>,
    )

    expect(screen.getByTestId("profile-actions")).toHaveAttribute(
      "aria-label",
      "Profile actions",
    )
  })

  it("renders adaptive availability guidance without requiring a secret label", async () => {
    const user = userEvent.setup()
    renderKeyResourceCard(
      <KeyResourceSecretDisplay
        message="The saved secret cannot be retrieved."
        layout={KEY_RESOURCE_CONTENT_LAYOUTS.Adaptive}
      />,
    )

    const availabilityButton = screen.getByRole("button", {
      name: "The saved secret cannot be retrieved.",
    })
    expect(availabilityButton).toBeVisible()
    expect(availabilityButton).toHaveAttribute("type", "button")
    expect(screen.getByRole("note")).toHaveTextContent(
      "The saved secret cannot be retrieved.",
    )
    await user.hover(availabilityButton)
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "The saved secret cannot be retrieved.",
    )
    expect(screen.queryByText("Key")).not.toBeInTheDocument()
  })

  it("announces loading and supports detail retry", async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    const { rerender } = renderKeyResourceCard(
      <KeyResourceCard
        presentation={presentation}
        details={{ status: "loading" }}
        isDetailsExpanded={true}
        onDetailsExpandedChange={vi.fn()}
      />,
    )
    expect(screen.getByRole("status")).toHaveTextContent("Loading details")
    rerender(
      <KeyResourceCard
        presentation={presentation}
        details={{
          status: "error",
          message: "Details unavailable",
          onRetry,
        }}
        isDetailsExpanded={true}
        onDetailsExpandedChange={vi.fn()}
      />,
    )
    expect(screen.getByRole("alert")).toHaveTextContent("Details unavailable")
    await user.click(screen.getByRole("button", { name: "Retry" }))
    expect(onRetry).toHaveBeenCalledOnce()

    rerender(
      <KeyResourceCard
        presentation={presentation}
        details={{ status: "error", message: "" }}
        isDetailsExpanded={true}
        onDetailsExpandedChange={vi.fn()}
      />,
    )
    expect(screen.getByRole("alert")).toHaveTextContent("Details unavailable")
  })

  it("omits the selection control when no selection callback is supplied", () => {
    renderKeyResourceCard(
      <KeyResourceCard
        presentation={presentation}
        isDetailsExpanded={false}
        onDetailsExpandedChange={vi.fn()}
      />,
    )
    expect(screen.queryByRole("checkbox")).toBeNull()
  })

  it("keeps an unavailable batch selection visible with a focusable explanation", async () => {
    const user = userEvent.setup()
    renderKeyResourceCard(
      <KeyResourceCard
        presentation={presentation}
        isDetailsExpanded={false}
        onDetailsExpandedChange={vi.fn()}
        selectionLabel="Select Example key"
        selectionDisabledReason="The full key cannot be retrieved."
      />,
    )

    const selection = screen.getByRole("checkbox", {
      name: "Select Example key",
    })
    expect(selection).toHaveAttribute("aria-disabled", "true")

    await user.tab()
    expect(selection).toHaveFocus()
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "The full key cannot be retrieved.",
    )
  })

  it("renders an explicit empty detail state", () => {
    renderKeyResourceCard(
      <KeyResourceCard
        presentation={{ ...presentation, secretAvailabilityMessage: undefined }}
        details={{ status: "ready", facts: [] }}
        isDetailsExpanded={true}
        onDetailsExpandedChange={vi.fn()}
      />,
    )
    expect(screen.getByText("No additional details")).toBeVisible()
  })

  it("binds the controlled trigger to its detail panel", async () => {
    const user = userEvent.setup()
    const onDetailsExpandedChange = vi.fn()
    const { rerender } = renderKeyResourceCard(
      <KeyResourceCard
        presentation={presentation}
        details={{ status: "ready", facts: presentation.detailFacts }}
        isDetailsExpanded={false}
        onDetailsExpandedChange={onDetailsExpandedChange}
      />,
    )

    const trigger = screen.getByRole("button", {
      name: "View details for Example key",
    })
    const panelId = trigger.getAttribute("aria-controls")

    expect(trigger).toHaveAttribute("aria-expanded", "false")
    expect(panelId).toBeTruthy()

    await user.click(trigger)

    expect(onDetailsExpandedChange).toHaveBeenCalledWith(true)
    rerender(
      <KeyResourceCard
        presentation={presentation}
        details={{ status: "ready", facts: presentation.detailFacts }}
        isDetailsExpanded={true}
        onDetailsExpandedChange={onDetailsExpandedChange}
      />,
    )
    expect(trigger).toHaveAttribute("aria-expanded", "true")
    expect(document.getElementById(panelId!)).toBeVisible()
  })

  it("gives every card a unique detail trigger and panel binding", () => {
    const firstPresentation = {
      ...presentation,
      id: "key-first",
      title: "First key",
    }
    const secondPresentation = {
      ...presentation,
      id: "key-second",
      title: "Second key",
    }
    renderKeyResourceCard(
      <>
        <KeyResourceCard
          presentation={firstPresentation}
          isDetailsExpanded={true}
          onDetailsExpandedChange={vi.fn()}
        />
        <KeyResourceCard
          presentation={secondPresentation}
          isDetailsExpanded={true}
          onDetailsExpandedChange={vi.fn()}
        />
      </>,
    )

    const firstTrigger = screen.getByRole("button", {
      name: "View details for First key",
    })
    const secondTrigger = screen.getByRole("button", {
      name: "View details for Second key",
    })
    const firstPanelId = firstTrigger.getAttribute("aria-controls")
    const secondPanelId = secondTrigger.getAttribute("aria-controls")

    expect(firstPanelId).toBeTruthy()
    expect(secondPanelId).toBeTruthy()
    expect(firstPanelId).not.toBe(secondPanelId)
    expect(document.getElementById(firstPanelId!)).toBeVisible()
    expect(document.getElementById(secondPanelId!)).toBeVisible()
  })
})
