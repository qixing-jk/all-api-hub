# API verification workspace

Status: ready-for-human

Design reconciled against the final implementation on 2026-11-14.

## Scope and accepted behavior

- Account, API credential profile and webpage verification share the workspace, streaming presentation, editable prompts and independent batch settings. The webpage keeps credential configuration and testing together; saving is optional.
- The selected-test header owns the test name, status, summary and actions. Results avoid repeating those headings. The conversation pane contains the prompt/model composer and ordered output.
- Reasoning, text and tool calls keep their first-observed order. Tool results update their original call identity, including out-of-order completions. These positions describe call initiation, not completion order.
- Only supplied reasoning is shown. AI SDK step performance and usage remain the measurement source: first generated output may precede visible answer text. Missing token usage stays unavailable; throughput is finalized from SDK usage. No reasoning duration, token estimate or queue time is inferred.
- Partial output survives failure and stopping without becoming a successful final answer. Reader disclosure choices and manual scrolling survive streaming updates. Incomplete or truncated text cannot offer a completed-answer shortcut.
- Routine batches and needle matrices have separate persisted concurrency choices, each from 1 through 10 with a default of 1. A run captures its choice. Independent manual tests do not share a global limiter; context-capacity search and dependent agent steps remain sequential.
- Needle cumulative hits use the full planned combination count as the denominator. Latest-run processed/scheduled counts are separate. Checkpoint recovery does not silently repeat uncertain requests.
- Desktop has independently collapsible test and request panels with a compact test rail. Small screens open those panels over a persistent selected detail; matching 180ms entry/exit animations preserve drafts, focus and detail position. Reduced-motion preferences remain supported.
- Desktop request panels remain rendered for their CSS exit transition while immediately becoming inert and inaccessible. Removing them with the hidden attribute before the transition finishes would skip that motion.
- Stop, retry and capacity continuation remain accessible when the test list is closed. Missing runtime credentials explain the required recovery action. Unsupported and timeout results retain their actual status.
- Q&A reference editing reveals and focuses the existing editor. Needle settings expose the current request/input estimate. Prompt-saving guidance describes its shared test-type scope.

## Shared rendering and implementation boundaries

Streamdown remains behind the shared MarkdownContent owner for static and incremental content. Announcements retain line breaks and sanitized links/styles; reports retain HTML tables and disclosure state/focus. No comparative Markdown-library benchmark was requested.

The locally adapted AI Elements components compose the official shadcn Trace, Message Scroller, Message and model-selector patterns on existing project primitives. Shipped notices retain Vercel Apache-2.0 and shadcn MIT attribution. The existing AI SDK, request profiles, history codecs, preference locks and generation services remain canonical; no new message runtime or general transport framework is introduced.

Verification state, request configuration, selected detail and execution orchestration have separate feature owners. Site-specific transport stays explicit. Context-capacity recovery differs from drawing/Q&A cancellation, so those clients remain distinct. Background handlers are grouped by their existing operation contracts.

## Decisions and rejected alternatives

Content-type tabs were tried and superseded by one ordered process with inline reasoning/tool disclosures and independent statistics/request disclosures. The useful selected-test header remains; removing duplicate result headings does not authorize hiding it.

A staged save-first webpage setup was rejected and reverted. The combined configuration/testing flow is intentional.

assistant-ui was considered; its additional message runtime offered little benefit for the existing test workspace. The maintained shadcn components and shared sanitized Markdown were selected instead.

## Validation evidence and remaining boundaries

Maintained tests cover the shared Markdown/generation boundaries, metric/history sanitization, concurrency admission/refill, cancellation and late results, checkpoint recovery, prompt drafts and the account/profile/webpage entry points. Chromium workflows use the actual extension with deterministic local HTTP/SSE fixtures; they do not establish paid-provider performance or live authenticated-provider acceptance.

Retain local evidence under the ignored artifacts directory. Earlier failures and genuine before/after captures are needed for review and must not be deleted solely because a later run passed.

- [Streaming and shared Markdown acceptance](artifacts/acceptance.md)
- [Ordered-process acceptance](artifacts/process-feed/acceptance.md)
- [UI actions and settings acceptance](artifacts/ux-improvements/acceptance.md)
- [Mobile panel behavior and comparisons](artifacts/concurrency-overlay/acceptance.md)
- [Latest responsibility-split checks and browser evidence](artifacts/scout-split-20261114/report.md)
- [Branch handoff and current acceptance](artifacts/finish-branch-20261114/acceptance.md)

The old webpage-host fixture failures were characterized and repaired in the later refactor; their original failure logs remain local. The legacy desktop layout assertions now follow the compact rail, current panel names and mobile sheet focus. Their animation checks exposed and now protect the desktop panel exit repair. Announcement/report rendering has current screenshots and behavioral assertions but no genuine pre-migration captures. New live-output states have no earlier equivalent.

Prior design iterations and the resolved UI review ticket are retained locally in artifacts/finish-branch-20261114/previous-spec.md and previous-review-ticket.md. This spec retains the accepted semantics and unresolved evidence boundaries. Remote CI and review are pending publication.
