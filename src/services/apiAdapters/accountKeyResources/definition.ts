import type { AccountSiteType } from "~/constants/siteType"
import type {
  AccountKeyCreationIntent,
  AccountKeyEditorSubmitResult,
  AccountKeyProvisionedResource,
  AccountKeyProvisioningSnapshot,
  AccountKeyResourceCapability,
  AccountKeyResourceEditor,
  AccountKeyResourceFacts,
  AccountKeyResourceOpenInput,
  AccountKeyResourceRef,
  AccountKeyScope,
  AccountKeyScopeInventory,
  AccountRuntimeKeyResolution,
  EditableResourceProjection,
  ResourceFailure,
  ResourceListQuery,
  ResourceOperationOptions,
  ResourceValidationResult,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import { type NativeResourceMutationResult } from "~/services/apiAdapters/nativeResources/factory"

export type AccountKeyResourcePage<TItem> = {
  items: readonly TItem[]
  total?: number
  nextCursor?: string
}

export type AccountKeyResourceEditorDefinition<TCommand> = {
  fields: AccountKeyResourceEditor["fields"]
  initialValues: EditableResourceProjection
  validate(values: EditableResourceProjection): ResourceValidationResult
  buildCommand(values: EditableResourceProjection): TCommand
  destinationScopeKey?: (command: TCommand) => string
  loadOptions?: AccountKeyResourceEditor["loadOptions"]
}

export type AccountKeyCreateMutation<TDetail> = {
  detail: TDetail | null
  scopeKey?: string
  createdSecret?: AccountKeyEditorSubmitResult["createdSecret"]
}

export type AccountKeyResourceDefinition<
  TConfig,
  TLocator,
  TListItem,
  TDetail,
  TCreateCommand,
  TUpdateCommand,
  TFailure,
> = {
  siteType: AccountSiteType
  inventorySecretAvailability?: AccountKeyResourceCapability["inventorySecretAvailability"]
  defaultCreation?: AccountKeyResourceCapability["defaultCreation"]
  openConfig(
    input: AccountKeyResourceOpenInput,
    options?: ResourceOperationOptions,
  ): Promise<TConfig>
  listScopes(
    config: TConfig,
    options?: ResourceOperationOptions,
  ): Promise<readonly AccountKeyScope[]>
  listScopeInventory?(
    config: TConfig,
    options?: ResourceOperationOptions,
  ): Promise<AccountKeyScopeInventory>
  provisioning?: {
    /** True only when createEditor validates and binds an opaque requirement identity. */
    supportsEditor?: boolean
    inspect(
      config: TConfig,
      options?: ResourceOperationOptions,
    ): Promise<AccountKeyProvisioningSnapshot>
    provision(
      config: TConfig,
      requirementKey: string,
      options?: ResourceOperationOptions,
    ): Promise<
      NativeResourceMutationResult<AccountKeyProvisionedResource, TFailure>
    >
    rename?(
      config: TConfig,
      ref: AccountKeyResourceRef,
      options?: ResourceOperationOptions,
    ): Promise<NativeResourceMutationResult<void, TFailure>>
  }
  runtimeKey?: {
    resolve(
      config: TConfig,
      ref: AccountKeyResourceRef,
      options?: ResourceOperationOptions,
    ): Promise<AccountRuntimeKeyResolution>
  }
  defaultScopeKey(config: TConfig, scopes: readonly AccountKeyScope[]): string
  encodeLocator(locator: TLocator): string
  decodeLocator(resourceId: string): TLocator
  locatorFromListItem(item: TListItem): TLocator
  locatorFromDetail(detail: TDetail): TLocator
  list(
    config: TConfig,
    scope: AccountKeyScope,
    query?: ResourceListQuery,
    options?: ResourceOperationOptions,
  ): Promise<AccountKeyResourcePage<TListItem>>
  get(
    config: TConfig,
    scope: AccountKeyScope,
    locator: TLocator,
    options?: ResourceOperationOptions,
  ): Promise<TDetail>
  toListFacts(
    item: TListItem,
    ref: AccountKeyResourceRef,
  ): AccountKeyResourceFacts
  toDetailFacts(
    detail: TDetail,
    ref: AccountKeyResourceRef,
  ): AccountKeyResourceFacts
  createEditor(
    config: TConfig,
    scope: AccountKeyScope,
    options?: ResourceOperationOptions,
    scopeInventory?: AccountKeyScopeInventory,
    intent?: AccountKeyCreationIntent,
    provisioningRequirementKey?: string,
  ): Promise<AccountKeyResourceEditorDefinition<TCreateCommand>>
  editEditor(
    config: TConfig,
    scope: AccountKeyScope,
    detail: TDetail,
  ): AccountKeyResourceEditorDefinition<TUpdateCommand>
  create(
    config: TConfig,
    scope: AccountKeyScope,
    command: TCreateCommand,
    options?: ResourceOperationOptions,
  ): Promise<
    NativeResourceMutationResult<AccountKeyCreateMutation<TDetail>, TFailure>
  >
  update(
    config: TConfig,
    scope: AccountKeyScope,
    detail: TDetail,
    command: TUpdateCommand,
    options?: ResourceOperationOptions,
  ): Promise<NativeResourceMutationResult<TDetail, TFailure>>
  delete(
    config: TConfig,
    scope: AccountKeyScope,
    locator: TLocator,
    options?: ResourceOperationOptions,
  ): Promise<NativeResourceMutationResult<void, TFailure>>
  mapFailure(error: unknown): ResourceFailure
}
