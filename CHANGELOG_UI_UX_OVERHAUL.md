# LedgerFlow UI/UX Overhaul — Changelog

Branch: ui-ux-overhaul

This PR is an incremental, reviewable first pass. Unchecked items are not complete.

## P0 — Bugs, compliance and trust
- [x] Replaced the warm/copper palette with blue/slate design tokens, Inter typography, card radius, focus rings, reduced-motion fallback, and dark-token foundation.
- [x] Replaced visible Financial Suite branding with LedgerFlow/Invoice Workspace; corrected CCGST to CGST.
- [x] Client invoice counts now pluralise invoice/invoices.
- [x] Client list derives state from state name or GSTIN code instead of the address fragment.
- [x] New issue/send actions require seller GSTIN, registered address, bank name, account number and IFSC; editor shows a Settings action. Draft saving remains available.
- [x] Dashboard displays missing profile fields and completion progress.
- [x] Preview printing/HTML download and document email sending are blocked until required seller fields exist.
- [x] Settings validates GSTIN structure/checksum, PAN structure and IFSC structure before saving.
- [x] State-code field is now a state-name select; common bank names autofill from IFSC prefixes.
- [x] Hides empty seller GSTIN/PAN/contact lines and empty bank details; Place of Supply shows a state name and displayed dates use DD Mon YYYY.
- [x] Cancelled invoices show — for balance due; zero overdue count and No Barcode are neutral; stock is flagged low at five or fewer units.
- [x] Header action is contextual and New menu offers Invoice, Quotation, Client and Product.
- [x] Dashboard hero is shorter, greeting uses available user metadata, and profile checklist is present.
- [x] Magic Command Bar starter: Ctrl+K focuses global search; Show overdue, Go to reports, and a rule-based invoice command navigate or prefill a draft from matched client/product data.
- [x] No Supabase schema migration or business data update was run.

### P0 still requiring work
- [ ] Verify the live organization record for the APEX ENTERPRISES PVT LMT typo. No matching hardcoded string was found in the inspected app source; no live business record was modified.
- [ ] Sign-out action: no sign-out handler was found in inspected app source; trace auth-provider ownership before moving it into the profile menu.
- [ ] Enforce issued-document immutability through every UI/server path; dedicated Cancel/Void and credit-note flows; confirm issued invoices cannot be permanently deleted.
- [ ] Test GSTIN checksum against independent official valid/invalid examples.
- [ ] Searchable state selector (current native select is not a searchable combobox).
- [ ] Audit all sidebar badge counts and low-stock colour cases.
- [ ] Review Supabase security-advisor findings and test RLS/function access before changing policies.

## P1 — UX upgrades
- [x] Design-token foundation, focus rings, reduced-motion defaults, profile checklist, contextual creation menu, basic command parsing and client-state display.
- [ ] Dashboard chart empty state, due-this-week, top-overdue-client and low-stock widgets, skeleton loading.
- [ ] Relative due dates, tooltips, action menus, mobile table cards and accessible empty states.
- [ ] Preview menu/share link/converted-quotation link/status watermark/print parity and filler-copy removal.
- [x] Live paper editor starter: responsive split layout, live form values/totals and a clickable missing-seller warning that opens Settings. Issue/paid stamp animation and precise warning overlays remain unfinished.
- [ ] Line-item UOM/discount/stock warnings, amount in words, round-off/shipping/TDS/TCS, quotation terms, template/logo/signature uploads.
- [ ] Reports date range, ageing, client totals, taxable value and GSTR-1-style export.
- [ ] HSN column and full responsive/accessibility audit at 360px.

## P2 — Polish
- [x] Reduced-motion CSS fallback and short transition token.
- [ ] Onboarding tour, complete shortcuts, robust autosave/optimistic updates and issue/paid stamp animation.

## Verification
- [x] Vercel generated preview deployments for this branch.
- [ ] Latest commit deployment must be READY before merge.
- [ ] No end-to-end browser test completed in this session.
- [ ] Build/lint/test output has not been independently run in a local checkout during this session.