import { act, renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { KEY_MANAGEMENT_ASSOCIATION_TARGET_STATES } from "~/features/KeyManagement/constants"
import { useTokenCredentialAssociations } from "~/features/KeyManagement/hooks/useTokenCredentialAssociations"
import { getKeyManagementAssociationTargetId } from "~/features/KeyManagement/testIds"
import type {
  KeyManagementEntry,
  NativeKeyManagementRow,
} from "~/features/KeyManagement/types"
import { KEY_MANAGEMENT_DISPLAY_ROW_KINDS } from "~/features/KeyManagement/types"
import { ACCOUNT_RUNTIME_KEY_SOURCES } from "~/services/accounts/accountRuntimeKeys"
import {
  API_CREDENTIAL_PROFILE_LINK_SOURCES,
  API_CREDENTIAL_PROFILE_LINK_STATES,
  type ApiCredentialProfileLink,
} from "~/types/apiCredentialProfiles"

const { openApiCredentialProfilesPageMock } = vi.hoisted(() => ({
  openApiCredentialProfilesPageMock: vi.fn(),
}))

vi.mock("~/utils/navigation", () => ({
  openApiCredentialProfilesPage: openApiCredentialProfilesPageMock,
}))

const locator = {
  source: ACCOUNT_RUNTIME_KEY_SOURCES.AccountToken,
  accountId: "account-example",
  siteType: SITE_TYPES.NEW_API,
  tokenId: 7,
} as const

const nativeRef = {
  accountId: "account-example",
  siteType: SITE_TYPES.OPENROUTER,
  scopeKey: "scope-example",
  resourceId: "resource-example",
} as const

const activeLink = {
  id: "association-example",
  profileId: "profile-example",
  locator,
  state: API_CREDENTIAL_PROFILE_LINK_STATES.Active,
  linkedBy: API_CREDENTIAL_PROFILE_LINK_SOURCES.User,
  createdAt: 1,
  updatedAt: 1,
} satisfies ApiCredentialProfileLink

const runtimeEntry = {
  id: "runtime-example",
  runtimeKey: {
    source: ACCOUNT_RUNTIME_KEY_SOURCES.AccountToken,
    accountId: locator.accountId,
    siteType: locator.siteType,
    tokenId: locator.tokenId,
  },
  uiState: {},
} as KeyManagementEntry

const nativeRow = {
  kind: KEY_MANAGEMENT_DISPLAY_ROW_KINDS.AccountKeyResource,
  rowKey: "native-example",
  accountId: nativeRef.accountId,
  accountName: "Example account",
  workspaceName: "Example workspace",
  facts: { ref: nativeRef },
} as NativeKeyManagementRow

type TokenCredentialAssociationParams = Parameters<
  typeof useTokenCredentialAssociations
>[0]

const renderAssociations = (
  overrides: Partial<TokenCredentialAssociationParams> = {},
) =>
  renderHook(
    (props: Partial<TokenCredentialAssociationParams>) =>
      useTokenCredentialAssociations({
        canAssociateExistingCredential: true,
        canManageCredentialAssociations: true,
        credentialProfileLinks: [],
        filteredDisplayRows: [],
        isLoading: false,
        nativeLoading: false,
        ...overrides,
        ...props,
      }),
    { initialProps: {} },
  )

describe("useTokenCredentialAssociations", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    document
      .getElementById(getKeyManagementAssociationTargetId(activeLink.id))
      ?.remove()
  })

  it("exposes the allowed action for each association state", () => {
    const onAssociateAssociation = vi.fn()
    const onUnlinkAssociation = vi.fn()
    const { result, rerender } = renderAssociations({
      onAssociateAssociation,
      onUnlinkAssociation,
    })

    const unlinked = result.current.getAssociationPresentation(
      locator,
      "Example key",
      "secret-example",
    )
    expect(unlinked?.status).toBe("unlinked")
    act(() => unlinked?.onAssociate?.())
    expect(onAssociateAssociation).toHaveBeenCalledWith(
      locator,
      "Example key",
      "secret-example",
    )

    rerender({
      credentialProfileLinks: [
        {
          ...activeLink,
          state: API_CREDENTIAL_PROFILE_LINK_STATES.NeedsConfirmation,
        },
      ],
    })
    const needsConfirmation = result.current.getAssociationPresentation(locator)
    expect(needsConfirmation?.status).toBe("needs-confirmation")
    act(() => needsConfirmation?.onOpen?.())
    expect(openApiCredentialProfilesPageMock).toHaveBeenLastCalledWith()

    rerender({ credentialProfileLinks: [activeLink] })
    const linked = result.current.getAssociationPresentation(locator)
    expect(linked?.status).toBe("linked")
    act(() => linked?.onOpen?.())
    expect(openApiCredentialProfilesPageMock).toHaveBeenLastCalledWith({
      profileId: activeLink.profileId,
    })
    act(() => linked?.onUnlink?.())
    expect(onUnlinkAssociation).toHaveBeenCalledWith(activeLink.id)
  })

  it("hides unavailable association actions", () => {
    const { result } = renderAssociations({
      canAssociateExistingCredential: false,
      canManageCredentialAssociations: false,
      credentialProfileLinks: [activeLink],
    })

    expect(
      result.current.getAssociationPresentation({ ...locator, tokenId: 8 }),
    ).toBeUndefined()
    const linked = result.current.getAssociationPresentation(locator)
    expect(linked?.onAssociate).toBeUndefined()
    expect(linked?.onUnlink).toBeUndefined()
  })

  it("marks only exact runtime and native locator matches as navigation targets", () => {
    const nativeLink = {
      ...activeLink,
      locator: {
        source: ACCOUNT_RUNTIME_KEY_SOURCES.AccountKeyResource,
        ref: nativeRef,
      },
    } satisfies ApiCredentialProfileLink
    const { result, rerender } = renderAssociations({
      associationTarget: activeLink,
    })

    expect(result.current.getRuntimeEntryNavigationProps(runtimeEntry)).toEqual(
      {
        targetId: getKeyManagementAssociationTargetId(activeLink.id),
        isNavigationTarget: true,
      },
    )
    expect(
      result.current.getRuntimeEntryNavigationProps({
        ...runtimeEntry,
        runtimeKey: {
          ...runtimeEntry.runtimeKey,
          tokenId: 8,
        },
      } as KeyManagementEntry),
    ).toBeUndefined()

    rerender({ associationTarget: nativeLink })
    expect(result.current.getNativeNavigationProps(nativeRow)).toEqual({
      targetId: getKeyManagementAssociationTargetId(activeLink.id),
      isNavigationTarget: true,
    })
    expect(
      result.current.getNativeNavigationProps({
        ...nativeRow,
        facts: {
          ...nativeRow.facts,
          ref: { ...nativeRef, resourceId: "other-resource" },
        },
      }),
    ).toBeUndefined()
  })

  it("reports missing targets and focuses each exact target only once", async () => {
    const onAssociationTargetStatusChange = vi.fn()
    const { rerender } = renderAssociations({
      associationTarget: activeLink,
      onAssociationTargetStatusChange,
    })

    await waitFor(() =>
      expect(onAssociationTargetStatusChange).toHaveBeenCalledWith(
        KEY_MANAGEMENT_ASSOCIATION_TARGET_STATES.Missing,
      ),
    )

    const target = document.createElement("button")
    target.id = getKeyManagementAssociationTargetId(activeLink.id)
    target.scrollIntoView = vi.fn()
    document.body.append(target)

    rerender({
      filteredDisplayRows: [{ kind: "runtime-key", entry: runtimeEntry }],
    })
    await waitFor(() => expect(target).toHaveFocus())
    expect(target.scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "center",
    })
    expect(onAssociationTargetStatusChange).toHaveBeenCalledWith(
      KEY_MANAGEMENT_ASSOCIATION_TARGET_STATES.Found,
    )

    const focusSpy = vi.spyOn(target, "focus")
    rerender({ filteredDisplayRows: [] })
    expect(focusSpy).not.toHaveBeenCalled()

    rerender({ associationTarget: null })
    rerender({ associationTarget: activeLink })
    await waitFor(() => expect(focusSpy).toHaveBeenCalledOnce())
  })

  it("waits for both inventories before resolving a target", () => {
    const onAssociationTargetStatusChange = vi.fn()
    const { rerender } = renderAssociations({
      associationTarget: activeLink,
      isLoading: true,
      onAssociationTargetStatusChange,
    })

    expect(onAssociationTargetStatusChange).not.toHaveBeenCalled()
    rerender({ isLoading: false, nativeLoading: true })
    expect(onAssociationTargetStatusChange).not.toHaveBeenCalled()
  })
})
