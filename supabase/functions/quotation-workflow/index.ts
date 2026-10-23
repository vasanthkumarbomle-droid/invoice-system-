import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

function respondJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char] ?? char);
}

function validEmail(value: unknown): value is string {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function normalizeFromAddress(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const source = value.trim();
  const named = source.match(/^(.+?)\s*<([^<>]+)>$/);
  if (named && validEmail(named[2])) return source;
  return validEmail(source) ? source : null;
}

function titleCase(value: unknown): string {
  return String(value || "").replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function todayInIndia(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function mapPublicDocument(documentType: "invoice" | "quotation", row: any, organization: any) {
  const itemsKey = documentType === "invoice" ? "invoice_items" : "quotation_items";
  const rawItems = Array.isArray(row[itemsKey]) ? row[itemsKey] : [];
  const items = rawItems.slice().sort((a: any, b: any) => Number(a.position || 0) - Number(b.position || 0)).map((item: any) => {
    const quantity = Number(item.quantity) || 0;
    const unitPrice = Number(item.unit_price) || 0;
    const gstRate = Number(item.gst_rate) || 0;
    const taxable = item.taxable_amount != null ? Number(item.taxable_amount) : quantity * unitPrice;
    const tax = item.tax_amount != null
      ? Number(item.tax_amount)
      : Number(item.cgst_amount || 0) + Number(item.sgst_amount || 0) + Number(item.igst_amount || 0) || taxable * gstRate / 100;
    return {
      id: item.id,
      description: item.description || "",
      sku: item.sku || "",
      quantity,
      unitPrice,
      gstRate,
      total: item.line_total != null ? Number(item.line_total) : taxable + tax,
    };
  });

  const client = row.clients || {};
  const rawStatus = String(row.status || "draft").toLowerCase();
  const gross = items.reduce((sum: number, item: any) => sum + item.quantity * item.unitPrice, 0);
  const taxableAmount = Number(row.subtotal ?? gross) || 0;
  const taxAmount = Number(row.tax_total) || Number(row.cgst_total || 0) + Number(row.sgst_total || 0) + Number(row.igst_total || 0);
  const grandTotal = Number(row.grand_total) || taxableAmount + taxAmount;

  return {
    id: row.id,
    type: documentType,
    documentNumber: documentType === "invoice" ? row.invoice_number : row.quote_number,
    status: titleCase(rawStatus),
    client: { name: client.name || "", email: client.email || "", phone: client.phone || "", address: client.address || "", gstin: client.gstin || "" },
    issueDate: row.issue_date || "",
    dueDate: documentType === "invoice" ? (row.due_date || "") : (row.valid_until || ""),
    paymentTerms: documentType === "quotation"
      ? (row.terms || "")
      : `Net ${Number(organization.default_payment_terms_days) || 15} days`,
    items,
    subtotal: documentType === "invoice" ? gross : taxableAmount,
    discountAmount: Math.max(0, gross - taxableAmount),
    taxableAmount,
    cgstAmount: Number(row.cgst_total) || 0,
    sgstAmount: Number(row.sgst_total) || 0,
    igstAmount: Number(row.igst_total) || 0,
    taxAmount,
    grandTotal,
    amountPaid: Number(row.amount_paid) || 0,
    balanceDue: Number(row.balance_due ?? grandTotal) || 0,
    notes: row.notes || "",
  };
}

async function getDocument(admin: any, documentType: "invoice" | "quotation", documentId: string, orgId: string) {
  const table = documentType === "invoice" ? "invoices" : "quotations";
  const itemRelation = documentType === "invoice" ? "invoice_items" : "quotation_items";
  const { data, error } = await admin
    .from(table)
    .select("*, clients(*), " + itemRelation + "(*)")
    .eq("id", documentId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) throw new Error("Could not load document details: " + error.message);
  if (!data) throw new Error("Document not found.");
  return data;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return respondJson({ error: "Use POST." }, 405);

  const body = await req.json().catch(() => ({}));
  const action = body?.action;
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return respondJson({ error: "Missing Supabase server configuration." }, 500);

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (action === "get_signature") {
    const authorization = req.headers.get("authorization") || "";
    const publishableKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
    if (!authorization || !publishableKey) return respondJson({ error: "Sign in before loading a document signature." }, 401);

    const caller = createClient(supabaseUrl, publishableKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: authError } = await caller.auth.getUser();
    const user = userData?.user;
    if (authError || !user) return respondJson({ error: "Your session is invalid. Sign in again." }, 401);

    const orgId = String(body?.orgId || "");
    const documentId = String(body?.documentId || "");
    const documentType = body?.documentType;
    if (!/^[0-9a-f-]{36}$/i.test(orgId) || !/^[0-9a-f-]{36}$/i.test(documentId) ||
        !["invoice", "quotation"].includes(documentType)) {
      return respondJson({ error: "Invalid document request." }, 400);
    }
    const { data: membership, error: memberError } = await admin.from("org_members")
      .select("role").eq("org_id", orgId).eq("user_id", user.id).maybeSingle();
    if (memberError || !membership) return respondJson({ error: "You do not have permission to view this business signature." }, 403);

    const { data: signatureRow, error: signatureError } = await admin.from("document_signatures")
      .select("signature_data").eq("org_id", orgId).eq("document_type", documentType)
      .eq("document_id", documentId).maybeSingle();
    if (signatureError) return respondJson({ error: "Document signature could not be loaded." }, 500);
    return respondJson({ success: true, signatureData: signatureRow?.signature_data || "" });
  }

  if (action === "save_signature") {
    const authorization = req.headers.get("authorization") || "";
    const publishableKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
    if (!authorization || !publishableKey) return respondJson({ error: "Sign in before saving a signature." }, 401);

    const caller = createClient(supabaseUrl, publishableKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: authError } = await caller.auth.getUser();
    const user = userData?.user;
    if (authError || !user) return respondJson({ error: "Your session is invalid. Sign in again." }, 401);

    const orgId = String(body?.orgId || "");
    const documentId = String(body?.documentId || "");
    const documentType = body?.documentType;
    const signatureData = String(body?.signatureData || "");
    if (!/^[0-9a-f-]{36}$/i.test(orgId) || !/^[0-9a-f-]{36}$/i.test(documentId) ||
        !["invoice", "quotation"].includes(documentType)) {
      return respondJson({ error: "Invalid document request." }, 400);
    }
    if (!/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(signatureData) || signatureData.length > 1000000) {
      return respondJson({ error: "Signature image is invalid or too large." }, 400);
    }

    const { data: membership, error: memberError } = await admin.from("org_members")
      .select("role").eq("org_id", orgId).eq("user_id", user.id).maybeSingle();
    if (memberError || !membership) return respondJson({ error: "You do not have permission to sign documents for this business." }, 403);

    try {
      await getDocument(admin, documentType, documentId, orgId);
    } catch (error) {
      return respondJson({ error: error instanceof Error ? error.message : "Document not found." }, 404);
    }

    const { data: savedSignature, error: signatureError } = await admin.from("document_signatures")
      .upsert({
        org_id: orgId,
        document_type: documentType,
        document_id: documentId,
        signature_data: signatureData,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: "org_id,document_type,document_id" })
      .select("id,updated_at").single();
    if (signatureError || !savedSignature) {
      return respondJson({ error: "Signature could not be saved. Apply the client document workflow SQL migration and try again." }, 500);
    }
    return respondJson({ success: true, updatedAt: savedSignature.updated_at });
  }

  if (action === "send") {
    const authorization = req.headers.get("authorization") || "";
    const publishableKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
    if (!authorization || !publishableKey) return respondJson({ error: "Sign in to send a document." }, 401);

    const caller = createClient(supabaseUrl, publishableKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: authError } = await caller.auth.getUser();
    const user = userData?.user;
    if (authError || !user) return respondJson({ error: "Your session is invalid. Sign in again." }, 401);

    const orgId = String(body?.orgId || "");
    const documentId = String(body?.documentId || "");
    const documentType = body?.documentType;
    if (!/^[0-9a-f-]{36}$/i.test(orgId) || !/^[0-9a-f-]{36}$/i.test(documentId) ||
        !["invoice", "quotation"].includes(documentType)) {
      return respondJson({ error: "Invalid document request." }, 400);
    }

    // Verify the signed-in user is a member of the requested organization before using the service role.
    const { data: membership, error: memberError } = await admin
      .from("org_members")
      .select("role")
      .eq("org_id", orgId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (memberError || !membership) return respondJson({ error: "You do not have permission to send documents for this business." }, 403);

    let record: any;
    try {
      record = await getDocument(admin, documentType, documentId, orgId);
    } catch (error) {
      return respondJson({ error: error instanceof Error ? error.message : "Document could not be loaded." }, 404);
    }

    const status = String(record.status || "draft").toLowerCase();
    if (documentType === "quotation" && ["accepted", "rejected", "converted", "expired"].includes(status)) {
      return respondJson({ error: "This quotation is already closed and cannot be reissued. Create a revised quotation instead." }, 409);
    }
    if (documentType === "invoice" && ["cancelled"].includes(status)) {
      return respondJson({ error: "Cancelled invoices cannot be sent." }, 409);
    }

    const client = record.clients || {};
    const recipient = String(client.email || "").trim();
    if (!validEmail(recipient)) return respondJson({ error: "Add a valid email address to this client record before sending." }, 422);

    const appBase = (Deno.env.get("PUBLIC_APP_URL") || "").replace(/\/+$/, "");
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const fromEmail = normalizeFromAddress(Deno.env.get("RESEND_FROM_EMAIL"));
    if (!/^https?:\/\//i.test(appBase) || !resendKey || !fromEmail) {
      return respondJson({ error: "Email is not configured. Set PUBLIC_APP_URL, RESEND_API_KEY and a verified RESEND_FROM_EMAIL in Supabase function secrets." }, 503);
    }

    if (documentType === "quotation" && record.valid_until && String(record.valid_until).slice(0, 10) < todayInIndia()) {
      await admin.from("quotations").update({ status: "expired" }).eq("id", documentId).eq("org_id", orgId).eq("status", "sent");
      return respondJson({ error: "This quotation has expired. Update its validity date before sending it." }, 409);
    }

    const rawToken = newToken();
    const tokenHash = await sha256(rawToken);
    const defaultExpiry = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    let expiresAt = defaultExpiry.toISOString();
    if (documentType === "quotation" && record.valid_until) {
      expiresAt = new Date(String(record.valid_until).slice(0, 10) + "T23:59:59+05:30").toISOString();
    }

    // Expire older active links for this exact document to avoid stale response links.
    await admin.from("document_share_tokens")
      .update({ expires_at: new Date().toISOString() })
      .eq("org_id", orgId)
      .eq("document_type", documentType)
      .eq("document_id", documentId)
      .is("responded_at", null);

    const { data: tokenRow, error: tokenError } = await admin.from("document_share_tokens").insert({
      org_id: orgId,
      document_type: documentType,
      document_id: documentId,
      token_hash: tokenHash,
      recipient_email: recipient,
      expires_at: expiresAt,
    }).select("id").single();
    if (tokenError || !tokenRow) return respondJson({ error: "Could not create a secure document link." }, 500);

    const link = appBase + "/client-document?token=" + encodeURIComponent(rawToken);
    const organization = await admin.from("organizations")
      .select("name,legal_name,email,phone")
      .eq("id", orgId)
      .maybeSingle();
    const companyName = organization.data?.name || organization.data?.legal_name || "Your supplier";
    const documentNumber = documentType === "invoice" ? (record.invoice_number || "invoice") : (record.quote_number || "quotation");
    const itemsKey = documentType === "invoice" ? "invoice_items" : "quotation_items";
    const itemRows = (record[itemsKey] || []).map((item: any) => {
      const lineTotal = item.line_total != null
        ? Number(item.line_total)
        : (Number(item.quantity) || 0) * (Number(item.unit_price) || 0) * (1 + (Number(item.gst_rate) || 0) / 100);
      return "<tr><td style=\"padding:8px;border-bottom:1px solid #e3e9e3\">" +
        escapeHtml(item.description) + "</td><td style=\"padding:8px;text-align:right;border-bottom:1px solid #e3e9e3\">" +
        escapeHtml(item.quantity) + "</td><td style=\"padding:8px;text-align:right;border-bottom:1px solid #e3e9e3\">₹" +
        lineTotal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "</td></tr>";
    }).join("");
    const grandTotal = Number(record.grand_total) || 0;
    const amountText = "₹" + grandTotal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const title = documentType === "quotation" ? "Quotation" : "Invoice";
    const intro = documentType === "quotation"
      ? "Please review the quotation and record your decision through the secure page."
      : "Your invoice is ready. Open the secure page to review the details and save a PDF copy.";
    const html = "<div style=\"font-family:Arial,sans-serif;max-width:680px;margin:auto;color:#202b24\">" +
      "<div style=\"background:#286747;color:#fff;padding:20px 24px;border-radius:10px 10px 0 0\"><strong style=\"font-size:20px\">" +
      escapeHtml(companyName) + "</strong><div style=\"font-size:12px;margin-top:6px\">" + escapeHtml(title) + " #" + escapeHtml(documentNumber) + "</div></div>" +
      "<div style=\"border:1px solid #e3e9e3;padding:24px;border-radius:0 0 10px 10px\"><p>Hello " + escapeHtml(client.name || "there") + ",</p><p>" +
      intro + "</p><table style=\"width:100%;border-collapse:collapse;font-size:13px\"><thead><tr><th style=\"text-align:left;padding:8px;background:#f1f6f1\">Item</th><th style=\"text-align:right;padding:8px;background:#f1f6f1\">Qty</th><th style=\"text-align:right;padding:8px;background:#f1f6f1\">Amount</th></tr></thead><tbody>" +
      itemRows + "</tbody></table><p style=\"text-align:right;font-size:18px;font-weight:700\">Total: " + amountText + "</p>" +
      "<p style=\"margin:24px 0\"><a href=\"" + escapeHtml(link) + "\" style=\"display:inline-block;background:#286747;color:white;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:7px\">View " + escapeHtml(title) + (documentType === "quotation" ? " & Respond" : " & Download PDF") + "</a></p>" +
      "<p style=\"color:#68756c;font-size:12px\">This secure link may expire. If you need help, reply to this email.</p>" +
      "<p>Regards,<br>" + escapeHtml(companyName) + "</p></div></div>";
    const textBody = "Hello " + (client.name || "there") + ",\n\n" + intro + "\n" + title + ": " + documentNumber + "\nTotal: " + amountText + "\nOpen: " + link;

    const emailPayload: Record<string, unknown> = {
      from: fromEmail,
      to: [recipient],
      subject: title + " " + documentNumber + " from " + companyName,
      html,
      text: textBody,
    };
    if (validEmail(organization.data?.email)) emailPayload.reply_to = organization.data.email;

    const mailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: "Bearer " + resendKey, "Content-Type": "application/json" },
      body: JSON.stringify(emailPayload),
    });
    if (!mailResponse.ok) {
      const errorText = (await mailResponse.text()).slice(0, 600);
      await admin.from("document_share_tokens").delete().eq("id", tokenRow.id);
      return respondJson({ error: "The email provider rejected the message. Check the sender domain and Resend configuration.", details: errorText }, 502);
    }

    // Update only after the email provider accepted it. A provider acceptance is not proof of final delivery.
    const targetTable = documentType === "invoice" ? "invoices" : "quotations";
    if (status === "draft") {
      const { error: statusError } = await admin.from(targetTable)
        .update({ status: documentType === "invoice" ? "pending" : "sent" })
        .eq("id", documentId).eq("org_id", orgId).eq("status", "draft");
      if (statusError) return respondJson({ error: "The email was accepted, but the document status could not be updated. Check the document in LedgerFlow." }, 500);
    }

    return respondJson({ success: true, emailAcceptedByProvider: true, recipient, documentType, documentNumber });
  }

  if (action === "view" || action === "respond") {
    const rawToken = String(body?.token || "");
    if (!/^[0-9a-f]{64}$/i.test(rawToken)) return respondJson({ error: "This document link is invalid or has expired." }, 400);
    const tokenHash = await sha256(rawToken);
    const { data: tokenRow, error: tokenError } = await admin.from("document_share_tokens")
      .select("*").eq("token_hash", tokenHash).maybeSingle();
    if (tokenError || !tokenRow || new Date(tokenRow.expires_at).getTime() <= Date.now()) {
      return respondJson({ error: "This document link is invalid or has expired. Ask the sender for a new link." }, 404);
    }

    if (action === "respond") {
      const decision = String(body?.decision || "").toLowerCase();
      if (tokenRow.document_type !== "quotation" || !["accepted", "rejected"].includes(decision)) {
        return respondJson({ error: "This action is not available for this document." }, 400);
      }
      if (tokenRow.responded_at || tokenRow.response_status) {
        return respondJson({ error: "A response has already been recorded for this quotation." }, 409);
      }

      let quote: any;
      try { quote = await getDocument(admin, "quotation", tokenRow.document_id, tokenRow.org_id); }
      catch { return respondJson({ error: "Quotation not found." }, 404); }

      if (String(quote.status || "").toLowerCase() !== "sent") {
        return respondJson({ error: "This quotation is no longer awaiting a response." }, 409);
      }
      if (quote.valid_until && String(quote.valid_until).slice(0, 10) < todayInIndia()) {
        await admin.from("quotations").update({ status: "expired" }).eq("id", quote.id).eq("org_id", tokenRow.org_id).eq("status", "sent");
        return respondJson({ error: "The quotation has expired. Contact the sender for an updated quotation." }, 409);
      }

      const { data: claimedToken, error: claimError } = await admin.from("document_share_tokens")
        .update({ response_status: decision, responded_at: new Date().toISOString() })
        .eq("id", tokenRow.id).is("responded_at", null).select("id").maybeSingle();
      if (claimError || !claimedToken) return respondJson({ error: "A response has already been recorded." }, 409);

      const { data: updatedQuote, error: updateError } = await admin.from("quotations")
        .update({ status: decision })
        .eq("id", quote.id).eq("org_id", tokenRow.org_id).eq("status", "sent")
        .select("id").maybeSingle();
      if (updateError || !updatedQuote) {
        await admin.from("document_share_tokens")
          .update({ response_status: null, responded_at: null })
          .eq("id", tokenRow.id).eq("response_status", decision);
        return respondJson({ error: "This quotation was updated elsewhere. Refresh the page to see the latest status." }, 409);
      }

      // Notify the business contact after the decision is committed. A failed notification
      // must never undo the client's recorded decision.
      let ownerNotified = false;
      const { data: business } = await admin.from("organizations")
        .select("name,legal_name,email")
        .eq("id", tokenRow.org_id)
        .maybeSingle();
      const ownerEmail = String(business?.email || "").trim();
      const mailKey = Deno.env.get("RESEND_API_KEY");
      const fromAddress = normalizeFromAddress(Deno.env.get("RESEND_FROM_EMAIL"));
      if (validEmail(ownerEmail) && mailKey && fromAddress) {
        try {
          const businessName = business?.name || business?.legal_name || "LedgerFlow business";
          const quoteNumber = quote.quote_number || quote.id;
          const accepted = decision === "accepted";
          const subject = `Quotation ${quoteNumber} was ${accepted ? "accepted" : "rejected"}`;
          const message = "The client " + (quote.clients?.name || "customer") + " has " + (accepted ? "accepted" : "rejected") + " quotation " + quoteNumber + " from " + businessName + ".";
          const mailResult = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { Authorization: "Bearer " + mailKey, "Content-Type": "application/json" },
            body: JSON.stringify({
              from: fromAddress,
              to: [ownerEmail],
              subject,
              text: message + String.fromCharCode(10, 10) + "Open LedgerFlow to review the recorded response.",
              html: "<div><h2>" + escapeHtml(subject) + "</h2><p>" + escapeHtml(message) + "</p><p>Open LedgerFlow to review the recorded response.</p></div>",
            }),
          });
          ownerNotified = mailResult.ok;
        } catch (notificationError) {
          console.error("Quotation response was recorded but owner notification failed:", notificationError);
        }
      }

      return respondJson({
        success: true,
        responseStatus: decision,
        respondedAt: new Date().toISOString(),
        ownerNotified,
      });
    }

    let record: any;
    try { record = await getDocument(admin, tokenRow.document_type, tokenRow.document_id, tokenRow.org_id); }
    catch { return respondJson({ error: "Document not found." }, 404); }

    if (tokenRow.document_type === "quotation" && record.valid_until &&
        String(record.valid_until).slice(0, 10) < todayInIndia() &&
        String(record.status || "").toLowerCase() === "sent") {
      await admin.from("quotations").update({ status: "expired" })
        .eq("id", record.id).eq("org_id", tokenRow.org_id).eq("status", "sent");
      record = { ...record, status: "expired" };
    }

    const { data: organization, error: organizationError } = await admin.from("organizations")
      .select("*").eq("id", tokenRow.org_id).maybeSingle();
    if (organizationError || !organization) return respondJson({ error: "Business details could not be loaded." }, 500);

    const { data: signatureRow, error: signatureError } = await admin.from("document_signatures")
      .select("signature_data")
      .eq("org_id", tokenRow.org_id)
      .eq("document_type", tokenRow.document_type)
      .eq("document_id", tokenRow.document_id)
      .maybeSingle();
    if (signatureError) return respondJson({ error: "Document signature could not be loaded." }, 500);
    const publicDocument = mapPublicDocument(tokenRow.document_type, record, organization);
    publicDocument.signatureData = signatureRow?.signature_data || "";

    return respondJson({
      documentType: tokenRow.document_type,
      document: publicDocument,
      organization: {
        name: organization.name || "",
        legal_name: organization.legal_name || organization.name || "",
        gstin: organization.gstin || "",
        pan: organization.pan || "",
        email: organization.email || "",
        phone: organization.phone || "",
        address: organization.address || "",
        bank_name: organization.bank_name || "",
        bank_account_no: organization.bank_account_no || "",
        bank_ifsc: organization.bank_ifsc || "",
        upi_id: organization.upi_id || "",
        default_payment_terms_days: organization.default_payment_terms_days || 15,
      },
      responseStatus: tokenRow.response_status || "",
    });
  }

  return respondJson({ error: "Unsupported action." }, 400);
});
