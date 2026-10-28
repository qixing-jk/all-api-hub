# Independent integration acceptance

Use before the first completion claim for user-facing account, managed-site or check-in adaptation, and native-editor changes. Review only the agreed scope; audit-only tasks produce findings. This supplements the existing behavior/live/visual checks rather than repeating every test or requiring unrelated features.

## Accept the intended detection outcome

For scoped onboarding changes, define the expected result per site, deployment/auth variant and available session before implementation. Record expected site type and account scope, populated field values, specifically missing credentials, intended guidance, next action and save eligibility in the existing task table. Match these expectations against native behavior and the product's designed workflow.

Exercise the actual add-account entrypoint and detection action in the current-worktree extension. Assert the outcome appropriate to the scenario:

| Expected outcome | Required assertions |
| --- | --- |
| Ready to save | Correct machine site type, identity/scope and required credentials; usable save; persisted values and refresh/readback when complete onboarding is promised. |
| Manual credential completion | Correct retained type, URL and identity; only the expected credential fields missing; intended guidance and usable continuation to the correct destination; form retained across handoff; save eligibility matches the designed stage. Verify credential validation and save separately when that continuation is in scope. |
| Failed or restricted detection | Specific failure/restriction and actionable recovery; no successful account or credential claim merely because a type was selected. Preserve useful form state and verify the relevant retry/manual path. |

For example, a verified scoped-token New API deployment can correctly identify the site and user while leaving Access Token empty and guiding the user to Security → Access Token. Assert the retained fields, empty token, guide and destination, and absence of premature account saves or credential issuance. A prefilled dashboard token must not stand in for the missing management credential. Keep legacy complete-token scenarios separate; version labels alone do not establish a deployment's contract.

An error-message element may also carry expected credential guidance. Judge its content and resulting state against the scenario target; neither accepting every message nor rejecting every message establishes correctness. A type match, finished spinner or click alone is insufficient. Reconcile the populated and missing fields and continuation with the declared target before marking the scenario passed.

Verify a detected credential independently of the browser's authenticated Cookie session; explicitly suppress Cookie authentication and redirects, or use an isolated request context. Match the returned identity and applicable organization/project scope. Valid credential renewal may change the token string while preserving those facts. When scope lives in hidden draft state, verify the actual UI save/readback before using it downstream; filling a temporary account with the expected scope would bypass that check. Cleanup must retain confirmed created IDs across renames, check uncertain dispatched saves within a bounded window and surface unresolved outcomes without replaying the save.

