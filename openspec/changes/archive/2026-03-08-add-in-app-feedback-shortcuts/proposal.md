## Why

Users currently need to discover the repository or About page on their own before they can report a bug, request a feature, or ask a question. Providing direct in-app feedback entry points reduces friction, channels users into the correct GitHub workflow, and makes community participation feel like a first-class part of the product.

## What Changes

- Add a compact in-app feedback entry point in the popup or side-panel header so users can quickly access support actions without leaving their current workflow.
- Add a dedicated feedback section in the About page with direct links for bug reports, feature requests, and community discussion.
- Route each action to the most appropriate upstream destination, including the existing GitHub issue templates and Discussions page.
- Keep the feedback actions lightweight and privacy-safe by linking users out to GitHub rather than auto-submitting any local account data.

## Capabilities

### New Capabilities
- `in-app-feedback-entrypoints`: Provide quick, discoverable in-app actions that open the correct external feedback destinations for bug reports, feature requests, and general discussion.

### Modified Capabilities
- None.

## Impact

- Affected UI surfaces: popup or side-panel header, About page, and related navigation helpers.
- Affected code areas: popup header components, About feature components, navigation or URL helpers, and localized UI copy.
- External systems: GitHub issue templates and GitHub Discussions links already defined by the repository.
- Privacy and security: no automatic upload of account data, tokens, or diagnostics; actions remain explicit outbound links.
