# LedgerFlow Authentication Redesign — QA & Configuration

Branch: \`auth-redesign\`

## Change boundary

- Replaces the old combined sign-in/sign-up/forgot UI with dedicated \`/login\`, \`/signup\`, \`/forgot-password\` and \`/reset-password\` screens.
- Adds a shared React Router around the session guard, login redirect preservation, optional company onboarding, login session persistence choice, safe generic auth errors, magic links, and an opt-in Google sign-in button.
- Uses existing \`organizations\` columns (\`name\`, \`legal_name\`, \`gstin\`, \`state_code\`, \`logo_url\`). No database migration is required by this implementation.
- No SQL was executed. No existing Supabase Auth user/session rows were edited by this work. Finishing company onboarding intentionally saves the company form for the signed-in user.
- Logo upload uses the existing Supabase Storage service; create the \`company-logos\` bucket and its upload policy in the dashboard before expecting uploads to work.
- Google sign-in is hidden unless the build-time variable \`VITE_SUPABASE_GOOGLE_ENABLED=true\` is set. This flag does not prove that the Google provider itself is configured.

## Visual review guide

### Desktop

- **Login:** a deep slate/navy-to-blue gradient panel on the left, the LedgerFlow mark and name, the “Billing that runs itself.” headline, animated fictional invoice preview, and three benefit rows. On the right is a white, 16px-radius form card with email/password, Remember me, forgot password, full-width blue sign-in, optional Google sign-in, magic link, and sign-up link.
- **Sign up:** same layout and invoice panel. The right card asks for name, company, email, password, and Terms acceptance. Password rules and the strength bar update as the password changes.
- **Confirmation screen:** mail/check illustration, the submitted email, “Check your email to confirm,” and a resend control with a 30-second cooldown.
- **Forgot password:** focused email input and a neutral success screen that does not say whether an email is registered.
- **Reset password:** the shared card styling with new-password and confirmation inputs, show/hide controls, mismatch/strength errors, expired-link recovery, and a success screen.

### 360px mobile

- The full gradient panel collapses to a slim LedgerFlow-branded header above the form; the invoice animation and benefit list are hidden to preserve space.
- The card fills the available width with narrow, safe side padding. Inputs and buttons remain touch-sized; password rules wrap into two columns.
- Check signup and onboarding with a tall viewport too: content should scroll vertically rather than overflow sideways.

## Ten-step manual QA checklist

1. **Protected route / destination:** in a signed-out browser open \`/invoices/new\`. Expect \`/login\`; after successful login with a completed company profile expect to return to \`/invoices/new\`. Confirm a logged-in user opening \`/login\` is redirected to the app.
2. **Failed-login feedback:** submit an incorrect password. Expect only “Incorrect email or password,” not account-existence details. Repeat five times; the client should disable login for 30 seconds. After cooldown, a new attempt should be possible. Supabase server-side rate limits remain authoritative.
3. **Keyboard and credentials:** use Tab/Enter without a mouse; confirm email autofocus, visible focus rings, correct email/current-password autocomplete, show/hide password, Caps Lock warning, and Remember me behavior. With Remember me off, close the tab/browser session and verify the session is not persisted; with it on, a reload should retain the session.
4. **Google OAuth:** while the provider flag is unset, confirm Google is hidden and the setup note appears. Once configured, set \`VITE_SUPABASE_GOOGLE_ENABLED=true\`, rebuild/redeploy the preview, sign in with Google, and confirm the original destination is preserved.
5. **Magic link:** enter an email and select “Email me a magic link.” Confirm neutral success feedback. Test with a registered email and an unregistered email; the UI should not reveal which exists. Open the link in the same browser and verify the allowed return URL.
6. **Sign-up validation:** try a short/weak password and leave Terms unchecked; submission should be blocked. Enter a compliant password and valid details, create the account, and verify the confirmation screen. Test resend once enabled and confirm the 30-second cooldown. Use a dedicated test account for this step.
7. **Company onboarding:** after confirming a new test account, verify the prefilled company name, optional GSTIN/state and logo upload. Save the company name and profile. Test the “finish later” route for an existing incomplete organization. Verify the app opens afterward and the original destination survives.
8. **Forgot password:** request a reset for a registered and an unregistered address. Both should show the same neutral confirmation. Confirm the email link lands on \`/reset-password\`; an expired/used link should offer a new request.
9. **Reset password:** use a valid recovery link; try mismatched passwords, too-short password, and a compliant matching pair. Expect inline errors for invalid input and a clear success screen. Verify the new password works at login and the old one no longer does.
10. **Responsive/motion/regression:** open all five screens at 360px and desktop width; confirm no horizontal scrolling, labels/errors are screen-reader accessible, and controls are keyboard usable. Enable “Reduce motion” and expect a static paid invoice preview; return to normal motion and verify the preview pauses when the browser tab is hidden. Smoke-test invoice and quotation pages after authentication.

## Supabase dashboard setup

### 1. Site URL and auth redirect allowlist

In **Supabase Dashboard → Authentication → URL Configuration**:

- Set **Site URL** to \`https://ledgerflowhq.vercel.app\`.
- Add the production redirect allowlist entry \`https://ledgerflowhq.vercel.app/**\`.
- Add the **actual Vercel Preview URL generated for this PR**, plus \`http://localhost:5173/**\` for local development.
- Save changes. The app sends the current origin as \`redirectTo\`; Supabase must allow each intended origin.

Do not add a guessed preview URL. Copy the hostname from the Vercel Preview deployment after it is ready.

### 2. Google sign-in (optional)

In **Supabase → Authentication → Sign In / Providers → Google**:

1. Create/select a project in [Google Cloud Console](https://console.cloud.google.com/).
2. Configure the OAuth consent screen.
3. Create an OAuth client of type **Web application**.
4. In **Authorized redirect URIs**, add exactly \`https://lfwwljiogwrbzdnufrvm.supabase.co/auth/v1/callback\`.
5. In Google Cloud **Authorized JavaScript origins**, add the production origin \`https://ledgerflowhq.vercel.app\` and the actual preview origin while testing.
6. Copy the Google **Client ID** and **Client Secret** into Supabase’s Google provider configuration and enable the provider.
7. In **Vercel → Project → Settings → Environment Variables**, set \`VITE_SUPABASE_GOOGLE_ENABLED\` to \`true\` for Preview (and Production only after testing). Redeploy to rebuild the client bundle.

If you do not configure Google, leave the variable unset; the button stays hidden. Google OAuth itself does not require adding another paid app service, but email delivery and provider usage remain subject to their own free-tier limits.

### 3. Confirmation and recovery email templates

In **Supabase → Authentication → Email Templates**:

- Review **Confirm signup**. The confirmation link/button should use Supabase’s \`{{ .ConfirmationURL }}\` so the token is verified by Supabase before the application receives the allowed redirect.
- Review **Reset password** similarly and ensure the link verifies the recovery token and returns to the app’s \`/reset-password\` route.
- Send a test confirmation and recovery email. Verify redirects against the URL allowlist from step 1.
- Check your project's email delivery/rate limits before using real customers. The built-in sender is intended for testing and may be restricted; keep the implementation on free services, and do not enable a paid SMTP provider without a separate decision.

### 4. Password security and server-side protection

In **Supabase → Authentication → Settings / Security and Protection** (labels may vary):

- Set the server-side minimum password length to at least **8**.
- Choose password requirements consistent with the signup rules (uppercase, lowercase and number; special character is recommended).
- Keep the project's auth rate limits enabled; the client-side cooldown is only supplementary.
- Enable **Leaked password protection** if it is available on the project’s current plan. The current Supabase security advisor reported it as disabled; do not assume the client-side strength meter replaces server-side checks.

### 5. Company logo bucket

In **Supabase → Storage**:

1. Create a bucket named \`company-logos\`.
2. Set public read only if you intend invoice logos to be openly visible; the current app uses \`getPublicUrl\`.
3. Add an **authenticated INSERT** policy restricted to objects whose first folder is the signed-in user’s UUID (the app upload path is \`<user-id>/<timestamp>-<filename>\`). Do not allow anonymous uploads or unrestricted writes.
4. Verify a signed-in test user can upload an image up to 2 MB. The UI accepts PNG/JPEG/WebP only.

The bucket/policy are dashboard configuration, not migration SQL. **No SQL was run.** If you prefer a SQL policy instead, review it before running it.

## P0 / P1 / P2 scope review

- **Auth-specific P0 addressed in this branch:** dedicated auth routes, protected-route guard with destination return, session-expired message, non-enumerating login/reset feedback, per-login persistence choice, client cooldown, reset flow and onboarding UI.
- **Inherited P0 not addressed by this auth PR:** issued-document immutability/server enforcement, credit-note workflow, independent GSTIN checksum test vectors, searchable state combo, sidebar badges, and reviewing RLS/security-definer advisor findings. The current security advisor also reports existing security-definer RPC warnings and disabled leaked-password protection; no policies/functions were changed here.
- **Inherited P1 not addressed:** advanced reports/dashboard widgets, full 360px audit of all app modules, complete PDF/print parity, expanded templates/brand assets and all mobile table states.
- **Inherited P2 not addressed:** complete onboarding tour, all shortcuts, robust autosave/optimistic updates and further visual polish.
- No Supabase schema changes or existing Auth user edits were performed as part of this branch. Automated CI and Vercel preview status must be checked after the PR is opened; live Google/email delivery and browser interaction still require manual testing with a dedicated test account.
