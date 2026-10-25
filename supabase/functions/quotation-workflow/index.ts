import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb, PageSizes } from "https://esm.sh/pdf-lib@1.17.1";

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
function safePdfText(value: unknown): string {
  return String(value ?? "")
    .replace(/₹/g, "INR ")
    .replace(/[–—]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, " ");
}

function pdfBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 0x8000, bytes.length)));
  }
  return btoa(binary);
}

function inr(value: unknown): string {
  return "INR " + (Number(value) || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

async function createDocumentPdf(record: any, organization: any, documentType: "invoice" | "quotation", client: any, documentNumber: string): Promise<string> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(documentNumber + " - LedgerFlow");
  pdf.setSubject(documentType === "invoice" ? "Tax invoice" : "Price quotation");
  pdf.setCreator("LedgerFlow");
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const [pageWidth, pageHeight] = PageSizes.A4;
  let page = pdf.addPage(PageSizes.A4);
  let y = pageHeight - 46;
  const left = 44;
  const right = pageWidth - 44;
  const textColor = rgb(0.12, 0.16, 0.22);
  const muted = rgb(0.38, 0.43, 0.50);
  const brand = rgb(0.15, 0.39, 0.72);

  const nextPage = () => {
    page = pdf.addPage(PageSizes.A4);
    y = pageHeight - 42;
    page.drawText(documentNumber + " (continued)", { x: left, y, size: 9, font: bold, color: muted });
    y -= 22;
  };
  const write = (value: unknown, options: { size?: number; strong?: boolean; color?: any; indent?: number } = {}) => {
    const text = safePdfText(value);
    const size = options.size || 9;
    const font = options.strong ? bold : regular;
    const maxWidth = right - left - (options.indent || 0);
    const words = text.split(/\s+/).filter(Boolean);
    let line = "";
    const drawLine = (lineText: string) => {
      if (y < 42) nextPage();
      page.drawText(lineText, { x: left + (options.indent || 0), y, size, font, color: options.color || textColor, maxWidth });
      y -= size + 5;
    };
    for (const word of words) {
      const proposed = line ? line + " " + word : word;
      if (line && font.widthOfTextAtSize(proposed, size) > maxWidth) {
        drawLine(line);
        line = word;
      } else line = proposed;
    }
    if (line) drawLine(line);
  };
  const rule = () => {
    if (y < 55) nextPage();
    page.drawLine({ start: { x: left, y: y + 3 }, end: { x: right, y: y + 3 }, thickness: 0.8, color: brand });
    y -= 11;
  };

  page.drawText(safePdfText(organization?.name || organization?.legal_name || "Business"), {
    x: left, y, size: 18, font: bold, color: brand, maxWidth: right - left,
  });
  y -= 27;
  write(organization?.legal_name || organization?.name || "", { size: 10, strong: true });
  write(organization?.address || "");
  const sellerContact = [organization?.email, organization?.phone].filter(Boolean).join(" | ");
  if (sellerContact) write(sellerContact, { size: 8, color: muted });
  if (organization?.gstin) write("GSTIN: " + organization.gstin, { size: 8, color: muted });
  y -= 5;
  rule();
  write(documentType === "invoice" ? "TAX INVOICE" : "PRICE QUOTATION", { size: 16, strong: true, color: brand });
  write("Document: " + documentNumber, { size: 10, strong: true });
  write("Issue date: " + (record.issue_date || "-") + "    " + (documentType === "invoice" ? "Due date: " : "Valid until: ") + (documentType === "invoice" ? record.due_date || "-" : record.valid_until || "-"), { size: 9, color: muted });
  y -= 4;
  rule();
  write("BILLED TO", { size: 8, strong: true, color: brand });
  write(client?.name || "Customer", { size: 11, strong: true });
  write(client?.address || "");
  if (client?.gstin) write("GSTIN: " + client.gstin, { size: 8, color: muted });
  if (client?.email) write("Email: " + client.email, { size: 8, color: muted });
  y -= 5;
  rule();
  write("ITEMS", { size: 10, strong: true });
  const itemRelation = documentType === "invoice" ? "invoice_items" : "quotation_items";
  const sourceItems = Array.isArray(record[itemRelation]) ? record[itemRelation] : [];
  if (sourceItems.length === 0) write("No line items.", { color: muted });
  for (let index = 0; index < sourceItems.length; index++) {
    const item = sourceItems[index];
    const quantity = Number(item.quantity) || 0;
    const unitPrice = Number(item.unit_price) || 0;
    const gstRate = Number(item.gst_rate) || 0;
    const itemTotal = item.line_total != null ? Number(item.line_total) : quantity * unitPrice * (1 + gstRate / 100);
    write((index + 1) + ". " + (item.description || "Item"), { size: 9, strong: true });
    write("Qty: " + quantity + " | Unit price: " + inr(unitPrice) + " | GST: " + gstRate + "% | Line total: " + inr(itemTotal), { size: 8, color: muted, indent: 12 });
    y -= 2;
  }
  y -= 5;
  rule();
  const discount = Math.max(0, Number(record.subtotal || 0) - Number(record.taxable_amount ?? record.subtotal ?? 0));
  write("Subtotal: " + inr(record.subtotal), { size: 9 });
  write("Discount: " + inr(record.discount_amount ?? discount), { size: 9 });
  write("Taxable value: " + inr(record.taxable_amount ?? record.subtotal), { size: 9 });
  write("CGST: " + inr(record.cgst_total), { size: 9 });
  write("SGST: " + inr(record.sgst_total), { size: 9 });
  write("IGST: " + inr(record.igst_total), { size: 9 });
  write("Total GST: " + inr(record.tax_total ?? (Number(record.cgst_total || 0) + Number(record.sgst_total || 0) + Number(record.igst_total || 0))), { size: 9 });
  y -= 2;
  rule();
  write("GRAND TOTAL: " + inr(record.grand_total), { size: 14, strong: true, color: brand });
  if (documentType === "invoice") {
    write("Amount paid: " + inr(record.amount_paid), { size: 9 });
    write("Balance due: " + inr(record.balance_due), { size: 10, strong: true });
  }
  if (record.notes) {
    y -= 4;
    rule();
    write("Notes", { size: 9, strong: true });
    write(record.notes, { size: 8 });
  }
  y = Math.max(34, y - 14);
  page.drawText("Generated by LedgerFlow. Verify business, tax and payment details before use.", {
    x: left, y, size: 7, font: regular, color: muted, maxWidth: right - left,
  });
  return pdfBase64(await pdf.save());
}

async function sendWithGoogleAppsScript(payload: Record<string, unknown>): Promise<{ ok: boolean; details?: string }> {
  const endpoint = Deno.env.get("GOOGLE_APPS_SCRIPT_URL");
  const sharedSecret = Deno.env.get("GOOGLE_APPS_SCRIPT_SECRET");
  if (!endpoint || !sharedSecret) return { ok: false, details: "Missing GOOGLE_APPS_SCRIPT_URL or GOOGLE_APPS_SCRIPT_SECRET." };
  let parsedEndpoint: URL;
  try { parsedEndpoint = new URL(endpoint); }
  catch { return { ok: false, details: "GOOGLE_APPS_SCRIPT_URL is not a valid URL." }; }
  if (parsedEndpoint.protocol !== "https:" || parsedEndpoint.hostname !== "script.google.com" ||
      !parsedEndpoint.pathname.startsWith("/macros/s/") || !parsedEndpoint.pathname.endsWith("/exec")) {
    return { ok: false, details: "GOOGLE_APPS_SCRIPT_URL must be a deployed Google Apps Script Web App URL ending in /exec." };
  }
  try {
    const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, secret: sharedSecret }) });
    const responseText = (await response.text()).slice(0, 1200);
    let result: any = null;
    try { result = JSON.parse(responseText); } catch { /* Surface a short response excerpt below. */ }
    if (!response.ok || result?.success !== true) return { ok: false, details: String(result?.error || result?.message || responseText || "Google Apps Script did not confirm success.") };
    return { ok: true };
  } catch (error) {
    return { ok: false, details: error instanceof Error ? error.message : "Google Apps Script request failed." };
  }
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
      hsnSac: item.hsn_sac || "",
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
    documentNumber: String((documentType === "invoice" ? row.invoice_number : row.quote_number) || ((documentType === "invoice" ? "INV-" : "QT-") + String(row.id || "").slice(0, 8).toUpperCase())),
    status: titleCase(rawStatus),
    client: {
      name: client.name || "", email: client.email || "", phone: client.phone || "",
      address: client.address || "", gstin: client.gstin || "",
      stateCode: client.state_code || String(client.gstin || "").slice(0, 2),
    },
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

