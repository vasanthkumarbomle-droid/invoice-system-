# Client quotation response, email and atomic document saves

## What this adds

- A private, unguessable link emailed to a client for reviewing an invoice/quotation.
- Clients can open the link without creating a LedgerFlow account.
- Clients can accept or reject a quotation once. The response is recorded in Supabase and the quotation status changes.
- The email provider receives a request to send the message. This confirms provider acceptance, not final inbox delivery.
- The email contains a secure link to view the document and save/print a PDF. It does **not** attach a PDF file.
- Invoice and quotation parent/line-item saves run through transactional PostgreSQL functions.

## Required one-time Supabase setup

1. Open the correct Supabase project and verify it already has the core LedgerFlow tables and columns used by the app: `organizations`, `org_members`, `clients`, `invoices`, `invoice_items`, `quotations`, and `quotation_items`. The repository does not contain a full clean-install migration for every core table. Do not run this feature migration against an unrelated or empty project.
2. In **Supabase → SQL Editor**, run the complete file `supabase/sql/003_client_document_workflow.sql`.
3. Confirm it completes successfully. It creates the private share-token table and the two atomic-save RPC functions. Since the client now uses those RPCs, invoice and quotation create/edit saves will fail until this migration is applied.
4. From the repository root, deploy the Edge Function:
   ```powershell
   supabase login
   supabase link --project-ref YOUR_SUPABASE_PROJECT_REF
   supabase functions deploy quotation-workflow
   ```
   The included `supabase/config.toml` disables the gateway's automatic JWT requirement for this particular endpoint because public client links don't have a LedgerFlow login. The function itself validates the logged-in user and their organization membership for owner-only `send` actions; public view/respond actions require a valid, unexpired random token.
5. Set the required Supabase Edge Function secrets (replace placeholders with real values):
   ```powershell
   supabase secrets set PUBLIC_APP_URL=https://YOUR-DEPLOYED-APP-DOMAIN RESEND_API_KEY=re_xxxxxxxxx RESEND_FROM_EMAIL="LedgerFlow <billing@your-verified-domain.com>"
   ```
   `PUBLIC_APP_URL` must be the base URL where this app is deployed (no trailing slash). Your sender domain/address must be verified by Resend. Supabase normally provides the project URL, anon key and service-role key as Edge Function environment values; never paste the service-role key into the React app or a public repository.
6. Verify `org_members` has `org_id`, `user_id`, and `role` columns. If your existing schema names these differently, the edge function membership check must be adjusted to match the real schema before deploying.
7. Build and test locally, then deploy the front-end hosting with the same `PUBLIC_APP_URL` base address.

## Test checklist

- As the owner, create a draft quotation for a client with a valid email address.
- In the document preview, click **Send to Client**. If email is not configured, the UI should show a clear error instead of a success state.
- Open the email link in a private/incognito browser. It should show the document without asking the client to sign in.
- For a live, unexpired quotation, accept it once. Refresh the page and confirm the response remains recorded. Test rejection separately with a second quotation.
- Confirm that a response cannot be submitted a second time and that an expired quotation cannot be accepted.
- Save a PDF from both the owner preview and the client link, and verify the A4 output.
- In owner preview, click the small pen beside **Authorized Signatory**, draw, save, and print/download. The signature should appear only in the signature space and the pen controls should not print.
- Save and edit an invoice and quotation after the SQL migration is applied. Confirm all line items remain if an error occurs.
- Confirm a payment larger than the outstanding balance is blocked in the UI. The database should also enforce this rule if payments may be created outside the UI.

## Important limitations

- Email is a secure link, not a PDF attachment. Clients can open the link and use the browser's **Download / Save PDF** print dialog.
- Provider acceptance isn't proof of delivery or that the client read the email. Delivery webhooks are not configured here.
- The signature pad creates a drawn signature image. It is not a cryptographic or legally verified electronic-signature service.
- Confirm actual schema, Row Level Security, Edge Function secrets and sender-domain verification in the intended Supabase project. Those settings cannot be validated from a GitHub repository alone.
