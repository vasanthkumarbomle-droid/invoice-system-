import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DAY_MS = 24 * 60 * 60 * 1000;
const EXCLUDED_STATUSES = new Set(["draft", "cancelled", "paid"]);

type InvoiceRow = {
  id: string;
  org_id: string;
  invoice_number: string | null;
  due_date: string;
  grand_total: number | string | null;
  amount_paid: number | string | null;
  balance_due: number | string | null;
  status: string;
  clients: { name?: string | null; email?: string | null } | null;
};

type OrganizationRow = {
  id: string;
  name: string | null;
  legal_name: string | null;
  email: string | null;
  phone: string | null;
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store, max-age=0",
      "Pragma": "no-cache",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function todayInIndia(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function daysUntilDue(today: string, dueDate: string): number {
  const todayMs = new Date(`${today.slice(0, 10)}T00:00:00Z`).getTime();
  const dueMs = new Date(`${dueDate.slice(0, 10)}T00:00:00Z`).getTime();
  return Math.round((dueMs - todayMs) / DAY_MS);
}

function validEmail(value: unknown): value is string {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Use POST." }, 405);
  }

  const cronSecret = Deno.env.get("INVOICE_REMINDER_CRON_SECRET");
  if (!cronSecret || req.headers.get("x-cron-secret") !== cronSecret) {
    return jsonResponse({ error: "Unauthorized." }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Missing Supabase server configuration." }, 500);
  }

  const body = await req.json().catch(() => ({}));
  const action = body?.action;
  if (action !== "pending" && action !== "log_sent") {
    return jsonResponse({ error: "Unsupported action. Use pending or log_sent." }, 400);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const today = todayInIndia();
  const nowMs = Date.now();

  if (action === "pending") {
    // Fail closed: only companies that opted in AND acknowledged the shared Gmail sender qualify.
    const { data: enabledRows, error: settingsError } = await supabase
      .from("organization_reminder_settings")
      .select("org_id")
      .eq("enabled", true)
      .eq("shared_sender_acknowledged", true);

    if (settingsError) {
      return jsonResponse({
        error: "Could not load reminder settings.",
        details: settingsError.message,
      }, 500);
    }

    const enabledOrgIds = [...new Set(
      (enabledRows ?? []).map((row) => String(row.org_id)),
    )];

    if (enabledOrgIds.length === 0) {
      return jsonResponse({
        success: true,
        date: today,
        candidates: [],
        skipped: 0,
        organizations_enabled: 0,
      });
    }

    const { data: rawInvoices, error: invoiceError } = await supabase
      .from("invoices")
      .select("id,org_id,invoice_number,due_date,grand_total,amount_paid,balance_due,status,clients(name,email)")
      .in("org_id", enabledOrgIds)
      .gt("balance_due", 0)
      .not("due_date", "is", null);

    if (invoiceError) {
      return jsonResponse({
        error: "Could not load invoices.",
        details: invoiceError.message,
      }, 500);
    }

    const invoices = (rawInvoices ?? []) as InvoiceRow[];
    const invoiceOrgIds = [...new Set(invoices.map((invoice) => invoice.org_id))];
    const organizationsById = new Map<string, OrganizationRow>();

    if (invoiceOrgIds.length > 0) {
      const { data: orgRows, error: orgError } = await supabase
        .from("organizations")
        .select("id,name,legal_name,email,phone")
        .in("id", invoiceOrgIds);

      if (orgError) {
        return jsonResponse({
          error: "Could not load organization details.",
          details: orgError.message,
        }, 500);
      }

      for (const organization of (orgRows ?? []) as OrganizationRow[]) {
        organizationsById.set(organization.id, organization);
      }
    }

    const candidates: Array<Record<string, unknown>> = [];
    let skipped = 0;

    for (const invoice of invoices) {
      const status = String(invoice.status || "").toLowerCase();
      const balance = Number(invoice.balance_due) || 0;

      if (EXCLUDED_STATUSES.has(status) || balance <= 0 || !invoice.due_date) {
        skipped++;
        continue;
      }

      const due = invoice.due_date.slice(0, 10);
      const days = daysUntilDue(today, due);
      let reminderType: "due_soon" | "overdue" | null = null;
      let referenceDate = today;

      if (days >= 1 && days <= 3) {
        reminderType = "due_soon";
        referenceDate = due;
      } else if (days < 0) {
        reminderType = "overdue";
        referenceDate = today;
      } else {
        skipped++;
        continue;
      }

      const recipient = invoice.clients?.email?.trim();
      if (!validEmail(recipient)) {
        skipped++;
        continue;
      }

      const { data: sameReminder, error: sameReminderError } = await supabase
        .from("invoice_reminder_log")
        .select("id")
        .eq("org_id", invoice.org_id)
        .eq("invoice_id", invoice.id)
        .eq("reminder_type", reminderType)
        .eq("reference_date", referenceDate)
        .maybeSingle();

      if (sameReminderError) {
        return jsonResponse({
          error: "Could not read reminder history. Verify invoice_reminder_log migration.",
          details: sameReminderError.message,
        }, 500);
      }

      if (sameReminder) {
        skipped++;
        continue;
      }

      if (reminderType === "overdue") {
        const { data: recentRows, error: recentError } = await supabase
          .from("invoice_reminder_log")
          .select("sent_at")
          .eq("org_id", invoice.org_id)
          .eq("invoice_id", invoice.id)
          .eq("reminder_type", "overdue")
          .order("sent_at", { ascending: false })
          .limit(1);

        if (recentError) {
          return jsonResponse({
            error: "Could not check overdue reminder throttle.",
            details: recentError.message,
          }, 500);
        }

        const lastSent = recentRows?.[0]?.sent_at
          ? new Date(recentRows[0].sent_at).getTime()
          : 0;

        if (lastSent && nowMs - lastSent < 7 * DAY_MS) {
          skipped++;
          continue;
        }
      }

      const organization = organizationsById.get(invoice.org_id);
      if (!organization) {
        skipped++;
        continue;
      }

      candidates.push({
        invoice_id: invoice.id,
        org_id: invoice.org_id,
        invoice_number: invoice.invoice_number || invoice.id.slice(0, 8).toUpperCase(),
        due_date: due,
        grand_total: Number(invoice.grand_total) || 0,
        amount_paid: Number(invoice.amount_paid) || 0,
        balance_due: balance,
        status,
        recipient_email: recipient,
        client_name: invoice.clients?.name || "Customer",
        organization: {
          name: organization.name || "",
          legal_name: organization.legal_name || "",
          email: organization.email || "",
          phone: organization.phone || "",
        },
        reminder_type: reminderType,
        days_until_due: days,
        reference_date: referenceDate,
      });
    }

    return jsonResponse({
      success: true,
      date: today,
      candidates,
      skipped,
      organizations_enabled: enabledOrgIds.length,
    });
  }

  // Apps Script calls this only after MailApp.sendEmail completes successfully.
  const invoiceId = String(body?.invoice_id || "");
  const reminderType = body?.reminder_type;
  const referenceDate = String(body?.reference_date || "").slice(0, 10);
  const recipientEmail = String(body?.recipient_email || "").trim();

  if (
    !invoiceId ||
    !["due_soon", "overdue"].includes(reminderType) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(referenceDate) ||
    !validEmail(recipientEmail)
  ) {
    return jsonResponse({ error: "Invalid log_sent payload." }, 400);
  }

  const { data: invoice, error: loadError } = await supabase
    .from("invoices")
    .select("id,org_id,due_date,balance_due,status,clients(email)")
    .eq("id", invoiceId)
    .maybeSingle();

  if (loadError) {
    return jsonResponse({
      error: "Could not revalidate invoice.",
      details: loadError.message,
    }, 500);
  }
  if (!invoice) return jsonResponse({ error: "Invoice not found." }, 404);

  // Re-check opt-in immediately before accepting the send log.
  const { data: activeReminderSetting, error: activeSettingsError } = await supabase
    .from("organization_reminder_settings")
    .select("org_id")
    .eq("org_id", invoice.org_id)
    .eq("enabled", true)
    .eq("shared_sender_acknowledged", true)
    .maybeSingle();

  if (activeSettingsError) {
    return jsonResponse({ error: "Could not verify organization reminder settings." }, 500);
  }
  if (!activeReminderSetting) {
    return jsonResponse({ error: "Reminders are not enabled for this organization." }, 409);
  }

  if (
    EXCLUDED_STATUSES.has(String(invoice.status || "").toLowerCase()) ||
    Number(invoice.balance_due) <= 0
  ) {
    return jsonResponse({ error: "Invoice is no longer eligible for reminders." }, 409);
  }

  const actualEmail = String(invoice.clients?.email || "").trim().toLowerCase();
  if (!actualEmail || actualEmail !== recipientEmail.toLowerCase()) {
    return jsonResponse({
      error: "Recipient does not match the invoice client's current email.",
    }, 403);
  }

  const due = String(invoice.due_date).slice(0, 10);
  const days = daysUntilDue(today, due);

  if (reminderType === "due_soon" && (!(days >= 1 && days <= 3) || referenceDate !== due)) {
    return jsonResponse({ error: "Invoice is not in the upcoming-due reminder window." }, 409);
  }
  if (reminderType === "overdue" && (!(days < 0) || referenceDate !== today)) {
    return jsonResponse({ error: "Invoice is not currently overdue." }, 409);
  }

  const { data: existing, error: existingError } = await supabase
    .from("invoice_reminder_log")
    .select("id")
    .eq("org_id", invoice.org_id)
    .eq("invoice_id", invoiceId)
    .eq("reminder_type", reminderType)
    .eq("reference_date", referenceDate)
    .maybeSingle();

  if (existingError) {
    return jsonResponse({ error: "Could not check reminder history.", details: existingError.message }, 500);
  }
  if (existing) return jsonResponse({ success: true, duplicate: true });

  if (reminderType === "overdue") {
    const { data: recentRows, error: recentError } = await supabase
      .from("invoice_reminder_log")
      .select("sent_at")
      .eq("org_id", invoice.org_id)
      .eq("invoice_id", invoiceId)
      .eq("reminder_type", "overdue")
      .order("sent_at", { ascending: false })
      .limit(1);

    if (recentError) {
      return jsonResponse({ error: "Could not check overdue reminder throttle.", details: recentError.message }, 500);
    }

    const lastSent = recentRows?.[0]?.sent_at
      ? new Date(recentRows[0].sent_at).getTime()
      : 0;

    if (lastSent && nowMs - lastSent < 7 * DAY_MS) {
      return jsonResponse({ success: true, throttled: true });
    }
  }

  const { error: insertError } = await supabase.from("invoice_reminder_log").insert({
    org_id: invoice.org_id,
    invoice_id: invoiceId,
    reminder_type: reminderType,
    reference_date: referenceDate,
    recipient_email: recipientEmail,
    provider_message_id: "google-apps-script-mailapp",
  });

  if (insertError) {
    if (insertError.code === "23505") return jsonResponse({ success: true, duplicate: true });
    return jsonResponse({
      error: "Email was sent but the reminder log could not be saved.",
      details: insertError.message,
    }, 500);
  }

  return jsonResponse({ success: true, logged: true });
});
