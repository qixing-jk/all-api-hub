# Site adaptation completeness checklist

Use this checklist during adaptation to prevent stopping at balance and keys. Copy applicable sections into the existing task spec and track them through discovery, implementation and validation. This is a target integration checklist, not a supported-site inventory.

For open-ended account adaptation, investigate **every account item below** against the website navigation, forms, docs and observed requests, then compare existing app seams. Do not omit an item because the closest adapter lacks it. Implement simple verified features that fit existing UI; explain substantial new flows or deliberate omissions separately. For narrow tasks, state excluded scope once. The separate managed checklist and check-in section apply to requested outcomes or relevant discovered capabilities, without requiring admin support for account-only sites. Add newly discovered ordinary-user features rather than treating this list as exhaustive.

## Checklist map

Choose the requested scope, then work through its functional groups. Shared setup and delivery checks apply to every integration. Authentication here means credentials used by the extension; account onboarding and managed connection remain separate user flows.

| Scope | Functional groups | When to use |
| --- | --- | --- |
| [Shared setup](#shared-setup) | Identity/domains, authentication choice, feature discovery | Every integration |
| [Account adaptation](#account-adaptation) | Onboarding/recovery; balance/usage/plans; keys/exports; models/pricing; invitation/notices/redemption/check-in availability; navigation/actions | Saved-account integration; inspect all groups for open-ended adaptation |
| [Managed-site adaptation](managed-site-checklist.md) | Connection/permissions; native resources/secrets; models/import/migration | Management integration |
| [Check-in adaptation](#check-in-adaptation) | Discovery/status; execution/rewards; user controls/feedback | A selected check-in method; account checklist surveys availability first |
| [Delivery check](#delivery-check) | Behavior/live validation; cleanup/evidence; final coverage | Every integration |

Keep capability groups in the same order in the task checklist and handoff so missing operations are easy to spot. The detailed workflow references explain implementation; this checklist tracks coverage.

## How to close an item

Mark an item complete only after recording an outcome:

- **Adapted**: explain the mapping/reused mechanism and why it fits; identify validated operations and limitations.
- **Partially adapted**: split completed and missing operations/fields; explain the omission and completion prerequisite.
- **Upstream unsupported / not applicable**: cite authoritative source/target evidence or explain why the scope does not own it.
- **Deferred**: state the scope, cost or product dependency and condition for reconsideration.
- **Unverified**: name the missing contract/access and next check. This closes the investigation record, not adaptation or live validation.

An adapter object, page navigation or passing mock alone does not close implementation/validation. Missing plugin code is a gap, not upstream absence; a guessed 404/401 or missing credentials does not prove unsupported behavior. Unknowns stay visible in the handoff.

## Shared setup

- [ ] **Type, family and domains**: discover official console/API/inference and alternate/regional domains; verify account/credential equivalence. Explain type/family choice and origin routing. Reuse registry/endpoint-role mechanisms; branding or inference-key sharing does not settle console identity.
- [ ] **Authentication alternatives**: compare tokens/PATs, refreshable tokens, Cookie sessions and interactive login for scope, lifetime, rotation, background use and account isolation. State the default and reasons for rejecting viable alternatives; provide acquisition/recovery guidance. Unknown expiry is not permanence.
- [ ] **Capability discovery**: survey visible features, native forms and requests, current dispatch, operation policies and UI consumers. Record additional relevant features found during investigation.

## Account adaptation

### Onboarding and continued access

- [ ] **Detection and automatic onboarding**: exercise fresh form → detection → credential acquisition/guide → verification → save → refresh. Preserve context through external-page handoff; cover origin/type mismatch, invalid credentials and wrong identity. Manual prefill is not automatic-onboarding validation.
- [ ] **Continued access and recovery**: verify access after closing the site tab, expiry/401, matching-account recovery and multi-account isolation. Verify serialized rotation/atomic persistence where required; explain re-login boundaries.

### Balance, usage and plans

- [ ] **Balance**: verify source, currency, conversion and purchased/bonus distinctions; cover normal/manual/background refresh and unavailable/error states. Unknown data must not become zero.
- [ ] **Usage and today statistics**: check consumed amount, request/token counts and logs individually, including pagination and timezone/day windows. Identify unavailable metrics rather than claiming all usage after one read.
- [ ] **Plans, allowances and resets**: inspect subscriptions, remaining allowance, expiry and reset timing; map verified facts into existing presentation. Keep plans, purchased balance and promotional points separate; explain missing metrics or deferred new flows.

### Keys and exports

- [ ] **Key inventory and scopes**: verify pagination, groups/projects/organizations, identity and empty states. Compare list/detail payloads to find omitted writable settings.
- [ ] **Native editor workflow parity**: follow [the editor comparison](native-editor-parity.md) for affected account-key tasks and type/mode variants before choosing fields/layout and during built-UI validation. Keep account credentials and operations distinct from managed resources.
- [ ] **Key creation**: inspect native defaults, options, conditional and role-limited fields. Map ordinary-account fields into the existing editor; verify disposable create/readback. Preserve name-only creation when supported.
- [ ] **Key editing**: compare every ordinary-account native field with the plugin editor, including visibility, validation and wire representation. Hydrate detail where needed; verify reopen, changed values and untouched settings/secrets. PUT preservation alone is not editable support; enumerate missing fields.
- [ ] **Key deletion and status**: check delete and enable/disable/expiry separately. Respect ownership and read back mutations; inventory alone does not prove CRUD.
- [ ] **Plaintext and default key automation**: distinguish masks, one-time create secrets and reveal endpoints; inspect defaultCreation/provisioning requirements. Explain why required input/scope or unavailable plaintext prevents specific actions.
- [ ] **Runtime keys, service credentials and exports**: resolve usable secrets and key-specific inference URLs through existing owners; check affected copy/export/CLI consumers. Console credentials are not inference keys; service credentials do not imply native CRUD.

### Models and pricing

- [ ] **Model catalog and access**: distinguish account/key, personalized and provider-wide scopes, groups and availability. Reuse catalog/pricing seams; disclose scope-changing fallback. One key's list is not the provider catalog.
- [ ] **Model pricing**: verify currency/units, token/request/media modes and group/plan effects against native display. Map understood prices; explain unsupported expressions instead of guessing.

### Invitations, announcements and grants

- [ ] **Invitation/referral link**: inspect code/link, host, encoding and auth; wire retrieval/copy and visible feedback. Include this simple verified feature; link retrieval does not promise payout/withdrawal.
- [ ] **Notices and announcements**: inspect site-wide/account-scoped sources separately; reuse notice/announcement and local read/deduplication owners. Check content, empty and refresh paths; popup metadata does not establish extension identity or upstream acknowledgement.
- [ ] **Redemption**: distinguish console navigation from automated submission. Verify endpoint, scope and outcome before using redemption; inherited family objects are insufficient. Explain gaps/deferred flows without extra irreversible writes solely for evidence.
- [ ] **Check-in availability**: inspect target feature/switch even when the family has candidates. Complete the check-in section if adapting it; otherwise state deployment/source limits or missing evidence.

### Navigation and action availability

- [ ] **Navigation and unavailable actions**: check provider-specific console links and every offered feature entry. Use existing product policies to hide/explain unavailable actions; do not expose actions whose contract is unimplemented.

## Check-in adaptation

### Discovery and status

- [ ] **Read-only discovery**: verify method/source/origin and enabled eligibility without credential issuance, login or recovery writes; register clues through existing definitions.
- [ ] **Status and day boundary**: verify not-checked/already-checked/auth-failure/unknown, timezone and reset semantics. Declare missing readback; never substitute POST status.

### Execution and rewards

- [ ] **Execution and reconciliation**: verify success/duplicate/uncertain outcomes through existing retry policy, cancellation and late-response protection.
- [ ] **Rewards**: use authoritative balance-equivalent amounts; distinguish points/expiring bonuses. Missing reward is unknown, not zero.

### User controls and feedback

- [ ] **User paths and feedback**: check manual/automatic selection, readiness, execution and results. Candidate registration does not establish readiness or target support.

## Delivery check

### Behavior and live validation

- [ ] **Behavior tests**: start each feature/fix with a failing focused test; implement/refactor with tests green. Cover transport/envelope and affected consumers, not only parsing.
- [ ] **Live protocol and UI**: run applicable hosted/self-hosted probes and current-worktree site-specific CDP for offered actions, including invitation copy and native fields. Explain each applicable skipped layer/path; mocks/source inspection are not live validation. Follow existing evidence and visual-preview references.
- [ ] **Editor usability, when affected**: reconcile [the native workflow comparison](native-editor-parity.md) before the first handoff; report worse, missing or unverified common paths separately from passing tests and field preservation.

### Cleanup and evidence

- [ ] **Cleanup and evidence**: read back mutations/cleanup, retain evidence pointers and rerun commands. Record irreversible grants; do not claim they were restored.

### Final coverage

- [ ] **Final coverage**: reconcile checklist, delivered code and visible actions. Include every applicable item in the handoff table; partial/deferred/unverified rows cannot disappear behind “site supported” or “fully tested”.

## Required handoff table

Keep this table in the existing spec/evidence index and summarize it in the handoff, grouped by the scope and functional headings above. Split operations/fields with different outcomes. Completed rows need their mapping and reason; **only omitted or partial rows need a non-adaptation reason**. Do not invent rejected alternatives for every completed feature.

| Scope / group | Checklist item / operation | Outcome | Adaptation approach and reason | Missing part and why not adapted | Validation / evidence / next prerequisite |
| --- | --- | --- | --- | --- | --- |
| `<e.g. account / keys and exports>` | `<item or sub-operation>` | `<adapted / partial / unsupported / deferred / unverified / N/A>` | `<existing seam, mapping and reason, or unknown>` | `<none, or concrete gap and reason>` | `<actual checks and evidence ID; exact missing prerequisite>` |

Completion requires delivery and validation of agreed behavior at the reported level, with applicable omissions explained. Closing an investigation record with deferred/unverified rows does not mean those capabilities were delivered.
