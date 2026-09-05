# Dependency patches

## cmdk 1.1.1

`cmdk@1.1.1.patch` adapts the selection-registry fix from [upstream PR #411](https://github.com/dip/cmdk/pull/411), commit `48424f4`, for the published ESM and CommonJS bundles. cmdk remains MIT licensed. The upstream proposal was open when checked on 2026-09-06; this is a locally verified backport, not an upstream release.

Harbor's async reviewer-team selector reproduced [issue #373](https://github.com/dip/cmdk/issues/373): the first option was selected, but the input lacked `aria-activedescendant`. The old implementation derived the id from DOM selection in a queued layout callback. The patch resolves it from the item registry when values change or matching items register, and uses the stored id when removing the selected item.

`src/components/ui/command.interaction.test.tsx` verifies async registration, controlled selection, removal of a selected option, keyboard movement, filtering and clearing unmatched selection through the production wrapper. Keep the patch until a cmdk release includes the fix and passes that regression plus the reviewer dialog browser check. The npm package ships only bundled runtime code, so the patch touches those published entry points; no application build output is checked in.
