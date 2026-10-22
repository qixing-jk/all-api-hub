# Account dialog outline

Decision record, finalized 2026-10-22. Apply one continuous layout to completed add and edit forms. The initial add step remains a distinct identification flow. Preserve provider policies, validation, account draft ownership and the fixed save footer.

## Layout and navigation decisions

- Use the modal body as the only vertical scroll container. Keep all form sections expanded, including on narrow screens. Order sections as site information, authentication, check-in/login, balance/statistics and tags/notes.
- Use flat settings sections with separators and responsive columns within each section. Tabs were rejected because they hid small amounts of related content; independent form columns weakened grouping.
- Show a sticky sidebar on wide screens, horizontal shortcuts on intermediate widths and a single section menu below 640px. The compact menu replaces an overflowing horizontal directory. Navigation selects the destination, moves focus to its heading after the menu closes, and restores scroll tracking on manual input.
- Match existing sidebar selection styles. Pulse a decorative ring around the whole destination section, then fade after 1.8 seconds; respect reduced-motion scrolling. Persistent heading emphasis and a tinted content fill were rejected.
- Keep help visible without a disclosure click. Place it below the directory only on sufficiently wide and tall screens, otherwise after the form. Authentication cautions remain on the existing help icon; fixed tooltip positioning and bounded width prevent modal clipping.
- Cookie authentication uses stacked fields, an import action beside the Cookie label and responsive permission guidance. Imported cookies remain required where provider policy requires them; browser-session cookies remain optional.

## Add flow and recovery decisions

- Put URL/authentication inputs first, followed immediately by provider recommendations. Ordinary identification guidance and the LDOH directory link follow recommendations. Selected-provider instructions stay beside the affected input, while slow/error recovery remains prominent.
- Rejected the side-by-side input/instruction proposal because it left excess empty space. Recommendations use a labelled grid on wide screens and stack on narrow screens; retain provider prefill and fallback destinations.
- Remove the redundant bookmark-import prompt from the add dialog; batch import stays available in the account-management header. Remove its dialog-only plumbing and locale keys together.
- Identification and invalid-form detection recovery show two equal-width actions: Auto Detect, then Manual Add. Do not add a separate Cancel action to that state. Completed forms retain cancel/save actions. Submitting the initial URL form runs detection instead of saving an incomplete account.
- Stack recovery text and actions on narrow screens so the message retains readable width.

## Evidence retained locally

Keep this decision record in Git. Review-only screenshots, comparisons, prior acceptance reports, failure logs and the superseded narrative stay local under the existing ignored `artifacts/` directory and `.scratch/visual-captures/`. They remain needed for review; no cleanup is proposed now.

Entry points: `artifacts/acceptance.md` and the focused acceptance records beneath `artifacts/`; latest narrow recovery, shared-icon and site-type checks are in `../visual-captures/account-narrow/acceptance.md`, `../visual-captures/account-icon-unification/acceptance.md` and `../visual-captures/account-site-type-icons/acceptance.md`.

Validation uses deterministic extension fixtures for UI integration and stored draft persistence. Live provider writes, Firefox and real-device parity remain unverified; closing those gaps requires exercising the same add/edit/recovery flows in those environments. No production data migration is involved.
