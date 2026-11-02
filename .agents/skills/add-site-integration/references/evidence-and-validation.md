# Site evidence and repeatable validation

Use this reference during deployment investigation and live-test planning. Keep reusable procedures here, deployment observations in the task's spec/evidence index, and durable protocol rationale beside the owning code. The [documentation ownership map](../../../../docs/agents/site-integrations.md#documentation-ownership) explains when public or shared guidance needs an update.

Link evidence and validation to the [completeness checklist and handoff table](capability-assessment.md). For each applicable validation layer, state why it was selected or skipped, the operations covered, actual result and remaining limits; retain exclusion evidence as well as successful samples. Refresh the final table after implementation and cleanup.

## Investigate observed transports and session changes

Follow the native task's actual requests and page data before expanding endpoint guesses. When a console uses server-rendered/RSC data or Server Actions, inspect the relevant route, payload and action bindings; record build-dependent identifiers, required headers and verified success/error envelopes. Prefer a suitable stable official API when verified. An absent browser XHR does not establish an absent capability, and finding an action binding does not establish a successful write contract.

Classify session refresh and token issuance as credential mutations even during reconnaissance. First observe the console's own renewal behavior or pinned source. Exercise uncertain rotation/reuse behavior in a disposable authorized session, accounting for the browser and probe as competing credential owners. Capture the replacement, validate its expected identity, and persist it atomically through the established credential mechanism before continuing ordinary requests; a copied refresh token can invalidate the original browser session. If a suitable session is unavailable, retain the unverified renewal case and continue read-only investigation rather than experimenting on the daily session. Reuse valid evidence; never replay an uncertain rotation to obtain a cleaner sample.

## Retain evidence while discovering it

Reuse `.scratch/<feature>/spec.md` and existing artifacts first. Keep task-local observations in `.scratch/<feature>/evidence/`, with an index linking the evidence, conclusions, remaining questions, and runnable commands. These are raw developer-only artifacts and must stay out of Git: use a location outside the checkout or a task-specific local exclusion in the file resolved by `git rev-parse --git-path info/exclude`, and verify exclusion with `git check-ignore` before capturing. Preserve unrelated scratch material. Promote only deliberately prepared fixtures, maintained scripts, and decisive contract documentation that belong to the integration.

Retain enough original material to answer later questions without another browser session:

- Capture time, deployment/browser/API/inference URLs and roles, backend version or build label, upstream commit when available, worktree commit, extension build/ID, and target account/role. Distinguish a backend version from a frontend build label.
- Request method, path/query, observed headers and authentication scheme, request body, status, response headers, and original response body. Preserve field names, nesting, values, types, null versus absent, empty lists, error envelopes, pagination, units, and timestamps. Keep originals alongside derived summaries rather than reducing responses to selected fields.
- Relevant frontend route/bundle excerpts, source paths and commit permalinks, documentation URL/section, and UI observations. Keep the observed form defaults and link construction when they determine app behavior, including aff/referral routes and code encoding.
- Available success, empty, auth-failure, duplicate/conflict, and mutation-readback samples that affect the promised behavior. Use incidental observations or disposable resources where appropriate; do not repeat a mutation merely to collect another sample.
- Before/after state and run-owned resource identifiers for writes, assertions performed, cleanup/readback result, and failures or skipped paths. Never infer restoration from a successful delete call alone.

For this developer workflow, local evidence and previews are **raw by default**; do not mask, truncate, or replace observed values solely because the capture is authenticated. Keep relevant request/response, screenshot, and trace detail so another investigation can reuse it. Capture only task-relevant browser/session state, rather than an entire browser profile. Runner credentials still use the established environment/session mechanism. Before promoting any material into Git or a public report, prepare a separate shareable copy without credentials or private account data and inspect the staged diff; local raw evidence is never staged or uploaded by default. Existing suites with automatic authenticated tracing disabled keep that default; use deliberate task-local capture when needed.

A compact index entry can be:

```text
Evidence ID: referral-read-01
Observed: <UTC time>; <deployment>; <version/build>; <target account/role>
Source: <original request/response file or source permalink>
Question: How does the console construct an invitation URL?
Observation: <observed route, response fields and UI behavior>
Decision: <chosen mapping>; alternatives: <considered options>
Reason: <why this fits the observed contract and existing app capability>
Validation: <command, assertion, result and cleanup, or reason not run>
Limits: <deployment/account scope, unknowns, capture omissions>
```

Link capability dispositions and tests to these evidence IDs. A 404 or 401 from one guessed request does not establish unsupported behavior. Separate source-confirmed, deployment-observed, inferred, and unverified facts. When deployment/version/auth scope changes, retain the earlier sample and append the new result and why revalidation was needed. Avoid repeating unchanged broad endpoint scans.

## Persist probes and CDP automation

