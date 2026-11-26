import { z } from "zod"

import { encryptNewApiPassword } from "~/services/apiService/newApiFamily/passwordEncryption"
import { newApiFamilyRequests } from "~/services/apiService/newApiFamily/request"
import { composeAbortSignals } from "~/services/apiTransport/abortableTask"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import {
  API_DIRECT_REQUEST_REASONS,
  API_OPERATION_SEMANTICS,
  type ApiServiceRequest,
} from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"

import type {
  TokenIssuanceJournal,
  TokenIssuanceReview,
} from "./issuanceJournal"
import {
  NEW_API_TOKEN_ACCESS_SCOPES as ACCESS_SCOPES,
  NEW_API_TOKEN_CREATION_ERRORS as CREATION_ERRORS,
  NEW_API_TOKEN_ENDPOINTS as ENDPOINTS,
  NEW_API_TOKEN_VERIFICATION_METHODS as METHODS,
  NEW_API_TOKEN_NAME_MAX_LENGTH,
  NEW_API_TOKEN_OPERATION_SCOPES as OPERATION_SCOPES,
  NEW_API_TOKEN_VERIFICATION_ERRORS as VERIFICATION_ERRORS,
} from "./protocol"
import { tokenSessionRequest } from "./sessionRequest"

const MIN_TOKEN_EXPIRY_SECONDS = 60 * 60
const ISSUANCE_TIMEOUT_MS = 30_000

/** Canonicalizes grant scopes for proof binding and returned-grant comparison. */
function normalizeGrantScopes(scopes: string[]) {
  return [...new Set(scopes)].sort()
}

const catalogSchema = z.object({
  default_expiry_days: z.number().int().positive(),
  max_tokens: z.number().int().positive(),
  groups: z.array(
    z.object({
      group: z.string(),
      resources: z.array(
        z.object({
          resource: z.string().min(1),
          label_key: z.string(),
          actions: z.array(
            z.object({
              action: z.string().min(1),
              label_key: z.string(),
              description_key: z.string().optional(),
            }),
          ),
        }),
      ),
    }),
  ),
})

const verificationSchema = z.object({
  scope: z.enum([OPERATION_SCOPES.GENERATE, OPERATION_SCOPES.REVOKE]),
  methods: z.array(
    z.object({
      method: z.string(),
      available: z.boolean(),
      reason: z.string().optional(),
    }),
  ),
  oauth_providers: z.array(
    z.object({ slug: z.string().min(1), name: z.string() }),
  ),
  password_encryption_enabled: z.boolean(),
})

export interface NewApiTokenCapabilities {
  creationUncertain?: boolean
  catalog: z.infer<typeof catalogSchema>
  verification: z.infer<typeof verificationSchema>
}

/** Flattens the site's catalog into one entry for each grantable scope. */
export function getNewApiTokenCatalogPermissions(
  catalog: NewApiTokenCapabilities["catalog"],
) {
  const permissions = new Map<string, string>()
  for (const group of catalog.groups) {
    for (const resource of group.resources) {
      for (const action of resource.actions) {
        permissions.set(
          `${resource.resource}:${action.action}`,
          `${resource.label_key} · ${action.label_key}`,
        )
      }
    }
  }
  return [...permissions].map(([scope, label]) => ({ scope, label }))
}

const draftSchema = z.object({
  name: z.string().trim().min(1).max(NEW_API_TOKEN_NAME_MAX_LENGTH),
  scopes: z.array(z.string().min(1)).min(1),
  expires_at: z.number().int().nonnegative(),
})
const proofSchema = z.object({
  proof_token: z.string().min(1),
  scope: z.enum([OPERATION_SCOPES.GENERATE, OPERATION_SCOPES.REVOKE]),
  method: z.string(),
  expires_at: z.number(),
})
export type NewApiTokenDraft = z.infer<typeof draftSchema>
export type NewApiTokenProof = z.infer<typeof proofSchema>
export type NewApiTokenVerification =
  | {
      method: typeof METHODS.PASSWORD
      password: string
    }
  | {
      method: typeof METHODS.TWO_FACTOR
      code: string
    }
  | { method: typeof METHODS.PASSKEY; rpId?: string }
  | {
      method: typeof METHODS.OAUTH
      provider: string
    }
