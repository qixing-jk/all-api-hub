# Account login capabilities

## Product scope

Account login is an account-owned capability, separate from API-request authentication and from the operations that use it. The existing AgentRouter login/check-in integration remains the only product caller. Its method selector and native username/password fields live in an independent Account login section in the account editor. That section renders only while the selected check-in method consumes account login; manual check-in also counts. The check-in section explains the dependency, shows the configured method, and links to the account-owned configuration. Hiding the section preserves saved settings. This adds no general login command, public runtime login action, account identification through login, credential renewal, or automatic expired-session recovery.

The internal capability discovers adapter-owned login methods, executes a selected method and verifies the saved account identity. It implements OAuth for New API-family sites and Sub2API, and native password login for New API, Sub2API and the verified AgentRouter deployment. Other New API forks do not inherit password support merely by sharing an API family. The common contract does not require the New API protocol or browser executor. Discovery never logs out or logs in. Future product integration must explicitly choose when to call these operations.

The browser's existing identity-provider session may complete authorization automatically. Password login uses explicitly saved credentials and prefers the site's native login form, including verified password-entry choices and required agreement controls. Native CAPTCHA and additional verification stay with the site; the existing verification reminder lets the user open the login window and finish them. A verification-free page without visible login controls may use the internal API protocol before any native submission. A dispatched submission is never replayed within the attempt. The feature does not replace saved extension access tokens or cookies, change the account's authentication type, enable check-in, or retry failed account requests. A browser login is independent of the credentials the extension uses for API requests.

Password flows prefer a private window only when the browser reports that extension access is allowed. Otherwise they use a regular window. Shared guidance in account login and Permissions explains how to grant browser-owned access, warns that changing access can reload the extension, and rechecks on focus or refresh. An existing regular-window session is not silently reset; a user can complete the required sign-out in the login window. OAuth keeps its existing window policy.

## Capability and implementation

- `accountLogin/configuration.ts` provides internal read/configure operations. Saving configuration never starts login. Password selection atomically saves `SiteAccount.login.methodId` and `login.credentials` in the existing account envelope. Configuration version 8 migrates legacy `passwordAuth` and `checkIn.loginCheckIn` fields without enabling login or changing user timestamps. The editor reads standalone login configuration and saves only explicit login changes; unrelated account or check-in edits preserve the latest saved credentials. Auto-detection returns proven login bindings as account facts, outside check-in. Switching to OAuth or clearing configuration removes the password. Changing site URL, site type or saved user ID also drops it. Credentials follow the account's existing backup, sync and deletion lifecycle; they are secrets stored by extension storage, without a separate encryption guarantee. Password entry is exposed only for the existing AgentRouter caller. Explicit password edits must contain both username and password before saving. Legacy fields are interpreted at the read/migration codec; execution accepts canonical login configuration only.
- Native password login reuses the browser executor's origin/session queue, popup lifecycle and failed-attempt cleanup. Native-form completion verifies the current self endpoint against the saved ID; the internal API protocol also verifies the login response. It never replaces extension API credentials or claims an ambient OAuth-provider identity. Lost mutation responses remain uncertain until session observation can establish the outcome, without replay within a login attempt; the existing check-in scheduling/retry policy remains unchanged.
- New API uses `/api/user/login` and `/api/user/self`, supporting legacy cookie sessions and modern dashboard auth bundles. When enabled by public status, native password encryption uses RSA-OAEP/SHA-256 or the upstream hybrid AES-GCM format for long UTF-8 passwords. Missing WebCrypto or invalid encryption keys fail without a plaintext fallback. Modern failed-session cleanup is scoped by `X-Auth-Session`; legacy cleanup first verifies the cookie identity.
- Sub2API uses email/password at `/api/v1/auth/login` and bearer verification at `/api/v1/auth/me`. Verified console tokens stay in website localStorage. A concurrently changed website token pair is preserved; cleanup revokes only the refresh token issued by this request. No token or password is returned in login results or raw upstream error messages.
- Protocol evidence: New API commit `d032204733db31208f10bac118b6e683aab3bf29` (`web/src/features/auth/api.ts`, `lib/password-encryption.ts`, `controller/user.go`); Sub2API commit `b0a02a3304a0a78cdd003ddda1dd23ba02c03084` (`frontend/src/api/auth.ts`). AgentRouter's deployed login bundle was inspected on 2026-10-16 and explicitly submits username/password to `/api/user/login`, returning optional `checked_in`.

