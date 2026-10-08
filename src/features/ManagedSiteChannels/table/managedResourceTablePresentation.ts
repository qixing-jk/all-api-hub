import { type ManagedSiteType } from "~/constants/siteType"
import type { ManagedResourceFieldPolicyDefinition } from "~/features/ManagedSiteChannels/editor/managedResourceFieldPresentation"
import type { ManagedChannelsSorting } from "~/features/ManagedSiteChannels/presentation/contracts"
import { MANAGED_CHANNELS_COLUMN_IDS } from "~/features/ManagedSiteChannels/presentation/contracts"
import {
  DEFAULT_MANAGED_RESOURCE_PRESENTATION_SEMANTICS,
  type ManagedResourcePresentationSemantics,
} from "~/features/ManagedSiteChannels/presentation/managedResourcePresentation"

export type NativeTablePresentationPolicy = {
  semantics: ManagedResourcePresentationSemantics
  defaultSorting: ManagedChannelsSorting
  columnLayout: NativeTableColumnLayout
  numericChannelFieldIds?: NumericChannelTableFieldIds
  supportsNumericChannelDeepLink?: boolean
}

export const NATIVE_TABLE_COLUMN_LAYOUTS = {
  Canonical: "canonical",
  NumericChannel: "numeric-channel",
  Sub2Api: "sub2api",
} as const

export type NativeTableColumnLayout =
  (typeof NATIVE_TABLE_COLUMN_LAYOUTS)[keyof typeof NATIVE_TABLE_COLUMN_LAYOUTS]

export type NumericChannelTableFieldIds = {
  readonly Id: string
  readonly Name: string
  readonly Type: string
  readonly Status: string
  readonly BaseUrl: string
  readonly ModelCount: string
  readonly Groups: string
  readonly Priority: string
  readonly Weight: string
}

export const CANONICAL_NATIVE_CHANNEL_FIELD_IDS = {
  Type: "type",
  Status: "status",
  BaseUrl: "baseURL",
  Models: "supportedModels",
  Tags: "tags",
} as const

export const defaultNativeTablePresentationPolicy: NativeTablePresentationPolicy =
  {
    semantics: DEFAULT_MANAGED_RESOURCE_PRESENTATION_SEMANTICS,
    defaultSorting: [{ id: MANAGED_CHANNELS_COLUMN_IDS.Name, desc: false }],
    columnLayout: NATIVE_TABLE_COLUMN_LAYOUTS.Canonical,
  }

export interface ManagedSitePresentationDefinition {
  siteType: ManagedSiteType
  fieldPolicies: readonly ManagedResourceFieldPolicyDefinition[]
  table: NativeTablePresentationPolicy
}