export interface NewApiCreatedToken {
  token: string
  id: number
  verified: boolean
}
export interface NewApiTokenInteraction {
  verify(
    input: Extract<
      NewApiTokenVerification,
      {
        method: typeof METHODS.OAUTH | typeof METHODS.PASSKEY
      }
    >,
    operation:
      | {
          scope: typeof OPERATION_SCOPES.GENERATE
          context: Pick<NewApiTokenDraft, "scopes" | "expires_at">
        }
      | {
          scope: typeof OPERATION_SCOPES.REVOKE
          context: { token_id: number }
        },
    request: ApiServiceRequest,
  ): Promise<NewApiTokenProof>
}

/** An issuance response was lost; starting another request could create a duplicate. */
export class NewApiTokenCreationUncertainError extends Error {
  constructor() {
    super(CREATION_ERRORS.UNCERTAIN)
  }
}

/** A draft-bound browser session can discover and issue one management token. */
export class NewApiAccessTokenCreation {
  private inFlight = false
  private uncertain = false
  private issuanceReview?: TokenIssuanceReview
  private created: NewApiCreatedToken | undefined
  private createdScopes: string[] = []
  private grantMatches = false
  private verificationAbort?: AbortController

  /** Cancel the active attempt; an already dispatched issuance remains uncertain. */
  cancelVerification() {
    this.verificationAbort?.abort()
  }
  constructor(
    private request: ApiServiceRequest,
    private readonly expectedUserId: string,
    private interaction?: NewApiTokenInteraction,
    private readonly journal?: TokenIssuanceJournal,
  ) {}

  /** Replace only a verified session, retaining one-time plaintext and issuance state. */
  reconnect(session: NewApiAccessTokenCreation) {
    if (this.inFlight) throw new Error(CREATION_ERRORS.BUSY)
    if (
      session.expectedUserId !== this.expectedUserId ||
      session.request.baseUrl !== this.request.baseUrl
    )
      throw new Error(API_ERROR_CODES.ACCOUNT_IDENTITY_MISMATCH)
    this.request = session.request
    this.interaction = session.interaction
  }

  /** User confirms review/revocation of a previous uncertain issuance before a new attempt. */
  async acknowledgeUncertain() {
    if (this.inFlight) throw new Error(CREATION_ERRORS.BUSY)
    await this.journal?.acknowledge(this.issuanceReview)
    this.issuanceReview = undefined
    this.uncertain = false
  }

  /** Uses the provider transport without credential recovery or ambient Cookie fallback. */
  private read<T>(endpoint: string): Promise<T> {
    return tokenSessionRequest<T>(this.request, { endpoint })
  }

  /** Confirm the remote identity before exposing account-specific grant choices. */
  async load(): Promise<NewApiTokenCapabilities> {
    const user = await this.read<{ id: unknown }>(ENDPOINTS.SELF)
    if (!this.expectedUserId || String(user?.id) !== this.expectedUserId) {
      throw new ApiError(
        "Account identity changed",
        undefined,
        ENDPOINTS.SELF,
        API_ERROR_CODES.ACCOUNT_IDENTITY_MISMATCH,
      )
    }
    const [catalog, verification] = await Promise.all([
      this.read(ENDPOINTS.CATALOG),
      this.read(
        `${ENDPOINTS.VERIFICATION_METHODS}?scope=${OPERATION_SCOPES.GENERATE}`,
      ),
    ])
    await this.observeUncertainIssuance()
    return {
      catalog: catalogSchema.parse(catalog),
      verification: verificationSchema
        .extend({ scope: z.literal(OPERATION_SCOPES.GENERATE) })
        .parse(verification),
      creationUncertain: this.uncertain,
    }
  }

  /** Retain the one-time plaintext after a verification failure; never mint another to retry. */
  async verifyCreated(): Promise<NewApiCreatedToken> {
    if (this.inFlight) throw new Error(CREATION_ERRORS.BUSY)
    return this.runOperation((signal) => this.checkCreatedToken(signal))
  }

