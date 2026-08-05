import { describe, expect, expectTypeOf, it } from "vitest"

import {
  MANAGED_SITE_MUTATION_COMPLETIONS,
  MANAGED_SITE_MUTATION_CONTROLLED_CATEGORIES,
  MANAGED_SITE_MUTATION_EFFECT_KINDS,
  MANAGED_SITE_MUTATION_OUTCOMES,
  parseManagedSiteExternalMutationSummary,
  parseManagedSitePersistedMutationState,
  parsePrivateManagedSiteMutationOutput,
  toManagedSiteExternalMutationSummary,
  toManagedSitePersistedMutationState,
  toPrivateManagedSiteMutationOutput,
  toPrivateManagedSiteThrownErrorMessage,
  type ManagedSiteExternalMutationSummary,
  type ManagedSiteMutationConfirmedEffect,
  type ManagedSiteMutationPartial,
  type ManagedSiteMutationRejected,
  type ManagedSiteMutationResult,
  type ManagedSiteMutationSucceeded,
  type ManagedSitePersistedMutationState,
  type ManagedSitePrivateMutationOutput,
} from "~/services/managedSites/mutations"

const effect: ManagedSiteMutationConfirmedEffect = {
  kind: MANAGED_SITE_MUTATION_EFFECT_KINDS.ResourceUpdated,
  resourceKind: "channel",
  resourceId: "resource-42",
}

const succeeded = (
  message = "Saved",
): ManagedSiteMutationSucceeded<
  { id: string },
  ManagedSiteMutationConfirmedEffect
> => ({
  outcome: MANAGED_SITE_MUTATION_OUTCOMES.Succeeded,
  data: { id: "private-resource-id" },
  confirmedEffects: [effect],
  message,
})

const rejected = (
  diagnostic: {
    message: string
    code?: string | number
    statusCode?: number
    raw?: unknown
  } = { message: "Rejected", code: "request_rejected", statusCode: 400 },
): ManagedSiteMutationRejected => ({
  outcome: MANAGED_SITE_MUTATION_OUTCOMES.Rejected,
  diagnostic,
})

const partial = (): ManagedSiteMutationPartial<
  { id: string },
  ManagedSiteMutationConfirmedEffect
> => ({
  outcome: MANAGED_SITE_MUTATION_OUTCOMES.Partial,
  data: { id: "private-resource-id" },
  confirmedEffects: [effect],
  completion: MANAGED_SITE_MUTATION_COMPLETIONS.Uncertain,
  diagnostic: {
    message: "The final state could not be confirmed",
    code: "confirmation_failed",
    statusCode: 502,
  },
})

const fusedSensitiveFieldNames = [
  "tokenvalue",
  "TOKENVALUE",
  "tokenValue",
  "token_value",
  "passwordvalue",
  "PASSWORDVALUE",
  "passwordValue",
  "password-value",
  "authheader",
  "AUTHHEADER",
  "authHeader",
  "auth_header",
  "sessionid",
  "SESSIONID",
  "sessionId",
  "session-id",
  "keyvalue",
  "KEYVALUE",
  "keyValue",
  "key_value",
  "jwtvalue",
  "JWTVALUE",
  "jwtValue",
  "jwt-value",
  "databasepasswordvalue",
  "DATABASEPASSWORDVALUE",
  "databasePasswordValue",
  "database_password_value",
  "usercredentialrecord",
  "USERCREDENTIALRECORD",
  "userCredentialRecord",
  "user-credential-record",
  "databasepassword",
  "DATABASEPASSWORD",
  "logincredential",
  "LOGINCREDENTIAL",
  "sessioncookie",
  "SESSIONCOOKIE",
  "bearertoken",
  "BEARERTOKEN",
  "usertoken",
  "USERTOKEN",
  "mastersecret",
  "MASTERSECRET",
  "databasekey",
  "DATABASEKEY",
  "apikey",
  "APIKEY",
  "accesstoken",
  "ACCESSTOKEN",
  "refreshtoken",
  "REFRESHTOKEN",
  "clientsecret",
  "CLIENTSECRET",
  "managementkey",
  "MANAGEMENTKEY",
  "admintoken",
  "ADMINTOKEN",
  "privatekey",
  "PRIVATEKEY",
  "apitoken",
  "APITOKEN",
  "apiToken",
  "servicetoken",
  "SERVICETOKEN",
  "serviceToken",
  "oauthtoken",
  "OAUTHTOKEN",
  "servicecredential",
  "SERVICECREDENTIAL",
  "adminpassword",
  "ADMINPASSWORD",
] as const

const sensitiveFieldNames = [
  "authorization",
  "AUTHORIZATION",
  "auth",
  "key",
  "admin_token",
  "management_key",
  "private_key",
  "client_secret",
  "clientSecret",
  "accessToken",
  "refresh-token",
  "apiKey",
  "cookie",
  "session",
  "jwt",
  "databasePassword",
  "account_passwd",
  "loginCredential",
  "settings[apiKey]",
  ...fusedSensitiveFieldNames,
] as const

const JWT_PROTECTED_HEADER = "eyJhbGciOiJIUzI1NiJ9"
const JWT_FIXTURE = `${JWT_PROTECTED_HEADER}.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signaturevalue`
const JWE_PROTECTED_HEADER = "eyJhbGciOiJkaXIiLCJlbmMiOiJBMjU2R0NNIn0"
const JWE_FIXTURE = `${JWE_PROTECTED_HEADER}.encryptedKeyValue.initialVector.ciphertextValue.authTagValue`

const encodeJoseProtectedHeader = (header: Record<string, string>) =>
  globalThis
    .btoa(JSON.stringify(header))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "")

