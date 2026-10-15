/**
 * Mail Merge for Google Sheets (YAMM-style)
 * Sheet layout: row 1 = headers. Needs a "Recipient" (or "Email") column.
 * Optional columns: Cc, Bcc, Attachment (Drive links, comma-separated), Unsubscribed (any value = skip)
 * Script adds: "Merge status" and "Sent at".
 */

const STATUS_HEADER = 'Merge status';
const SENT_HEADER = 'Sent at';
const RECIPIENT_HEADERS = ['recipient', 'email', 'email address', 'e-mail'];
const MAX_RUNTIME_MS = 5 * 60 * 1000; // Apps Script hard limit is 6 min
const EMAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]{2,}$/;
const COLORS = { sent: '#d9ead3', error: '#f4cccc', invalid: '#fce5cd', bounced: '#ea9999', replied: '#cfe2f3', skipped: '#efefef' };

const PROP_SHEET_ID = 'mmSheetId';
/* Add-ons may not run time-driven triggers more than once an hour, so an
 * unfinished scheduled merge resumes on that cadence rather than every minute. */
const CONTINUE_DELAY_MS = 60 * 60 * 1000;

/**
 * Background runs have no active spreadsheet, so they resolve the document by
 * the id stashed when the merge was scheduled. (Opening by id is also why the
 * manifest asks for the full spreadsheets scope rather than currentonly.)
 */
function getSpreadsheet_() {
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) {
    PropertiesService.getDocumentProperties().setProperty(PROP_SHEET_ID, active.getId());
    return active;
  }
  const id = PropertiesService.getDocumentProperties().getProperty(PROP_SHEET_ID);
  if (!id) throw new Error('Open the add-on from the spreadsheet you want to merge.');
  return SpreadsheetApp.openById(id);
}

function writeStatus_(sheet, r, statusCol, text, color) {
  sheet.getRange(r + 2, statusCol + 1).setValue(text).setBackground(color);
}
function setProgress_(done, total) {
  CacheService.getScriptCache().put('progress', JSON.stringify({ done: done, total: total }), 600);
}
function clearProgress_() { CacheService.getScriptCache().remove('progress'); }
function getProgress() {
  const v = CacheService.getScriptCache().get('progress');
  return v ? JSON.parse(v) : null;
}

/* ---------------- Menu / UI ---------------- */

function onInstall() {
  onOpen();
}

/**
 * Populates the Extensions menu. Marketplace review checks that both onInstall
 * and onOpen do this, and require createAddonMenu — createMenu builds a
 * top-level menu that only works while the add-on is unpublished, and it moves
 * under Extensions the moment you publish.
 *
 * A published add-on runs this in AuthMode.NONE/LIMITED, where only menu
 * building is permitted. Touching Properties, Gmail, Drive or the spreadsheet
 * here fails and silently takes the whole menu with it.
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createAddonMenu()
    .addItem('Open Simple Mail Merge', 'showMergeDialog')
    .addItem('Open in sidebar instead', 'showSidebar')
    .addItem('Check replies & bounces', 'checkRepliesAndBounces')
    .addItem('Cancel scheduled send', 'cancelScheduled')
    .addToUi();
}

/**
 * The main UI: a centred modal. The React app is built from ui/ into
 * src/Dialog.html by `npm run build` and pushed by clasp.
 */
function showMergeDialog() {
  const html = HtmlService.createHtmlOutputFromFile('Dialog')
    .setWidth(780)
    .setHeight(660);
  SpreadsheetApp.getUi().showModalDialog(html, 'Simple Mail Merge');
}

/** Older plain-HTML sidebar. Kept as a fallback; the dialog is the main view. */
function showSidebar() {
  const html = HtmlService.createHtmlOutputFromFile('Sidebar').setTitle('Simple Mail Merge');
  SpreadsheetApp.getUi().showSidebar(html);
}

function getSidebarData() {
  const sheet = SpreadsheetApp.getActiveSheet();
  const lastCol = Math.max(1, sheet.getLastColumn());
  const headers = sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0].filter(String);
  const subjects = [...new Set(GmailApp.getDrafts().map(d => d.getMessage().getSubject()))].filter(String);
  const scheduled = PropertiesService.getDocumentProperties().getProperty('scheduledAt');
  return {
    sheet: sheet.getName(),
    headers: headers,
    drafts: subjects,
    aliases: GmailApp.getAliases(),
    quota: MailApp.getRemainingDailyQuota(),
    rows: Math.max(0, sheet.getLastRow() - 1),
    scheduledAt: scheduled ? Number(scheduled) : null,
    stats: getStats_(sheet)
  };
}