  private async runOperation<T>(
    action: (signal: AbortSignal | undefined) => Promise<T>,
  ): Promise<T> {
    this.inFlight = true
    const abort = new AbortController()
    this.verificationAbort = abort
    const combined = composeAbortSignals([
      this.request.abortSignal,
      abort.signal,
    ])
    try {
      return await action(combined.signal)
    } finally {
      combined.dispose()
      this.verificationAbort = undefined
      this.inFlight = false
    }
  }

  private async checkCreatedToken(
    abortSignal?: AbortSignal,
  ): Promise<NewApiCreatedToken> {
    if (!this.created) throw new Error(CREATION_ERRORS.NOT_CREATED)
    if (!this.grantMatches) throw new Error(CREATION_ERRORS.GRANT_MISMATCH)
    const isolatedRequest: ApiServiceRequest = {
      baseUrl: this.request.baseUrl,
      siteType: this.request.siteType,
      directRequestReason: API_DIRECT_REQUEST_REASONS.CredentialIsolation,
      abortSignal,
      auth: {
        authType: AuthTypeEnum.AccessToken,
        userId: this.expectedUserId,
        accessToken: this.created.token,
      },
    }
    const read = <T>(endpoint: string) =>
      newApiFamilyRequests.data<T>(isolatedRequest, {
        endpoint,
        currentTabTransport: "disabled",
        options: { credentials: "omit", redirect: "error" },
        tempWindowFallback: { codes: [], statusCodes: [] },
      })
    const user = await read<{ id: unknown }>(ENDPOINTS.SELF)
    if (String(user?.id) !== this.expectedUserId)
      throw new ApiError(
        "Account identity changed",
        undefined,
        ENDPOINTS.SELF,
        API_ERROR_CODES.ACCOUNT_IDENTITY_MISMATCH,
      )
    for (const [scope, endpoint] of [
      [ACCESS_SCOPES.USAGE_READ, "/api/log/self?p=0&page_size=1"],
      [ACCESS_SCOPES.WALLET_READ, "/api/subscription/self"],
      [ACCESS_SCOPES.API_KEY_READ, "/api/token/?p=0&page_size=1"],
    ] as const) {
      if (this.createdScopes.includes(scope)) await read(endpoint)
    }
    this.created.verified = true
    return { ...this.created }
  }

  private async verifyOperation(
    input: NewApiTokenVerification,
    verification: NewApiTokenCapabilities["verification"],
    operation: Parameters<NewApiTokenInteraction["verify"]>[1],
    operationRequest: ApiServiceRequest,
  ) {
    if (
      !verification.methods.some(
        (method) => method.method === input.method && method.available,
      )
    )
      throw new Error(VERIFICATION_ERRORS.METHOD_UNAVAILABLE)
    let candidate: unknown
    if (input.method === METHODS.OAUTH || input.method === METHODS.PASSKEY) {
      if (
        input.method === METHODS.OAUTH &&
        !verification.oauth_providers.some(
          (provider) => provider.slug === input.provider,
        )
      )
        throw new Error(VERIFICATION_ERRORS.METHOD_UNAVAILABLE)
      if (!this.interaction) throw new Error(VERIFICATION_ERRORS.FLOW_REQUIRED)
      candidate = await this.interaction.verify(
        input,
        operation,
        operationRequest,
      )
    } else {
      const fields =
        input.method === METHODS.PASSWORD
          ? verification.password_encryption_enabled
            ? await encryptNewApiPassword(input.password, async () => ({
                success: true,
                data: await this.read("/api/user/login/encryption-key"),
              }))
            : { password: input.password }
          : { code: input.code.trim() }
      candidate = await tokenSessionRequest(operationRequest, {
        endpoint: ENDPOINTS.VERIFY,
        operationSemantics: API_OPERATION_SEMANTICS.Mutation,
        options: {
          method: "POST",
          body: JSON.stringify({
            ...operation,
            method: input.method,
            ...fields,
          }),
        },
      })
    }
    const proof = proofSchema.parse(candidate)
    operationRequest.abortSignal?.throwIfAborted()
    if (
      proof.scope !== operation.scope ||
      proof.method !== input.method ||
      proof.expires_at <= Date.now() / 1000
    )
      throw new Error(CREATION_ERRORS.INVALID_PROOF)
    return proof
  }

