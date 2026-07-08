# Dialog Module

Use `~/components/ui/dialog` for new dialogs. It is the preferred shadcn-style
primitive interface: compose `Dialog`, `DialogContent`, `DialogHeader`,
`DialogFooter`, `DialogTitle`, and `DialogDescription` directly at the call
site.

`Modal` is a deprecated compatibility wrapper for existing dialogs that still
depend on the legacy slot interface (`header`, `footer`, `size`,
`panelClassName`) or project-specific dismissal guards (`closeOnEsc`,
`closeOnBackdropClick`). Do not add new call sites or new capabilities to
`Modal`; migrate old dialogs only when they are already being touched for a
feature or behavior change.