/* ---------------- Entry points from sidebar ---------------- */

function sendMerge(opts) {
  return runMerge_(getSpreadsheet_().getActiveSheet(), opts);
}

function sendTest(opts) {
  opts.test = true;
  return runMerge_(getSpreadsheet_().getActiveSheet(), opts);
}

function scheduleMerge(opts, whenMs) {
  if (whenMs <= Date.now()) throw new Error('Pick a time in the future.');
  getTemplate_(opts.subject);                 // fail early if the draft is missing
  const ss = getSpreadsheet_();               // also stashes the id the trigger needs
  const props = PropertiesService.getDocumentProperties();
  opts.sheetName = ss.getActiveSheet().getName();
  clearTriggers_();
  props.setProperty('scheduledOpts', JSON.stringify(opts));
  props.setProperty('scheduledAt', String(whenMs));
  ScriptApp.newTrigger('runScheduled_').timeBased().at(new Date(whenMs)).create();
  return 'Scheduled for ' + new Date(whenMs).toLocaleString() +
    '. Google can run it up to 15 minutes late.';
}

function cancelScheduled() {
  clearTriggers_();
  const props = PropertiesService.getDocumentProperties();
  props.deleteProperty('scheduledOpts');
  props.deleteProperty('scheduledAt');
  clearProgress_();
  const ss = SpreadsheetApp.getActive();
  if (ss) ss.toast('Scheduled send cancelled.');
  return 'Cancelled.';
}

function runScheduled_() {
  const props = PropertiesService.getDocumentProperties();
  const raw = props.getProperty('scheduledOpts');
  if (!raw) return;

  const opts = JSON.parse(raw);
  const sheet = getSpreadsheet_().getSheetByName(opts.sheetName);
  if (!sheet) {
    props.deleteProperty('scheduledOpts');
    props.deleteProperty('scheduledAt');
    return;
  }

  clearTriggers_();
  const res = runMerge_(sheet, opts);

  if (res.remaining > 0 && MailApp.getRemainingDailyQuota() > 0) {
    // Pick up the rest on the next allowed tick (add-ons are capped at hourly).
    ScriptApp.newTrigger('runScheduled_').timeBased().after(CONTINUE_DELAY_MS).create();
  } else {
    props.deleteProperty('scheduledOpts');
    props.deleteProperty('scheduledAt');
    emailSummary_(sheet, res, opts);
  }
}

/**
 * Background merges finish while nobody is watching the sidebar, so the sender
 * gets the result by email instead.
 */
function emailSummary_(sheet, res, opts) {
  try {
    const lines = [
      'Your scheduled mail merge finished.',
      '',
      'Sheet: ' + sheet.getName(),
      'Template: ' + opts.subject,
      '',
      'Sent: ' + res.sent,
      'Errors: ' + res.errors,
      'Invalid addresses: ' + (res.invalid || 0),
      'Skipped: ' + res.skipped
    ];
    if (res.remaining) lines.push('', 'Still to send: ' + res.remaining + ' — continues automatically.');
    if (res.problems && res.problems.length) lines.push('', 'First problems:', res.problems.join('\n'));

    GmailApp.sendEmail(
      Session.getEffectiveUser().getEmail(),
      'Mail merge finished — ' + res.sent + ' sent',
      lines.join('\n')
    );
  } catch (e) {
    // A failed summary must never break the merge itself.
  }
}

function clearTriggers_() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'runScheduled_')
    .forEach(t => ScriptApp.deleteTrigger(t));
}

/* ---------------- Core merge ---------------- */

/**
 * Resolves the template and every column the merge needs. Shared by the
 * preview the sender confirms and the send itself, so both agree on exactly
 * who gets what.
 */