  /** Read metadata only; no plaintext can be recovered from the server. */
  async reviewRecovery() {
    if (this.inFlight) throw new Error(CREATION_ERRORS.BUSY)
    const created = this.created
    if (!created) return false
    const user = await this.read<{ id: unknown }>(ENDPOINTS.SELF)
    if (String(user.id) !== this.expectedUserId)
      throw new Error(API_ERROR_CODES.ACCOUNT_IDENTITY_MISMATCH)
    const data = z
      .object({ items: z.array(z.object({ id: z.number().int().positive() })) })
      .parse(await this.read(ENDPOINTS.ACCESS_TOKENS))
    if (data.items.some((item) => item.id === created.id)) return false
    this.created = undefined
    return true
  }

  /** Read metadata only; no plaintext can be recovered from the server. */
  async loadRecovery() {
    const reviewing = !this.inFlight ? await this.journal?.pending() : undefined
    await this.load()
    const verification = verificationSchema.parse(
      await this.read(
        `${ENDPOINTS.VERIFICATION_METHODS}?scope=${OPERATION_SCOPES.REVOKE}`,
      ),
    )
    if (verification.scope !== OPERATION_SCOPES.REVOKE)
      throw new Error(CREATION_ERRORS.INVALID_PROOF)
    const reviewStartedAt = Date.now()
    const data = z
      .object({
        items: z.array(
          z.object({
            id: z.number().int().positive(),
            name: z.string(),
            created_at: z.number(),
            expires_at: z.number(),
            scopes: z.array(z.string()),
            token_hint: z.string().optional(),
          }),
        ),
      })
      .parse(await this.read(ENDPOINTS.ACCESS_TOKENS))
    if (reviewing)
      this.issuanceReview = { marker: reviewing, startedAt: reviewStartedAt }
    return { ...data, verification }
  }

  /** Explicitly revoke one selected token with an id-bound proof, then read back. */
  async revokeToken(id: number, input: NewApiTokenVerification) {
    if (this.inFlight) throw new Error(CREATION_ERRORS.BUSY)
    return this.runOperation(async (signal) => {
      const recovery = await this.loadRecovery()
      const revokedCreated = this.created?.id === id
      if (!recovery.items.some((item) => item.id === id)) {
        if (revokedCreated) this.created = undefined
        return revokedCreated
      }
      const request = { ...this.request, abortSignal: signal }
      const proof = await this.verifyOperation(
        input,
        recovery.verification,
        {
          scope: OPERATION_SCOPES.REVOKE,
          context: { token_id: id },
        },
        request,
      )
      signal?.throwIfAborted()
      await tokenSessionRequest(request, {
        endpoint: `${ENDPOINTS.ACCESS_TOKENS}/${id}`,
        operationSemantics: API_OPERATION_SEMANTICS.Mutation,
        options: {
          method: "DELETE",
          headers: { "X-Security-Proof": proof.proof_token },
        },
      })
      if ((await this.loadRecovery()).items.some((item) => item.id === id))
        throw new Error(CREATION_ERRORS.REVOKE_UNCONFIRMED)
      if (revokedCreated) this.created = undefined
      return revokedCreated
    })
  }