### Coverage before execution

Default to a complete acceptance pass for the integration or workflow in scope, not a smoke subset. Build the scenario inventory from the native console, the extension's rendered actions and adapter contracts **before** inspecting what the runner happens to implement. Reconcile all three sources: a missing control is a possible adaptation defect; an advertised action without a handler is a contract defect. Neither disappears from acceptance because the script lacks a test. Reuse the existing task table rather than maintaining a parallel checklist.

For each applicable task, include the following branches. Mark genuinely absent branches not applicable with contract evidence; do not silently omit them.

| Surface | Required scenario inventory |
| --- | --- |
| Actions | Every reachable action, including row, overflow, bulk and post-save actions; both directions of reversible state changes such as disable/enable. Copy/reveal, export/verification, rotate/revoke/delete and navigation remain separate tasks when offered. |
| Editors | Create and edit separately; defaults and distinguishing non-default values; each editable field, conditional mode and immutable fact; preserve untouched values, save/reopen/readback, clear restrictions, validation boundaries, cancel and draft recovery. Test combined settings where they interact. |
| Account and collection states | Supported auth/role/scope variants; missing, invalid or expired credentials; empty/one/multiple results and pagination; eligible and restricted actions, disabled/expired resources, missing or one-time secrets and unavailable option catalogues. |
| Failures and lifecycle | Authentication/permission rejection, transport or upstream failure, pending/double click, cancellation, retry, partial or uncertain mutation, stale/concurrent state and context reload where relevant. Check actionable feedback and absence of unintended writes or replay. |

Execute every applicable, authorized and available row by default. Limited test frequency is not a reason to stop after the main success path. Group independent cases and reuse setup/evidence to reduce cost, rather than dropping cases. Extend the maintained runner when it lacks coverage. A later isolated change may rerun affected rows and shared regressions, retaining valid earlier results for unchanged rows; the original acceptance inventory still governs completion. Exhaustiveness means all distinct actions and behavioral branches in scope, not every unrelated site or an unbounded Cartesian product. State the reason when equivalent combinations share a case.

Use disposable resources for writes and confirm cleanup. This coverage default does not authorize paid calls, destructive changes to existing resources, credential rotation or repeated grants. Where live execution is unavailable or unauthorized, exercise a verified fixture in the actual extension for the independently testable branch and retain the live gap; do not fabricate a production failure or mark mocked behavior as live-tested. Continue available cases without waiting for a blocker that affects only another row.

### Coverage closure

Before declaring acceptance, reconcile the inventory with **executed assertions**, not test names, the runner's exit code or the number of screenshots. Each row records target/build, starting state, action, expected result, actual result, evidence and one status: passed, failed, blocked, not run or not applicable. Distinguish live UI, mocked extension E2E, protocol-only and unit/contract evidence. Opening a modal, rendering a field or locating an enabled button proves only that checkpoint. A mutation requires its intended state plus authoritative readback; wait separately for the UI to accept the result before the next dependent action. A direct API call or seeded fixture does not prove the corresponding UI action or onboarding path.

Maintained runners must report failed, skipped, blocked and unselected scenarios alongside passed ones. Missing prerequisites or selected suites must not produce an unqualified full-pass summary. New or extended runners retain a result even on failure, use separate run directories, distinguish cleanup success from scenario success, and fail the requested run when an executed assertion fails. An unresolved failure followed by a successful retry remains a recorded failure requiring explanation; never overwrite it to obtain green evidence.

Acceptance is complete only when every applicable row has adequate passing evidence or the user has explicitly excluded it. Report remaining blocked/not-run rows as incomplete, with exact prerequisites; do not relabel them unsupported or narrow scope on the agent's own initiative. Final claims name what actually ran and material gaps. “CDP passed,” “fully adapted” or equivalent claims cannot stand in for this accounting. Representative images are a visual-review optimization, never permission to sample away behavior.

### Reusable automation and evidence

Before extending coverage, inspect the existing runner and its fixtures for paths that bypass the promised behavior: seeded accounts, prefilled credentials, forced capability props, generic page containers, swallowed errors and success messages without readback. Record what each path actually proves in the task's scenario map. Keep detection identity/credential continuity explicit when later stages use another fixture or saved account.

For shared acceptance helpers, add a distinguishing failure case: correct site type with wrong identity, expected guide with the wrong credential state, an eligible action disabled, or a wrong-source/empty catalog. Verify that the assertion rejects that case, then exercise representative consumers in the actual extension. Derive expected values from the native contract or verified fixture, rather than copying the observed UI into the expectation. Use `assertAccountDetectionOutcome` in `scripts/flows/auto-detect.mjs` for declared field values, guidance and save eligibility; keep provider-specific continuation, issuance effects and persistence/readback assertions with the scenario. Its checks cover only the fields the caller declares, so reconcile those fields with the integration's intended outcome.

