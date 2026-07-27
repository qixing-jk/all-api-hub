# Typed Runtime Messaging Design

Date: 2026-06-02

## Purpose

Move extension-wide request/response runtime RPCs away from raw
`{ action }` message payloads and onto `@webext-core/messaging` typed
`sendMessage(type, data)` / `onMessage(type, handler)` protocols.

The migration should make message contracts explicit at compile time while
preserving the runtime semantics of existing feature flows. The design applies
to extension-wide request/response calls routed through the background runtime
message surface. It does not make every WebExtension message typed.

## Current Context

The extension currently has multiple runtime-message shapes:

- extension-wide request/response RPCs routed by
  `src/entrypoints/background/runtimeMessages.ts` and `RuntimeActionIds`.
- tab-scoped content-script messages sent with `browser.tabs.sendMessage` or
  `sendTabMessageWithRetry`.
- broadcast or progress update messages, such as account-key repair progress,
  auto-check-in completion, tag-store updates, and model-sync fanout.
- content-script context-menu triggers and content-to-background utility
  messages.

These shapes have different lifecycle constraints. Extension-wide RPCs can be
typed through `@webext-core/messaging`, but tab/content messages still depend on
browser tab targeting, content-script availability, retry behavior, and
best-effort delivery semantics.

## Goals

- Use typed runtime protocols for extension-wide request/response RPCs.
- Keep each typed protocol close to the feature domain that owns the operation.
- Make message request and response shapes explicit through TypeScript protocol
  maps.
- Remove migrated RPC branches from the central raw `{ action }` router.
- Avoid legacy dual-routing for migrated RPCs.
- Preserve tab/content message behavior, broadcast behavior, and user-facing
  product behavior.
- Keep the central runtime router focused on raw messages that still need raw
  WebExtension transport semantics.

## Non-Goals

- Do not migrate `browser.tabs.sendMessage` or `sendTabMessageWithRetry` calls
  solely to make them look like extension-wide RPCs.
- Do not migrate broadcast, progress, or event fanout messages when they are not
  request/response RPCs.
- Do not add compatibility shims where migrated request/response operations can
  still be called through the old `{ action }` payload.
- Do not redesign feature business logic while migrating message transport.
- Do not add a single global protocol map that owns every feature domain.
- Do not change user-visible behavior, settings, telemetry, or E2E coverage
  only because the transport is typed.

## Message Categories

### Typed Extension RPC

Use typed messaging for extension-wide request/response operations where the
sender expects a direct response from the background service and the message
does not require a specific tab target.

Examples include settings updates, scheduler control requests, feature service
queries, account-key repair requests, product analytics requests, and other
background-owned operations that already behave like RPC calls.

Typed RPC modules should expose:

- a literal `MessageTypes` object for operation names.
- a protocol map that defines request and response shapes.
- typed sender and listener helpers from `defineExtensionMessaging`.
- a setup function for background listener registration when the feature owns
  background handlers.

### Raw Tab and Content Messages

Keep raw WebExtension messaging for tab-scoped content-script interactions.

This includes messages sent with `browser.tabs.sendMessage` or
`sendTabMessageWithRetry`, such as localStorage reads, temporary-window content
fetches, rendered-title reads, Turnstile waits, protection guard checks, and
content-script UI triggers.

These messages need explicit tab targeting and retry behavior that should stay
visible at the call site.

### Raw Broadcast and Event Messages

Keep broadcast and progress fanout messages on their existing raw transport
unless a separate design proves that a typed event channel is worthwhile.

Broadcast messages are not RPCs: senders usually do not expect a direct
response, receivers may be optional, and delivery is often best-effort.

## Target Structure

Typed protocols should be colocated with the feature domain instead of gathered
into a large central message registry.

Examples:

```text
src/services/
  runtimeMessaging/
    logger.ts
    result.ts
  checkin/autoCheckin/
    messaging.ts
  models/modelSync/
    messaging.ts
  managedSites/
    channelConfigMessaging.ts
  notifications/
    taskNotificationMessaging.ts
  productAnalytics/
    messaging.ts
```

