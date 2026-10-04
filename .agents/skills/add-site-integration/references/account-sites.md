# User/account site workflow

Use for user account onboarding and capabilities. Reuse the shared workflow in `SKILL.md`; load the managed or check-in reference only when those outcomes are also requested.

## Establish the account contract

- Confirm registered type/family and account scope in `src/services/accountSiteDefinitions/`, then inspect the closest account adapters and detection path. Serving inference APIs does not establish an account console contract.
- Record browser/session, account API, management/gateway, and inference endpoint roles separately. Verify how the account is identified, including organization/project scope, and validate live identity before accepting browser-derived replacement credentials or balances. Cached browser user data alone is insufficient.
- Compare available authentication and recovery methods using the shared criteria. Confirm which credential is a console credential and which is an inference key; a token displayed by the website may be unusable for the required console endpoints.
- Record balance currency/scale, consumption windows, subscription allowances, reset timing, and price source separately. Remaining plan allowance, promotional points, purchased credit, and cash balance must not be merged without an explicit provider contract.
- Verify native key inventory, create/edit/delete and reveal semantics individually. Masked inventory or a one-time create secret does not imply a secret-reveal endpoint. Keep the provider's verified form defaults; do not add discovery prerequisites to a name-only key-create flow.

## Cover simple user features

Inspect the console's navigation, relevant routes and existing application capability seams. For an open-ended adaptation, consider balance/plans/usage, keys, model list/pricing, aff/invite, and announcements rather than selecting only balance and keys. Record implementation or a justified disposition for each relevant feature.

For aff/invite, retain the native code/link response, link construction/encoding, canonical host and login requirements. Reuse the existing invitation-link retrieval/copy workflow when compatible, then assert the returned link and visible copy feedback. Retrieving an invite link does not authorize referral enrollment, payout, or withdrawal automation. Read the check-in reference if check-in support is selected.

## Validate and hand off

Use focused failing behavior tests for credential identity, transport/envelope, units, endpoint resolution, key semantics and each added capability. Exercise the requested add/save/refresh/recovery flow in the current-worktree extension; use disposable resources for writes and verify cleanup. Include the implemented simple features in site-specific CDP assertions and [visual previews](visual-previews.md).

Keep deployment-only overrides separate from family behavior. Explain whether compatibility is structural across the family or verified only on the named deployment, and retain evidence pointers for both supported and deferred capabilities.
