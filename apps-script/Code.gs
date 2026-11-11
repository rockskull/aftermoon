/**
 * AFTER CL TO MOON — Google Sheets gateway (Apps Script, bound to the club spreadsheet)
 *
 *  GET  <web app url>                         → public schedule (published + public rows, public columns only)
 *  POST {action:"read",   secret, tables}     → private tables for the website server
 *  POST {action:"commit", secret, commit}     → checked, locked write (see commit_ below)
 *
 * The website server is the only caller of POST; the secret lives in Script
 * Properties (PROPOSAL_SECRET, same value as CLUB_API_SECRET on Vercel).
 * Setup: README.md → "Google Sheets 연결".
 */

var TZ = 'Asia/Seoul';

/** Tabs and their columns. Mirrors src/server/store/schema.ts. The first column is the id. */
var TABLES = {
  Events: ['event_id', 'title', 'short_title', 'description', 'category', 'start_at', 'end_at', 'registration_open',
    'registration_close', 'capacity', 'public_fee', 'registration_url', 'host', 'audience', 'location', 'notes',
    'visibility', 'status', 'updated_at'],
  Enrollment: ['enrollment_id', 'title', 'start_date', 'end_date', 'description', 'application_url', 'status'],
  Proposals: ['proposal_id', 'submitted_at', 'proposer', 'contact', 'event_title', 'description', 'experience',
    'preferred_date', 'date_flexible', 'estimated_duration', 'audience', 'expected_attendance', 'free_ok',
    'desired_fee', 'fee_unit', 'estimated_cost', 'requirements', 'staff_support', 'other_requests',
    'review_status', 'review_notes'],
  Members: ['member_id', 'name', 'email', 'depositor_name', 'role', 'status', 'applied_at', 'joined_at',
    'member_consent_at', 'memo'],
  Plans: ['plan_id', 'name', 'price', 'duration_months', 'bonus_months', 'active', 'sort_order', 'description'],
  Payments: ['payment_id', 'member_id', 'depositor_name', 'amount', 'joining_fee', 'plan_id', 'status', 'requested_at',
    'requested_start', 'deposited_at', 'bank_transaction_id', 'approved_by', 'approved_at', 'note'],
  Memberships: ['membership_id', 'member_id', 'plan_id', 'start_date', 'end_date', 'status', 'source_payment_id',
    'created_at', 'updated_at', 'note'],
  Notifications: ['notification_id', 'member_id', 'type', 'title', 'body', 'url', 'scheduled_at', 'sent_at', 'status',
    'attempts', 'last_error', 'deduplication_key', 'created_at', 'read_at'],
  PushSubscriptions: ['subscription_id', 'member_id', 'endpoint', 'p256dh', 'auth', 'user_agent', 'status',
    'created_at', 'last_success_at', 'failure_count'],
  NotificationPrefs: ['member_id', 'membership', 'events', 'operator', 'updated_at'],
  EventWatch: ['event_id', 'fingerprint', 'status', 'first_seen_at', 'updated_at'],
  Ledger: ['entry_id', 'date', 'category', 'description', 'amount', 'person', 'method', 'receipt_url', 'memo',
    'status', 'created_by', 'created_at', 'updated_at'],
  AuditLog: ['log_id', 'commit_id', 'actor_id', 'action', 'target_id', 'before_value', 'after_value', 'created_at'],
  Settings: ['key', 'value', 'description'],
};

/** Only these columns ever leave the spreadsheet through the public GET. */
var PUBLIC_EVENT_FIELDS = ['event_id', 'title', 'short_title', 'description', 'category', 'start_at', 'end_at',
  'registration_open', 'registration_close', 'capacity', 'public_fee', 'registration_url', 'host', 'audience',
  'location', 'notes', 'visibility', 'status'];
var PUBLIC_EVENT_STATUSES = ['published', 'closed', 'canceled'];
var PUBLIC_ENROLLMENT_FIELDS = ['enrollment_id', 'title', 'start_date', 'end_date', 'description', 'application_url', 'status'];
var PUBLIC_ENROLLMENT_STATUSES = ['published', 'closed'];

// ---------------------------------------------------------------------------
// GET: public schedule (no secret; nothing private is ever included)
// ---------------------------------------------------------------------------

