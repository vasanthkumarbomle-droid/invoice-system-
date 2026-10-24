# LedgerFlow UI/UX Overhaul — How to Test

Use the Vercel preview for branch ui-ux-overhaul, not production.

## P0 smoke checks
- [ ] Sign in; verify sidebar, dashboard and contextual header action.
- [ ] Open New menu; verify Invoice, Quotation, Client and Product routes/actions.
- [ ] Confirm dashboard profile checklist progress and Settings shortcut.
- [ ] With seller profile incomplete, try issuing, sending and downloading; each should be blocked. Save as Draft should remain available.
- [ ] Complete seller fields and retry send/print/download.
- [ ] Try invalid GSTIN format, wrong checksum, invalid PAN and invalid IFSC; save should be blocked visibly.
- [ ] Enter common IFSC prefixes SBIN, HDFC, ICIC, UTIB, KKBK, PUNB, BARB, CNRB, UBIN, IDFB and YESB; verify bank-name autofill.
- [ ] Open a preview with some seller fields blank; confirm blank labels do not print.
- [ ] Confirm Place of Supply shows a state name (for example 36 – Telangana) and dates use DD Mon YYYY.
- [ ] Confirm cancelled invoice balances show —, zero overdue is neutral, and No Barcode is neutral.
- [ ] Press Ctrl+K; try Go to reports and Show overdue.
- [ ] Try Invoice Ravi Traders 3 keyboards 18% due in 15 days using existing client/product records; inspect every prefilled field before saving.

## Accounting and security regression checks before merge
- [ ] Create/edit draft invoice and quotation.
- [ ] Convert accepted quotation to invoice; ensure repeated clicks cannot create duplicates.
- [ ] Partial payment to paid status; server must reject overpayment.
- [ ] Paid/partially paid/cancelled invoices cannot be permanently deleted; numbering and audit history remain intact.
- [ ] Cross-state GST applies IGST; same-state GST splits CGST/SGST.
- [ ] Verify organization isolation and RLS with two test organizations and non-owner roles.
- [ ] Confirm reminder Edge Function still runs and email delivery is configured.
- [ ] Test preview/print at desktop and 360px; compare PDF output to preview.
- [ ] Test dark mode, keyboard navigation and reduced-motion after remaining work lands.

## Known limitations
The live paper editor, advanced reports, all preview actions, full dark-mode toggle, all issued-document replacement flows and comprehensive automated/browser tests are not complete. Do not merge for production use until checks pass.