describe("managed site mutation disclosure boundaries", () => {
  it("does not mutate internal diagnostics or traverse their raw nested cause", () => {
    const nestedCause = { token: "nested-secret", message: "Nested failure" }
    const raw = Object.create(null) as Record<string, unknown>
    Object.defineProperty(raw, "cause", {
      enumerable: true,
      get: () => {
        throw new Error("raw cause getter must not run")
      },
    })
    const diagnostic = {
      message: "Bearer known-secret upstream failure",
      code: "known-secret-code",
      statusCode: 502,
      raw,
      cause: nestedCause,
    }
    const result = rejected(diagnostic)

    const output = toPrivateManagedSiteMutationOutput(result, {
      knownSecrets: ["known-secret"],
    })

    expect(output).toEqual({
      outcome: "rejected",
      message: "Bearer [REDACTED] upstream failure",
      code: "[REDACTED]-code",
      statusCode: 502,
    })
    expect(diagnostic.message).toBe("Bearer known-secret upstream failure")
    expect(diagnostic.code).toBe("known-secret-code")
    expect(diagnostic.statusCode).toBe(502)
    expect(diagnostic.raw).toBe(raw)
    expect(diagnostic.cause).toBe(nestedCause)
  })

  it("projects thrown errors through known-secret and structural redaction", () => {
    const secret = "thrown-secret-placeholder"
    const message = toPrivateManagedSiteThrownErrorMessage(
      new Error(
        `Provider failed ${secret} authorization=secondary-private-value`,
        { cause: new Error(`cause ${secret}`) },
      ),
      { knownSecrets: [secret] },
    )

    expect(message).toContain("Provider failed")
    expect(message).not.toContain(secret)
    expect(message).not.toContain("secondary-private-value")
  })

  it("fails closed when a thrown value cannot be inspected safely", () => {
    const thrown = new Proxy(
      {},
      {
        has() {
          throw new Error("inspection unavailable")
        },
      },
    )

    expect(
      toPrivateManagedSiteThrownErrorMessage(thrown, { knownSecrets: [] }),
    ).toBeUndefined()
  })

  it("redacts exact known secrets from success and failure messages and codes", () => {
    const knownSecrets = ["secret-value"]

    expect(
      toPrivateManagedSiteMutationOutput(
        succeeded("Created with secret-value"),
        { knownSecrets },
      ),
    ).toEqual({
      outcome: "succeeded",
      message: "Created with [REDACTED]",
    })

    expect(
      toPrivateManagedSiteMutationOutput(
        rejected({
          message: "Provider returned secret-value",
          code: "secret-value",
          statusCode: 401,
        }),
        { knownSecrets },
      ),
    ).toEqual({
      outcome: "rejected",
      message: "Provider returned [REDACTED]",
      code: "[REDACTED]",
      statusCode: 401,
    })
  })

  it.each([
    ["Authorization: Bearer abc.def-123", "Authorization: Bearer [REDACTED]"],
    ["Authorization: Basic dXNlcjpwYXNz", "Authorization: Basic [REDACTED]"],
    ["Cookie: session=private; theme=dark", "Cookie: [REDACTED]"],
    ["Set-Cookie: session=private; HttpOnly", "Set-Cookie: [REDACTED]"],
    [
      "Request https://user:password@example.invalid/v1/items?token=private&safe=ok#part failed",
      "Request https://example.invalid/v1/items failed",
    ],
    [`JWT ${JWT_FIXTURE} rejected`, "JWT [REDACTED] rejected"],
    ["Key sk-proj_1234567890abcdef rejected", "Key [REDACTED] rejected"],
    ["api_key=private-credential", "api_key=[REDACTED]"],
    ["password: private-credential", "password: [REDACTED]"],
    ["access_token = private-credential", "access_token = [REDACTED]"],
  ])("structurally redacts %s without a known-secret list", (message, safe) => {
    expect(
      toPrivateManagedSiteMutationOutput(succeeded(message), {
        knownSecrets: [],
      }),
    ).toEqual({ outcome: "succeeded", message: safe })
  })

  it("redacts a complete Digest Authorization header value", () => {
    const secret =
      'Digest username="example-user", realm="example.invalid", nonce="private-nonce"'
    const output = toPrivateManagedSiteMutationOutput(
      rejected({
        message: `Authorization: ${secret}`,
        code: `Authorization: ${secret}`,
      }),
      { knownSecrets: [] },
    )

    expect(output).toEqual({
      outcome: "rejected",
      message: "Authorization: [REDACTED]",
      code: "Authorization: [REDACTED]",
    })
    expect(output.message).not.toContain("private-nonce")
    expect(output.code).not.toContain("private-nonce")
  })

  it.each([
    [
      "authorization=Digest username=example,response=private-response,nonce=private-nonce",
      "authorization=[REDACTED]",
      ["private-response", "private-nonce"],
    ],
    [
      "Authorization=AWS4-HMAC-SHA256 Credential=private-credential, SignedHeaders=host;x-date, Signature=private-signature\nstatus=ok",
      "Authorization=[REDACTED]\nstatus=ok",
      ["private-credential", "private-signature"],
    ],
    [
      "auth=Basic private-basic, metadata=private-metadata",
      "auth=Basic [REDACTED]",
      ["private-basic", "private-metadata"],
    ],
    [
      "sessionCookie=session=private-cookie; theme=dark",
      "sessionCookie=[REDACTED]",
      ["private-cookie", "theme=dark"],
    ],
    [
      "privateKey=-----BEGIN PRIVATE KEY----- private-key-material",
      "privateKey=[REDACTED]",
      ["private-key-material"],
    ],
    [
      "loginCredential=private credential, metadata=private-metadata",
      "loginCredential=[REDACTED]",
      ["private credential", "private-metadata"],
    ],
  ])(
    "redacts a complete equals-delimited sensitive header value in %s",
    (value, safe, secretParts) => {
      const output = toPrivateManagedSiteMutationOutput(
        rejected({ message: value, code: value }),
        { knownSecrets: [] },
      )

      expect(output).toEqual({
        outcome: "rejected",
        message: safe,
        code: safe,
      })
      for (const secretPart of secretParts) {
        expect(output.message).not.toContain(secretPart)
        expect(output.code).not.toContain(secretPart)
      }
    },
  )

  it.each([
    [
      "Authorization: AWS4-HMAC-SHA256 Credential=private-credential, SignedHeaders=host;x-date, Signature=private-signature\r\nstatus=ok",
      "Authorization: [REDACTED]\r\nstatus=ok",
      "private-signature",
    ],
    [
      "password=private value with spaces; status=ok",
      "password=[REDACTED]; status=ok",
      "private value",
    ],
    [
      "private_key: -----BEGIN PRIVATE KEY----- private-material",
      "private_key: [REDACTED]",
      "private-material",
    ],
    [
      "loginCredential: private credential material\nstatus=ok",
      "loginCredential: [REDACTED]\nstatus=ok",
      "private credential",
    ],
    [
      "password=private value, status=ok",
      "password=[REDACTED], status=ok",
      "private value",
    ],
  ])(
    "redacts the complete logical sensitive value in %s",
    (value, safe, secretPart) => {
      const output = toPrivateManagedSiteMutationOutput(
        rejected({ message: value, code: value }),
        { knownSecrets: [] },
      )

      expect(output).toEqual({ outcome: "rejected", message: safe, code: safe })
      expect(output.message).not.toContain(secretPart)
      expect(output.code).not.toContain(secretPart)
    },
  )

  it.each(sensitiveFieldNames)(
    "redacts credential assignments for sensitive field %s",
    (fieldName) => {
      expect(
        toPrivateManagedSiteMutationOutput(
          succeeded(`${fieldName}=private-value`),
          { knownSecrets: [] },
        ),
      ).toEqual({
        outcome: "succeeded",
        message: `${fieldName}=[REDACTED]`,
      })
    },
  )

  it.each([
    [
      "Request https://us'er:pa'ss@example.invalid/owner's/path?token=sec'ret&safe=ok failed",
      "Request https://example.invalid/owner's/path failed",
    ],
    [
      "Request //user:password@example.invalid/path?token=secret failed",
      "Request //example.invalid/path failed",
    ],
  ])("removes userinfo and query secrets from URL form %#", (message, safe) => {
    expect(
      toPrivateManagedSiteMutationOutput(succeeded(message), {
        knownSecrets: [],
      }),
    ).toEqual({ outcome: "succeeded", message: safe })
  })

  it("normalizes special-scheme backslashes before redacting URL secrets", () => {
    const secretUrl =
      "https:\\\\user:password@example.invalid\\path?token=private-url-token"
    const output = toPrivateManagedSiteMutationOutput(
      rejected({
        message: `Request ${secretUrl} failed`,
        code: `Request ${secretUrl} failed`,
      }),
      { knownSecrets: [] },
    )

    expect(output).toEqual({
      outcome: "rejected",
      message: "Request https://example.invalid/path failed",
      code: "Request https://example.invalid/path failed",
    })
    expect(output.message).not.toContain("user")
    expect(output.message).not.toContain("password")
    expect(output.message).not.toContain("private-url-token")
    expect(output.code).not.toContain("private-url-token")
  })

  it("preserves ordinary prose containing backslashes", () => {
    const message = "Keep folder\\name and notes\\draft unchanged"

    expect(
      toPrivateManagedSiteMutationOutput(succeeded(message), {
        knownSecrets: [],
      }),
    ).toEqual({ outcome: "succeeded", message })
  })

  it.each([
    ["Request /api/items?key=private failed", "Request /api/items failed"],
    ["Request /?key=private failed", "Request / failed"],
    ["Request ./?key=private failed", "Request ./ failed"],
    ["Request ../?key=private failed", "Request ../ failed"],
    ["Inspect /#key=private next", "Inspect / next"],
    ["Inspect ./#key=private next", "Inspect ./ next"],
    ["Inspect ../#key=private next", "Inspect ../ next"],
    ["Request api/items?key=private failed", "Request api/items failed"],
    ["Request items?key=private failed", "Request items failed"],
    ["Inspect items#key=private next", "Inspect items next"],
    ["Request ?key=private failed", "Request [URL] failed"],
    ["Inspect #key=private next", "Inspect [URL] next"],
    [
      "Inspect v1/items?access_token=private#details next",
      "Inspect v1/items next",
    ],
    ["Request api/items?key=sec'ret failed", "Request api/items failed"],
    ["Request items?key=sec'ret failed", "Request items failed"],
    ["Request ?key=sec'ret failed", "Request [URL] failed"],
    ["Inspect api/items#key=sec'ret next", "Inspect api/items next"],
    ["Inspect items#key=sec'ret next", "Inspect items next"],
    ["Inspect #key=sec'ret next", "Inspect [URL] next"],
    ['Request "items?key=private" failed', 'Request "items" failed'],
    ["Request <items#key=private> failed", "Request <items> failed"],
    ["Request (items?key=private), next", "Request (items), next"],
    ["Request [items?key=private], next", "Request [items], next"],
    ["Request {items#key=private}; next", "Request {items}; next"],
  ])(
    "removes query or fragment data from relative reference %#",
    (message, safe) => {
      expect(
        toPrivateManagedSiteMutationOutput(succeeded(message), {
          knownSecrets: [],
        }),
      ).toEqual({ outcome: "succeeded", message: safe })
    },
  )

  it.each([
    "items?%74oken=private-encoded-query",
    "items?to%6ben=private-encoded-query",
    "items?To%6Ben=private-encoded-query",
    "items?to+ken=private-encoded-query",
    "items#%74oken=private-encoded-query",
    "items?to%ZZken=private-encoded-query",
  ])("removes encoded or malformed sensitive URL data from %s", (reference) => {
    const value = `Request ${reference} next`
    const output = toPrivateManagedSiteMutationOutput(
      rejected({ message: value, code: value }),
      { knownSecrets: [] },
    )

    expect(output).toEqual({
      outcome: "rejected",
      message: "Request items next",
      code: "Request items next",
    })
    expect(output.message).not.toContain("private-encoded-query")
    expect(output.code).not.toContain("private-encoded-query")
  })

  it.each([
    "/keyboard?lang=en",
    "/author/profile?view=full",
    "/monkey?theme=dark",
  ])("preserves a safe relative path and query in %s", (reference) => {
    expect(
      toPrivateManagedSiteMutationOutput(succeeded(`Request ${reference}`), {
        knownSecrets: [],
      }),
    ).toEqual({ outcome: "succeeded", message: `Request ${reference}` })
  })

  it("still removes sensitive data from a path containing sensitive substrings", () => {
    const secret = "private-path-query"
    const output = toPrivateManagedSiteMutationOutput(
      succeeded(`Request /keyboard?token=${secret}`),
      { knownSecrets: [] },
    )

    expect(output).toEqual({
      outcome: "succeeded",
      message: "Request /keyboard",
    })
    expect(output.message).not.toContain(secret)
  })

  it.each(
    sensitiveFieldNames.flatMap((fieldName) => [
      [`Request items?${fieldName}=private next`, "Request items next"],
      [`Inspect items#${fieldName}=private next`, "Inspect items next"],
    ]),
  )("removes URL data for sensitive field in %s", (message, safe) => {
    expect(
      toPrivateManagedSiteMutationOutput(succeeded(message), {
        knownSecrets: [],
      }),
    ).toEqual({ outcome: "succeeded", message: safe })
  })

  it("uses sensitive field classification for messages and string codes", () => {
    expect(
      toPrivateManagedSiteMutationOutput(
        rejected({
          message: "CLIENTSECRET=private-message",
          code: "items#SERVICETOKEN=private-code",
        }),
        { knownSecrets: [] },
      ),
    ).toEqual({
      outcome: "rejected",
      message: "CLIENTSECRET=[REDACTED]",
      code: "items",
    })
  })

  it("redacts empty-bracket credential assignments in messages and string codes", () => {
    expect(
      toPrivateManagedSiteMutationOutput(
        rejected({
          message: "token[]=private-message safe",
          code: "token[]=private-code",
        }),
        { knownSecrets: [] },
      ),
    ).toEqual({
      outcome: "rejected",
      message: "token[]=[REDACTED]",
      code: "token[]=[REDACTED]",
    })
  })

  it.each([
    ["tokens[0]=private suffix", "tokens[0]=[REDACTED]"],
    [
      "settings[0][apiKey]=private, status=ok",
      "settings[0][apiKey]=[REDACTED], status=ok",
    ],
    [
      "Failed at endpoint settings[0][apiKey]=private suffix",
      "Failed at endpoint settings[0][apiKey]=[REDACTED]",
    ],
    [
      "headers[0][authorization]=Bearer private suffix",
      "headers[0][authorization]=Bearer [REDACTED]",
    ],
    [
      'settings["apiKey"]="private value" safe',
      'settings["apiKey"]="[REDACTED]" safe',
    ],
    [
      "settings['accessToken']='private value' safe",
      "settings['accessToken']='[REDACTED]' safe",
    ],
    [
      'settings["api\\"Key"]=private suffix',
      'settings["api\\"Key"]=[REDACTED]',
    ],
    [
      "headers.authorization=Bearer private suffix",
      "headers.authorization=Bearer [REDACTED]",
    ],
    [
      "settings.credentials.password=private; status=ok",
      "settings.credentials.password=[REDACTED]; status=ok",
    ],
  ])(
    "redacts nested credential assignment %s in messages and string codes",
    (value, safe) => {
      expect(
        toPrivateManagedSiteMutationOutput(
          rejected({ message: value, code: value }),
          { knownSecrets: [] },
        ),
      ).toEqual({ outcome: "rejected", message: safe, code: safe })
    },
  )

  it.each([
    ["token[=private suffix", "token[=[REDACTED]"],
    ["settings[apiKey=private suffix", "settings[apiKey=[REDACTED]"],
    ['settings["apiKey]=private suffix', 'settings["apiKey]=[REDACTED]'],
    ["token[]junk=private suffix", "token[]junk=[REDACTED]"],
    ["token]=private suffix", "token]=[REDACTED]"],
  ])("fails closed for malformed sensitive assignment %s", (value, safe) => {
    expect(
      toPrivateManagedSiteMutationOutput(succeeded(value), {
        knownSecrets: [],
      }),
    ).toEqual({ outcome: "succeeded", message: safe })
  })

  it.each([",", ";", "&"])(
    "fails closed for an overlong quoted bracket segment containing %s",
    (delimiter) => {
      const secret = "private-overlong-value"
      const field = `settings["${"x".repeat(257)}\\"${delimiter}apiKey"]`
      const output = toPrivateManagedSiteMutationOutput(
        rejected({
          message: `${field}=${secret}`,
          code: `${field}=${secret}`,
        }),
        { knownSecrets: [] },
      )

      expect(output).toEqual({
        outcome: "rejected",
        message: `${field}=[REDACTED]`,
      })
      expect(output.message).not.toContain(secret)
      expect(output.code).toBeUndefined()
    },
  )

  it.each([
    "items[0]=value",
    "settings[0][name]=value",
    "model.name=value",
    'settings["name"]=value',
    "settings[broken=value",
  ])("keeps non-sensitive nested assignment %s", (message) => {
    expect(
      toPrivateManagedSiteMutationOutput(succeeded(message), {
        knownSecrets: [],
      }),
    ).toEqual({ outcome: "succeeded", message })
  })

  it.each([
    [
      "Request items?settings[0][apiKey]=private&safe=value next",
      "Request items next",
    ],
    [
      "Inspect items#headers.authorization=Bearer%20private next",
      "Inspect items next",
    ],
    ["Request items?items[0]=value next", "Request items?items[0]=value next"],
  ])(
    "leaves URL-owned nested assignment handling intact in %s",
    (value, safe) => {
      expect(
        toPrivateManagedSiteMutationOutput(succeeded(value), {
          knownSecrets: [],
        }),
      ).toEqual({ outcome: "succeeded", message: safe })
    },
  )

  it.each(
    [")", ",", ".", ";", "!", "?"].flatMap((punctuation) => [
      [`Request items?key=private${punctuation} next`, "Request items next"],
      [`Request items#key=private${punctuation} next`, "Request items next"],
      [
        `Request https://example.invalid/path?key=private${punctuation} next`,
        "Request https://example.invalid/path next",
      ],
      [
        `Request https://example.invalid/path#key=private${punctuation} next`,
        "Request https://example.invalid/path next",
      ],
    ]),
  )("does not restore query or fragment punctuation in %s", (message, safe) => {
    expect(
      toPrivateManagedSiteMutationOutput(succeeded(message), {
        knownSecrets: [],
      }),
    ).toEqual({ outcome: "succeeded", message: safe })
  })

  it.each([
    [
      "Request (https://example.invalid/path?key=private), next",
      "Request (https://example.invalid/path), next",
    ],
    [
      "Request [https://example.invalid/path#key=private]; next",
      "Request [https://example.invalid/path]; next",
    ],
    [
      'Request "https://example.invalid/path?key=private", next',
      'Request "https://example.invalid/path", next',
    ],
    [
      "Request <https://example.invalid/path#key=private>, next",
      "Request <https://example.invalid/path>, next",
    ],
  ])("preserves punctuation outside a URL wrapper in %s", (message, safe) => {
    expect(
      toPrivateManagedSiteMutationOutput(succeeded(message), {
        knownSecrets: [],
      }),
    ).toEqual({ outcome: "succeeded", message: safe })
  })

  it.each([
    ["Request items?key=! next", "Request items next"],
    ["Request items#key=! next", "Request items next"],
    [
      "Request https://example.invalid/path?key=! next",
      "Request https://example.invalid/path next",
    ],
    [
      "Request https://example.invalid/path#key=! next",
      "Request https://example.invalid/path next",
    ],
  ])("drops punctuation-only URL secrets in %s", (message, safe) => {
    expect(
      toPrivateManagedSiteMutationOutput(succeeded(message), {
        knownSecrets: [],
      }),
    ).toEqual({ outcome: "succeeded", message: safe })
  })

  it("removes relative-reference secrets from both message and code", () => {
    expect(
      toPrivateManagedSiteMutationOutput(
        rejected({
          message: "Failed at items?key=private safely",
          code: "items#key=sec'ret",
        }),
        { knownSecrets: [] },
      ),
    ).toEqual({
      outcome: "rejected",
      message: "Failed at items safely",
      code: "items",
    })
  })

  it.each([
    "Keep issue#123 visible",
    "Explain why?because matters",
    "A monkey met a turkey",
    "A monkey used a keyboard and tokenizer for tokenization",
    "The turkey joined a sessionized secretariat and claimed authorship",
    "The clientside adminpanel keeps issue reference model and name visible",
  ])("does not rewrite ordinary rootless prose in %s", (message) => {
    expect(
      toPrivateManagedSiteMutationOutput(succeeded(message), {
        knownSecrets: [],
      }),
    ).toEqual({ outcome: "succeeded", message })
  })

  it.each(
    [
      ["clientside", "true"],
      ["adminpanel", "visible"],
      ["issue", "123"],
      ["reference", "resource-42"],
      ["model", "example-model"],
      ["name", "example-name"],
    ].flatMap(([fieldName, value]) => {
      const assignment = `${fieldName}=${value}`
      const query = `Request items?${fieldName}=${value} next`
      const fragment = `Inspect items#${fieldName}=${value} next`
      return [assignment, query, fragment]
    }),
  )("does not redact non-sensitive field substrings in %s", (message) => {
    expect(
      toPrivateManagedSiteMutationOutput(succeeded(message), {
        knownSecrets: [],
      }),
    ).toEqual({ outcome: "succeeded", message })
  })

  it.each(
    [
      "monkey",
      "turkey",
      "keyboard",
      "tokenizer",
      "tokenization",
      "sessionized",
      "secretariat",
      "authorship",
    ].flatMap((fieldName) => [
      [`${fieldName}=value`, `${fieldName}=[REDACTED]`],
      [`Request items?${fieldName}=value next`, "Request items next"],
      [`Inspect items#${fieldName}=value next`, "Inspect items next"],
    ]),
  )(
    "fails closed when a parsed field contains a sensitive core in %s",
    (message, safe) => {
      expect(
        toPrivateManagedSiteMutationOutput(succeeded(message), {
          knownSecrets: [],
        }),
      ).toEqual({ outcome: "succeeded", message: safe })
    },
  )

  it.each([
    ['password="secret value" rejected', 'password="[REDACTED]" rejected'],
    ["token='secret value' rejected", "token='[REDACTED]' rejected"],
    ["secret = 'another private value'", "secret = '[REDACTED]'"],
  ])("redacts the complete quoted credential in %s", (message, safe) => {
    expect(
      toPrivateManagedSiteMutationOutput(succeeded(message), {
        knownSecrets: [],
      }),
    ).toEqual({ outcome: "succeeded", message: safe })
  })

  it("redacts complete quoted credential values from both message and code", () => {
    expect(
      toPrivateManagedSiteMutationOutput(
        rejected({
          message: 'password="secret value" rejected',
          code: "token='secret code value'",
        }),
        { knownSecrets: [] },
      ),
    ).toEqual({
      outcome: "rejected",
      message: 'password="[REDACTED]" rejected',
      code: "token='[REDACTED]'",
    })
  })

  it.each([
    ['password="secret value', 'password="[REDACTED]"'],
    [
      'password="sec\\"ret value" safe status',
      'password="[REDACTED]" safe status',
    ],
    ["token='secret value", "token='[REDACTED]'"],
    ["secret='sec\\'ret value' safe status", "secret='[REDACTED]' safe status"],
    [
      'password="secret value\nsafe status',
      'password="[REDACTED]"\nsafe status',
    ],
  ])("fails closed for malformed quoted credential in %s", (message, safe) => {
    expect(
      toPrivateManagedSiteMutationOutput(succeeded(message), {
        knownSecrets: [],
      }),
    ).toEqual({ outcome: "succeeded", message: safe })
  })

  it("fails closed for malformed quoted credentials in both message and code", () => {
    expect(
      toPrivateManagedSiteMutationOutput(
        rejected({
          message: 'password="sec\\"ret value" safe',
          code: "token='secret code value",
        }),
        { knownSecrets: [] },
      ),
    ).toEqual({
      outcome: "rejected",
      message: 'password="[REDACTED]" safe',
      code: "token='[REDACTED]'",
    })
  })

  it.each([
    [`JWT (${JWT_FIXTURE}-) rejected`, "JWT ([REDACTED]) rejected"],
    [`JWT ${JWT_FIXTURE}_ rejected`, "JWT [REDACTED] rejected"],
    ["Key (sk-proj_1234567890abcdef-) rejected", "Key ([REDACTED]) rejected"],
    ["Key sk-proj_1234567890abcdef_ rejected", "Key [REDACTED] rejected"],
  ])("redacts the full base64url-shaped credential in %s", (message, safe) => {
    expect(
      toPrivateManagedSiteMutationOutput(succeeded(message), {
        knownSecrets: [],
      }),
    ).toEqual({ outcome: "succeeded", message: safe })
  })

  it("redacts a complete five-part JWE without leaking trailing segments", () => {
    const output = toPrivateManagedSiteMutationOutput(
      succeeded(`JWE ${JWE_FIXTURE} rejected`),
      { knownSecrets: [] },
    )

    expect(output).toEqual({
      outcome: "succeeded",
      message: "JWE [REDACTED] rejected",
    })
    expect(output.message).not.toContain("ciphertextValue")
    expect(output.message).not.toContain("authTagValue")
  })

  it.each([
    [`${JWT_FIXTURE}. Next`, "[REDACTED]. Next", "signaturevalue"],
    [`${JWT_FIXTURE}.. Next`, "[REDACTED].. Next", "signaturevalue"],
    [`(${JWT_FIXTURE}). Next`, "([REDACTED]). Next", "signaturevalue"],
    [`${JWE_FIXTURE}. Next`, "[REDACTED]. Next", "ciphertextValue"],
    [`${JWE_FIXTURE}.. Next`, "[REDACTED].. Next", "authTagValue"],
    [`(${JWE_FIXTURE}). Next`, "([REDACTED]). Next", "ciphertextValue"],
    [`${JWT_FIXTURE}.extra`, "[REDACTED]", "signaturevalue"],
    [`${JWE_FIXTURE}.extra`, "[REDACTED]", "authTagValue"],
  ])(
    "redacts a JOSE token while handling trailing run %s",
    (value, safe, secretPart) => {
      const message = `Token ${value}`
      const safeMessage = `Token ${safe}`
      const output = toPrivateManagedSiteMutationOutput(
        rejected({ message, code: message }),
        { knownSecrets: [] },
      )

      expect(output).toEqual({
        outcome: "rejected",
        message: safeMessage,
        code: safeMessage,
      })
      expect(output.message).not.toContain(secretPart)
      expect(output.code).not.toContain(secretPart)
    },
  )

  it.each([
    "https://api.example.invalid/path",
    "v1.2.3",
    "alpha.beta.gamma",
    "foo.bar.baz",
    "vendor.model-v2.latest",
    "new-api.compat.v3",
    "e30.payload.signature",
    "W10.payload.signature",
    "eyJhbGciOiIifQ.payload.signature",
    "__8.payload.signature",
  ])("preserves safe dotted text %s", (dottedText) => {
    const value = `Backend ${dottedText} remains available`

    expect(
      toPrivateManagedSiteMutationOutput(
        rejected({ message: value, code: value }),
        { knownSecrets: [] },
      ),
    ).toEqual({ outcome: "rejected", message: value, code: value })
  })

  it("fails closed for a plausible JWT with an oversized valid protected header", () => {
    const protectedHeader = encodeJoseProtectedHeader({
      alg: "HS256",
      padding: "x".repeat(1_540),
    })
    const value = `${protectedHeader}.payload.signature`

    expect(protectedHeader.length).toBeGreaterThan(2_048)
    expect(value.length).toBeLessThan(4_096)

    expect(
      toPrivateManagedSiteMutationOutput(succeeded(value), {
        knownSecrets: [],
      }),
    ).toEqual({ outcome: "succeeded", message: "[REDACTED]" })
    expect(
      toPrivateManagedSiteMutationOutput(succeeded(value), {
        knownSecrets: [],
      }).message,
    ).not.toContain(value)

    expect(
      toPrivateManagedSiteMutationOutput(succeeded(`${value}. Next`), {
        knownSecrets: [],
      }),
    ).toEqual({ outcome: "succeeded", message: "[REDACTED]. Next" })
  })

  it("fails closed for a plausible JWE with an oversized valid protected header", () => {
    const protectedHeader = encodeJoseProtectedHeader({
      alg: "dir",
      enc: "A256GCM",
      padding: "x".repeat(1_540),
    })
    const value = `${protectedHeader}..initialVector.ciphertextValue.authTagValue`

    expect(protectedHeader.length).toBeGreaterThan(2_048)
    expect(value.length).toBeLessThan(4_096)

    expect(
      toPrivateManagedSiteMutationOutput(
        rejected({ message: value, code: value }),
        { knownSecrets: [] },
      ),
    ).toEqual({
      outcome: "rejected",
      message: "[REDACTED]",
      code: "[REDACTED]",
    })
  })

  it("preserves oversized ordinary text without a plausible compact shape", () => {
    const value = `${"a".repeat(2_049)}.description`

    expect(
      toPrivateManagedSiteMutationOutput(succeeded(value), {
        knownSecrets: [],
      }),
    ).toEqual({ outcome: "succeeded", message: value })
  })

  it.each([
    [JWT_FIXTURE, "signaturevalue"],
    [JWE_FIXTURE, "ciphertextValue"],
    [`${JWT_PROTECTED_HEADER}.x.signatureValue`, "signatureValue"],
    [`${JWT_PROTECTED_HEADER}.payloadValue.`, "payloadValue"],
    [
      `${JWE_PROTECTED_HEADER}..initialVector.ciphertextValue.authTagValue`,
      "ciphertextValue",
    ],
  ])("redacts the complete JOSE compact token %s", (token, secretPart) => {
    const wrapped = `(${token});`
    const output = toPrivateManagedSiteMutationOutput(
      rejected({ message: wrapped, code: wrapped }),
      { knownSecrets: [] },
    )

    expect(output).toEqual({
      outcome: "rejected",
      message: "([REDACTED]);",
      code: "([REDACTED]);",
    })
    expect(output.message).not.toContain(secretPart)
    expect(output.code).not.toContain(secretPart)
  })

  it("handles a 100KB adversarial dot chain within a deterministic bound", () => {
    const dotChain = Array.from({ length: 13_000 }, () => "abcdefgh").join(".")
    expect(dotChain.length).toBeGreaterThan(100_000)

    const startedAt = performance.now()
    const output = toPrivateManagedSiteMutationOutput(succeeded(dotChain), {
      knownSecrets: [],
    })
    const duration = performance.now() - startedAt

    expect(duration).toBeLessThan(2_000)
    expect(output.message).toHaveLength(4_096)
  })

  it("redacts JWT-shaped values before assignment punctuation in messages and codes", () => {
    expect(
      toPrivateManagedSiteMutationOutput(
        rejected({
          message: `JWT ${JWT_FIXTURE}: rejected`,
          code: `JWT ${JWT_FIXTURE} = rejected`,
        }),
        { knownSecrets: [] },
      ),
    ).toEqual({
      outcome: "rejected",
      message: "JWT [REDACTED]: rejected",
      code: "JWT [REDACTED] = rejected",
    })
  })

  it.each([
    [`field=${JWT_FIXTURE}:invalid`, "field=[REDACTED]:invalid"],
    [`${JWT_FIXTURE};`, "[REDACTED];"],
    [`${JWT_FIXTURE})`, "[REDACTED])"],
    [`${JWT_FIXTURE}=rejected`, "[REDACTED]=rejected"],
  ])("redacts JWT-shaped values around punctuation in %s", (value, safe) => {
    expect(
      toPrivateManagedSiteMutationOutput(
        rejected({ message: value, code: value }),
        { knownSecrets: [] },
      ),
    ).toEqual({ outcome: "rejected", message: safe, code: safe })
  })

  it.each([
    ["tokenvalue", "apikeyvalue", "="],
    ["auth", "key", ":"],
    ["secret", "tokenvalue", "="],
  ])(
    "redacts validated JOSE before a sensitive-looking assignment boundary in %s.%s%s",
    (payload, signature, separator) => {
      const token = `${JWT_PROTECTED_HEADER}.${payload}.${signature}`
      const value = `${token}${separator}rejected`
      const safe = `[REDACTED]${separator}[REDACTED]`

      expect(
        toPrivateManagedSiteMutationOutput(
          rejected({ message: value, code: value }),
          { knownSecrets: [] },
        ),
      ).toEqual({ outcome: "rejected", message: safe, code: safe })
      expect(
        toPrivateManagedSiteMutationOutput(succeeded(value), {
          knownSecrets: [],
        }).message,
      ).not.toContain(token)
    },
  )

  it("applies structural redaction to string codes", () => {
    expect(
      toPrivateManagedSiteMutationOutput(
        rejected({
          message: "Safe provider message",
          code: "token=private-credential",
        }),
        { knownSecrets: [] },
      ),
    ).toEqual({
      outcome: "rejected",
      message: "Safe provider message",
      code: "token=[REDACTED]",
    })
  })

  it("drops mutation payloads, effects, raw values, and unknown fields", () => {
    const successResult = {
      ...succeeded(),
      unknown: "private metadata",
    }
    const failureResult = {
      ...rejected({ message: "Rejected", raw: { secret: "private" } }),
      unknown: "private metadata",
    }

    expect(
      toPrivateManagedSiteMutationOutput(successResult, { knownSecrets: [] }),
    ).toEqual({ outcome: "succeeded", message: "Saved" })
    expect(
      toPrivateManagedSiteMutationOutput(failureResult, { knownSecrets: [] }),
    ).toEqual({ outcome: "rejected", message: "Rejected" })
  })

  it("truncates messages at a complete code-point boundary and omits overlong codes", () => {
    const message = `${"a".repeat(4095)}😀trailing`
    const output = toPrivateManagedSiteMutationOutput(
      rejected({
        message,
        code: "x".repeat(257),
      }),
      { knownSecrets: [] },
    )

    expect(output.message).toBe("a".repeat(4095))
    expect(output.message).toHaveLength(4095)
    expect(output).not.toHaveProperty("code")

    const exactBoundary = toPrivateManagedSiteMutationOutput(
      succeeded(`${"a".repeat(4094)}😀trailing`),
      { knownSecrets: [] },
    )
    expect(exactBoundary.message).toHaveLength(4096)
    expect(exactBoundary.message?.endsWith("😀")).toBe(true)
  })

  it("omits a code when redaction expands it beyond the disclosure limit", () => {
    const output = toPrivateManagedSiteMutationOutput(
      rejected({
        message: "Rejected",
        code: `${"a".repeat(250)}x`,
      }),
      { knownSecrets: ["x"] },
    )

    expect(output).toEqual({ outcome: "rejected", message: "Rejected" })
  })

  it("retains an overlong code when known-secret redaction makes it safe", () => {
    const secretCode = "s".repeat(257)
    const output = toPrivateManagedSiteMutationOutput(
      rejected({ message: "Rejected", code: secretCode }),
      { knownSecrets: [secretCode] },
    )

    expect(output).toEqual({
      outcome: "rejected",
      message: "Rejected",
      code: "[REDACTED]",
    })
  })

  it("preserves only valid private status and numeric code values", () => {
    expect(
      toPrivateManagedSiteMutationOutput(
        rejected({ message: "Rejected", code: 42, statusCode: 429 }),
        { knownSecrets: [] },
      ),
    ).toEqual({
      outcome: "rejected",
      message: "Rejected",
      code: 42,
      statusCode: 429,
    })

    const invalid = rejected({
      message: "Rejected",
      code: Number.POSITIVE_INFINITY,
      statusCode: 99,
    })
    expect(
      toPrivateManagedSiteMutationOutput(invalid, { knownSecrets: [] }),
    ).toEqual({ outcome: "rejected", message: "Rejected" })
  })

  it("keeps persisted and external DTOs minimal and nominally distinct", () => {
    const persisted = toManagedSitePersistedMutationState(partial())
    const external = toManagedSiteExternalMutationSummary(partial())

    expect(persisted).toEqual({
      outcome: "partial",
      completion: "uncertain",
      category: MANAGED_SITE_MUTATION_CONTROLLED_CATEGORIES.Partial,
    })
    expect(external).toEqual(persisted)
    expect(Object.keys(persisted)).toEqual([
      "outcome",
      "completion",
      "category",
    ])
    expectTypeOf<ManagedSitePersistedMutationState>().not.toEqualTypeOf<ManagedSiteExternalMutationSummary>()
    expectTypeOf<ManagedSitePrivateMutationOutput>().not.toEqualTypeOf<ManagedSitePersistedMutationState>()

    // @ts-expect-error Persisted state must be revalidated for the external boundary.
    const externalFromPersisted: ManagedSiteExternalMutationSummary = persisted
    // @ts-expect-error External summaries must be revalidated for persistence.
    const persistedFromExternal: ManagedSitePersistedMutationState = external
    void externalFromPersisted
    void persistedFromExternal
  })

  it.each([
    [succeeded(), { outcome: "succeeded", category: "succeeded" }],
    [rejected(), { outcome: "rejected", category: "rejected" }],
    [
      partial(),
      { outcome: "partial", completion: "uncertain", category: "partial" },
    ],
    [
      {
        outcome: MANAGED_SITE_MUTATION_OUTCOMES.Uncertain,
        diagnostic: { message: "Not confirmed" },
      } satisfies ManagedSiteMutationResult,
      { outcome: "uncertain", category: "uncertain" },
    ],
  ])(
    "maps controlled categories only from mutation outcome %#",
    (result, expected) => {
      expect(toManagedSitePersistedMutationState(result)).toEqual(expected)
      expect(toManagedSiteExternalMutationSummary(result)).toEqual(expected)
    },
  )

  it("exact-validates unknown serialized input and rebrands it per boundary", () => {
    const serialized: unknown = JSON.parse(
      JSON.stringify({
        outcome: "partial",
        completion: "rejected",
        category: "partial",
      }),
    )

    const privateOutput = parsePrivateManagedSiteMutationOutput({
      outcome: "rejected",
      statusCode: 409,
      code: "conflict",
      message: "Already changed",
    })
    const persisted = parseManagedSitePersistedMutationState(serialized)
    const external = parseManagedSiteExternalMutationSummary(serialized)

    expect(privateOutput).toEqual({
      outcome: "rejected",
      statusCode: 409,
      code: "conflict",
      message: "Already changed",
    })
    expect(persisted).toEqual(serialized)
    expect(external).toEqual(serialized)
    expect(persisted).not.toBe(serialized)
    expect(external).not.toBe(serialized)
  })

  it.each([
    { outcome: "rejected", unknown: true },
    { outcome: "rejected", message: undefined },
    { outcome: "rejected", statusCode: Number.NaN },
    { outcome: "rejected", statusCode: Number.POSITIVE_INFINITY },
    { outcome: "rejected", statusCode: 99 },
    { outcome: "rejected", statusCode: 600 },
    { outcome: "rejected", statusCode: 400.5 },
    { outcome: "rejected", code: Number.NaN },
    { outcome: "rejected", code: Number.POSITIVE_INFINITY },
    { outcome: "rejected", code: Number.MAX_SAFE_INTEGER + 1 },
    { outcome: "rejected", code: "x".repeat(257) },
    { outcome: "rejected", message: "x".repeat(4097) },
    { outcome: "invalid" },
    { outcome: "partial" },
    { outcome: "partial", completion: "complete" },
    { outcome: "succeeded", completion: "rejected" },
  ])("rejects an invalid private DTO %#", (value) => {
    expect(() => parsePrivateManagedSiteMutationOutput(value)).toThrow(
      TypeError,
    )
  })

  it.each([
    { outcome: "rejected", unknown: true },
    { outcome: "rejected", category: undefined },
    { outcome: "rejected", category: "provider-specific" },
    { outcome: "invalid" },
    { outcome: "partial", category: "partial" },
    { outcome: "partial", completion: "complete", category: "partial" },
    { outcome: "succeeded", completion: "rejected", category: "succeeded" },
    { outcome: "rejected", completion: "uncertain", category: "rejected" },
    { outcome: "rejected", category: "succeeded" },
  ])("rejects an invalid persisted or external DTO %#", (value) => {
    expect(() => parseManagedSitePersistedMutationState(value)).toThrow(
      TypeError,
    )
    expect(() => parseManagedSiteExternalMutationSummary(value)).toThrow(
      TypeError,
    )
  })

  it("rejects accessors, symbols, and inherited fields without reading getters", () => {
    let outcomeReads = 0
    const accessor = { category: "rejected" }
    Object.defineProperty(accessor, "outcome", {
      enumerable: true,
      get: () => {
        outcomeReads += 1
        return "rejected"
      },
    })

    expect(() => parseManagedSitePersistedMutationState(accessor)).toThrow(
      TypeError,
    )
    expect(outcomeReads).toBe(0)

    expect(() =>
      parseManagedSiteExternalMutationSummary({
        outcome: "rejected",
        category: "rejected",
        [Symbol("unknown")]: true,
      }),
    ).toThrow(TypeError)

    expect(() =>
      parsePrivateManagedSiteMutationOutput(
        Object.assign(Object.create({ message: "inherited" }), {
          outcome: "rejected",
        }),
      ),
    ).toThrow(TypeError)
  })

  it("accepts null-prototype DTOs with exact own data properties", () => {
    const value = Object.assign(Object.create(null), {
      outcome: "rejected",
      category: "rejected",
    })

    expect(parseManagedSitePersistedMutationState(value)).toEqual({
      outcome: "rejected",
      category: "rejected",
    })
  })

  it("produces cloneable and JSON-round-trippable DTOs without brand fields", () => {
    const privateOutput = toPrivateManagedSiteMutationOutput(
      rejected({ message: "Rejected", code: "safe", statusCode: 400 }),
      { knownSecrets: [] },
    )
    const persisted = toManagedSitePersistedMutationState(partial())
    const external = toManagedSiteExternalMutationSummary(partial())

    expect(structuredClone(privateOutput)).toEqual(privateOutput)
    for (const dto of [privateOutput, persisted, external]) {
      expect(JSON.parse(JSON.stringify(dto))).toEqual(dto)
      expect(Reflect.ownKeys(dto)).toEqual(Object.keys(dto))
    }
  })
})
