## 1. Shared feedback destinations

- [ ] 1.1 Add a shared helper that resolves repository, bug-template, feature-template, and Discussions URLs
- [ ] 1.2 Add targeted tests for the feedback destination helper to keep popup and About links aligned

## 2. Popup and side-panel entry point

- [ ] 2.1 Add a compact feedback trigger to the shared popup or side-panel header using the existing dropdown-menu primitive
- [ ] 2.2 Wire bug-report, feature-request, and discussion actions from the header to the shared feedback destination helper
- [ ] 2.3 Add or update component tests for the popup or side-panel feedback entry point behavior where practical

## 3. About page feedback section

- [ ] 3.1 Add a dedicated feedback and support section to the About page using the existing external-link card pattern
- [ ] 3.2 Reuse the shared feedback destination helper for the About page actions so all support surfaces stay consistent

## 4. Localization and validation

- [ ] 4.1 Add localized labels, tooltips, and descriptions for the new feedback actions in the affected locale files
- [ ] 4.2 Run scoped validation for the changed helper and UI surfaces, then fix any issues discovered