`src/services/runtimeMessaging` may contain transport-neutral helpers shared by
typed messaging modules, such as logger adaptation and standard response
helpers. It should not own feature-specific operation names.

## Protocol Ownership

Each feature domain owns its message type strings and protocol map. The domain
is responsible for keeping request and response types aligned with the service
functions it exposes.

Use this general shape:

```ts
export const DomainMessageTypes = {
  Operation: "domain:operation",
} as const

interface DomainProtocolMap {
  [DomainMessageTypes.Operation](data: DomainRequest): DomainResponse
}

export const {
  sendMessage: sendDomainMessage,
  onMessage: onDomainMessage,
} = defineExtensionMessaging<DomainProtocolMap>({
  logger: createRuntimeMessagingLogger("DomainMessaging"),
})
```

Background setup should register handlers through domain-owned setup functions:

```ts
export function setupDomainMessagingListeners() {
  onDomainMessage(DomainMessageTypes.Operation, async ({ data }) => {
    return await performDomainOperation(data)
  })
}
```

The background entrypoint may import setup functions, but it should not re-own
the domain's request parsing or response construction after migration.

## Compatibility Policy

Migrated request/response RPCs should become typed-only. Do not keep a parallel
legacy `{ action }` branch after all known callers for that operation have moved
to the typed sender.

This keeps the migration honest:

- tests fail when a caller is missed.
- unused `RuntimeActionIds` can be pruned.
- new code learns the preferred domain protocol instead of copying legacy raw
  payloads.

Raw message constants should remain only for categories that still use raw
transport: tab/content messages, broadcast/event messages, and any runtime
operation whose browser semantics still require raw WebExtension handling.

## Result and Error Shape

Typed runtime handlers may continue returning existing response shapes when
callers already depend on them. Where a shared wrapper is useful, use a small
standard result type:

```ts
type RuntimeMessageResponse<T> =
  | { success: true; data: T }
  | { success: false; error: string }
```

Error payloads should remain privacy-safe. Do not include URLs, tokens, raw
backend messages, stack traces, account names, user-entered text, or other
sensitive values in shared runtime error responses.

## Migration Strategy

Migrate one domain or small group of domains at a time:

1. Add or update the domain typed protocol module.
2. Convert direct callers to the typed sender.
3. Register typed background listeners through a setup function.
4. Remove the corresponding raw `{ action }` branch from the background router.
5. Remove the migrated action constant only after no raw callers remain.
6. Run focused tests for the touched domain and type-check the repo.

High-use or cross-entrypoint domains should migrate after low-risk domains so
the shared logger/result helpers and background registration pattern have
already been proven.

## Validation Plan

Focused validation should cover:

- domain service tests for migrated handlers.
- UI or hook tests for migrated callers.
- background runtime routing tests that prove removed raw branches no longer
  handle migrated RPCs.
- `tests/utils/runtimeActions.test.ts` updates when action constants are
  pruned.

Run `pnpm compile` after each meaningful migration slice.

Use `pnpm run validate:push` when cleanup changes exported surfaces, removes
constants, removes helpers, or may affect dead-code analysis. Use
`pnpm run validate:staged` before committing a staged migration slice.

Add or update Playwright E2E only when the changed message path depends on real
browser extension behavior that lower-level tests cannot observe.

## Risks

- Some raw messages look like RPCs but depend on a tab target or content-script
  retry behavior. Mitigation: classify the message category before migrating.
- Dual typed/raw compatibility branches can hide missed callers. Mitigation:
  remove the raw branch in the same slice that migrates all known callers.
- A centralized protocol map can become another large router. Mitigation:
  keep protocol ownership with feature domains.
- Broadcast messages can be mistaken for RPCs. Mitigation: keep fanout/event
  channels out of this migration unless they get a separate design.