- `SiteTypeCapabilities.account.login` is optional. Absence means unsupported; the capability contract lives in `apiAdapters/contracts/accountLogin.ts`.
- `accountSiteDefinitions` owns static login policy. `methods` contains adapter-owned IDs; protocol-specific options are optional and namespaced, such as `protocols.newApi`. A different adapter does not need a New API protocol tag, user-ID header or callback path list. New API login navigation reuses `onboarding.routes.loginPath`. The registry returns defensive copies of login policy.
- `apiAdapters/registry.getAccountLoginCapability` resolves the canonical AgentRouter deployment before the saved site type. AgentRouter remains deployment metadata in `accountSiteDefinitions/deployments.ts`, without introducing a site type. Invalid AgentRouter schemes or ports cannot fall through to a generic protocol.
- `accountLogin.discoverAccountLoginMethods` and `loginAccount` are the business entrypoints and delegate to that resolver. Discovery returns `{ id, label }`; login receives the selected `methodId`. The common contract accepts native or custom method IDs without adding them to a global provider enum. Each adapter implements the capability, selects and configures the protocol, and adapts protocol responses to the shared login result. There is no second hierarchy of capabilities under `accountLogin/providers`.
- The login target provides optional saved `id` and `username` fields. Each adapter chooses the authoritative identity and rejects missing or mismatched evidence. For example, existing AIHubMix identity verification uses `username`, while Sub2API and VoAPI use IDs with their own bearer/raw-JWT protocols. An OpenRouter extension-generated fallback ID must not be assumed to identify its website session. `AccountLoginResult` is a domain contract, independent of the generic browser login result; optional check-in evidence is not required from other implementations.
- `apiService/newApiFamily/oauth` owns reusable discovery, authorization URL and content protocol functions. The content handlers own logout, OAuth state and identity verification. `browserLogin/browserLogin.ts` owns popup lifecycle, cancellation, origin checks, cleanup and session scheduling. The OAuth executor owns redirect/authorization/completion; `accountLogin/browserPassword.ts` owns native dispatch and result parsing. The browser lifecycle does not inspect protocol evidence or credentials. Providers on the same origin share their protocol's lock. Preparation and completion can return explicit unsupported, interaction-required or uncertain outcomes.
- `apiAdapters/sub2api/auth/accountLogin.ts` registers Sub2API's login capability. Its OAuth flow uses `apiService/sub2api/oauth`, shared public-settings access and passive browser-session helpers; its password flow uses the native Sub2API auth protocol. It has no dependency on New API's flow factory, status fields, user-ID headers or auth-bundle refresh. A successful result contains only the verified identity, without check-in evidence.
- AgentRouter reuses the New API OAuth flow factory and browser executor. Its adapter specializes protocol actions and parsing; the shared factory does not branch on deployment names. Its content protocol retains `__agwt_rt` cleanup, `mode=login`, canonical origin and system-name checks, and optional `checked_in` evidence. Only its check-in caller interprets that evidence as a check-in result.
- Content actions execute only fixed same-origin protocol requests. Modern flow evidence is bound to the initiating origin and request ID. Completion uses the configured paths saved at preparation, so later messages cannot broaden them. Credentials remain in the browser context; successful login returns identity and optional evidence.

## Adding a different login protocol

A new implementation belongs to its site's adapter and registers through `SiteTypeCapabilities.account.login`. It supplies its own read-only discovery, session establishment and authoritative identity verification. Only genuinely shared mechanics should use `browserOAuth`; other implementations can return the same domain outcomes directly. Status envelopes, logout/state endpoints, token storage, callback handling and identity headers stay in the relevant protocol.

Sub2API exercises this boundary with a real second protocol. Additional contract tests use an explicitly labeled AIHubMix test double with a custom method ID and username identity. That double does not implement AIHubMix OAuth; AIHubMix and VoAPI login remain separate work.

## Internal support matrix

