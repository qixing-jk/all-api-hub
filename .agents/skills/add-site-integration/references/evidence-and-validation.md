# Site evidence and repeatable validation

Use this reference during deployment investigation and live-test planning. Keep reusable procedures here, deployment observations in the task's spec/evidence index, and durable protocol rationale beside the owning code. The [documentation ownership map](../../../../docs/agents/site-integrations.md#documentation-ownership) explains when public or shared guidance needs an update.

Link evidence and validation to the [completeness checklist and handoff table](capability-assessment.md). For each applicable validation layer, state why it was selected or skipped, the operations covered, actual result and remaining limits; retain exclusion evidence as well as successful samples. Refresh the final table after implementation and cleanup.

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

Save useful discovery scripts during the investigation, before the browser context is lost. Task-specific exploratory scripts may start under `.scratch/<feature>/`; promote reusable probes to `scripts/suites/<provider>/` and CDP runners to the existing `scripts/test-<provider>-e2e-live.mjs` pattern when they become part of delivered validation. Extend a suitable existing runner instead of adding a parallel framework.

- Use `scripts/utils/local-env.mjs` for Node environment loading; reuse the primary-worktree configuration without copying credentials into this worktree. Record variable names and override rules, never values. Prefer environment credentials to command-line secrets.
- Use `scripts/cdp/client.mjs` for current-worktree extension connection and `scripts/cdp/dev-profile.mjs` for profile/port resolution. Follow the live-extension skill for shared versus isolated profile selection. Do not discover the extension solely by the first `chrome-extension://` target or hardcode port 9222.
- Separate read-only probing from explicit mutation mode. Record preconditions, configurable target URLs, bounded waits, and exact rerun commands. A mutating probe must track and clean up only its own resources, even when assertions fail, and surface cleanup failures.
- Assert observable site behavior and extension outcomes, not only page navigation or printed JSON. Make failures and skips visible in the run result. Save complete task-relevant output and error bodies in the locally excluded evidence directory; keep reusable committed scripts free of embedded credentials and private results.
- Keep scripts independent of the investigation's current tab or resource ID. Detach from the shared browser without closing unrelated tabs/browser state; clean up pages owned by the runner.
- Run delivered scripts in the available permitted mode. A syntax check alone does not establish live behavior; record any mode that could not run and why.

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
