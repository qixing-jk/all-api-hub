# PR 1834 feedback

Scope: quick dialog fades, preserved account sessions, and regression evidence.
Source head: `2be968a1ad9106523b239db82ecab8470a588176`.
Base refreshed by ordinary merge of `2c8e4afdda` (model context probes); no overlapping protocol migration. Recovery ref: `recovery/temp18-pr1834-before-feedback-20261107`.

| Source | Finding and disposition | Evidence |
| --- | --- | --- |
| 4500833424 | Keep check-in feedback mounted through close completion; isolate reopened sessions. Implemented. | Hook lifecycle test; actual midpoint exit and eventual removal in `e2e/checkInFeedback.spec.ts`, desktop/narrow English/Chinese. |
| 4500833443 | Reconcile old onboarding before replacing AccountDialog. Implemented at provider boundary with the existing workspace close contract; concurrent callers await the same completion. | Provider deferred-replacement test, AccountDialog handle test, OpenRouter concurrent-close regression. |
| 4500833449 | Prevent stale success/close callbacks from resolving or dismissing the next session. Implemented. | Provider parameterized regression, observed red before repair. |
| Review 5810990080, timing | Compare original animation onset, including delay, before seeking. Implemented for Modal and Dialog. | Original onset difference must be less than 20 ms, detecting the reported 60 ms stagger. |
| Review 5810990080, interruption | Pause entrance and assert incomplete progress before close. Implemented. | Real Chromium interrupted entrance/reopen test. |
| Review 5810990080, replay | Record animationstart before input and inspect after rendered frames. Implemented. | Account form readiness/replay browser test. |
| Codecov, Modal.tsx source lines 394/408 | `no-test-warranted`: defensive non-HTMLElement autofocus event targets. Radix FocusScope dispatches both events on its mounted DOM container (`node_modules/@radix-ui/react-focus-scope/dist/index.mjs`); Modal Content is a div. Forcing a different event target would mock away the supported contract. No production guard removed. | Modal focus tests and real Chromium focus restoration/replacement tests pass. |
| Codecov, AccountDialog/index.tsx source line 379 | `test-added`: invalid hydrated draft disables save; AI/ML API add requires matching successful credential verification (absent/error/success cases). Existing loading and failed-load tests cover the other guards. | Scoped V8 evidence under `artifacts/coverage/` and `artifacts/aiml-coverage/`; remote confirmation pending. |

Local checks: 268 distinct Vitest cases passed across affected provider, dialog, OpenRouter, save workflow, auth defaults, Modal and feedback files. Twelve Chromium scenarios passed (seven motion plus five feedback), with build setup counted separately. Existing act warnings remain diagnostic output; no test failed in the final focused runs.

Local evidence under `artifacts/` is retained for review. `artifacts/feedback-browser/` and `artifacts/motion-browser/` retain actual final browser captures; the narrow Chinese feedback panel was visually inspected. No comparable pre-repair screenshot was retained; the pre-repair lifecycle failures are established by red regression assertions, not a visual before/after comparison. Remote checks, exact-head CodeRabbit review, fresh thread reconciliation and final Codecov coverage remain pending until publication.
