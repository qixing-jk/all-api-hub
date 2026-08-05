import type { AccountSiteType } from "~/constants/siteType"
import type { CreatedRuntimeSecret } from "~/services/accounts/createdRuntimeSecret"
import type { ApiServiceRequest } from "~/services/apiTransport/type"

import type {
  EditableResourceProjection,
  ResourceDisplayFact,
  ResourceFailure,
  ResourceFieldDescriptor,
  ResourceFieldOption,
  ResourceListQuery,
  ResourceOperationOptions,
  ResourceValidationResult,
} from "./resourceNative"

export {
  RESOURCE_FAILURE_CODES as ACCOUNT_KEY_RESOURCE_FAILURE_CODES,
  RESOURCE_FIELD_ISSUE_CODES as ACCOUNT_KEY_RESOURCE_FIELD_ISSUE_CODES,
} from "./resourceNative"
export type {
  EditableResourceProjection,
  ResourceDisplayFact,
  ResourceFailure,
  ResourceFieldDescriptor,
  ResourceFieldIssue,
  ResourceFieldOption,
  ResourceListQuery,
  ResourceOperationOptions,
  ResourceValidationResult,
} from "./resourceNative"

export type AccountKeyResourceRef = {
  readonly accountId: string
  readonly siteType: AccountSiteType
  readonly scopeKey: string
  readonly resourceId: string
}

export type AccountKeyScope = {
  readonly scopeKey: string
  readonly routeKey: string
  readonly displayName: string
  readonly isDefault: boolean
  readonly secondaryLabel?: string
}

export type AccountKeyResourceFacts = {
  readonly ref: AccountKeyResourceRef
  readonly displayName: string
  readonly maskedLabel: string
  readonly status: "enabled" | "disabled" | "expired" | "unknown"
  readonly fields: readonly ResourceDisplayFact[]
  readonly searchValues?: readonly string[]
  readonly actions: Readonly<{ canUpdate: boolean; canDelete: boolean }>
}

export type AccountKeyEditorSubmitResult = {
  readonly facts: AccountKeyResourceFacts
  readonly createdSecret?: CreatedRuntimeSecret
}

export type AccountKeyResourcePage = {
  items: readonly AccountKeyResourceFacts[]
  total?: number
  nextCursor?: string
}

export class AccountKeyResourceError extends Error {
  constructor(readonly failure: ResourceFailure) {
    super(failure.code)
    this.name = "AccountKeyResourceError"
  }
}

export interface AccountKeyResourceEditor {
  readonly fields: readonly ResourceFieldDescriptor[]
  readonly initialValues: EditableResourceProjection
  validate(values: EditableResourceProjection): ResourceValidationResult
  loadOptions?: (
    fieldId: string,
    values: EditableResourceProjection,
    options?: ResourceOperationOptions,
  ) => Promise<readonly ResourceFieldOption[]>
  submit(
    values: EditableResourceProjection,
    options?: ResourceOperationOptions,
  ): Promise<AccountKeyEditorSubmitResult>
}

export interface AccountKeyResourceCollection {
  readonly scope: AccountKeyScope
  list(
    query?: ResourceListQuery,
    options?: ResourceOperationOptions,
  ): Promise<AccountKeyResourcePage>
  get(
    ref: AccountKeyResourceRef,
    options?: ResourceOperationOptions,
  ): Promise<AccountKeyResourceFacts>
  openEditEditor(
    ref: AccountKeyResourceRef,
    options?: ResourceOperationOptions,
  ): Promise<AccountKeyResourceEditor>
  delete(
    ref: AccountKeyResourceRef,
    options?: ResourceOperationOptions,
  ): Promise<void>
}

export interface AccountKeyResourceSession {
  resolveDefaultScope(
    options?: ResourceOperationOptions,
  ): Promise<AccountKeyScope>
  listScopes(
    options?: ResourceOperationOptions,
  ): Promise<readonly AccountKeyScope[]>
  openCollection(
    scopeKey: string,
    options?: ResourceOperationOptions,
  ): Promise<AccountKeyResourceCollection>
  openCreateEditor(
    scopeKey: string,
    options?: ResourceOperationOptions,
  ): Promise<AccountKeyResourceEditor>
}

export type AccountKeyResourceOpenInput = {
  account: {
    id: string
    name?: string
    siteType: AccountSiteType
  }
  request: ApiServiceRequest
}

export interface AccountKeyResourceCapability {
  open(
    input: AccountKeyResourceOpenInput,
    options?: ResourceOperationOptions,
  ): Promise<AccountKeyResourceSession>
}