| Site type / deployment | Implemented methods | Compatibility basis |
| --- | --- | --- |
| New API | GitHub, Linux DO, Discord, OIDC, password | Current upstream auth-flow and earlier session-cookie contracts; native password protocol |
| Veloera | GitHub, Linux DO, OIDC when advertised | Shared status/session contract; `/app/tokens` callback destination |
| V-API, Super-API, Rix-Api, neo-Api, wong-gongyi | GitHub, Linux DO when advertised | New API protocol reuse; individual deployments/forks are not live-certified |
| Canonical `https://agentrouter.org` | GitHub, Linux DO, password | Existing verified deployment protocol |
| Sub2API | GitHub, Google, Linux DO, OIDC, DingTalk, WeChat Open when advertised; password | Native public settings, backend authorization redirects, password auth and website Bearer sessions |
| One API, OneHub, DoneHub, APIYI, ModelFlare, VoAPI, other AnyRouter deployments, unknown | None in this iteration | Do not infer browser login from account API compatibility |
| Other site types outside the New API family | None in this iteration | Future optional capabilities |

New API custom OAuth providers, Telegram, New API WeChat and Veloera IDCFlare are not implemented. Sub2API WeChat requires an explicit enabled Open capability; MP/mobile modes and an old aggregate WeChat flag are insufficient. The matrix describes implementation scope, not a guarantee that a deployment has enabled or configured each provider. A fork with different endpoint, frontend or identity-header contracts needs its own capability or a verified shared extension.

New API accepts its legacy `/console` and `/console/token` destinations and modern `/dashboard`; Veloera accepts `/app/tokens`. Other compatibility buckets retain the previous path allowlist in their explicit metadata until their deployment contracts can be verified. Their navigation routes are not evidence of an OAuth callback destination.

## Sub2API protocol boundary

| Responsibility | New API family | Sub2API |
| --- | --- | --- |
| Discovery | Public `/api/status`, including client IDs | Public `/api/v1/settings/public` provider flags and OIDC label |
| OAuth start | Content prepares state; adapter validates the IdP authorization URL | Navigate once to the same-origin `/api/v1/auth/oauth/{provider}/start`; backend owns state, PKCE and the IdP redirect |
| Fresh browser session | Family-specific logout and session handling | Public logout revokes the website refresh token and clears pending/bind cookies; then clear website auth storage |
| Callback exchange | New API frontend and version-specific session handling | Sub2API frontend consumes legacy fragments or its pending-cookie exchange |
| Identity verification | `/api/user/self` with the relevant session format | `/api/v1/auth/me` with the website Bearer token, checked against `auth_user.id` and the saved account ID |

Sub2API requests explicit login intent and a dashboard redirect containing the operation's request ID. Both the browser flow and content completion require that exact redirect, so an old dashboard or an unfinished callback cannot count as a new login. GitHub/Google also retain the website's tab-local provider hint for deployments where the provider initially redirects to the frontend callback.

Tencent/Aliyun action CAPTCHA returns `interaction_required` before logout; the extension does not manufacture a proof or submit a different login method. Normal IdP consent and verification remain visible in the browser window. Sub2API does not reuse Linux DO's automatic consent action because its backend owns the authorization state. Pending account adoption, binding or 2FA remains owned by the website. An unfinished flow stays unverified and reaches the browser executor's bounded interaction timeout.

Completion passively reads the new website session. It never rotates a Sub2API refresh token, calls registration/binding endpoints, or imports credentials into extension storage. An expired or concurrently replaced session requires interaction. Failure cleanup removes only this request's flow evidence and the unchanged session actually observed during completion; it preserves a newer session established in another tab. A lost logout response is `uncertain` and does not trigger fallback or replay.

## Version compatibility

The modern protocol was checked against New API **v1.0.0-rc.37**:

