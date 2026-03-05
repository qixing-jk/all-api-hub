## MODIFIED Requirements

### Requirement: Bookmark list UI exists in Options and Popup
The system MUST provide a Bookmarks list UI in both Options and Popup:

- **Options:** Bookmarks MUST be accessible via a dedicated Options sidebar/menu page (route `#bookmark`).
- **Popup:** The popup view switch control MUST include entries for Accounts and Bookmarks, enabling users to switch between those views.

#### Scenario: Bookmarks view does not show account-only sections
- **WHEN** the user switches to the Bookmarks view in the Popup
- **THEN** the popup hides account-only content (e.g., balance aggregates and account action shortcuts) and shows bookmark actions instead