  /** Verify the final operation and dispatch issuance exactly once for this session. */
  async create(
    rawDraft: NewApiTokenDraft,
    input: NewApiTokenVerification,
  ): Promise<NewApiCreatedToken> {
    if (this.inFlight) throw new Error(CREATION_ERRORS.BUSY)
    if (this.uncertain) throw new NewApiTokenCreationUncertainError()
    if (this.created) return this.verifyCreated()
    return this.runOperation(async (signal) => {
      const operationRequest = { ...this.request, abortSignal: signal }
      const draft = draftSchema.parse(rawDraft)
      if (!draft.scopes.includes(ACCESS_SCOPES.PROFILE_READ))
        throw new Error(CREATION_ERRORS.PROFILE_REQUIRED)
      draft.scopes = normalizeGrantScopes(draft.scopes)
      if (
        draft.expires_at !== 0 &&
        draft.expires_at <
          Math.floor(Date.now() / 1000) + MIN_TOKEN_EXPIRY_SECONDS
      )
        throw new Error(CREATION_ERRORS.EXPIRY_INVALID)
      const capabilities = await this.load()
      signal?.throwIfAborted()
      if (this.uncertain) throw new NewApiTokenCreationUncertainError()
      const allowed = new Set(
        getNewApiTokenCatalogPermissions(capabilities.catalog).map(
          ({ scope }) => scope,
        ),
      )
      if (draft.scopes.some((scope) => !allowed.has(scope)))
        throw new Error(CREATION_ERRORS.SCOPE_FORBIDDEN)
      const proof = await this.verifyOperation(
        input,
        capabilities.verification,
        {
          scope: OPERATION_SCOPES.GENERATE,
          context: { scopes: draft.scopes, expires_at: draft.expires_at },
        },
        operationRequest,
      )
      const issue = () => this.issueWithProof(draft, proof, operationRequest)
      const created = await (this.journal
        ? this.journal.whileIssuing(issue)
        : issue())
      try {
        return await this.checkCreatedToken(signal)
      } catch {
        return { ...created }
      }
    })
  }

  private async issueWithProof(
    draft: NewApiTokenDraft,
    proof: NewApiTokenProof,
    operationRequest: ApiServiceRequest,
  ) {
    operationRequest.abortSignal?.throwIfAborted()
    if (this.journal && !(await this.journal.begin(proof.expires_at * 1000))) {
      await this.observeUncertainIssuance()
      throw new NewApiTokenCreationUncertainError()
    }
    let issued: unknown
    try {
      issued = await tokenSessionRequest(
        { ...operationRequest, requestTimeoutMs: ISSUANCE_TIMEOUT_MS },
        {
          endpoint: ENDPOINTS.ACCESS_TOKENS,
          operationSemantics: API_OPERATION_SEMANTICS.Mutation,
          options: {
            method: "POST",
            headers: { "X-Security-Proof": proof.proof_token },
            body: JSON.stringify(draft),
          },
        },
      )
    } catch (error) {
      // Only an explicit server rejection establishes that creation did not succeed.
      if (
        !(error instanceof ApiError) ||
        !error.upstreamCode ||
        (error.statusCode ?? 0) >= 500
      ) {
        return await this.recordUncertainIssuance()
      }
      await this.journal?.resolved()
      throw error
    }
    const parsed = z
      .object({
        token: z.string().min(1),
        item: z.object({ id: z.number().int().positive() }).passthrough(),
      })
      .safeParse(issued)
    if (!parsed.success) {
      return await this.recordUncertainIssuance()
    }
    const created = (this.created = {
      token: parsed.data.token,
      id: parsed.data.item.id,
      verified: false,
    })
    this.createdScopes = draft.scopes
    const grant = draftSchema.safeParse(parsed.data.item)
    this.grantMatches =
      created.token.startsWith("nap_") &&
      grant.success &&
      grant.data.expires_at === draft.expires_at &&
      grant.data.name === draft.name &&
      JSON.stringify(normalizeGrantScopes(grant.data.scopes)) ===
        JSON.stringify(draft.scopes)
    // If local storage fails, keep the marker but allow validation of this token.
    await this.journal?.resolved().catch(() => undefined)
    return created
  }

  private async observeUncertainIssuance() {
    if (await this.journal?.pending()) this.uncertain = true
  }

  /** Preserve the journal marker when the server may have accepted issuance. */
  private async recordUncertainIssuance(): Promise<never> {
    this.uncertain = true
    await this.journal?.uncertain()
    await this.observeUncertainIssuance()
    throw new NewApiTokenCreationUncertainError()
  }
}
