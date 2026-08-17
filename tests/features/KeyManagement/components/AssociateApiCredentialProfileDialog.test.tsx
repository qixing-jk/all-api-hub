import { describe, expect, it, vi } from "vitest"

import { AssociateApiCredentialProfileDialog } from "~/features/KeyManagement/components/AssociateApiCredentialProfileDialog"
import { KEY_MANAGEMENT_TEST_IDS } from "~/features/KeyManagement/testIds"
import type { AccountRuntimeKeyLocator } from "~/services/accounts/accountRuntimeKeys"
import { ACCOUNT_RUNTIME_KEY_SOURCES } from "~/services/accounts/accountRuntimeKeys"
import type { ApiCredentialProfile } from "~/types/apiCredentialProfiles"
import { fireEvent, render, screen, waitFor } from "~~/tests/test-utils/render"

const locator: AccountRuntimeKeyLocator = {
  source: ACCOUNT_RUNTIME_KEY_SOURCES.AccountToken,
  accountId: "account-1",
  siteType: "new-api",
  tokenId: 42,
}

const profile: ApiCredentialProfile = {
  id: "profile-1",
  name: "Example credential",
  apiType: "openai-compatible",
  baseUrl: "https://api.example.invalid",
  apiKey: "key-example",
  tagIds: [],
  notes: "",
  telemetryConfig: { mode: "disabled" },
  createdAt: 1,
  updatedAt: 1,
}

describe("AssociateApiCredentialProfileDialog", () => {
  it("submits the selected existing profile for the current key", async () => {
    const onAssociate = vi.fn().mockResolvedValue(undefined)

    render(
      <AssociateApiCredentialProfileDialog
        isOpen
        locator={locator}
        profiles={[profile]}
        isProfilesLoading={false}
        existingProfileNames={[]}
        isWorking={false}
        onClose={vi.fn()}
        onAssociate={onAssociate}
        onOpenProfiles={vi.fn()}
      />,
    )

    fireEvent.click(
      await screen.findByTestId(
        KEY_MANAGEMENT_TEST_IDS.associateCredentialProfileSelect,
      ),
    )
    fireEvent.click(
      await screen.findByRole("option", { name: /Example credential/ }),
    )
    fireEvent.click(
      await screen.findByTestId(
        KEY_MANAGEMENT_TEST_IDS.associateCredentialConfirmButton,
      ),
    )

    await waitFor(() => expect(onAssociate).toHaveBeenCalledWith("profile-1"))
  })

  it("offers a path to create a profile when none are saved", async () => {
    const onOpenProfiles = vi.fn()

    render(
      <AssociateApiCredentialProfileDialog
        isOpen
        locator={locator}
        profiles={[]}
        isProfilesLoading={false}
        existingProfileNames={[]}
        isWorking={false}
        onClose={vi.fn()}
        onAssociate={vi.fn().mockResolvedValue(undefined)}
        onOpenProfiles={onOpenProfiles}
      />,
    )

    fireEvent.click(
      await screen.findByRole("button", {
        name: "apiCredentialProfiles:empty.keyManagementLink",
      }),
    )

    expect(onOpenProfiles).toHaveBeenCalledOnce()
  })

  it("compares a selected credential with the target masked key", async () => {
    render(
      <AssociateApiCredentialProfileDialog
        isOpen
        locator={locator}
        targetSecret="sk-or-v1-••••example"
        profiles={[{ ...profile, apiKey: "sk-or-v1-complete-example" }]}
        isProfilesLoading={false}
        existingProfileNames={[]}
        isWorking={false}
        onClose={vi.fn()}
        onAssociate={vi.fn().mockResolvedValue(undefined)}
        onOpenProfiles={vi.fn()}
      />,
    )

    fireEvent.click(
      await screen.findByTestId(
        KEY_MANAGEMENT_TEST_IDS.associateCredentialProfileSelect,
      ),
    )
    fireEvent.click(
      await screen.findByRole("option", { name: /Example credential/ }),
    )

    expect(
      await screen.findByText(
        "apiCredentialProfiles:association.secretComparison.maskedDescription",
      ),
    ).toBeVisible()
  })

  it("warns when visible key fragments conflict", async () => {
    render(
      <AssociateApiCredentialProfileDialog
        isOpen
        locator={locator}
        targetSecret="sk-or-v1-••••example"
        profiles={[{ ...profile, apiKey: "sk-or-v1-other-value" }]}
        isProfilesLoading={false}
        existingProfileNames={[]}
        isWorking={false}
        onClose={vi.fn()}
        onAssociate={vi.fn().mockResolvedValue(undefined)}
        onOpenProfiles={vi.fn()}
      />,
    )

    fireEvent.click(
      await screen.findByTestId(
        KEY_MANAGEMENT_TEST_IDS.associateCredentialProfileSelect,
      ),
    )
    fireEvent.click(
      await screen.findByRole("option", { name: /Example credential/ }),
    )

    const notice = await screen.findByRole("status")
    expect(notice).toHaveAttribute("data-tone", "warning")
    expect(notice).toHaveTextContent(
      "apiCredentialProfiles:association.secretComparison.mismatchDescription",
    )
  })

  it("shows the current token name when it is available", async () => {
    render(
      <AssociateApiCredentialProfileDialog
        isOpen
        locator={locator}
        displayLabel="Production key"
        profiles={[]}
        isProfilesLoading={false}
        existingProfileNames={[]}
        isWorking={false}
        onClose={vi.fn()}
        onAssociate={vi.fn().mockResolvedValue(undefined)}
        onOpenProfiles={vi.fn()}
      />,
    )

    expect(await screen.findByText("Production key")).toBeVisible()
    expect(screen.queryByText(/accountToken/)).not.toBeInTheDocument()
  })
})
