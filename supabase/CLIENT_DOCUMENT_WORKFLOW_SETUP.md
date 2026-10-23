# Client quotation response, email and atomic document saves

## What this workflow does

- Emails clients a private link to review an invoice or quotation.
- Lets clients accept or reject an unexpired quotation once, without creating a LedgerFlow account.
- Records the quotation response in Supabase and can notify the business email address.
- Lets the owner draw and save a signature in the authorized-signatory area; the signature is shown on the client document.
- Lets the client print/save an A4 PDF from the secure document link.
- Saves invoice/quotation headers and line items through database transactions.

**Email provider:** Google Apps Script \`MailApp\`. The existing Apps Script reminder functions and trigger are separate and should be kept.

The email contains a secure link. It does not attach a PDF file. The browser's print dialog is used to save the document as PDF. Provider acceptance is not proof that the message reached the recipient's inbox.

## Setup

### 1. Database migration

If \`supabase/sql/003_client_document_workflow.sql\` has already run successfully in the correct LedgerFlow Supabase project, do not run it again. It creates the share-token/signature tables and database functions used by this feature.

The existing core tables must already be present: \`organizations\`, \`org_members\`, \`clients\`, \`invoices\`, \`invoice_items\`, \`quotations\`, and \`quotation_items\`. This feature migration is not a complete clean-install schema.

### 2. Add the email bridge to your existing Google Apps Script project

1. Open the same Apps Script project where \`previewinvoicereminders\` and \`runinvoicereminders\` already exist.
2. Keep those functions and the existing trigger. Do not create a second project or delete the trigger.
3. Open \`supabase/GOOGLE_APPS_SCRIPT_EMAIL_BRIDGE.gs\` in this repository and append its code to your existing Apps Script editor. The function dropdown should then also show \`doPost\`. If you already have a \`doPost(e)\` function, merge the handler into it instead of creating a duplicate.
4. In **Project Settings → Script properties**, add \`LEDGERFLOW_WEBHOOK_SECRET\` and set its value to a new, random secret. Generate one locally in PowerShell:
   \`\`\`powershell
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   \`\`\`
   Save the value privately. You will use the exact same value in Supabase. Never paste it into chat, frontend code, or GitHub.
5. In Apps Script, choose **Deploy → New deployment → Web app**. Set **Execute as** to your account and **Who has access** to **Anyone**, then deploy and authorize the requested mail permissions. The shared-secret check inside \`doPost\` protects requests. Copy the Web app URL ending in \`/exec\`.
6. Whenever you modify Apps Script after deployment, open **Deploy → Manage deployments**, edit the deployment, choose a new version, and deploy again. Keep the same Web app URL when updating that deployment.

The reminder trigger continues running its existing reminder function on its schedule. This new \`doPost\` handler is the separate HTTP endpoint that LedgerFlow calls for individual document emails.

### 3. Deploy the Supabase Edge Function

From the project folder in PowerShell, you have already completed \`npx supabase link --project-ref ...\`. Continue with:

\`\`\`powershell
npx supabase functions deploy quotation-workflow
\`\`\`

The repository's \`supabase/config.toml\` disables gateway JWT enforcement for this endpoint because clients use a secure, expiring document token rather than a LedgerFlow login. Owner-only actions validate the Supabase session and organization membership inside the function.

### 4. Configure Supabase secrets

Set the Apps Script deployment URL and the exact same secret you stored in Apps Script:

\`\`\`powershell
npx supabase secrets set GOOGLE_APPS_SCRIPT_URL="YOUR_APPS_SCRIPT_WEB_APP_URL" GOOGLE_APPS_SCRIPT_SECRET="YOUR_SAME_RANDOM_SECRET"
\`\`\`

Replace both placeholder values locally. Do not share the secret. Supabase automatically supplies its own project URL and service-role configuration to Edge Functions; do not place the service-role key in the React app.

### 5. Deploy the frontend later

The website is not deployed yet, so **do not invent a public URL or set \`PUBLIC_APP_URL\` to localhost**. The email link must lead to a publicly accessible frontend for the client to view and accept/reject a quotation. After the frontend is deployed, set its actual base URL:

\`\`\`powershell
npx supabase secrets set PUBLIC_APP_URL="https://YOUR-REAL-DEPLOYED-SITE"
\`\`\`

Use the real URL, with no trailing slash. Then the Send to Client workflow can generate links clients can open outside your computer. Until these secrets and the public frontend are configured, sending client documents is expected to fail with a configuration error.

### 6. Check database assumptions

Confirm that \`org_members\` has \`org_id\`, \`user_id\`, and \`role\` columns. If the existing schema uses different column names, update the membership check in the Edge Function before relying on owner actions.

## Test checklist

- Verify the Apps Script project still has \`previewinvoicereminders\`, \`runinvoicereminders\`, and its scheduled trigger.
- Deploy the new Apps Script version and confirm \`doPost\` is present in the code.
- In LedgerFlow, save an invoice and a quotation and confirm their line items persist.
- After the website is deployed and the required secrets are set, send a document to a client with a valid email address.
- Open the received link in a private/incognito browser without signing into LedgerFlow.
- Accept one quotation and reject a different quotation; verify each response is recorded and cannot be submitted a second time.
- Confirm that expired quotations cannot be accepted.
- Verify the owner gets an email notification for a client quotation response when the organization's email is valid.
- Download/print the invoice and quotation as PDF and check the A4 output and signature placement.

## Important limitations

- Google Apps Script sends from the Google account that owns/runs the script; it does not spoof an arbitrary sender address. The organization email is used as Reply-To when valid.
- Google Apps Script sending quotas and permissions apply.
- The public client URL will not work until the frontend is deployed and \`PUBLIC_APP_URL\` is set correctly.
- A drawn signature image is not a cryptographic or legally verified electronic-signature service.
- Verify the actual database schema, Row Level Security, deployment permissions, and email delivery in the intended Supabase and Google accounts; these cannot be proven from GitHub code alone.