function prepare_(sheet, opts) {
  const tpl = getTemplate_(opts.subject);
  const ctx = readSheet_(sheet);
  validatePlaceholders_(tpl, ctx.map);

  const recCol = RECIPIENT_HEADERS.map(h => ctx.map[h]).find(i => i !== undefined);
  if (recCol === undefined) throw new Error('No recipient column found. Add a header named "Recipient" or "Email".');

  return {
    tpl: tpl,
    ctx: ctx,
    recCol: recCol,
    statusCol: ctx.map[STATUS_HEADER.toLowerCase()],
    sentCol: ctx.map[SENT_HEADER.toLowerCase()],
    ccCol: ctx.map['cc'],
    bccCol: ctx.map['bcc'],
    attCol: ctx.map['attachment'],
    unsubCol: ctx.map['unsubscribed']
  };
}

function rowObject_(ctx, row) {
  const o = {};
  ctx.headers.forEach((h, i) => { if (h) o[h.toLowerCase()] = row[i]; });
  return o;
}

/**
 * Rows split into what will be sent, and why everything else won't be.
 * The Marketplace policy on sending mail on a user's behalf requires the
 * sender to confirm the content AND the intended recipients before anything
 * is sent, so this is what the sidebar shows them.
 */
function previewMerge(opts) {
  const sheet = getSpreadsheet_().getActiveSheet();
  const p = prepare_(sheet, opts);

  const pending = [], alreadyDone = [], unsubscribed = [], invalid = [];
  p.ctx.values.forEach((row, r) => {
    const to = String(row[p.recCol]).trim();
    if (!to) return;
    if (/^(sent|replied|bounced)/i.test(row[p.statusCol])) { alreadyDone.push(to); return; }
    if (p.unsubCol !== undefined && String(row[p.unsubCol]).trim()) { unsubscribed.push(to); return; }
    if (!EMAIL_RE.test(to)) { invalid.push({ row: r + 2, to: to }); return; }
    pending.push({ row: r + 2, to: to, index: r });
  });

  let sample = null;
  if (pending.length) {
    const rowObj = rowObject_(p.ctx, p.ctx.values[pending[0].index]);
    sample = {
      to: pending[0].to,
      subject: fill_(p.tpl.message.subject, rowObj, false),
      body: fill_(p.tpl.message.text, rowObj, false)
    };
  }

  return {
    pending: pending.length,
    recipients: pending.slice(0, 25).map(x => x.to),
    moreRecipients: Math.max(0, pending.length - 25),
    alreadyDone: alreadyDone.length,
    unsubscribed: unsubscribed.length,
    invalid: invalid.slice(0, 25),
    invalidCount: invalid.length,
    sample: sample,
    quota: MailApp.getRemainingDailyQuota(),
    attachments: p.tpl.attachments.map(a => a.getName()),
    inlineImageCount: Object.keys(p.tpl.inlineImages).length
  };
}