function doGet() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var events = loadTable_(ss, 'Events', true).records
      .filter(function (r) {
        return lower_(r.visibility) === 'public' && PUBLIC_EVENT_STATUSES.indexOf(lower_(r.status)) !== -1 &&
          r.event_id !== '' && r.title !== '' && r.start_at !== '';
      })
      .map(function (r) { return pick_(r, PUBLIC_EVENT_FIELDS); });
    var enrollments = loadTable_(ss, 'Enrollment', true).records
      .filter(function (r) {
        return PUBLIC_ENROLLMENT_STATUSES.indexOf(lower_(r.status)) !== -1 &&
          r.enrollment_id !== '' && r.title !== '' && r.start_date !== '';
      })
      .map(function (r) { return pick_(r, PUBLIC_ENROLLMENT_FIELDS); });
    return json_({ ok: true, generated_at: Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd'T'HH:mm:ssXXX"), events: events, enrollments: enrollments });
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: 'read_failed' });
  }
}

// ---------------------------------------------------------------------------
// POST: private read / locked commit (website server only)
// ---------------------------------------------------------------------------

function doPost(e) {
  var body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: 'bad_request' });
  }
  var secret = PropertiesService.getScriptProperties().getProperty('PROPOSAL_SECRET');
  if (!secret || !body || body.secret !== secret) return json_({ ok: false, error: 'unauthorized' });

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (body.action === 'read') {
      var out = {};
      (body.tables || []).forEach(function (name) {
        if (TABLES[name]) out[name] = loadTable_(ss, name, true).records;
      });
      return json_({ ok: true, tables: out });
    }
    if (body.action === 'commit') return json_(commit_(ss, body.commit));
    return json_({ ok: false, error: 'bad_request' });
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: 'server_error' });
  }
}

/**
 * A commit is applied under the script lock, so commits never interleave:
 *  1. AuditLog already has commit.id → it was applied before (a retry): no-op
 *  2. every check is re-verified against the live sheet → otherwise "conflict"
 *  3. every op is validated before anything is written → otherwise "invalid"
 *  4. ops are written in order, then flushed
 * Same rules as applyCommit() in src/server/store/commit.ts.
 */