Use verified fixtures for unavailable states and label that evidence as controlled extension E2E. DOM-only helper tests establish helper behavior; injected temporary accounts bypass detection. Record which actual extraction/session/credential paths ran on the target deployment and which remain unverified, following [evidence and validation](evidence-and-validation.md#persist-probes-and-cdp-automation).

## Assign an independent reviewer

After the implementation and applicable checks are ready, use a separate sub-agent for acceptance when the runtime supports delegation. Prefer a fresh context with the user's requirements and explicit exclusions, task spec/evidence index, native task/field comparison, relevant source paths, current diff/build identity, and reproducible test/browser entrypoints. Supply known gaps as claims to verify, not a conclusion to endorse. Keep raw credentials in the established local mechanism, outside the prompt.

The reviewer inspects the native experience or its retained evidence and the current implementation directly. An implementation summary, test count or screenshot gallery alone cannot establish acceptance. Do not substitute a design consultation or the implementer's self-review for this final check. If delegation is unavailable, perform the same review explicitly and report that independence was unavailable. Missing native access or browser control remains an evidence gap even when an independent code review passes.

Default the reviewer to read-only source/evidence inspection and non-mutating UI navigation. Browser attachment follows the project live-extension skill. Share browser ownership deliberately; the implementer must pause competing interactions. The reviewer reuses valid mutation/readback evidence, and requests targeted verification from the implementer when needed. Review adds no authority to rotate credentials, issue keys, consume paid inference or repeat check-in grants.

## Challenge coverage and meaning

Start from what the scoped native tasks let the target user do, then compare the extension. Reuse the [native editor comparison and field inventory](native-editor-parity.md) for editors and the existing capability table for other tasks. The reviewer checks:

| Risk | Required acceptance evidence |
| --- | --- |
| Detection judged against the wrong target | Reconcile each scoped site/auth variant with the detection outcome table above. Check retained identity, expected missing credentials, guidance and usable continuation, plus save/readback where promised. Distinguish complete onboarding, expected manual completion and failure. |
| Missing native fields or task variants | Every in-scope user-editable field has a reachable control or a precise partial/deferred disposition. Exercise relevant create/edit, conditional sections, non-default values and save/reopen. Preserve hidden writable values, but count preservation separately from editing support. |
| Supported actions hidden or disabled | For each promised action, follow adapter support through dispatch, operation policy, parent render guards and the rendered control. In an eligible account/role/configuration, assert it is reachable and usable; exercise the action with the authorized runner where applicable. For restricted states, verify the actual restriction and actionable explanation. A legacy capability flag, absent generic field or incomplete optional metric alone is not evidence that the upstream action is unsupported. |
| Wrong financial meaning | Check the [source-to-display mapping](account-sites.md#preserve-native-meaning-through-shared-workflows) against native labels and responses, including identity scope, asset/scale, remaining versus ceiling, active state and reset period. Check affected totals/history/notifications as well as a single card. |
| Forced reuse of an unsuitable workflow | Confirm the existing canonical model, editor and policy preserve native decisions and outcomes. Identify any missing capability caused by fitting the provider into an existing family or control. Extend the smallest suitable seam for verified in-scope behavior; unrelated migrations remain outside scope. |
| Nominally working but inferior UI | Replay the same scoped task in the native console and current-worktree extension, using comparable role/configuration and verified evidence. Compare required steps, defaults, available information, recovery and completion. Distinguish first-time setup, daily operation and error recovery. For check-in, rule verification, execution history and schedule enablement are independent facts. |

Use representative current-build UI checks, not only adapter/parser tests or a child rendered with forced capability props. Pair eligible and restricted cases where gating changed. Use verified fixtures for missing live roles or non-default financial/field variants, and label their live limits. Inspect representative final images when visual judgment matters, following [task acceptance](../../../../docs/agents/task-acceptance.md#compare-changed-ui); open native/baseline comparisons when needed to answer a concrete parity question. A screenshot cannot prove persistence or request semantics.

Reconcile the native task/field inventory with the [scenario coverage mapping](evidence-and-validation.md#persist-probes-and-cdp-automation), including scenarios not executed. Confirm each claimed create/edit/save/reopen/readback outcome has corresponding assertions, and each new regression remains runnable. A successful selected subset, missing prerequisite or field-only inspection cannot stand in for full capability coverage.

## Return findings and close the loop

Record findings in the existing task spec/evidence index. Each finding names the native expected task/field/meaning, observed extension result, severity, source/build and reproducible evidence, plus the required correction or missing prerequisite. Classify compared tasks as improved, equivalent, worse, missing or unverified. State which native/UI/code paths the reviewer actually inspected and which claims remain untested.

The implementer resolves in-scope missing fields, incorrect meanings, avoidably disabled actions and avoidably worse core tasks before claiming completion. Add a failing behavior test for each feature/bug correction, implement it, and run affected checks. The reviewer then rechecks the findings and affected tasks against the updated build; reuse unchanged evidence and avoid another full sweep without a new risk. Stop when no unresolved in-scope acceptance defects remain, with explicit user exclusions and blocked/unverified capabilities reported separately. Changing a checklist row to unsupported/deferred requires contract evidence or an agreed scope decision, not merely an inconvenient implementation.

The handoff links the review result and corrective evidence, names the reviewed revision/build, and reports any remaining comparison or independence gap. Reviewer approval alone does not replace required live validation or current-head PR reconciliation.