function runMerge_(sheet, opts) {
  const start = Date.now();
  const p = prepare_(sheet, opts);
  const tpl = p.tpl, ctx = p.ctx;
  const recCol = p.recCol, statusCol = p.statusCol, sentCol = p.sentCol;
  const ccCol = p.ccCol, bccCol = p.bccCol, attCol = p.attCol, unsubCol = p.unsubCol;

  const result = { sent: 0, errors: 0, invalid: 0, skipped: 0, remaining: 0, problems: [] };
  const total = ctx.values.filter(rw => String(rw[recCol]).trim() && !/^(sent|replied|bounced)/i.test(rw[statusCol])).length;
  let done = 0;
  if (!opts.test) setProgress_(0, total);

  for (let r = 0; r < ctx.values.length; r++) {
    const row = ctx.values[r];
    const to = String(row[recCol]).trim();
    if (!to) continue;

    if (!opts.test) {
      if (/^(sent|replied|bounced)/i.test(row[statusCol])) { result.skipped++; continue; }
      if (unsubCol !== undefined && String(row[unsubCol]).trim()) {
        writeStatus_(sheet, r, statusCol, 'Skipped: unsubscribed', COLORS.skipped);
        result.skipped++;
        continue;
      }
      if (!EMAIL_RE.test(to)) {
        writeStatus_(sheet, r, statusCol, 'INVALID EMAIL', COLORS.invalid);
        result.invalid++;
        if (result.problems.length < 15) result.problems.push('Row ' + (r + 2) + ': invalid email "' + to + '"');
        continue;
      }
      if (Date.now() - start > MAX_RUNTIME_MS || MailApp.getRemainingDailyQuota() <= 0) {
        result.remaining++;
        continue;
      }
    }

    if (!opts.test) setProgress_(++done, total);
    const rowObj = rowObject_(ctx, row);

    try {
      let subject = fill_(tpl.message.subject, rowObj, false);
      const html = fill_(tpl.message.html, rowObj, true);
      const text = fill_(tpl.message.text, rowObj, false);

      const attachments = tpl.attachments.slice();
      if (attCol !== undefined && row[attCol]) {
        String(row[attCol]).split(/[,\n]/).forEach(link => {
          const m = link.match(/[-\w]{25,}/);
          if (m) attachments.push(DriveApp.getFileById(m[0]).getBlob());
        });
      }

      const options = { htmlBody: html, attachments: attachments, inlineImages: tpl.inlineImages };
      if (opts.fromName) options.name = opts.fromName;
      if (opts.replyTo) options.replyTo = opts.replyTo;
      if (opts.alias) options.from = opts.alias;
      const cc = [opts.cc, ccCol !== undefined ? row[ccCol] : ''].filter(String).join(',');
      const bcc = [opts.bcc, bccCol !== undefined ? row[bccCol] : ''].filter(String).join(',');
      if (cc) options.cc = cc;
      if (bcc) options.bcc = bcc;

      if (opts.test) {
        subject = '[TEST] ' + subject;
        GmailApp.sendEmail(Session.getEffectiveUser().getEmail(), subject, text, options);
        result.sent = 1;
        return result; // only first row for a test
      }

      GmailApp.sendEmail(to, subject, text, options);
      writeStatus_(sheet, r, statusCol, 'Sent', COLORS.sent);
      sheet.getRange(r + 2, sentCol + 1).setValue(new Date());
      result.sent++;
      if (opts.delaySec) Utilities.sleep(Math.min(opts.delaySec, 10) * 1000);
    } catch (e) {
      if (opts.test) throw e;
      writeStatus_(sheet, r, statusCol, 'ERROR: ' + e.message, COLORS.error);
      result.errors++;
      if (result.problems.length < 15) result.problems.push('Row ' + (r + 2) + ' (' + to + '): ' + e.message);
    }
  }
  result.quota = MailApp.getRemainingDailyQuota();
  clearProgress_();
  return result;
}

/* ---------------- Reply & bounce detection ---------------- */

function checkRepliesAndBounces() {
  const sheet = SpreadsheetApp.getActiveSheet();
  const ctx = readSheet_(sheet);
  const recCol = RECIPIENT_HEADERS.map(h => ctx.map[h]).find(i => i !== undefined);
  const statusCol = ctx.map[STATUS_HEADER.toLowerCase()];
  const sentCol = ctx.map[SENT_HEADER.toLowerCase()];
  const empty = () => Object.assign(getStats_(sheet), { checked: 0, newBounced: 0, newReplied: 0, bouncedList: [] });
  if (recCol === undefined || !ctx.values.length) return empty();

  const sentDates = sheet.getRange(2, sentCol + 1, ctx.values.length, 1).getValues();
  const targets = [];
  ctx.values.forEach((row, i) => {
    if (row[statusCol] === 'Sent' && sentDates[i][0] instanceof Date) {
      targets.push({ i: i, email: String(row[recCol]).trim().toLowerCase(), at: sentDates[i][0] });
    }
  });
  if (!targets.length) return empty();

  const earliest = Math.min.apply(null, targets.map(t => t.at.getTime()));
  const since = Math.floor(earliest / 1000);

  // Bounces: one search across every mailer-daemon / postmaster thread.
  const bounceText = GmailApp.search('in:anywhere from:(mailer-daemon OR postmaster) after:' + since, 0, 200)
    .map(t => t.getMessages().map(m => m.getPlainBody()).join(' '))
    .join(' ')
    .toLowerCase();

  // Replies: also ONE search, not one per recipient. A GmailApp.search costs
  // about a second, so a per-row search blew the 6-minute runtime limit on any
  // merge past ~150 rows and silently stopped checking the rest.
  const replySenders = {};
  GmailApp.search('after:' + since, 0, 500).forEach(thread => {
    thread.getMessages().forEach(m => {
      const raw = String(m.getFrom() || '').toLowerCase();
      const angled = raw.match(/<([^>]+)>/);
      replySenders[(angled ? angled[1] : raw).trim()] = true;
    });
  });

  let bounced = 0, replied = 0;
  const bouncedList = [];
  targets.forEach(t => {
    let status = null;
    if (bounceText.indexOf(t.email) !== -1) { status = 'Bounced'; bounced++; bouncedList.push('Row ' + (t.i + 2) + ': ' + t.email); }
    else if (replySenders[t.email]) {
      status = 'Replied'; replied++;
    }
    if (status) writeStatus_(sheet, t.i, statusCol, status, status === 'Bounced' ? COLORS.bounced : COLORS.replied);
  });
  SpreadsheetApp.flush();
  const res = Object.assign(getStats_(sheet), { checked: targets.length, newBounced: bounced, newReplied: replied, bouncedList: bouncedList.slice(0, 30) });
  const ss = SpreadsheetApp.getActive();
  if (ss) ss.toast('Bounced: ' + res.bounced + ' | Replied: ' + res.replied);
  return res;
}