- [`router/api-router.go`](https://github.com/QuantumNous/new-api/blob/v1.0.0-rc.37/router/api-router.go): `POST /api/user/auth/logout`, `POST /api/oauth/state`.
- [`controller/oauth.go`](https://github.com/QuantumNous/new-api/blob/v1.0.0-rc.37/controller/oauth.go): explicit `{ provider, intent: "login" }` and `data.flow_token`.
- [`web/src/routes/oauth/$provider.tsx`](https://github.com/QuantumNous/new-api/blob/v1.0.0-rc.37/web/src/routes/oauth/$provider.tsx): frontend-owned OAuth exchange and `/dashboard` completion.
- [`web/src/lib/oauth.ts`](https://github.com/QuantumNous/new-api/blob/v1.0.0-rc.37/web/src/lib/oauth.ts): provider-specific authorization endpoints, scopes and redirects.
- [`Veloera OAuth2Callback.js`](https://github.com/Veloera/Veloera/blob/main/web/src/components/OAuth2Callback.js): `/app/tokens` completion and `localStorage.user`.

Discord scopes use a space-separated value before URL encoding, as required by the [Discord OAuth2 protocol](https://docs.discord.com/developers/topics/oauth2#authorization-code-grant). This avoids copying rc.37's literal `+` into `URLSearchParams`, which would encode the separator as `%2B`.

Legacy fallback is limited: only HTTP 404/405 from the modern logout route permits `GET /api/user/logout` followed by `GET /api/oauth/state`. Legacy completion uses `localStorage.user` and verifies `/api/user/self` with the identity header from explicit login metadata (`New-Api-User`, `Veloera-User`, `X-Api-User`, `Rix-Api-User`, or `neo-api-user`). Modern completion instead obtains a transient auth bundle via the browser refresh cookie and verifies `/self` with its Bearer token, using the existing strict bundle parser. Tokens never cross the content-message channel or enter extension storage.

Network failures, 401/409/429, 5xx, malformed successful responses, and business errors do not trigger protocol fallback or automatic mutation replay. Partially upgraded deployments, alternate old themes and very old releases are not a priority compatibility target. No universal minimum version is inferred from version strings.

New API protocol requests have a bounded timeout. A lost response from logout or OAuth-state creation is reported as uncertain because the mutation may already have completed. After failed identity verification, cleanup refreshes the current modern session and logs it out only when its session ID and user identity still match the session observed by this operation; a newer session established in another tab is preserved. Legacy cleanup applies the same identity check before logout.

Content messaging can retry when the browser reports that no receiver exists yet. Once an action was dispatched, a lost response does not replay preparation or the authorization click; callback observation continues for an already-sent click.

Sub2API was checked against [`881f3202694c6bc932446931a30c27d9675178b9`](https://github.com/Wei-Shaw/sub2api/tree/881f3202694c6bc932446931a30c27d9675178b9):

- [Public settings DTO](https://github.com/Wei-Shaw/sub2api/blob/881f3202694c6bc932446931a30c27d9675178b9/backend/internal/handler/dto/settings.go) and [frontend auth API](https://github.com/Wei-Shaw/sub2api/blob/881f3202694c6bc932446931a30c27d9675178b9/frontend/src/api/auth.ts): provider flags, WeChat Open capability, GET OAuth start and pending exchange.
- [Auth routes](https://github.com/Wei-Shaw/sub2api/blob/881f3202694c6bc932446931a30c27d9675178b9/backend/internal/server/routes/auth.go) and [logout regression test](https://github.com/Wei-Shaw/sub2api/blob/881f3202694c6bc932446931a30c27d9675178b9/backend/internal/handler/auth_oauth_logout_test.go): public logout and HttpOnly OAuth-cookie cleanup.
- [Linux DO callback](https://github.com/Wei-Shaw/sub2api/blob/881f3202694c6bc932446931a30c27d9675178b9/frontend/src/views/auth/LinuxDoCallbackView.vue) and [email OAuth callback](https://github.com/Wei-Shaw/sub2api/blob/881f3202694c6bc932446931a30c27d9675178b9/frontend/src/views/auth/OAuthCallbackView.vue): legacy token fragments, current pending-cookie completion, website-owned token persistence and final redirects.
- [OAuth CAPTCHA start handler](https://github.com/Wei-Shaw/sub2api/blob/881f3202694c6bc932446931a30c27d9675178b9/backend/internal/handler/auth_oauth_captcha_start.go): Tencent/Aliyun proof belongs to interactive initiation.

Compatibility relies on these routes/settings and the website completing its own session. No minimum release version or live certification of every Sub2API fork is inferred. A deployment with a different API prefix or callback/redirect contract needs verified protocol adaptation.

## Validation boundaries

Protocol tests cover discovery, both session formats, explicit login intent, missing routes, failure-without-replay, origin/request binding and mismatched identity. Browser tests exercise real extension messaging and OAuth navigation against controlled gateway and identity-provider responses through internal content actions. These tests do not claim live authorization coverage for every listed deployment or provider.

Sub2API browser fixtures cover both callback generations, real HTTP redirects and HttpOnly cookies, frontend-first Google callbacks, mismatched identity, action CAPTCHA and a lost logout response. Related tests also retain Sub2API onboarding, refresh and account API behavior and the existing AgentRouter check-in caller.

No new telemetry event is added; existing account-save and check-in outcomes cover this configuration workflow. As before, URLs, account identities, OAuth state, auth responses and credentials are not analytics payloads.
