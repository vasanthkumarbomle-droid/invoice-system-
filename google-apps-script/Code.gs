/** LedgerFlow invoice reminders via the current user's Google account.
 * Configure Script Properties before running. Do not share this script project
 * with anyone who should not be able to trigger customer emails.
 */
function ledgerFlowReminderConfig_() {
  const props = PropertiesService.getScriptProperties();
  const functionUrl = props.getProperty('LEDGERFLOW_REMINDER_FUNCTION_URL');
  const secret = props.getProperty('LEDGERFLOW_REMINDER_CRON_SECRET');
  if (!functionUrl || !secret) {
    throw new Error('Set LEDGERFLOW_REMINDER_FUNCTION_URL and LEDGERFLOW_REMINDER_CRON_SECRET in Project Settings > Script Properties.');
  }
  return { functionUrl: functionUrl, secret: secret };
}

function ledgerFlowCallFunction_(payload) {
  const config = ledgerFlowReminderConfig_();
  const response = UrlFetchApp.fetch(config.functionUrl, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-cron-secret': config.secret },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
  const status = response.getResponseCode();
  const text = response.getContentText();
  let data;
  try { data = JSON.parse(text); } catch (e) { throw new Error('Reminder endpoint returned non-JSON (HTTP ' + status + ').'); }
  if (status < 200 || status >= 300 || data.error) {
    throw new Error(data.error || ('Reminder endpoint returned HTTP ' + status));
  }
  return data;
}

/** Safe preview: lists candidate invoice numbers in the execution log; sends no email. */
function previewInvoiceReminders() {
  const result = ledgerFlowCallFunction_({ action: 'pending' });
  const candidates = result.candidates || [];
  Logger.log('India date: ' + result.date + '; candidate count: ' + candidates.length + '; skipped: ' + result.skipped);
  candidates.forEach(function (item) {
    Logger.log(item.reminder_type + ' | ' + item.invoice_number + ' | due ' + item.due_date + ' | days until due: ' + item.days_until_due);
  });
  return result;
}

function ledgerFlowEscapeHtml_(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
  });
}

function ledgerFlowMoney_(value) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(value) || 0);
}

function ledgerFlowDate_(value) {
  const date = new Date(String(value).slice(0, 10) + 'T00:00:00Z');
  if (isNaN(date.getTime())) return String(value || '');
  return Utilities.formatDate(date, 'Asia/Kolkata', 'dd MMM yyyy');
}

