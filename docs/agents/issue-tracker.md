# Issue tracker: Local Markdown

Issues and specs for this repo live as markdown files in `.scratch/`.

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`
- The spec is `.scratch/<feature-slug>/spec.md`
- Implementation issues are one file per ticket at `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01` — never a single combined tickets file
- For ordinary issues, record triage state as a `Status:` line near the top of the file using the roles in `triage-labels.md`; use `needs-triage` when no triage outcome has been established. Wayfinder child tickets use the separate lifecycle below.
- Comments and conversation history append to the bottom of the file under a `## Comments` heading

## Retention and cleanup

Keep task-owned material under its feature directory. Put new generated logs, screenshots, response dumps and build outputs in an existing ignored output directory or a feature-local `artifacts/` directory with a scoped ignore rule. Keep specs and reusable source visible to Git; ignoring the entire feature directory hides unfinished work and useful findings.

Before handing off a task that used `.scratch`, review its tracked, untracked **and ignored** material and assign each task-owned file or output group a disposition:

- **Preserve in Git:** information needed for a concrete future decision that code, tests or existing docs do not already explain: protocol evidence, rejected alternatives and reasons, semantic distinctions, or validation gaps with the conditions needed to close them. Update the smallest existing owner; use the feature spec when no better owner exists. Sanitize samples, identify the investigated revision/date and distinguish observation from inference. Verify preserved files are tracked or explicitly included in the task commit. Reusable reproducers need prerequisites, assertions and known limitations; useful one-off experiments may be retained when clearly labelled.
- **Keep local:** unfinished investigation and evidence still needed for review, pending acceptance or unresolved failures. Leave a concise entry in the existing spec or ticket identifying the remaining question and retained paths. Preserve required before/after evidence through its review; a successful retry alone does not make failure evidence disposable.
- **Offer for cleanup:** redundant drafts, superseded dumps, logs, packages and screenshots after useful information has been extracted and review no longer needs them. Provide commands scoped to the inspected paths; execute deletion only when requested. Recheck that targets contain no tracked files or unfinished work. Age, extension and a merged branch alone do not establish disposability.

Report only the retained Git entry points, unfinished/local exceptions and proposed cleanup commands; no extra inventory document is required. If nothing adds useful information, say so rather than creating a completion report merely to fill the spec. Stay within task-owned material and leave unrelated worktrees and scratch intact.

## When a skill says "publish to the issue tracker"

Write specs to `.scratch/<feature-slug>/spec.md` and implementation tickets to `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, creating directories as needed. Number new tickets after the highest existing ticket number in that directory. For wayfinder maps and child tickets, use the paths below.

## When a skill says "fetch the relevant ticket"

Read the file at the referenced path. The user will normally pass the path or the issue number directly.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a file with one **child** file per ticket.

- **Map**: `.scratch/<effort>/map.md` — the Notes / Decisions-so-far / Fog body.
- **Child ticket**: `.scratch/<effort>/issues/NN-<slug>.md`, numbered from `01`, with the question in the body. A `Type:` line records the ticket type (`research`/`prototype`/`grilling`/`task`). Its `Status:` starts as `open`, changes to `claimed` before work, and becomes `resolved` when the answer is recorded. This field tracks wayfinder execution, not triage readiness; keep these lifecycle values when another skill works on a wayfinder child ticket.
- **Blocking**: a `Blocked by: NN, NN` line near the top. A ticket is unblocked when every file it lists is `resolved`.
- **Frontier**: scan `.scratch/<effort>/issues/` for child tickets with `Status: open` whose blockers are all `resolved`; first by number wins. `claimed` and `resolved` tickets are outside the frontier.
- **Claim**: set `Status: claimed` and save before any work.
- **Resolve**: append the answer under an `## Answer` heading, set `Status: resolved`, then append a context pointer (gist + link) to the map's Decisions-so-far in `map.md`.
