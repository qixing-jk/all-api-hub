# User/account site workflow

Use for user account onboarding and capabilities. Reuse the shared workflow in `SKILL.md`; load the managed or check-in reference only when those outcomes are also requested.

Use the [completeness checklist and handoff table](capability-assessment.md) for authentication alternatives, onboarding/recovery, balance/usage/plans, each key action and native field, runtime-key export, catalogs/pricing, invitation, notices and redemption. Each part needs its mapping and selection reason, or a precise exclusion/deferral reason with evidence; a generic “account supported” result is insufficient.

## Establish the account contract

- Confirm registered type/family and account scope in `src/services/accountSiteDefinitions/`, then inspect the closest account adapters and detection path. Serving inference APIs does not establish an account console contract.
- Record browser/session, account API, management/gateway, and inference endpoint roles separately. Verify how the account is identified, including organization/project scope, and validate live identity before accepting browser-derived replacement credentials or balances. Cached browser user data alone is insufficient.
- Compare available authentication and recovery methods using the shared criteria. Confirm which credential is a console credential and which is an inference key; a token displayed by the website may be unusable for the required console endpoints.
- Record balance currency/scale, consumption windows, subscription allowances, reset timing, and price source separately. Remaining plan allowance, promotional points, purchased credit, and cash balance must not be merged without an explicit provider contract.
- Verify native key inventory, create/edit/delete and reveal semantics individually. Masked inventory or a one-time create secret does not imply a secret-reveal endpoint. Keep the provider's verified form defaults; do not add discovery prerequisites to a name-only key-create flow.
- Before claiming native key editing, inspect the website's actual create/edit forms, including conditional sections and role restrictions. Account for each ordinary-account field's default, options, validation, read/write representation and visibility in the shared editor. Preserving an extra field in a PUT payload is not editable support. Exercise provider-specific controls through the extension UI on a disposable key, read back the changed values, and verify that untouched settings and saved auxiliary credentials survive another edit. Report any deliberately deferred native fields explicitly; a generic name/quota/group editor does not establish form parity.
- Compare inventory and single-resource detail payloads before selecting the edit baseline. A list may omit writable settings or auxiliary credentials even when it returns the main secret's mask. Hydrate the selected owned resource through the verified detail endpoint for editor opening, fresh pre-write comparison and post-write confirmation; keep bulk inventory lightweight. Preserve identity and abort boundaries, and test reopening a saved key with non-default native settings rather than only editing a default key once.

## Discover domains and account boundaries

Survey the provider's official homepage, docs/FAQ, console navigation, and connection or migration notices for canonical, alternate, regional, and fallback domains. Retain the source and an inventory of domain, role, stated purpose, account relationship, and evidence status. Follow official links for bounded read-only inspection; do not assume the requested hostname is exhaustive or enumerate guessed subdomains. If official sources are unavailable, report discovery as incomplete rather than silently limiting the provider to one host.

For candidate account-console aliases, distinguish a redirect from separate frontends, a shared account service from regional account stores, and an inference-only gateway from an onboarding entrypoint. Check public version/status and detection contracts before credentialed verification. Official claims of API Key interoperability establish only that stated scope; verify console Access/System tokens and browser-session behavior independently, including expected identity and cookie origin/domain constraints. Do not send credentials to a newly discovered host merely to test whether they work; first establish its official role and that credential use is within the authorized scope.

Implement verified aliases through the existing registry/detection and endpoint-role mechanisms as part of open-ended adaptation. Use separate types only when the account boundary warrants them, and keep inference-only domains out of console onboarding aliases. Test detection and the relevant origin consumers: credential guidance, account requests, browser recovery, duplicate matching, and exported inference URLs. Preserve the user's chosen console origin unless a verified contract requires another endpoint; do not introduce automatic cross-domain credential fallback.

Retain live validation per domain and authentication method where behavior may differ. Equivalent evidence may be reused when the shared contract is established, with the reason recorded. Mark inaccessible or unverified domains explicitly and report them in the handoff; success on one domain alone does not establish provider-wide support.