function ledgerFlowEmail_(item) {
  const org = item.organization || {};
  const client = item.client_name || 'Customer';
  const invoiceNo = item.invoice_number || item.invoice_id;
  const dueDate = ledgerFlowDate_(item.due_date);
  const balance = ledgerFlowMoney_(item.balance_due);
  const total = ledgerFlowMoney_(item.grand_total);
  const days = Number(item.days_until_due);
  const isDueSoon = item.reminder_type === 'due_soon';
  const subject = isDueSoon
    ? 'Payment reminder: invoice ' + invoiceNo + ' is due in ' + days + (days === 1 ? ' day' : ' days')
    : 'Payment overdue: invoice ' + invoiceNo;
  const lead = isDueSoon
    ? 'This is a courteous reminder that the invoice below is due in ' + days + (days === 1 ? ' day.' : ' days.')
    : 'Our records show that the invoice below is overdue by ' + Math.abs(days) + (Math.abs(days) === 1 ? ' day.' : ' days.');
  const company = org.legal_name || org.name || 'Accounts Team';
  const e = ledgerFlowEscapeHtml_;
  const htmlBody = '<!doctype html><html><head><meta charset="utf-8"></head>' +
    '<body style="margin:0;background:#f3f6f3;font-family:Arial,Helvetica,sans-serif;color:#252b27">' +
    '<div style="max-width:640px;margin:24px auto;background:#fff;border:1px solid #e2e9e2;border-radius:12px;overflow:hidden">' +
    '<div style="background:#286747;padding:22px 28px;color:#fff"><div style="font-size:12px;letter-spacing:1.4px;text-transform:uppercase">LedgerFlow · Accounts</div>' +
    '<div style="font-size:22px;font-weight:700;margin-top:7px">Payment ' + (isDueSoon ? 'reminder' : 'follow-up') + '</div></div>' +
    '<div style="padding:28px"><p>Dear ' + e(client) + ',</p><p style="line-height:1.65">' + e(lead) + ' Please review the details below and arrange payment for the outstanding balance.</p>' +
    '<table role="presentation" style="width:100%;border-collapse:collapse;border:1px solid #e2e9e2"><tr><td style="padding:12px;background:#f5f8f5;width:42%">Invoice number</td><td style="padding:12px;font-weight:700">' + e(invoiceNo) + '</td></tr>' +
    '<tr><td style="padding:12px;border-top:1px solid #e2e9e2;background:#f5f8f5">Due date</td><td style="padding:12px;border-top:1px solid #e2e9e2">' + e(dueDate) + '</td></tr>' +
    '<tr><td style="padding:12px;border-top:1px solid #e2e9e2;background:#f5f8f5">Invoice total</td><td style="padding:12px;border-top:1px solid #e2e9e2">' + e(total) + '</td></tr>' +
    '<tr><td style="padding:12px;border-top:1px solid #e2e9e2;background:#f5f8f5">Outstanding balance</td><td style="padding:12px;border-top:1px solid #e2e9e2;color:#286747;font-size:18px;font-weight:700">' + e(balance) + '</td></tr></table>' +
    '<p style="line-height:1.65;margin-top:22px">If you have already made this payment, please disregard this reminder and reply with the payment reference so we can update our records.</p>' +
    '<p style="line-height:1.6;margin-top:22px">Kind regards,<br><strong>' + e(company) + '</strong>' + (org.phone ? '<br>' + e(org.phone) : '') + (org.email ? '<br>' + e(org.email) : '') + '</p></div>' +
    '<div style="padding:14px 28px;background:#f5f8f5;color:#687269;font-size:11px;line-height:1.5">Automated accounts reminder for an outstanding invoice. Please contact the sender if this does not match your records.</div></div></body></html>';
  const body = 'Dear ' + client + ',\n\n' + lead + ' Please arrange payment for the outstanding balance.\n\nInvoice: ' + invoiceNo + '\nDue date: ' + dueDate + '\nInvoice total: ' + total + '\nOutstanding balance: ' + balance + '\n\nIf already paid, please disregard this reminder and reply with the payment reference.\n\nKind regards,\n' + company + (org.phone ? '\n' + org.phone : '') + (org.email ? '\n' + org.email : '');
  return { subject: subject, body: body, htmlBody: htmlBody, replyTo: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(org.email || '')) ? org.email : undefined };
}

/** Sends reminders, then asks the server to log each successful send. */
function runInvoiceReminders() {
  const result = ledgerFlowCallFunction_({ action: 'pending' });
  const candidates = result.candidates || [];
  let remaining = MailApp.getRemainingDailyQuota();
  let sent = 0;
  let failed = 0;
  Logger.log('India date: ' + result.date + '; candidates: ' + candidates.length + '; mail quota remaining: ' + remaining);

  for (let i = 0; i < candidates.length; i++) {
    if (remaining <= 0) {
      Logger.log('Daily recipient quota reached; remaining candidates will be retried on a later run if still eligible.');
      break;
    }
    const item = candidates[i];
    try {
      const mail = ledgerFlowEmail_(item);
      const message = {
        to: item.recipient_email,
        subject: mail.subject,
        body: mail.body,
        htmlBody: mail.htmlBody,
        name: 'LedgerFlow Billing',
      };
      if (mail.replyTo) message.replyTo = mail.replyTo;
      MailApp.sendEmail(message);
      remaining--;

      // Log only after MailApp returns successfully.
      ledgerFlowCallFunction_({
        action: 'log_sent',
        invoice_id: item.invoice_id,
        reminder_type: item.reminder_type,
        reference_date: item.reference_date,
        recipient_email: item.recipient_email,
      });
      sent++;
      Logger.log('Sent and logged: ' + item.invoice_number + ' (' + item.reminder_type + ')');
    } catch (err) {
      failed++;
      Logger.log('Failed for invoice ' + (item.invoice_number || item.invoice_id) + ': ' + String(err && err.message || err));
    }
  }
  Logger.log('Reminder run finished. sent/logged=' + sent + ', failed=' + failed + ', candidates=' + candidates.length);
}

/** Run once to install a daily trigger. Project timezone must be Asia/Kolkata. */
function installDailyReminderTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'runInvoiceReminders') ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger('runInvoiceReminders').timeBased().everyDays(1).atHour(9).create();
  Logger.log('Daily reminder trigger installed for approximately 9 AM in the project timezone.');
}
