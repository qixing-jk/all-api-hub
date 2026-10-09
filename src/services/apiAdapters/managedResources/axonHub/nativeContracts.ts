import { type AxonHubChannelStatus } from "~/constants/axonHub"
import {
  type ManagedResourceRef,
  type ResourceListQuery,
  type ResourceOperationOptions,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import { type AxonHubNativeChannelPatch } from "~/services/apiAdapters/managedResources/axonHub/editorContracts"
import { type AxonHubChannelPage } from "~/services/apiService/axonHub/channels"
import {
  type ManagedSiteMutationDiagnostic,
  type ManagedSiteMutationResult,
} from "~/services/managedSites/mutations/contracts"
import type { AxonHubChannel, AxonHubCreateChannelInput } from "~/types/axonHub"

export type AxonHubNativeFailure = {
  code:
    | "configuration_required"
    | "invalid_configuration"
    | "authentication_failed"
    | "permission_denied"
    | "not_found"
    | "unavailable"
    | "upstream_rejected"
    | "aborted"
    | "unexpected"
  dispatch: "before" | "after"
}

type AxonHubNativeResourcePage = {
  readonly items: readonly AxonHubChannelPage["items"][number][]
  readonly nextCursor?: AxonHubChannelPage["nextCursor"]
}

export interface AxonHubNativeResourceOperations {
  readonly scopeKey: string
  list(
    query?: ResourceListQuery,
    options?: ResourceOperationOptions,
  ): Promise<AxonHubNativeResourcePage>
  get(
    ref: ManagedResourceRef,
    options?: ResourceOperationOptions,
  ): Promise<AxonHubChannel>
  loadSecret(
    ref: ManagedResourceRef,
    options?: ResourceOperationOptions,
  ): Promise<string>
  create(
    input: AxonHubCreateChannelInput,
    desiredStatus: AxonHubChannelStatus,
    options?: ResourceOperationOptions,
  ): Promise<ManagedSiteMutationResult<AxonHubChannel>>
  update(
    detail: AxonHubChannel,
    input: AxonHubNativeChannelPatch,
    options?: ResourceOperationOptions,
  ): Promise<ManagedSiteMutationResult<AxonHubChannel>>
  delete(
    ref: ManagedResourceRef,
    options?: ResourceOperationOptions,
  ): Promise<ManagedSiteMutationResult<void>>
}

export type AxonHubMutationStepResult<TData> =
  | { outcome: "applied"; data: TData }
  | {
      outcome: "rejected" | "uncertain"
      diagnostic: ManagedSiteMutationDiagnostic
    }