async function sendWithPreferredProvider(payload: Record<string, unknown>): Promise<{ ok: boolean; details?: string }> {
  const apiKey = Deno.env.get("RESEND_API_KEY") || "";
  const from = Deno.env.get("RESEND_FROM_EMAIL") || "";
  if (apiKey || from) {
    if (!apiKey || !from) {
      return { ok: false, details: "Configure both RESEND_API_KEY and RESEND_FROM_EMAIL, or remove both to use Google Apps Script." };
    }
    try {
      const attachments = Array.isArray(payload.attachments)
        ? payload.attachments.map((attachment: any) => ({
            filename: String(attachment?.filename || "document.pdf").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120),
            content: String(attachment?.content || ""),
            content_type: String(attachment?.content_type || "application/pdf"),
          }))
        : [];
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": "Bearer " + apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          from,
          to: [String(payload.to || "")],
          subject: String(payload.subject || ""),
          html: String(payload.htmlBody || ""),
          text: String(payload.body || ""),
          ...(validEmail(payload.replyTo) ? { reply_to: String(payload.replyTo) } : {}),
          ...(attachments.length ? { attachments } : {}),
        }),
      });
      const responseText = (await response.text()).slice(0, 1200);
      let result: any = null;
      try { result = JSON.parse(responseText); } catch { /* Use provider text response below. */ }
      if (!response.ok || !result?.id) {
        return { ok: false, details: String(result?.message || result?.name || responseText || "Resend did not confirm the email.") };
      }
      return { ok: true };
    } catch (error) {
      return { ok: false, details: error instanceof Error ? error.message : "Resend request failed." };
    }
  }
  return sendWithGoogleAppsScript(payload);
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

  // Organization owners/admins manage server-only reminder settings through this
  // authenticated action; the browser never gets direct table access.
  if (action === "get_reminder_settings" || action === "save_reminder_settings") {
    const authorization = req.headers.get("authorization") || "";
    const publishableKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
    if (!authorization || !publishableKey) {
      return respondJson({ error: "Sign in before changing payment reminders." }, 401);
    }
    const caller = createClient(supabaseUrl, publishableKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: authError } = await caller.auth.getUser();
    const user = userData?.user;
    if (authError || !user) return respondJson({ error: "Your session is invalid. Sign in again." }, 401);

    const orgId = String(body?.orgId || "");
    if (!/^[0-9a-f-]{36}$/i.test(orgId)) return respondJson({ error: "Invalid organization." }, 400);

    const { data: membership, error: memberError } = await admin.from("org_members")
      .select("role").eq("org_id", orgId).eq("user_id", user.id).maybeSingle();
    if (memberError || !membership || !["owner", "admin"].includes(String(membership.role || "").toLowerCase())) {
      return respondJson({ error: "Only organization owners or admins can change reminder settings." }, 403);
    }

    if (action === "get_reminder_settings") {
      const { data, error } = await admin.from("organization_reminder_settings")
        .select("enabled,shared_sender_acknowledged,reminder_schedule")
        .eq("org_id", orgId).maybeSingle();
      if (error) return respondJson({ error: "Could not load reminder preferences.", details: error.message }, 500);
      return respondJson({
        success: true,
        settings: {
          enabled: Boolean(data?.enabled),
          sharedSenderAcknowledged: Boolean(data?.shared_sender_acknowledged),
          schedule: data?.reminder_schedule || "3_days_before",
        },
      });
    }

    const enabled = body?.enabled === true;
    const sharedSenderAcknowledged = body?.sharedSenderAcknowledged === true;
    const schedule = String(body?.schedule || "3_days_before");
    if (!["3_days_before", "due_date", "7_days_overdue"].includes(schedule)) {
      return respondJson({ error: "Choose a valid reminder schedule." }, 400);
    }
    if (enabled && !sharedSenderAcknowledged) {
      return respondJson({ error: "Acknowledge the shared sender identity before enabling automated reminders." }, 400);
    }
    const now = new Date().toISOString();
    const { data, error } = await admin.from("organization_reminder_settings").upsert({
      org_id: orgId,
      enabled,
      shared_sender_acknowledged: sharedSenderAcknowledged,
      reminder_schedule: schedule,
      enabled_by: enabled ? user.id : null,
      enabled_at: enabled ? now : null,
      updated_at: now,
    }, { onConflict: "org_id" }).select("enabled,shared_sender_acknowledged,reminder_schedule").single();
    if (error || !data) return respondJson({ error: "Could not save reminder preferences.", details: error?.message || "" }, 500);
    return respondJson({
      success: true,
      settings: {
        enabled: Boolean(data.enabled),
        sharedSenderAcknowledged: Boolean(data.shared_sender_acknowledged),
        schedule: data.reminder_schedule,
      },
    });
  }

  if (action === "manage_order") {
    const authorization = req.headers.get("authorization") || "";
    const publishableKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
    if (!authorization || !publishableKey) return respondJson({ error: "Sign in to manage sales orders." }, 401);

    const caller = createClient(supabaseUrl, publishableKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: authError } = await caller.auth.getUser();
    const user = userData?.user;
    if (authError || !user) return respondJson({ error: "Your session is invalid. Sign in again." }, 401);

    const orgId = String(body?.orgId || "");
    const orderId = String(body?.orderId || "");
    const orderAction = String(body?.orderAction || "");
    const allowedActions = new Set([
      "confirm_stock", "mark_advance_paid", "start_packing", "mark_packed",
      "dispatch", "cancel_order", "generate_invoice",
    ]);
    if (!/^[0-9a-f-]{36}$/i.test(orgId) || !/^[0-9a-f-]{36}$/i.test(orderId) ||
        !allowedActions.has(orderAction)) {
      return respondJson({ error: "Invalid sales-order request." }, 400);
    }

    // Never trust a client-supplied role or org ID. Verify the current user's
    // membership before using the server-only function that performs mutations.
    const { data: membership, error: memberError } = await admin.from("org_members")
      .select("role").eq("org_id", orgId).eq("user_id", user.id).maybeSingle();
    if (memberError || !membership || !["owner", "admin"].includes(String(membership.role || "").toLowerCase())) {
      return respondJson({ error: "Only business owners or admins can manage sales orders." }, 403);
    }

    const carrier = String(body?.carrier || "").trim().slice(0, 120);
    const trackingNumber = String(body?.trackingNumber || "").trim().slice(0, 180);
    const trackingUrl = String(body?.trackingUrl || "").trim().slice(0, 2000);
    if (trackingUrl && !/^https:\/\/[^\s]+$/i.test(trackingUrl)) {
      return respondJson({ error: "Tracking URL must be a valid HTTPS URL." }, 400);
    }

    const { data: result, error: actionError } = await admin.rpc("manage_sales_order_action", {
      p_org_id: orgId,
      p_order_id: orderId,
      p_action: orderAction,
      p_carrier: carrier || null,
      p_tracking_number: trackingNumber || null,
      p_tracking_url: trackingUrl || null,
    });
    if (actionError) {
      console.error("Sales-order action failed:", actionError.message);
      return respondJson({ error: actionError.message || "Sales-order action failed." }, 400);
    }
    if (!result?.success) return respondJson({ error: "The sales-order action was not confirmed." }, 500);
    return respondJson(result);
  }

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
    if (memberError || !membership || !["owner", "admin"].includes(String(membership.role || "").toLowerCase())) {
      return respondJson({ error: "Only business owners or admins can view the saved document signature." }, 403);
    }

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
    if (memberError || !membership || !["owner", "admin"].includes(String(membership.role || "").toLowerCase())) {
      return respondJson({ error: "Only business owners or admins can save document signatures." }, 403);
    }

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
    if (memberError || !membership || !["owner", "admin"].includes(String(membership.role || "").toLowerCase())) {
      return respondJson({ error: "Only business owners or admins can send client documents." }, 403);
    }

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

    // The production app URL is stable; allow PUBLIC_APP_URL to override it,
    // but do not make a missing copy of this public URL disable all email sends.
    const configuredAppBase = String(Deno.env.get("PUBLIC_APP_URL") || "").trim();
    const appBase = (configuredAppBase || "https://ledgerflowhq.vercel.app").replace(/\/+$/, "");
    const scriptUrl = String(Deno.env.get("GOOGLE_APPS_SCRIPT_URL") || "").trim();
    const scriptSecret = String(Deno.env.get("GOOGLE_APPS_SCRIPT_SECRET") || "");
    const missingEmailSettings: string[] = [];
    if (!/^https:\/\//i.test(appBase)) missingEmailSettings.push("PUBLIC_APP_URL (must be an HTTPS URL)");
    if (!scriptUrl) missingEmailSettings.push("GOOGLE_APPS_SCRIPT_URL");
    if (!scriptSecret) missingEmailSettings.push("GOOGLE_APPS_SCRIPT_SECRET");
    if (scriptUrl) {
      try {
        const parsedScriptUrl = new URL(scriptUrl);
        if (parsedScriptUrl.protocol !== "https:" || parsedScriptUrl.hostname !== "script.google.com" ||
            !parsedScriptUrl.pathname.startsWith("/macros/s/") || !parsedScriptUrl.pathname.endsWith("/exec")) {
          missingEmailSettings.push("GOOGLE_APPS_SCRIPT_URL (must be a deployed Google Apps Script Web App URL ending in /exec)");
        }
      } catch {
        missingEmailSettings.push("GOOGLE_APPS_SCRIPT_URL (not a valid URL)");
      }
    }
    if (missingEmailSettings.length > 0) {
      console.error("Quotation email configuration incomplete:", missingEmailSettings.join(", "));
      return respondJson({
        error: "Client email sending is not configured correctly.",
        details: "Fix these Supabase Edge Function secrets: " + missingEmailSettings.join(", "),
        missingSettings: missingEmailSettings,
      }, 503);
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
      .select("name,legal_name,email,phone,bank_name,bank_account_holder,bank_account_no,bank_ifsc,upi_id")
      .eq("id", orgId)
      .maybeSingle();
    const companyName = organization.data?.name || organization.data?.legal_name || "Your supplier";
    let linkedSalesOrder: any = null;
    if (documentType === "invoice" && record.sales_order_id) {
      const { data: linkedOrder } = await admin.from("sales_orders")
        .select("order_number,carrier,tracking_number,tracking_url")
        .eq("id", record.sales_order_id).eq("org_id", orgId).maybeSingle();
      linkedSalesOrder = linkedOrder;
    }
    const paymentDetails = [
      organization.data?.bank_name ? "Bank: " + organization.data.bank_name : "",
      organization.data?.bank_account_holder ? "Account holder: " + organization.data.bank_account_holder : "",
      organization.data?.bank_account_no ? "Account number: " + organization.data.bank_account_no : "",
      organization.data?.bank_ifsc ? "IFSC: " + organization.data.bank_ifsc : "",
      organization.data?.upi_id ? "UPI ID: " + organization.data.upi_id : "",
    ].filter(Boolean);
    const hasUsablePaymentRoute = Boolean(String(organization.data?.upi_id || "").trim()) ||
      Boolean(String(organization.data?.bank_account_no || "").trim() && String(organization.data?.bank_ifsc || "").trim());
    if (documentType === "invoice" && !hasUsablePaymentRoute) {
      await admin.from("document_share_tokens").delete().eq("id", tokenRow.id);
      return respondJson({
        error: "Invoice email was not sent because payment instructions are incomplete.",
        details: "Add a UPI ID or a bank account number plus IFSC code in Settings, then send the invoice again.",
      }, 422);
    }
    const paymentHtml = documentType === "invoice"
      ? "<h3>Payment details</h3>" + (paymentDetails.length ? "<ul>" + paymentDetails.map((item) => "<li>" + escapeHtml(item) + "</li>").join("") + "</ul>" : "<p>Payment details are not configured. Please contact the business before paying.</p>")
      : "";
    const safeTrackingUrl = /^https:\/\//i.test(String(linkedSalesOrder?.tracking_url || ""))
      ? String(linkedSalesOrder.tracking_url)
      : "";
    const trackingText = linkedSalesOrder
      ? "Sales order: " + linkedSalesOrder.order_number +
        (linkedSalesOrder.carrier ? "\nCarrier: " + linkedSalesOrder.carrier : "") +
        (linkedSalesOrder.tracking_number ? "\nTracking number: " + linkedSalesOrder.tracking_number : "") +
        (safeTrackingUrl ? "\nTrack shipment: " + safeTrackingUrl : "")
      : "";
    const trackingHtml = linkedSalesOrder
      ? "<p><strong>Sales order:</strong> " + escapeHtml(linkedSalesOrder.order_number) +
        (linkedSalesOrder.carrier ? "<br><strong>Carrier:</strong> " + escapeHtml(linkedSalesOrder.carrier) : "") +
        (linkedSalesOrder.tracking_number ? "<br><strong>Tracking number:</strong> " + escapeHtml(linkedSalesOrder.tracking_number) : "") +
        (safeTrackingUrl ? "<br><a href=\"" + escapeHtml(safeTrackingUrl) + "\">Track shipment</a>" : "") + "</p>"
      : "";
    const documentNumber = documentType === "invoice" ? (record.invoice_number || "invoice") : (record.quote_number || "quotation");
    const itemsKey = documentType === "invoice" ? "invoice_items" : "quotation_items";
    const itemRows = (record[itemsKey] || []).map((item: any) => {
      const lineTotal = item.line_total != null
        ? Number(item.line_total)
        : (Number(item.quantity) || 0) * (Number(item.unit_price) || 0) * (1 + (Number(item.gst_rate) || 0) / 100);
      return "<tr><td style=\"padding:8px;border-bottom:1px solid #E2E8F0\">" +
        escapeHtml(titleCase(item.description || "Item")) + "</td><td style=\"padding:8px;text-align:right;border-bottom:1px solid #E2E8F0\">" +
        escapeHtml(item.quantity) + "</td><td style=\"padding:8px;text-align:right;border-bottom:1px solid #E2E8F0\">₹" +
        lineTotal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "</td></tr>";
    }).join("");
    const grandTotal = Number(record.grand_total) || 0;
    const amountText = "₹" + grandTotal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const title = documentType === "quotation" ? "Quotation" : "Invoice";
    const intro = documentType === "quotation"
      ? "Please review the quotation and record your decision through the secure page."
      : "Your invoice is ready. Open the secure page to review the details and save a PDF copy.";
    const html = "<div style=\"font-family:Arial,sans-serif;max-width:680px;margin:auto;color:#0F172A\">" +
      "<div style=\"background:#2563EB;color:#fff;padding:20px 24px;border-radius:10px 10px 0 0\"><strong style=\"font-size:20px\">" +
      escapeHtml(companyName) + "</strong><div style=\"font-size:12px;margin-top:6px\">" + escapeHtml(title) + " #" + escapeHtml(documentNumber) + "</div></div>" +
      "<div style=\"border:1px solid #E2E8F0;padding:24px;border-radius:0 0 10px 10px\"><p>Hello " + escapeHtml(titleCase(client.name || "there")) + ",</p><p>" +
      intro + "</p><table style=\"width:100%;border-collapse:collapse;font-size:13px\"><thead><tr><th style=\"text-align:left;padding:8px;background:#EFF6FF\">Item</th><th style=\"text-align:right;padding:8px;background:#EFF6FF\">Qty</th><th style=\"text-align:right;padding:8px;background:#EFF6FF\">Amount</th></tr></thead><tbody>" +
      itemRows + "</tbody></table><p style=\"text-align:right;font-size:18px;font-weight:700\">Total: " + amountText + "</p>" +
      trackingHtml + paymentHtml +
      "<p style=\"margin:24px 0\"><a href=\"" + escapeHtml(link) + "\" style=\"display:inline-block;background:#2563EB;color:white;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:7px\">View " + escapeHtml(title) + (documentType === "quotation" ? " & Respond" : " & Download PDF") + "</a></p>" +
      "<p style=\"color:#64748B;font-size:12px\">This secure link may expire. If you need help, reply to this email.</p>" +
      "<p>Regards,<br>" + escapeHtml(companyName) + "</p>" +
      "<p style=\"color:#64748B;font-size:11px\">This message was sent using LedgerFlow on behalf of " + escapeHtml(companyName) + ".</p></div></div>";
    const textBody = "Hello " + (client.name || "there") + ",\n\n" + intro + "\n" + title + ": " + documentNumber + "\nTotal: " + amountText +
      "\n" + trackingText + "\n" +
      (documentType === "invoice" ? "Payment details:\n" + (paymentDetails.join("\n") || "Not configured; contact the business before paying.") + "\n" : "") +
      "\nOpen: " + link + "\n\nThis message was sent using LedgerFlow on behalf of " + companyName + "."

    const documentPdf = await createDocumentPdf(record, organization.data, documentType, client, documentNumber);
    const emailPayload: Record<string, unknown> = {
      to: recipient,
      subject: title + " " + documentNumber + " from " + companyName,
      htmlBody: html,
      body: textBody,
      attachments: [{ filename: documentNumber + ".pdf", content: documentPdf, content_type: "application/pdf" }],
      // Be transparent about the sender identity: MailApp sends from the
      // Google account that owns the Apps Script, not the business profile email.
      senderName: "LedgerFlow | " + companyName,
    };
    if (validEmail(organization.data?.email)) emailPayload.replyTo = organization.data.email;

    const mailResponse = await sendWithPreferredProvider(emailPayload);
    if (!mailResponse.ok) {
      await admin.from("document_share_tokens").delete().eq("id", tokenRow.id);
      return respondJson({
        error: "Google Apps Script could not send the email. Check its Web App deployment and secret configuration.",
        details: mailResponse.details || "The email request was rejected.",
      }, 502);
    }

    // Only now expire older links: if the provider rejects the email, the previous
    // delivered link remains valid. Keep the just-emailed token active.
    const { error: expireOldLinksError } = await admin.from("document_share_tokens")
      .update({ expires_at: new Date().toISOString() })
      .eq("org_id", orgId)
      .eq("document_type", documentType)
      .eq("document_id", documentId)
      .is("responded_at", null)
      .neq("id", tokenRow.id);
    if (expireOldLinksError) {
      // The email and new token are already live. Do not turn that into a false
      // send failure; log the cleanup problem for server-side investigation.
      console.error("Email accepted, but older document links could not be expired:", expireOldLinksError.message);
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

      let responseTime = new Date().toISOString();
      let salesOrderId: string | null = null;
      let salesOrderNumber: string | null = null;
      let orderStatus = "";
      let stockStatus = "";
      let paymentType = "";

      if (decision === "accepted") {
        // Acceptance creates a sales order and reserves available stock. Tax invoicing
        // is deferred until an owner dispatches the order.
        const { data: orderResult, error: orderError } = await admin.rpc(
          "accept_quotation_create_sales_order",
          { p_token_id: tokenRow.id },
        );
        if (orderError || !orderResult?.success || !orderResult?.salesOrderId) {
          console.error("Sales order creation failed:", orderError?.message || "No sales order was returned.");
          return respondJson({
            error: "Your acceptance could not be completed. No order was confirmed; ask the sender to retry.",
            details: orderError?.message || "The sales-order workflow did not return an order.",
          }, 500);
        }
        responseTime = new Date().toISOString();
        salesOrderId = String(orderResult.salesOrderId);
        salesOrderNumber = String(orderResult.salesOrderNumber || "");
        orderStatus = String(orderResult.orderStatus || "awaiting_stock");
        stockStatus = String(orderResult.stockStatus || "manual_check");
        paymentType = String(orderResult.paymentType || "credit");
      } else {
        const { data: claimedToken, error: claimError } = await admin.from("document_share_tokens")
          .update({ response_status: decision, responded_at: responseTime })
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
      }

      // Send order confirmation after acceptance. No tax invoice or payment request
      // is sent until fulfillment reaches the dispatch stage.
      let orderConfirmationEmailSent = false;
      let orderConfirmationEmailError = "";
      let orderConfirmationRecipient = "";
      if (decision === "accepted" && salesOrderId && salesOrderNumber) {
        try {
          const { data: company } = await admin.from("organizations")
            .select("name,legal_name,email")
            .eq("id", tokenRow.org_id)
            .maybeSingle();
          const companyName = company?.name || company?.legal_name || "Your supplier";
          const recipient = String(tokenRow.recipient_email || quote.clients?.email || "").trim();
          orderConfirmationRecipient = recipient;
          if (!validEmail(recipient)) {
            orderConfirmationEmailError = "The client record does not contain a valid email address.";
          } else {
            const quoteNumber = String(quote.quote_number || quote.id);
            const items = (quote.quotation_items || []).map((item: any) =>
              "• " + String(item.description || "Item") + " × " + String(item.quantity || 0)
            ).join("\n");
            const stockMessage = stockStatus === "reserved"
              ? "Available stock has been reserved for your order."
              : stockStatus === "backorder"
                ? "The order is confirmed; the business is checking availability or restocking before dispatch."
                : "The business will check stock availability before dispatch.";
            const advanceMessage = paymentType === "advance"
              ? "\nThe agreed terms require advance payment. The business will send payment instructions separately."
              : "";
            const subject = "Order confirmed " + salesOrderNumber + " — quotation " + quoteNumber;
            const bodyText = "Hello " + String(quote.clients?.name || "there") + ",\n\n" +
              "Thank you. We recorded your acceptance of quotation " + quoteNumber + ".\n" +
              "Sales order: " + salesOrderNumber + "\nStatus: " + titleCase(orderStatus) + "\n\n" +
              (items ? "Items:\n" + items + "\n\n" : "") +
              stockMessage + advanceMessage + "\n\n" +
              "No tax invoice has been issued at this stage. The business will generate and send the tax invoice once the order is packed and dispatched.\n\n" +
              "Regards,\n" + companyName + "\n\nSent using LedgerFlow on behalf of " + companyName + ".";
            const linkBase = (String(Deno.env.get("PUBLIC_APP_URL") || "https://ledgerflowhq.vercel.app").replace(/\/+$/, ""));
            const link = linkBase + "/client-document?token=" + encodeURIComponent(rawToken);
            const bodyHtml = "<div style=\"font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#0F172A\">" +
              "<div style=\"background:#2563EB;color:#fff;padding:20px 24px\"><strong style=\"font-size:20px\">" +
              escapeHtml(companyName) + "</strong><div style=\"font-size:12px;margin-top:6px\">Order confirmation</div></div>" +
              "<div style=\"border:1px solid #E2E8F0;padding:24px\"><p>Hello " + escapeHtml(titleCase(quote.clients?.name || "there")) + ",</p>" +
              "<p>Thank you. We recorded your acceptance of quotation <strong>" + escapeHtml(quoteNumber) + "</strong>.</p>" +
              "<p style=\"font-size:18px\"><strong>Sales order " + escapeHtml(salesOrderNumber) + "</strong></p>" +
              "<p>Status: " + escapeHtml(titleCase(orderStatus)) + " — " + escapeHtml(stockMessage) + "</p><ul>" +
              (quote.quotation_items || []).map((item: any) => "<li>" + escapeHtml(titleCase(item.description || "Item")) + " × " + escapeHtml(item.quantity || 0) + "</li>").join("") +
              "</ul>" +
              (paymentType === "advance" ? "<p>The agreed terms require advance payment. The business will send payment instructions separately.</p>" : "") +
              "<p>No tax invoice has been issued yet. The tax invoice will be generated and sent after packing and dispatch.</p>" +
              "<p><a href=\"" + escapeHtml(link) + "\">View accepted quotation</a></p>" +
              "<p>Regards,<br>" + escapeHtml(companyName) + "</p><p style=\"font-size:11px;color:#64748B\">Sent using LedgerFlow on behalf of " + escapeHtml(companyName) + ".</p></div></div>";
            const emailPayload: Record<string, unknown> = {
              to: recipient, subject, body: bodyText, htmlBody: bodyHtml,
              senderName: "LedgerFlow | " + companyName,
            };
            if (validEmail(company?.email)) emailPayload.replyTo = company.email;
            const mailResult = await sendWithPreferredProvider(emailPayload);
            orderConfirmationEmailSent = mailResult.ok;
            if (!mailResult.ok) orderConfirmationEmailError = mailResult.details || "The email provider did not accept the order confirmation.";
          }
        } catch (orderEmailError) {
          orderConfirmationEmailError = orderEmailError instanceof Error ? orderEmailError.message : "Order confirmation email failed.";
          console.error("Order confirmation email failed:", orderConfirmationEmailError);
        }
      }

      // Notify the business contact after the decision is committed. A failed notification
      // must never undo the client's recorded decision.
      let ownerNotified = false;
      const { data: business } = await admin.from("organizations")
        .select("name,legal_name,email")
        .eq("id", tokenRow.org_id)
        .maybeSingle();
      const ownerEmail = String(business?.email || "").trim();
      if (validEmail(ownerEmail) && Deno.env.get("GOOGLE_APPS_SCRIPT_URL") && Deno.env.get("GOOGLE_APPS_SCRIPT_SECRET")) {
        try {
          const businessName = business?.name || business?.legal_name || "LedgerFlow business";
          const quoteNumber = quote.quote_number || quote.id;
          const accepted = decision === "accepted";
          const subject = decision === "accepted"
            ? `Quotation ${quoteNumber} accepted — sales order ${salesOrderNumber || ""}`
            : `Quotation ${quoteNumber} was rejected`;
          const message = decision === "accepted"
            ? "The client " + (quote.clients?.name || "customer") + " accepted quotation " + quoteNumber + ". Sales order " + (salesOrderNumber || "") + " is now " + titleCase(orderStatus) + "."
            : "The client " + (quote.clients?.name || "customer") + " rejected quotation " + quoteNumber + " from " + businessName + ".";
          const mailResult = await sendWithPreferredProvider({
            to: ownerEmail,
            subject,
            body: message + String.fromCharCode(10, 10) + "Open LedgerFlow to review the recorded response.",
            htmlBody: "<div><h2>" + escapeHtml(subject) + "</h2><p>" + escapeHtml(message) + "</p><p>Open LedgerFlow to review the recorded response.</p></div>",
            senderName: businessName,
          });
          ownerNotified = mailResult.ok;
          if (!mailResult.ok) console.error("Quotation response was recorded but owner notification failed:", mailResult.details);
        } catch (notificationError) {
          console.error("Quotation response was recorded but owner notification failed:", notificationError);
        }
      }

      return respondJson({
        success: true,
        responseStatus: decision,
        respondedAt: responseTime,
        ownerNotified,
        salesOrderCreated: decision === "accepted" && Boolean(salesOrderId),
        salesOrderId,
        salesOrderNumber,
        orderStatus,
        stockStatus,
        paymentType,
        orderConfirmationEmailSent,
        orderConfirmationRecipient,
        orderConfirmationEmailError: orderConfirmationEmailError || undefined,
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
    const publicDocument = {
      ...mapPublicDocument(tokenRow.document_type, record, organization),
      signatureData: signatureRow?.signature_data || "",
    };

    let linkedInvoiceId: string | null = null;
    let publicSalesOrder: any = null;
    if (tokenRow.document_type === "quotation") {
      const { data: linkedOrder } = await admin.from("sales_orders")
        .select("id,order_number,status,stock_status,payment_type,payment_terms,advance_paid,carrier,tracking_number,tracking_url")
        .eq("org_id", tokenRow.org_id)
        .eq("quotation_id", record.id)
        .maybeSingle();
      if (linkedOrder) {
        publicSalesOrder = linkedOrder;
        const { data: linkedInvoice } = await admin.from("invoices")
          .select("id,invoice_number,status")
          .eq("org_id", tokenRow.org_id)
          .eq("sales_order_id", linkedOrder.id)
          .maybeSingle();
        if (linkedInvoice) {
          linkedInvoiceId = String(linkedInvoice.id);
          publicSalesOrder.invoiceNumber = linkedInvoice.invoice_number;
          publicSalesOrder.invoiceStatus = linkedInvoice.status;
        }
      }
    }

    return respondJson({
      documentType: tokenRow.document_type,
      document: publicDocument,
      organization: {
        name: organization.name || "",
        legal_name: organization.legal_name || organization.name || "",
        gstin: organization.gstin || "",
        state_code: organization.state_code || String(organization.gstin || "").slice(0, 2),
        pan: organization.pan || "",
        email: organization.email || "",
        phone: organization.phone || "",
        address: organization.address || "",
        bank_name: organization.bank_name || "",
        bank_account_holder: organization.bank_account_holder || organization.legal_name || organization.name || "",
        bank_account_no: organization.bank_account_no || "",
        bank_ifsc: organization.bank_ifsc || "",
        upi_id: organization.upi_id || "",
        default_payment_terms_days: organization.default_payment_terms_days || 15,
      },
      responseStatus: tokenRow.response_status || "",
      salesOrder: publicSalesOrder,
      invoiceGenerated: Boolean(linkedInvoiceId),
      invoiceId: linkedInvoiceId,
    });
  }

  return respondJson({ error: "Unsupported action." }, 400);
});
