import type { AccountSiteType } from "~/constants/siteType"
import { CREATED_RUNTIME_SECRET_CORRELATION_KINDS as correlationKinds } from "~/services/accounts/keys/createdRuntimeSecret"
import {
  ACCOUNT_KEY_RESOURCE_FAILURE_CODES,
  ACCOUNT_KEY_RESOURCE_LOCAL_METADATA,
  AccountKeyResourceError,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import type {
  AccountKeyResourceCollection,
  AccountKeyResourceFacts,
  AccountKeyResourceRef,
  AccountKeyScope,
  ResourceFailure,
  ResourceOperationOptions,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import {
  assertNativeResourceFacts,
  createNativeResourceRefBoundary,
  isNativeResourceBoundaryError,
  resolveNativeResourceMutation,
} from "~/services/apiAdapters/nativeResources/factory"

import type { AccountKeyResourceDefinition } from "./definition"
import { createAccountKeyResourceEditor } from "./editor"
import {
  mapMutationOperation,
  mapOperation,
  unexpectedFailure,
  validationFailure,
} from "./operationErrors"
import { isAccountKeyResourceRefFor } from "./ref"
import { cloneScope } from "./scopeInventory"

/** Correlates all collection reads and mutations with one frozen account/site/scope identity. */
export function createAccountKeyResourceCollection<
  TConfig,
  TLocator,
  TListItem,
  TDetail,
  TUpdateCommand,
  TFailure,
>({
  definition,
  config,
  accountId,
  siteType,
  resolvedScope,
  mapFailure,
}: {
  definition: Pick<
    AccountKeyResourceDefinition<
      TConfig,
      TLocator,
      TListItem,
      TDetail,
      never,
      TUpdateCommand,
      TFailure
    >,
    | "encodeLocator"
    | "decodeLocator"
    | "locatorFromListItem"
    | "locatorFromDetail"
    | "list"
    | "get"
    | "toListFacts"
    | "toDetailFacts"
    | "editEditor"
    | "getEditDetail"
    | "update"
    | "requiresFreshUpdateDetail"
    | "delete"
    | "revoke"
  >
  config: TConfig
  accountId: string
  siteType: AccountSiteType
  resolvedScope: AccountKeyScope
  mapFailure: (error: unknown) => ResourceFailure
}): AccountKeyResourceCollection {
  const canonicalScopeKey = resolvedScope.scopeKey
  const canonicalRouteKey = resolvedScope.routeKey
  const providerScope = cloneScope({
    ...resolvedScope,
    scopeKey: canonicalScopeKey,
    routeKey: canonicalRouteKey,
  })
  const publicScope = cloneScope({
    ...resolvedScope,
    scopeKey: canonicalScopeKey,
    routeKey: canonicalRouteKey,
  })
  const refBoundary = createNativeResourceRefBoundary<
    AccountKeyResourceRef,
    TLocator
  >({
    scopeKey: canonicalScopeKey,
    encodeLocator: definition.encodeLocator,
    decodeLocator: definition.decodeLocator,
    buildRef: (resourceId) =>
      Object.freeze({
        accountId,
        siteType,
        scopeKey: canonicalScopeKey,
        resourceId,
      }),
    matchesRef: (value): value is AccountKeyResourceRef =>
      isAccountKeyResourceRefFor(value, {
        accountId,
        siteType,
        scopeKey: canonicalScopeKey,
      }),
  })
  const createRef = (locator: TLocator) => {
    try {
      return refBoundary.createRef(locator)
    } catch (error) {
      if (isNativeResourceBoundaryError(error)) throw unexpectedFailure()
      throw error
    }
  }
  const decodeRef = (ref: unknown) => {
    try {
      return refBoundary.decodeRef(ref)
    } catch (error) {
      if (isNativeResourceBoundaryError(error)) throw validationFailure()
      throw error
    }
  }
  const projectFacts = (
    facts: AccountKeyResourceFacts,
    ref: AccountKeyResourceRef,
  ) => {
    try {
      return assertNativeResourceFacts(facts, ref, refBoundary.refsMatch)
    } catch (error) {
      if (isNativeResourceBoundaryError(error)) throw unexpectedFailure()
      throw error
    }
  }
  const readDetail = async (
    ref: unknown,
    readOptions?: ResourceOperationOptions,
  ) => {
    const decoded = decodeRef(ref)
    const detail = await definition.get(
      config,
      providerScope,
      decoded.locator,
      readOptions,
    )
    const actualRef = createRef(definition.locatorFromDetail(detail))
    if (!refBoundary.refsMatch(actualRef, decoded.ref)) {
      throw unexpectedFailure()
    }
    return { detail, ref: decoded.ref }
  }
  return {
    ...(definition.revoke
      ? {
          revoke: (
            ref: AccountKeyResourceRef,
            options?: ResourceOperationOptions,
          ) =>
            mapOperation(async () => {
              const decoded = decodeRef(ref)
              const resolution = resolveNativeResourceMutation(
                await mapMutationOperation(
                  () =>
                    definition.revoke!(
                      config,
                      providerScope,
                      decoded.locator,
                      options,
                    ),
                  mapFailure,
                ),
              )
              if (resolution.status === "not-applied")
                throw new AccountKeyResourceError(
                  mapFailure(resolution.failure),
                )
              if (resolution.status === "uncertain")
                throw new AccountKeyResourceError({
                  ...mapFailure(resolution.failure),
                  code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.MutationStateUncertain,
                })
              const actualRef = createRef(
                definition.locatorFromDetail(resolution.value),
              )
              if (!refBoundary.refsMatch(actualRef, decoded.ref))
                throw unexpectedFailure()
              return projectFacts(
                definition.toDetailFacts(resolution.value, actualRef),
                actualRef,
              )
            }, mapFailure),
        }
      : {}),
    scope: publicScope,
    list: (query, listOptions) =>
      mapOperation(async () => {
        const page = await definition.list(
          config,
          providerScope,
          query,
          listOptions,
        )
        return {
          items: page.items.map((item) => {
            const ref = createRef(definition.locatorFromListItem(item))
            return projectFacts(definition.toListFacts(item, ref), ref)
          }),
          ...(page.total === undefined ? {} : { total: page.total }),
          ...(page.nextCursor === undefined
            ? {}
            : { nextCursor: page.nextCursor }),
        }
      }, mapFailure),
    get: (ref, getOptions) =>
      mapOperation(async () => {
        const current = await readDetail(ref, getOptions)
        return projectFacts(
          definition.toDetailFacts(current.detail, current.ref),
          current.ref,
        )
      }, mapFailure),
    openEditEditor: (ref, editorOptions, intent) =>
      mapOperation(async () => {
        const decoded = decodeRef(ref)
        if (intent?.snapshot) projectFacts(intent.snapshot, decoded.ref)
        const current = definition.getEditDetail
          ? {
              ref: decoded.ref,
              detail: await definition.getEditDetail(
                config,
                providerScope,
                decoded.locator,
                editorOptions,
                intent,
              ),
            }
          : await readDetail(ref, editorOptions)
        if (
          !refBoundary.refsMatch(
            createRef(definition.locatorFromDetail(current.detail)),
            current.ref,
          )
        )
          throw unexpectedFailure()
        const editorDefinition = definition.editEditor(
          config,
          providerScope,
          current.detail,
          intent,
        )
        return createAccountKeyResourceEditor({
          mapFailure,
          editorDefinition,
          resolveDestinationScopeKey: () => canonicalScopeKey,
          mutate: async (command, submitOptions) => {
            const latest =
              editorDefinition.mutationKind ===
                ACCOUNT_KEY_RESOURCE_LOCAL_METADATA ||
              !definition.requiresFreshUpdateDetail(command, current.detail)
                ? current
                : await readDetail(current.ref, submitOptions)
            const result = await definition.update(
              config,
              providerScope,
              { baseline: current.detail, current: latest.detail },
              command,
              submitOptions,
            )
            if (result.certainty !== "applied") return result
            return {
              certainty: "applied" as const,
              value: {
                detail: result.value,
                createdSecret: result.createdSecret,
              },
            }
          },
          projectApplied: ({ detail, createdSecret }) => {
            const returnedRef = createRef(definition.locatorFromDetail(detail))
            if (!refBoundary.refsMatch(returnedRef, current.ref)) {
              throw unexpectedFailure()
            }
            if (
              createdSecret &&
              (createdSecret.correlation.kind !==
                correlationKinds.AccountKeyResource ||
                !refBoundary.refsMatch(
                  createdSecret.correlation.ref,
                  returnedRef,
                ))
            ) {
              throw unexpectedFailure()
            }
            return {
              ...(createdSecret ? { createdSecret } : {}),
              ...(editorDefinition.mutationKind ===
              ACCOUNT_KEY_RESOURCE_LOCAL_METADATA
                ? { refreshPolicy: ACCOUNT_KEY_RESOURCE_LOCAL_METADATA }
                : {}),
              facts: projectFacts(
                definition.toDetailFacts(detail, returnedRef),
                returnedRef,
              ),
            }
          },
        })
      }, mapFailure),
    delete: (ref, deleteOptions) =>
      mapOperation(async () => {
        const { locator } = decodeRef(ref)
        const resolution = resolveNativeResourceMutation(
          await mapMutationOperation(
            () =>
              definition.delete(config, providerScope, locator, deleteOptions),
            mapFailure,
          ),
        )
        if (resolution.status === "not-applied") {
          throw new AccountKeyResourceError(mapFailure(resolution.failure))
        }
        if (resolution.status === "uncertain") {
          const failure = mapFailure(resolution.failure)
          throw new AccountKeyResourceError({
            code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.MutationStateUncertain,
            ...(failure.message ? { message: failure.message } : {}),
            ...(failure.upstreamCode
              ? { upstreamCode: failure.upstreamCode }
              : {}),
          })
        }
      }, mapFailure),
  }
}
