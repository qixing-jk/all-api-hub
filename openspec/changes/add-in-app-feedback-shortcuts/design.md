## Context

The extension already exposes project links in several places, but they are generic and not optimized for quick feedback flows.

- The popup and side panel share `HeaderSection`, which already concentrates compact global actions such as refresh, open full page, settings, and side-panel open.
- The About page already uses reusable `LinkCard` components to present project and store links.
- The repository already has dedicated upstream destinations for bug reports, feature requests, and general discussion through GitHub issue templates and Discussions.

This change is cross-cutting because it spans two user-facing surfaces with different density constraints:

- Popup or side-panel header: must stay compact and action-oriented.
- About page: can provide richer explanatory cards and clearer support routing.

The design should reuse existing UI patterns, keep user-visible copy translatable, and avoid introducing any automatic sharing of potentially sensitive account or site data.

## Goals / Non-Goals

**Goals:**
- Provide a fast, discoverable in-app feedback entry point from the popup or side-panel header.
- Add a richer About-page feedback section that routes users to the correct upstream channel.
- Reuse existing primitives and navigation helpers rather than inventing a new support framework.
- Keep the flow privacy-safe by opening external destinations explicitly instead of collecting or uploading local diagnostics automatically.
- Ensure the same feedback destinations are used consistently across popup and About surfaces.

**Non-Goals:**
- Implementing in-app issue submission, GitHub API integration, or authenticated issue creation.
- Attaching account data, logs, tokens, or diagnostics automatically to outbound feedback flows.
- Reworking the broader popup header layout beyond what is necessary to host a compact feedback entry point.
- Replacing existing generic repository links in unrelated surfaces such as onboarding dialogs.

## Decisions

1) **Use a single popup-header feedback entry point, not multiple standalone icons.**
   - The popup header is already dense and optimized for high-frequency actions.
   - A single overflow-style feedback trigger keeps the header readable while still making support actions easy to reach.
   - This entry point naturally applies to both popup and side-panel contexts because they share the same header component.
   - Alternative considered: separate bug and feature icons in the header. Rejected because it increases visual clutter and competes with core operational actions.

2) **Expose three top-level feedback destinations: bug report, feature request, and discussion.**
   - These map cleanly to the repository's existing support model:
     - GitHub bug template
     - GitHub feature-request template
     - GitHub Discussions
   - This keeps the app's routing aligned with upstream maintenance workflows instead of sending all users to the repository root.
   - Alternative considered: a single generic repository link. Rejected because it adds user friction and makes it less obvious where to go for different types of feedback.

3) **Add a dedicated About-page feedback section using the existing card pattern.**
   - The About page already uses `LinkCard` for external project and store links, so feedback actions can be added with minimal conceptual and visual churn.
   - The About page is the right place to provide slightly more descriptive copy for each feedback path.
   - Alternative considered: place feedback links only in the popup. Rejected because the About page is already the natural long-form project-information surface.

4) **Centralize feedback destination URL building in a small shared helper.**
   - The implementation should avoid scattering hard-coded GitHub URLs across popup and About components.
   - A shared helper can expose stable destinations such as repository root, bug template, feature template, and Discussions.
   - This keeps future changes localized if template names or support destinations change.
   - Alternative considered: inline URLs directly in each component. Rejected because it duplicates support-routing logic and increases maintenance risk.

5) **Keep the initial flow link-only and privacy-safe.**
   - The first version should open the correct upstream page and let the user decide what to include.
   - No automatic prefill of account identifiers, URLs, tokens, or diagnostics should be attempted.
   - If future improvements add optional issue context, they should be explicitly user-confirmed and limited to safe metadata such as extension version.
   - Alternative considered: prefill issue bodies with runtime state. Rejected for now because it raises privacy review needs and expands scope beyond quick-entry feedback.

6) **Treat localization as part of the feature contract.**
   - All new labels, tooltips, menu items, and About-page descriptions should be added to locale files together with the UI changes.
   - This preserves consistency with the rest of the extension and avoids English-only support affordances appearing in localized UIs.

## Risks / Trade-offs

- **Header crowding risk** → Mitigation: use one compact feedback trigger and place the three actions inside a dropdown menu rather than adding multiple top-level icons.
- **Support-link drift across surfaces** → Mitigation: use one shared helper for feedback destinations so popup and About always resolve the same URLs.
- **Users may still choose the wrong channel** → Mitigation: use specific labels and short descriptions that distinguish bugs, feature ideas, and general discussion.
- **Added copy increases localization workload** → Mitigation: keep the initial text concise and aligned with existing About-page card patterns.
- **Future expectation for richer in-app support may grow** → Mitigation: document that this change intentionally solves quick routing first, leaving diagnostics or richer prefill as a follow-up change if needed.

## Migration Plan

1. Add a shared feedback-destination helper that resolves the repository, bug-template, feature-template, and Discussions URLs.
2. Add the popup or side-panel header feedback trigger using the existing dropdown-menu primitive.
3. Add the About-page feedback section using the existing card-based external-link pattern.
4. Add or update locale strings for the new feedback labels and descriptions.
5. Add targeted tests for the helper and any new UI behavior that is practical to cover at component level.

Rollback strategy: remove the new feedback UI entry points and helper. This is low risk because the change is additive, has no storage migration, and does not alter existing data flows.

## Open Questions

- Should the popup header menu also include a shortcut to the About page, or should it stay focused strictly on external feedback destinations?
- Should a future iteration prefill safe metadata such as extension version into issue-template URLs, or should all templates remain completely unparameterized?
