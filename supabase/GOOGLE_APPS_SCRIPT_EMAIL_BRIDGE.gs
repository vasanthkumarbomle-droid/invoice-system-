/**
 * LedgerFlow email bridge for Google Apps Script.
 *
 * ADD this to your EXISTING invoice-reminder Apps Script project so that the
 * existing previewinvoicereminders/runinvoicereminders functions and trigger
 * remain untouched. If that project already has a doPost(e), merge this logic
 * into the existing doPost instead of defining a second one.
 *
 * Required Script Property:
 *   LEDGERFLOW_WEBHOOK_SECRET = the same high-entropy secret configured as
 *   GOOGLE_APPS_SCRIPT_SECRET in Supabase Edge Function secrets.
 */

function doPost(e) {
  try {
    var rawBody = e && e.postData && e.postData.contents;
    if (!rawBody) return ledgerFlowJson_({ success: false, error: "Missing JSON request body." });

    var request;
    try {
      request = JSON.parse(rawBody);
    } catch (_parseError) {
      return ledgerFlowJson_({ success: false, error: "Request body must be valid JSON." });
    }

    var expectedSecret = PropertiesService.getScriptProperties().getProperty("LEDGERFLOW_WEBHOOK_SECRET");
    var suppliedSecret = String(request.secret || "");
    if (!expectedSecret || !suppliedSecret || suppliedSecret !== expectedSecret) {
      return ledgerFlowJson_({ success: false, error: "Unauthorized request." });
    }

    var to = String(request.to || "").trim();
    var subject = String(request.subject || "").trim();
    var body = String(request.body || "");
    var htmlBody = String(request.htmlBody || "");
    var senderName = String(request.senderName || "LedgerFlow").replace(/[\r\n]/g, " ").trim().slice(0, 120);
    var replyTo = String(request.replyTo || "").trim();
    var validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to);

    if (!validEmail) return ledgerFlowJson_({ success: false, error: "Recipient email is invalid." });
    if (!subject || subject.length > 200) return ledgerFlowJson_({ success: false, error: "Email subject is missing or too long." });
    if (!body && !htmlBody) return ledgerFlowJson_({ success: false, error: "Email body is empty." });
    if (body.length > 50000 || htmlBody.length > 100000) {
      return ledgerFlowJson_({ success: false, error: "Email body is too large." });
    }

    var message = {
      to: to,
      subject: subject,
      body: body || "Please view this message in an HTML-capable email client.",
      name: senderName || "LedgerFlow"
    };
    if (htmlBody) message.htmlBody = htmlBody;
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(replyTo)) message.replyTo = replyTo;

    MailApp.sendEmail(message);
    return ledgerFlowJson_({ success: true });
  } catch (error) {
    console.error("LedgerFlow email bridge failed: " + String(error && error.message || error));
    return ledgerFlowJson_({ success: false, error: "Email sending failed. Check Apps Script executions and Mail service permissions." });
  }
}

function ledgerFlowJson_(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
