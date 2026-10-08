import "./copyKeyDialogMocks"

import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import CopyKeyDialog from "~/features/AccountManagement/components/CopyKeyDialog"
import type {
  ApiCredentialProfile,
  ApiCredentialProfileLink,
} from "~/types/apiCredentialProfiles"
import { act, render, screen } from "~~/tests/test-utils/render"

import { listAccountKeyResourcesMock } from "./copyKeyDialogMocks"
import {
  ACCOUNT,
  setupCopyKeyDialogTestDefaults,
} from "./copyKeyDialogTestSupport"

const { profilesState, linksState } = vi.hoisted(() => ({
  profilesState: { profiles: [] as ApiCredentialProfile[], isLoading: false },
  linksState: {
    links: [] as ApiCredentialProfileLink[],
    isLoading: false,
    error: null,
  },
}))
vi.mock(
  "~/features/ApiCredentialProfiles/workspace/useApiCredentialProfiles",
  () => ({ useApiCredentialProfiles: () => profilesState }),
)
vi.mock(
  "~/features/ApiCredentialProfiles/associations/useApiCredentialProfileLinks",
  () => ({
    useApiCredentialProfileLinks: () => linksState,
  }),
)

const account = {
  ...ACCOUNT,
  siteType: SITE_TYPES.FREEMODEL,
  baseUrl: "https://freemodel.dev",
}
const facts = {
  ref: {
    accountId: account.id,
    siteType: SITE_TYPES.FREEMODEL,
    scopeKey: "default-workspace",
    resourceId: "12",
  },
  displayName: "Saved FreeModel key",
  maskedLabel: "fe_oa_••••••••••••9bf5",
  status: "enabled" as const,
  runtimeKey: {
    modelAccess: { unrestricted: true, suggestedModelIds: [] },
    baseUrl: "https://api.freemodel.dev",
  },
  fields: [],
  actions: { canUpdate: false, canDelete: true },
}
const profile: ApiCredentialProfile = {
  id: "linked-profile",
  name: "Saved credential",
  apiType: "anthropic",
  baseUrl: "https://cc-hq.freemodel.dev",
  apiKey: "fe_oa_complete_example_9bf5",
  tagIds: [],
  notes: "",
  createdAt: 1,
  updatedAt: 1,
}
const link = {
  id: "link",
  profileId: profile.id,
  locator: { source: "account_key_resource", ref: facts.ref },
  state: "active",
  linkedBy: "user",
  createdAt: 1,
  updatedAt: 1,
} satisfies ApiCredentialProfileLink

async function renderExpandedKey() {
  const user = userEvent.setup()
  const view = render(
    <CopyKeyDialog isOpen onClose={() => {}} account={account} />,
  )
  await user.click(
    await screen.findByRole("button", {
      name: "keyManagement:actions.detailsFor",
    }),
  )
  return { user, view }
}

describe("CopyKeyDialog linked native keys", () => {
  beforeEach(() => {
    setupCopyKeyDialogTestDefaults()
    listAccountKeyResourcesMock.mockResolvedValue({ items: [facts] })
    profilesState.profiles = [profile]
    linksState.links = [link]
  })

  it("uses the provider mask and reveals/copies a linked credential without a provider reveal call", async () => {
    const { user } = await renderExpandedKey()
    expect(screen.getByText(facts.maskedLabel)).toBeVisible()
    expect(screen.queryByText(profile.apiKey)).not.toBeInTheDocument()
    expect(
      screen.queryByText("keyManagement:keyDetails.createResponseOnlySecret"),
    ).not.toBeInTheDocument()
    await user.click(
      await screen.findByRole("button", {
        name: "keyManagement:actions.showKey",
      }),
    )
    expect(screen.getByText(profile.apiKey)).toBeVisible()
    await user.click(
      screen.getByRole("button", { name: "common:actions.copyKey" }),
    )
    expect(await navigator.clipboard.readText()).toBe(profile.apiKey)
    expect(
      screen.getByRole("button", { name: "common:actions.export" }),
    ).toBeVisible()
    expect(
      screen.getByRole("button", { name: "keyManagement:actions.verifyApi" }),
    ).toBeVisible()
  })

  it("hides a replaced linked secret until it is explicitly revealed", async () => {
    const { user, view } = await renderExpandedKey()
    await user.click(
      screen.getByRole("button", { name: "keyManagement:actions.showKey" }),
    )
    expect(screen.getByText(profile.apiKey)).toBeVisible()
    const replacement = { ...profile, apiKey: "fe_oa_replaced_example_9bf5" }
    profilesState.profiles = [replacement]
    await act(async () =>
      view.rerender(
        <CopyKeyDialog isOpen onClose={() => {}} account={account} />,
      ),
    )
    expect(screen.queryByText(replacement.apiKey)).not.toBeInTheDocument()
    expect(screen.queryByText(profile.apiKey)).not.toBeInTheDocument()
  })

  it("hides a revealed secret after unlinking and relinking the same profile", async () => {
    const { user, view } = await renderExpandedKey()
    await user.click(
      screen.getByRole("button", { name: "keyManagement:actions.showKey" }),
    )
    expect(screen.getByText(profile.apiKey)).toBeVisible()
    linksState.links = []
    await act(async () =>
      view.rerender(
        <CopyKeyDialog isOpen onClose={() => {}} account={account} />,
      ),
    )
    expect(screen.queryByText(profile.apiKey)).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "keyManagement:actions.showKey" }),
    ).not.toBeInTheDocument()
    profilesState.profiles = [profile]
    linksState.links = [link]
    await act(async () =>
      view.rerender(
        <CopyKeyDialog isOpen onClose={() => {}} account={account} />,
      ),
    )
    expect(screen.queryByText(profile.apiKey)).not.toBeInTheDocument()
  })

  it.each(["needs-confirmation", "other-account"])(
    "does not expose a profile for %s links",
    async (kind) => {
      linksState.links = [
        kind === "other-account"
          ? {
              ...link,
              locator: {
                ...link.locator,
                ref: { ...facts.ref, accountId: "other" },
              },
            }
          : { ...link, state: "needs-confirmation" },
      ]
      await renderExpandedKey()
      expect(screen.getByText(facts.maskedLabel)).toBeVisible()
      expect(
        screen.queryByRole("button", { name: "keyManagement:actions.showKey" }),
      ).not.toBeInTheDocument()
    },
  )
})
