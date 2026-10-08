import { type KeyManagementAssociationTargetResultState } from "~/features/KeyManagement/constants"
import {
  type KeyManagementEntry,
  type NativeKeyManagementRow,
} from "~/features/KeyManagement/types"
import {
  type AccountRuntimeKey,
  type AccountRuntimeKeyLocator,
} from "~/services/accounts/keys/accountRuntimeKeys"
import {
  type AccountKeyResourceFacts,
  type AccountKeyResourceRef,
  type ResourceFailure,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import type { ManagedSiteTokenChannelStatus } from "~/services/managedSites/matching/tokenChannelStatus"
import type { DisplaySiteData } from "~/types"
import type {
  ApiCredentialProfile,
  ApiCredentialProfileLink,
} from "~/types/apiCredentialProfiles"

interface GuidedManagedSiteImportTarget {
  accountId?: string
  tokenId?: string
  request: string
}

export interface TokenListProps {
  isLoading: boolean
  entries: KeyManagementEntry[]
  filteredEntries: KeyManagementEntry[]
  handleAddToken: () => void
  canCreateTokens?: boolean
  onAddAccount?: () => void
  onRequestAccountSelection?: () => void
  selectedAccount: string
  displayData: DisplaySiteData[]
  currentAccountLoadError?: string | null
  nativeInventoryLoadError?: string | null
  currentAccountUnsupportedKeyManagement?: boolean
  onRetryCurrentAccount?: () => void
  managedSiteTokenStatuses?: Record<
    string,
    {
      isChecking: boolean
      result?: ManagedSiteTokenChannelStatus
    }
  >
  onManagedSiteImportSuccess?: (
    runtimeKey: AccountRuntimeKey,
  ) => void | Promise<void>
  onManagedSiteVerificationRetry?: (
    runtimeKey: AccountRuntimeKey,
    managedSiteStatus: ManagedSiteTokenChannelStatus,
  ) => void | Promise<void>
  allAccountsFilterAccountIds?: string[]
  onCopyServiceCredential?: (account: DisplaySiteData) => Promise<void>
  onRotateServiceCredential?: (account: DisplaySiteData) => Promise<void>
  guidedManagedSiteImport?: GuidedManagedSiteImportTarget
  nativeRows?: readonly NativeKeyManagementRow[]
  nativeUnfilteredRows?: readonly NativeKeyManagementRow[]
  nativeLoading?: boolean
  nativeDetail?: AccountKeyResourceFacts | null
  nativeDetailLoading?: boolean
  nativeDetailFailure?: ResourceFailure | null
  onCloseNativeDetail?: () => void
  nativeDetailsFromRows?: boolean
  onOpenNativeDetail?: (ref: AccountKeyResourceRef) => void
  onEditNativeKey?: (ref: AccountKeyResourceRef) => void
  onDeleteNativeKey?: (ref: AccountKeyResourceRef) => void
  credentialProfileLinks?: readonly ApiCredentialProfileLink[]
  getCredentialProfileForLocator?: (
    locator: AccountRuntimeKeyLocator,
  ) => ApiCredentialProfile | undefined
  canManageCredentialAssociations?: boolean
  /** Whether at least one saved API credential can be selected for association. */
  canAssociateExistingCredential?: boolean
  onAssociateAssociation?: (
    locator: AccountRuntimeKeyLocator,
    displayLabel?: string,
    targetSecret?: string,
  ) => void
  onUnlinkAssociation?: (associationId: string) => void | Promise<void>
  associationTarget?: ApiCredentialProfileLink | null
  onAssociationTargetStatusChange?: (
    status: KeyManagementAssociationTargetResultState,
  ) => void
}