## Choose continued access and its default

Before implementing authentication, compare viable methods using provider source/docs and observed console behavior. For each, record required endpoint scopes, acquisition steps, lifetime/refresh evidence, revocation or replacement effects, background access without an open site tab, and isolation between saved accounts. Distinguish a console access token from an inference API key; a token's label or lack of an expiry field does not prove permanent validity.

Prefer the method with sustainable access, sufficient scope, reliable recovery, and independent account credentials. A verified durable token or safely managed refresh normally takes priority over an ambient Cookie session, even when the token requires a one-time manual step. A limited-scope token that cannot serve the promised actions is not automatically better, and the user's explicit authentication choice takes precedence. If Cookie is the only verified viable method, explain that choice and its re-login boundary. If a promising token method lacks live access, prepare its acquisition guide, report what remains unverified, and identify the necessary user cooperation instead of silently treating Cookie support as complete authentication coverage.

Set the new-account default through the existing provider registry/onboarding mechanism; preserve existing saved credentials. Keep supported alternatives explicitly selectable, explain their practical trade-offs beside the credential choice, and never silently switch to Cookie after token verification fails. Reuse an existing token before considering issuance; investigate whether creating another replaces it, and require the applicable authorization before issuing or rotating credentials.

## Complete automatic onboarding

Treat automatic detection and the resulting credential guide as part of account integration delivery:

1. Start from the ordinary fresh add-account form and its intended authentication default. Detect the site type and obtain the identity/context available through authorized read-only discovery; cover detection rejection and bind asynchronous results to the current origin and account.
2. If the preferred credential cannot be acquired automatically, retain the discovered account name/ID, site, and relevant form values. Offer a concise provider-specific guide linking to the official profile/security page, distinguish the required console credential from an inference key, and provide a clear return/paste/verify action with focus on the credential field. Expected password/security verification must lead to this actionable guide rather than an unexplained error or unsupported result. Do not silently create or replace a token.
3. Reuse the existing persistent sidepanel or Options handoff when a popup cannot survive the external-page step; preserve onboarding context. Allow an explicit supported authentication alternative without discarding discovered account details.
4. Verify the supplied credential against the detected origin and expected identity, then save and refresh through the normal UI. Test authentication failure, identity mismatch, and recovery without overwriting a usable saved credential. Establish background access after the site tab closes and multi-account isolation where those properties motivate the selected method.

Use focused failing tests for the new default and guidance/recovery behavior, and retain a site-specific CDP runner for detection → guide/acquisition → return → verify → save → refresh. Manual credential prefill or a successful alternate authentication path alone does not validate ordinary onboarding. When user interaction or a credential is unavailable, finish independently testable detection/guidance and explicitly report the remaining live prerequisite.

## Cover simple user features

Inspect the console's navigation, relevant routes and existing application capability seams. For an open-ended adaptation, consider balance/plans/usage, keys, model list/pricing, aff/invite, and announcements rather than selecting only balance and keys. Record implementation or a justified disposition for each relevant feature.

For aff/invite, retain the native code/link response, link construction/encoding, canonical host and login requirements. Reuse the existing invitation-link retrieval/copy workflow when compatible, then assert the returned link and visible copy feedback. Retrieving an invite link does not authorize referral enrollment, payout, or withdrawal automation. Read the check-in reference if check-in support is selected.

## Validate and hand off

Use focused failing behavior tests for credential identity, transport/envelope, units, endpoint resolution, key semantics and each added capability. Exercise the requested add/save/refresh/recovery flow in the current-worktree extension; use disposable resources for writes and verify cleanup. Include the implemented simple features in site-specific CDP assertions and [visual previews](visual-previews.md).

Keep deployment-only overrides separate from family behavior. Explain whether compatibility is structural across the family or verified only on the named deployment, and retain evidence pointers for both supported and deferred capabilities.