function commit_(ss, commit) {
  if (!commit || !commit.id || !commit.ops) return { ok: false, error: 'invalid', detail: 'malformed commit' };
  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    var cache = {};
    var table = function (name) {
      if (!TABLES[name]) throw new Error('unknown table ' + name);
      if (!cache[name]) cache[name] = loadTable_(ss, name, false);
      return cache[name];
    };

    var audit = table('AuditLog');
    for (var a = 0; a < audit.records.length; a++) {
      if (String(audit.records[a].commit_id) === commit.id) return { ok: true, duplicate: true };
    }

    var checks = commit.checks || [];
    for (var c = 0; c < checks.length; c++) {
      var problem = verifyCheck_(table(checks[c].table), checks[c]);
      if (problem) return { ok: false, error: 'conflict', detail: problem };
    }

    var staged = {};
    for (var v = 0; v < commit.ops.length; v++) {
      var op = commit.ops[v];
      var t = table(op.table);
      var fields = Object.keys(op.type === 'append' ? op.row : op.set);
      var missing = fields.filter(function (f) { return t.headers.indexOf(f) === -1; });
      if (missing.length) return { ok: false, error: 'invalid', detail: op.table + ': missing columns ' + missing.join(', ') + ' (run setupSheets)' };
      var key = TABLES[op.table][0];
      if (op.type === 'append') {
        var newId = String(op.row[key] || '');
        staged[op.table] = staged[op.table] || {};
        if (!newId || findIndex_(t, newId) !== -1 || staged[op.table][newId]) return { ok: false, error: 'invalid', detail: op.table + ' duplicate id ' + newId };
        staged[op.table][newId] = true;
      } else if (op.type === 'update') {
        if (findIndex_(t, op.id) === -1) return { ok: false, error: 'invalid', detail: op.table + ' ' + op.id + ' not found' };
      } else {
        return { ok: false, error: 'invalid', detail: 'unknown op ' + op.type };
      }
    }

    commit.ops.forEach(function (op) {
      var t = table(op.table);
      if (op.type === 'append') {
        t.sheet.appendRow(t.headers.map(function (h) { return toCell_(op.row[h]); }));
      } else {
        var i = findIndex_(t, op.id);
        var rowNumber = i + 2;
        var current = t.sheet.getRange(rowNumber, 1, 1, t.headers.length).getValues()[0];
        Object.keys(op.set).forEach(function (f) { current[t.headers.indexOf(f)] = toCell_(op.set[f]); });
        t.sheet.getRange(rowNumber, 1, 1, t.headers.length).setValues([current]);
        Object.keys(op.set).forEach(function (f) { t.records[i][f] = serialize_(op.set[f]); });
      }
    });
    SpreadsheetApp.flush();
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

function verifyCheck_(t, check) {
  var key = TABLES[check.table][0];
  if (check.type === 'exists') {
    var i = findIndex_(t, check.id);
    if (i === -1) return check.table + ' ' + check.id + ' not found';
    return fieldsDiffer_(t.records[i], check.fields || {}, check.table + ' ' + check.id);
  }
  if (check.type === 'absent') {
    var hit = t.records.some(function (r) { return matches_(r, check.where); });
    return hit ? check.table + ' already has ' + JSON.stringify(check.where) : null;
  }
  if (check.type === 'snapshot') {
    var current = t.records.filter(function (r) { return matches_(r, check.where); });
    var expected = Object.keys(check.rows).sort().join('|');
    var actual = current.map(function (r) { return text_(r[key]); }).sort().join('|');
    if (expected !== actual) return check.table + ' changed for ' + JSON.stringify(check.where);
    for (var n = 0; n < current.length; n++) {
      var d = fieldsDiffer_(current[n], check.rows[text_(current[n][key])], check.table + ' ' + text_(current[n][key]));
      if (d) return d;
    }
    return null;
  }
  return 'unknown check ' + check.type;
}

function fieldsDiffer_(record, fields, label) {
  var names = Object.keys(fields);
  for (var n = 0; n < names.length; n++) {
    var actual = text_(record[names[n]]);
    var expected = fields[names[n]];
    var ok = Array.isArray(expected) ? expected.indexOf(actual) !== -1 : actual === expected;
    if (!ok) return label + ': ' + names[n] + '=' + JSON.stringify(actual) + ' (expected ' + JSON.stringify(expected) + ')';
  }
  return null;
}

function matches_(record, where) {
  return Object.keys(where).every(function (k) { return text_(record[k]) === where[k]; });
}

function findIndex_(t, id) {
  var key = t.key;
  for (var i = 0; i < t.records.length; i++) if (text_(t.records[i][key]) === id) return i;
  return -1;
}

// ---------------------------------------------------------------------------
// Setup and triggers (run from the Apps Script editor)
// ---------------------------------------------------------------------------

/**
 * Creates every tab with its header row, adds any missing columns to existing
 * tabs, adds dropdowns, seeds the plans and settings, and sets the Seoul
 * timezone. Safe to run again; existing data is never touched.
 */
function setupSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.setSpreadsheetTimeZone(TZ);
  Object.keys(TABLES).forEach(function (name) { ensureSheet_(ss, name, TABLES[name]); });

  dropdown_(ss, 'Events', 'visibility', ['public', 'private']);
  dropdown_(ss, 'Events', 'status', ['draft', 'published', 'closed', 'canceled']);
  dropdown_(ss, 'Enrollment', 'status', ['draft', 'published', 'closed']);
  dropdown_(ss, 'Proposals', 'review_status', ['new', 'reviewing', 'accepted', 'declined']);
  dropdown_(ss, 'Members', 'role', ['member', 'operator', 'admin']);
  dropdown_(ss, 'Members', 'status', ['applicant', 'active', 'inactive']);
  dropdown_(ss, 'Payments', 'status', ['pending', 'matched', 'approved', 'rejected', 'refunded']);
  dropdown_(ss, 'Memberships', 'status', ['active', 'canceled', 'refunded']);
  dropdown_(ss, 'Ledger', 'category', ['임대료·관리비', '보증금', '시설·공사', '장비·용품', '소모품', '운송', '보험', '수수료',
    '식음료', '기타 지출', '출자금', '일일 이용료', '이벤트 참가비', '기타 수입']);
  dropdown_(ss, 'Ledger', 'method', ['모임통장', '개인 결제', '현금', '기타']);
  dropdown_(ss, 'Ledger', 'status', ['active', 'void']);

  var plans = ss.getSheetByName('Plans');
  if (plans.getLastRow() < 2) {
    plans.getRange(2, 1, 3, 8).setValues([
      ['PLAN-1M', '1개월', 80000, 1, 0, true, 1, '한 달 동안 이용'],
      ['PLAN-6M', '6개월', 500000, 6, 1, true, 2, '6개월 + 보너스 1개월'],
      ['PLAN-12M', '12개월', 1000000, 12, 2, true, 3, '12개월 + 보너스 2개월'],
    ]);
  }
  // Settings: add any key that is missing (existing values are never overwritten).
  var settings = ss.getSheetByName('Settings');
  var defaults = [
    ['bank_name', '카카오뱅크 모임통장', '입금 안내에 표시'],
    ['account_number', '', '입금 계좌번호'],
    ['account_holder', '', '예금주'],
    ['deposit_notice', '입금자명은 신청할 때 적은 이름과 같게 보내 주세요.', '입금 안내 문구'],
    ['sheet_url', ss.getUrl(), '운영진용 스프레드시트 링크'],
    ['joining_fee', 100000, '첫 등록 가입비 (원, 0이면 없음)'],
    ['consent_daily_url', 'https://forms.gle/voZyWWAKs8gUAv949', '일일 이용 동의서 (Google 설문)'],
    ['consent_member_url', 'https://forms.gle/m1ZoK1xUvmktA1kT7', '회원 등록 동의서 (Google 설문)'],
  ];
  var existingKeys = settings.getLastRow() < 2 ? [] :
    settings.getRange(2, 1, settings.getLastRow() - 1, 1).getValues().map(function (r) { return String(r[0]).trim(); });
  defaults.forEach(function (row) {
    if (existingKeys.indexOf(row[0]) === -1) settings.appendRow(row);
  });
}

