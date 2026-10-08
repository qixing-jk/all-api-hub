import type {
  AccountKeyProvisionedResource,
  AccountKeyResourceCapability,
  AccountKeyResourceRef,
  ResourceOperationOptions,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import { AccountKeyResourceError } from "~/services/apiAdapters/contracts/accountKeyResource"
import {
  assertNativeResourceFacts,
  createNativeResourceRefBoundary,
} from "~/services/apiAdapters/nativeResources/factory"

import { createAccountKeyResourceCollection } from "./collection"
import type { AccountKeyResourceDefinition } from "./definition"
import { createAccountKeyResourceEditor } from "./editor"
import {
  mapOperation,
  unexpectedFailure,
  validationFailure,
} from "./operationErrors"
import { isAccountKeyResourceRef, isAccountKeyResourceRefFor } from "./ref"
import { cloneScope, createAccountKeyScopeInventory } from "./scopeInventory"
import { assertOpenInput, isBoundedNonBlankString } from "./validation"

/** Composes neutral boundaries into an account-correlated native key capability. */
export function defineAccountKeyResourceCapability<
  TConfig,
  TLocator,
  TListItem,
  TDetail,
  TCreateCommand,
  TUpdateCommand,
  TFailure,
>(
  definition: AccountKeyResourceDefinition<
    TConfig,
    TLocator,
    TListItem,
    TDetail,
    TCreateCommand,
    TUpdateCommand,
    TFailure
  >,
): AccountKeyResourceCapability {
  const mapFailure = (error: unknown) => definition.mapFailure(error)
  const siteType = definition.siteType

  return {
    ...(definition.defaultCreation
      ? { defaultCreation: definition.defaultCreation }
      : {}),
    ...(definition.inventorySecretAvailability
      ? { inventorySecretAvailability: definition.inventorySecretAvailability }
      : {}),
    open: (input, options) =>
      mapOperation(async () => {
        assertOpenInput(input, siteType)
        const accountId = input.account.id
        const config = await definition.openConfig(input, options)
        const provisioningDefinition = definition.provisioning
        const runtimeKeyDefinition = definition.runtimeKey
        const isSessionRef = (value: unknown): value is AccountKeyResourceRef =>
          isAccountKeyResourceRef(value) &&
          value.accountId === accountId &&
          value.siteType === siteType
        const assertProvisionedResource = (
          value: AccountKeyProvisionedResource,
        ): AccountKeyProvisionedResource => {
          if (!isSessionRef(value.ref)) throw unexpectedFailure()
          const createdSecret = value.createdSecret
          if (
            createdSecret &&
            (createdSecret.correlation.kind !== "account-key-resource" ||
              !isSessionRef(createdSecret.correlation.ref) ||
              createdSecret.correlation.ref.scopeKey !== value.ref.scopeKey ||
              createdSecret.correlation.ref.resourceId !== value.ref.resourceId)
          ) {
            throw unexpectedFailure()
          }
          return value
        }
        const scopeInventory = createAccountKeyScopeInventory({
          read: async (scopeOptions) =>
            definition.listScopeInventory
              ? await definition.listScopeInventory(config, scopeOptions)
              : { scopes: await definition.listScopes(config, scopeOptions) },
          resolveDefaultScopeKey: (scopes) =>
            definition.defaultScopeKey(config, scopes),
          mapFailure,
        })
        const { getScopes, getScopeInventory, resolveScope } = scopeInventory
        const openCollection = async (
          scopeKey: string,
          options?: ResourceOperationOptions,
        ) =>
          createAccountKeyResourceCollection({
            definition,
            config,
            accountId,
            siteType,
            resolvedScope: await resolveScope(scopeKey, options),
            mapFailure,
          })

        return {
          ...(provisioningDefinition
            ? {
                provisioning: {
                  inspect: (provisioningOptions?: ResourceOperationOptions) =>
                    mapOperation(
                      () =>
                        provisioningDefinition.inspect(
                          config,
                          provisioningOptions,
                        ),
                      mapFailure,
                    ),
                  provision: (
                    requirementKey: string,
                    provisioningOptions?: ResourceOperationOptions,
                  ) =>
                    mapOperation(async () => {
                      const result = await provisioningDefinition.provision(
                        config,
                        requirementKey,
                        provisioningOptions,
                      )
                      if (result.certainty === "applied") {
                        return {
                          certainty: result.certainty,
                          value: assertProvisionedResource(result.value),
                        }
                      }
                      return {
                        certainty: result.certainty,
                        failure: mapFailure(result.failure),
                      }
                    }, mapFailure),
                  ...(provisioningDefinition.rename
                    ? {
                        rename: (
                          ref: AccountKeyResourceRef,
                          renameOptions?: ResourceOperationOptions,
                        ) =>
                          mapOperation(async () => {
                            if (!isSessionRef(ref)) throw validationFailure()
                            const result = await provisioningDefinition.rename!(
                              config,
                              ref,
                              renameOptions,
                            )
                            return result.certainty === "applied"
                              ? result
                              : {
                                  certainty: result.certainty,
                                  failure: mapFailure(result.failure),
                                }
                          }, mapFailure),
                      }
                    : {}),
                },
              }
            : {}),
          ...(runtimeKeyDefinition
            ? {
                runtimeKey: {
                  resolve: (
                    ref: AccountKeyResourceRef,
                    runtimeKeyOptions?: ResourceOperationOptions,
                  ) =>
                    mapOperation(async () => {
                      if (!isSessionRef(ref)) throw validationFailure()
                      await resolveScope(ref.scopeKey, runtimeKeyOptions)
                      return runtimeKeyDefinition.resolve(
                        config,
                        ref,
                        runtimeKeyOptions,
                      )
                    }, mapFailure),
                },
              }
            : {}),
          resolveDefaultScope: (scopeOptions) =>
            resolveScope(undefined, scopeOptions),
          listScopes: getScopes,
          listScopeInventory: getScopeInventory,
          refreshScopeInventory: (scopeOptions) =>
            scopeInventory.refresh(scopeOptions),
          openCollection,
          openCreateEditor: async (
            scopeKey: string,
            editorOptions,
            intent,
            provisioningRequirementKey,
          ) => {
            if (
              provisioningRequirementKey !== undefined &&
              !provisioningDefinition?.supportsEditor
            )
              throw new AccountKeyResourceError({ code: "unavailable" })
            const resolvedScope = await resolveScope(scopeKey, editorOptions)
            const editorScopeInventory = scopeInventory.snapshot
            if (!editorScopeInventory) throw unexpectedFailure()
            const canonicalScopeKey = resolvedScope.scopeKey
            const canonicalRouteKey = resolvedScope.routeKey
            const providerScope = cloneScope({
              ...resolvedScope,
              scopeKey: canonicalScopeKey,
              routeKey: canonicalRouteKey,
            })
            const editorDefinition = await mapOperation(
              () =>
                definition.createEditor(
                  config,
                  providerScope,
                  editorOptions,
                  editorScopeInventory,
                  intent,
                  provisioningRequirementKey,
                ),
              mapFailure,
            )
            const resolveCreateDestinationScopeKey = (
              command: TCreateCommand,
            ) => {
              const destinationScopeKey =
                editorDefinition.destinationScopeKey?.(command) ??
                canonicalScopeKey
              if (
                !isBoundedNonBlankString(destinationScopeKey, 2048) ||
                !editorScopeInventory.scopes.some(
                  (scope) => scope.scopeKey === destinationScopeKey,
                )
              ) {
                throw validationFailure()
              }
              return destinationScopeKey
            }
            return createAccountKeyResourceEditor({
              mapFailure,
              editorDefinition,
              resolveDestinationScopeKey: (values) => {
                return resolveCreateDestinationScopeKey(
                  editorDefinition.buildCommand(values),
                )
              },
              mutate: (command, submitOptions) => {
                resolveCreateDestinationScopeKey(command)
                return definition.create(
                  config,
                  providerScope,
                  command,
                  submitOptions,
                )
              },
              projectApplied: (result) => {
                if (result.detail === null) {
                  const secret = result.createdSecret
                  if (
                    !secret ||
                    secret.correlation.kind !== "account-create" ||
                    secret.correlation.accountId !== accountId
                  )
                    throw unexpectedFailure()
                  return { facts: null, createdSecret: secret }
                }
                const appliedScopeKey = result.scopeKey ?? canonicalScopeKey
                if (!isBoundedNonBlankString(appliedScopeKey, 2048))
                  throw unexpectedFailure()
                const refBoundary = createNativeResourceRefBoundary<
                  AccountKeyResourceRef,
                  TLocator
                >({
                  scopeKey: appliedScopeKey,
                  encodeLocator: definition.encodeLocator,
                  decodeLocator: definition.decodeLocator,
                  buildRef: (resourceId) =>
                    Object.freeze({
                      accountId,
                      siteType,
                      scopeKey: appliedScopeKey,
                      resourceId,
                    }),
                  matchesRef: (value): value is AccountKeyResourceRef =>
                    isAccountKeyResourceRefFor(value, {
                      accountId,
                      siteType,
                      scopeKey: appliedScopeKey,
                    }),
                })
                const ref = refBoundary.createRef(
                  definition.locatorFromDetail(result.detail),
                )
                const facts = assertNativeResourceFacts(
                  definition.toDetailFacts(result.detail, ref),
                  ref,
                  refBoundary.refsMatch,
                )
                const createdSecret = result.createdSecret
                if (
                  createdSecret &&
                  (createdSecret.correlation.kind !== "account-key-resource" ||
                    !refBoundary.refsMatch(createdSecret.correlation.ref, ref))
                ) {
                  throw unexpectedFailure()
                }
                return { facts, ...(createdSecret ? { createdSecret } : {}) }
              },
            })
          },
        }
      }, mapFailure),
  }
}