function getStats_(sheet) {
  const out = { sent: 0, replied: 0, bounced: 0, invalid: 0, errors: 0 };
  if (sheet.getLastColumn() < 1 || sheet.getLastRow() < 2) return out;
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => String(h).trim().toLowerCase());
  const c = headers.indexOf(STATUS_HEADER.toLowerCase());
  if (c < 0) return out;
  sheet.getRange(2, c + 1, sheet.getLastRow() - 1, 1).getValues().forEach(function (r) {
    const v = String(r[0]).toLowerCase();
    if (v === 'sent') out.sent++;
    else if (v === 'replied') out.replied++;
    else if (v === 'bounced') out.bounced++;
    else if (v.indexOf('invalid') === 0) out.invalid++;
    else if (v.indexOf('error') === 0) out.errors++;
  });
  return out;
}

/* ---------------- Helpers ---------------- */

function readSheet_(sheet) {
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h).trim());
  [STATUS_HEADER, SENT_HEADER].forEach(h => {
    if (headers.map(x => x.toLowerCase()).indexOf(h.toLowerCase()) < 0) {
      sheet.getRange(1, headers.length + 1).setValue(h).setFontWeight('bold');
      if (h === SENT_HEADER) sheet.getRange(2, headers.length + 1, sheet.getMaxRows() - 1, 1).setNumberFormat('yyyy-mm-dd hh:mm');
      headers.push(h);
    }
  });
  const n = sheet.getLastRow() - 1;
  const values = n > 0 ? sheet.getRange(2, 1, n, headers.length).getDisplayValues() : [];
  const map = {};
  headers.forEach((h, i) => { if (h) map[h.toLowerCase()] = i; });
  return { headers: headers, values: values, map: map };
}

function getTemplate_(subjectLine) {
  const draft = GmailApp.getDrafts().filter(d => d.getMessage().getSubject() === subjectLine)[0];
  if (!draft) throw new Error('Draft not found: "' + subjectLine + '"');
  const msg = draft.getMessage();
  const html = msg.getBody();

  // Inline images (cid:) -> map to blobs
  const inlineAll = msg.getAttachments({ includeInlineImages: true, includeAttachments: false });
  const byName = {};
  inlineAll.forEach(i => { byName[i.getName()] = i; });
  const inlineImages = {};
  const imgRe = /<img[^>]*?src="cid:(.*?)"[^>]*?alt="(.*?)"[^>]*>/g;
  let m;
  while ((m = imgRe.exec(html)) !== null) {
    if (byName[m[2]]) inlineImages[m[1]] = byName[m[2]];
  }

  return {
    message: { subject: subjectLine, text: msg.getPlainBody(), html: html },
    attachments: msg.getAttachments({ includeInlineImages: false }),
    inlineImages: inlineImages
  };
}

function validatePlaceholders_(tpl, map) {
  const all = tpl.message.subject + ' ' + tpl.message.html;
  const re = /\{\{\s*([^{}]+?)\s*\}\}/g;
  const missing = new Set();
  let m;
  while ((m = re.exec(all)) !== null) {
    if (map[m[1].toLowerCase()] === undefined) missing.add(m[0]);
  }
  if (missing.size) {
    throw new Error('Placeholders without a matching column: ' + [...missing].join(', ') +
      '. (If the name looks right, retype it in the draft as plain text — formatting inside {{ }} breaks matching.)');
  }
}

function fill_(s, obj, isHtml) {
  return s.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, function (match, key) {
    const v = obj[key.toLowerCase()];
    if (v === undefined) return match;
    return isHtml ? escapeHtml_(v) : v;
  });
}

function escapeHtml_(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}