Save useful discovery scripts during the investigation, before the browser context is lost. Task-specific exploratory scripts may start under `.scratch/<feature>/`; promote reusable probes to `scripts/suites/<provider>/` and CDP runners to the existing `scripts/test-<provider>-e2e-live.mjs` pattern when they become part of delivered validation. Extend a suitable existing runner instead of adding a parallel framework.

- Use `scripts/utils/local-env.mjs` for Node environment loading; reuse the primary-worktree configuration without copying credentials into this worktree. Record variable names and override rules, never values. Prefer environment credentials to command-line secrets.
- Use `scripts/cdp/client.mjs` for current-worktree extension connection and `scripts/cdp/dev-profile.mjs` for profile/port resolution. Follow the live-extension skill for shared versus isolated profile selection. Do not discover the extension solely by the first `chrome-extension://` target or hardcode port 9222.
- Separate read-only probing from explicit mutation mode. Record preconditions, configurable target URLs, bounded waits, and exact rerun commands. A mutating probe must track and clean up only its own resources, even when assertions fail, and surface cleanup failures.
- Assert observable site behavior and extension outcomes, not only page navigation or printed JSON. Make failures and skips visible in the run result. Save complete task-relevant output and error bodies in the locally excluded evidence directory; keep reusable committed scripts free of embedded credentials and private results.
- Keep scripts independent of the investigation's current tab or resource ID. Detach from the shared browser without closing unrelated tabs/browser state; clean up pages owned by the runner.
- Run delivered scripts in the available permitted mode. A syntax check alone does not establish live behavior; record any mode that could not run and why.

Map each promised capability and meaningful native task/field variant to a runnable scenario and its assertions in the existing task table. Cover the complete outcome where promised: action → save → reopen → authoritative readback, including untouched fields. Separate field visibility and enabled-action inspection from executed writes; a reachable edit button is not an edit/readback result. Use distinguishing non-default values and eligible/restricted states. Keep inaccessible roles and difficult failure variants in deterministic extension E2E with verified fixtures, explicitly retaining their live-validation limits.

For repeated UI work, extend `scripts/flows/` and the existing site runner before duplicating navigation, editor readiness or submission. `pnpm e2e:cdp -- --list` lists reusable inspection scenarios; use `--scenario` to run only the relevant task. The shared native-editor helper waits for a provider-selected field and submits at most once; provider policy, native values, readback and owned-resource cleanup remain with the site suite. Keep regression scenarios in maintained runners. Record per-scenario coverage, actual result, duration and evidence; blocked, failed and unselected paths remain visible and cannot become a full-acceptance claim. The independent reviewer reconciles this mapping against the native task/field inventory, not just the executed scenario list.

Retain command, prerequisites, version/build identity, result, and evidence pointers in the index. Handoff must allow a later agent to rerun the same path without rebuilding the original probe from chat history.

## Choose validation targets

Select targets from the provider contract and available access, and record reasons before testing:

| Situation | Preferred validation | What it establishes / remaining limit |
| --- | --- | --- |
| Source-available backend with a runnable deployment | Reuse a compatible existing instance or provision a disposable pinned backend; compose focused `e2e/realSite/` scenarios | Real server/auth/resource behavior for that version; hosted forks still need target-specific checks |
| Hosted provider or deployment-specific dialect | Authorized logged-in target, protocol probe and site-specific extension CDP | Observed deployment contract and app flow for that account/role |
| Both are available | Self-hosted real-site regression plus targeted hosted checks for differing behavior | Repeatability and target fidelity; avoid duplicating unchanged checks |
| Live access or runnable deployment is unavailable | Focused contract/unit tests and browser mocks for independently testable behavior | Local behavior only; record the blocked live path and missing prerequisite |

For self-hosting, verify server source and an actual runnable recipe, not just the presence of GitHub or OpenAPI docs. Read `e2e/realSite/README.md`, `scripts/real-site-e2e-matrix.mjs`, and the closest fixture before adding a target. Prefer existing deployment/test infrastructure. Pin the image tag/digest or source revision, document setup/health checks, ports, test-account bootstrap, config variable names, and teardown commands. Reuse an existing instance only when its version and configuration fit; isolate test resources and preserve other users' data. Do not replace an operator's running service or delete shared volumes. State a concrete blocker if provisioning is infeasible, such as unavailable container runtime, closed server source, or missing licensed components, and continue the independent validation.

Report separately the focused unit/contract checks, mocked extension E2E, self-hosted real-site E2E, hosted live protocol checks, and site-specific CDP that actually ran. For each applicable layer, give the target/version, command, result, capability coverage, and skipped paths with reasons. Include aff/invite and other implemented simple features in the assertions. Successful self-hosted or generic smoke tests do not substitute for promised target-deployment validation.