/** Calls the website's notification scheduler. Installed by installTick(). */
function tick() {
  var props = PropertiesService.getScriptProperties();
  var site = props.getProperty('SITE_URL');
  var secret = props.getProperty('CRON_SECRET');
  if (!site || !secret) return;
  var res = UrlFetchApp.fetch(site.replace(/\/$/, '') + '/api/cron/notifications', {
    headers: { Authorization: 'Bearer ' + secret },
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) console.warn('tick ' + res.getResponseCode() + ' ' + res.getContentText().slice(0, 300));
}

/** Runs tick() every 15 minutes (optional; Vercel Cron already runs it daily). */
function installTick() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'tick') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('tick').timeBased().everyMinutes(15).create();
}

/** Keeps Events.updated_at current when the crew edits a row (runs automatically as a simple trigger). */
function onEdit(e) {
  var sheet = e.range.getSheet();
  if (sheet.getName() !== 'Events' || e.range.getRow() === 1) return;
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var col = headers.indexOf('updated_at') + 1;
  if (col > 0 && e.range.getColumn() !== col) sheet.getRange(e.range.getRow(), col).setValue(new Date());
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadTable_(ss, name, readOnly) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    if (readOnly) return { sheet: null, headers: [], records: [], key: TABLES[name][0] };
    throw new Error('missing sheet ' + name + ' (run setupSheets)');
  }
  var values = sheet.getDataRange().getValues();
  var headers = (values[0] || []).map(function (h) { return String(h).trim(); });
  var records = values.slice(1).map(function (row) {
    var r = {};
    headers.forEach(function (h, i) { if (h) r[h] = serialize_(row[i]); });
    return r;
  });
  if (readOnly) records = records.filter(function (r) { return Object.keys(r).some(function (k) { return r[k] !== ''; }); });
  return { sheet: sheet, headers: headers, records: records, key: TABLES[name][0] };
}

/** Dates become "yyyy-MM-dd" (date-only cells) or "yyyy-MM-ddTHH:mm:ss+09:00". */
function serialize_(v) {
  if (v instanceof Date) {
    var time = Utilities.formatDate(v, TZ, 'HH:mm:ss');
    return time === '00:00:00' ? Utilities.formatDate(v, TZ, 'yyyy-MM-dd') : Utilities.formatDate(v, TZ, "yyyy-MM-dd'T'HH:mm:ssXXX");
  }
  if (typeof v === 'string') return v.trim();
  return v;
}

/**
 * Value for a cell. Dates and timestamps become real dates (so the crew can
 * edit them in the sheet); every other text is stored as literal text, so it
 * is never turned into a number, a date or a formula.
 */
function toCell_(v) {
  if (v === undefined || v === null) return '';
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  var s = String(v).slice(0, 5000);
  if (s === '') return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(s + 'T00:00:00+09:00');
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?([+-]\d{2}:\d{2}|Z)$/.test(s)) return new Date(s);
  return "'" + s;
}

function text_(v) {
  return v === undefined || v === null ? '' : String(v);
}

function pick_(record, fields) {
  var out = {};
  fields.forEach(function (f) { if (record[f] !== undefined && record[f] !== '') out[f] = record[f]; });
  return out;
}

function lower_(v) {
  return text_(v).trim().toLowerCase();
}

function ensureSheet_(ss, name, headers) {
  var sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sheet.setFrozenRows(1);
    return sheet;
  }
  var current = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim(); });
  var missing = headers.filter(function (h) { return current.indexOf(h) === -1; });
  if (missing.length) sheet.getRange(1, current.length + 1, 1, missing.length).setValues([missing]).setFontWeight('bold');
  return sheet;
}

function dropdown_(ss, name, header, options) {
  var sheet = ss.getSheetByName(name);
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var col = headers.indexOf(header) + 1;
  if (col === 0 || sheet.getMaxRows() < 2) return;
  var rule = SpreadsheetApp.newDataValidation().requireValueInList(options, true).setAllowInvalid(false).build();
  sheet.getRange(2, col, sheet.getMaxRows() - 1, 1).setDataValidation(rule);
}

function json_(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
