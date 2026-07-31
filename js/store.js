/* ============================================================
   store.js — the only file that talks to localStorage.
   ------------------------------------------------------------
   Why isolate it: every screen asks this module for data and
   never touches storage itself. If we ever outgrow localStorage
   and move to IndexedDB, we rewrite THIS file and the screens
   don't change at all.

   Shape on disk (one JSON blob under one key):

     {
       version:  1,
       students: [ Student, ... ],
       sessions: [ Session, ... ],
       active:   ActiveSession | null
     }

   Student (from Section 3 of the build plan):
     id         unique id
     name       text
     color      hex string - the colour of their initial
     hourlyRate number, in birr. 0 means "no rate set"
     currency   text, default 'ETB'
     createdAt  timestamp
     updatedAt  timestamp
     archived   boolean - hide an old student without deleting

   Session (a finished lesson):
     id         unique id
     studentId  -> Student.id
     startedAt  timestamp the timer first started
     endedAt    timestamp it stopped
     pauses     [ { pausedAt, resumedAt } ]
     netSeconds elapsed minus paused - the billable time
     entryType  'live' (timer run) | 'manual' (typed in later)
     note       optional freeform text
     edits      [ Edit ]  - the trust trail, filled from Step 4
     locked     true once included in a shared summary

   ActiveSession (the one currently running, if any):
     studentId, startedAt, pauses, paused

   ---------------------------------------------------------------
   THE CRASH-SAFETY RULE (build plan, Section 4, Screen 2)
   ---------------------------------------------------------------
   A running timer is stored as a START TIMESTAMP, never as a
   counter that ticks. Elapsed time is always recalculated as

       now - startedAt - (time spent paused)

   so closing the app, locking the phone, or crashing loses
   nothing: whenever we come back, we subtract again from the
   real clock and get the right answer. Nothing in this file may
   ever "add one second" to a stored total.
   ============================================================ */

const STORAGE_KEY = 'tutorclock.v1';
const SCHEMA_VERSION = 1;

/* The palette a student's coloured initial is picked from.
   Purple first so the first student you add matches the brand. */
export const STUDENT_COLORS = [
  '#6657df', // purple  (brand)
  '#18a67e', // green
  '#ed825c', // orange
  '#4b8de8', // blue
  '#c77dbb', // orchid
  '#12a594', // teal
  '#e0685f', // coral
  '#9a6fd6', // violet
];

export const DEFAULT_CURRENCY = 'ETB';

/* ------------------------------------------------------------
   Small helpers
   ------------------------------------------------------------ */

function newId() {
  // crypto.randomUUID is in every current browser, but fall back
  // just in case the app is opened somewhere old.
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
}

function emptyData() {
  return { version: SCHEMA_VERSION, students: [], sessions: [], active: null };
}

/* ------------------------------------------------------------
   Reading and writing the whole blob
   ------------------------------------------------------------ */

/* We keep the parsed data in memory and write the whole thing on
   every change. That is fine at this size (a few students, some
   sessions) and it keeps the code obvious. */
let data = null;

/* True when the last write failed - e.g. private browsing, or a
   full disk. The UI checks this so it can warn you instead of
   silently pretending your data was saved. */
let storageBroken = false;

function readFromDisk() {
  let raw;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch (err) {
    // Some browsers throw on localStorage access entirely.
    console.error('TutorClock: cannot read storage', err);
    storageBroken = true;
    return emptyData();
  }

  if (!raw) return emptyData();

  try {
    const parsed = JSON.parse(raw);
    // Be forgiving about what is on disk. A missing or malformed
    // field should not blank out the whole app.
    return {
      version: parsed.version || SCHEMA_VERSION,
      students: Array.isArray(parsed.students) ? parsed.students : [],
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      active: isUsableActive(parsed.active) ? parsed.active : null,
    };
  } catch (err) {
    // The stored JSON is corrupt. Do NOT wipe it - keep a copy
    // aside so nothing is lost, and start fresh in the app.
    console.error('TutorClock: stored data is corrupt', err);
    try {
      localStorage.setItem(STORAGE_KEY + '.corrupt.' + Date.now(), raw);
    } catch (_) { /* nothing more we can do */ }
    return emptyData();
  }
}

function writeToDisk() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    storageBroken = false;
    return true;
  } catch (err) {
    console.error('TutorClock: could not save', err);
    storageBroken = true;
    return false;
  }
}

/** Load data from disk. Call once on startup. */
export function load() {
  data = readFromDisk();
  return data;
}

function ensureLoaded() {
  if (data === null) load();
}

/** True if the last save failed, so the UI can warn honestly. */
export function isStorageBroken() {
  return storageBroken;
}

/* ------------------------------------------------------------
   Students
   ------------------------------------------------------------ */

/** All students, newest last, optionally including archived ones. */
export function listStudents({ includeArchived = false } = {}) {
  ensureLoaded();
  const all = data.students.slice().sort((a, b) => a.createdAt - b.createdAt);
  return includeArchived ? all : all.filter((s) => !s.archived);
}

export function listArchivedStudents() {
  ensureLoaded();
  return data.students
    .filter((s) => s.archived)
    .sort((a, b) => a.createdAt - b.createdAt);
}

export function getStudent(id) {
  ensureLoaded();
  return data.students.find((s) => s.id === id) || null;
}

/** How many students exist in total. */
export function studentCount() {
  ensureLoaded();
  return data.students.length;
}

/**
 * Pick a sensible colour for a new student: the first one in the
 * palette nobody is using yet. Counting students instead would hand
 * out a duplicate as soon as you pick a colour by hand, so two kids
 * end up with the same coloured initial - the one thing the colour
 * is there to prevent. Once all eight are taken we start reusing.
 */
export function suggestColor() {
  ensureLoaded();
  const taken = new Set(data.students.map((s) => s.color));
  const free = STUDENT_COLORS.find((c) => !taken.has(c));
  return free || STUDENT_COLORS[data.students.length % STUDENT_COLORS.length];
}

/**
 * Add a student.
 * @returns {{ok: boolean, student?: object, error?: string}}
 */
export function addStudent({ name, color, hourlyRate }) {
  ensureLoaded();

  const cleanName = String(name || '').trim();
  if (!cleanName) return { ok: false, error: 'A name is required.' };

  const now = Date.now();
  const student = {
    id: newId(),
    name: cleanName,
    color: color || suggestColor(),
    hourlyRate: normaliseRate(hourlyRate),
    currency: DEFAULT_CURRENCY,
    createdAt: now,
    updatedAt: now,
    archived: false,
  };

  data.students.push(student);

  if (!writeToDisk()) {
    // Roll the change back in memory so what you see on screen
    // matches what is actually on disk. Never pretend.
    data.students.pop();
    return { ok: false, error: 'Could not save to this device.' };
  }
  return { ok: true, student };
}

/**
 * Update a student.
 *
 * Note for later: this is a plain overwrite, which is correct for
 * student details (a name or rate is just a current fact). SESSION
 * edits are different - trust rule R2 says those must append an
 * Edit record and never overwrite. That lands in Step 4.
 *
 * @returns {{ok: boolean, student?: object, error?: string}}
 */
export function updateStudent(id, changes) {
  ensureLoaded();

  const index = data.students.findIndex((s) => s.id === id);
  if (index === -1) return { ok: false, error: 'That student no longer exists.' };

  const before = data.students[index];
  const next = { ...before, updatedAt: Date.now() };

  if (changes.name !== undefined) {
    const cleanName = String(changes.name).trim();
    if (!cleanName) return { ok: false, error: 'A name is required.' };
    next.name = cleanName;
  }
  if (changes.color !== undefined) next.color = changes.color;
  if (changes.hourlyRate !== undefined) next.hourlyRate = normaliseRate(changes.hourlyRate);
  if (changes.archived !== undefined) next.archived = Boolean(changes.archived);

  data.students[index] = next;

  if (!writeToDisk()) {
    data.students[index] = before; // roll back
    return { ok: false, error: 'Could not save to this device.' };
  }
  return { ok: true, student: next };
}

/* Turn whatever was typed into a clean number of birr per hour.
   Blank, junk, or negative all become 0, which the app reads as
   "no rate set" rather than "free". */
function normaliseRate(value) {
  const n = Number.parseFloat(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100) / 100; // keep at most 2 decimal places
}

/* ============================================================
   The running timer
   ============================================================ */

/* A stored active session is only usable if it still makes sense:
   it needs a start time and a student who still exists. Anything
   malformed is dropped rather than crashing the app on startup. */
function isUsableActive(active) {
  return Boolean(
    active &&
    typeof active.studentId === 'string' &&
    typeof active.startedAt === 'number' &&
    Number.isFinite(active.startedAt) &&
    Array.isArray(active.pauses)
  );
}

/** The session currently running or paused, or null. */
export function getActive() {
  ensureLoaded();
  // If the student was somehow removed, don't strand a timer.
  if (data.active && !getStudent(data.active.studentId)) return null;
  return data.active;
}

/**
 * Total seconds spent paused so far. A pause that has not been
 * resumed yet is still counting, so it runs up to `at`.
 */
function pausedMsOf(active, at) {
  let total = 0;
  for (const p of active.pauses) {
    const from = p.pausedAt;
    const to = p.resumedAt === null || p.resumedAt === undefined ? at : p.resumedAt;
    if (Number.isFinite(from) && Number.isFinite(to) && to > from) total += to - from;
  }
  return total;
}

/**
 * The billable seconds of a running session: elapsed minus paused.
 *
 * This is recomputed from timestamps every single time it is asked
 * for - that is what makes the timer survive the app closing.
 *
 * Clamped at 0 because the device clock can move backwards (a time
 * sync, or the tutor changing the phone's clock). Better to show
 * 0:00 briefly than a negative lesson.
 */
export function netSecondsOf(active, at = Date.now()) {
  if (!active) return 0;
  const elapsed = at - active.startedAt - pausedMsOf(active, at);
  return Math.max(0, Math.floor(elapsed / 1000));
}

/** Is the timer currently paused? */
export function isPaused(active) {
  if (!active || active.pauses.length === 0) return false;
  const last = active.pauses[active.pauses.length - 1];
  return last.resumedAt === null || last.resumedAt === undefined;
}

/**
 * Start timing a lesson. Only one session may run at a time -
 * two timers going at once would make the log meaningless.
 */
export function startSession(studentId) {
  ensureLoaded();

  if (data.active) return { ok: false, error: 'A session is already running.' };
  if (!getStudent(studentId)) return { ok: false, error: 'That student no longer exists.' };

  const previous = data.active;
  data.active = { studentId, startedAt: Date.now(), pauses: [] };

  if (!writeToDisk()) {
    data.active = previous;
    // If we cannot write the start time down, we cannot promise the
    // session survives a crash - so refuse rather than pretend.
    return { ok: false, error: 'Could not start: this device is not saving data.' };
  }
  return { ok: true, active: data.active };
}

/** Pause the running session. */
export function pauseSession() {
  ensureLoaded();
  if (!data.active) return { ok: false, error: 'Nothing is running.' };
  if (isPaused(data.active)) return { ok: true, active: data.active };

  data.active.pauses.push({ pausedAt: Date.now(), resumedAt: null });

  if (!writeToDisk()) {
    data.active.pauses.pop();
    return { ok: false, error: 'Could not save the pause.' };
  }
  return { ok: true, active: data.active };
}

/** Resume a paused session. */
export function resumeSession() {
  ensureLoaded();
  if (!data.active) return { ok: false, error: 'Nothing is running.' };
  if (!isPaused(data.active)) return { ok: true, active: data.active };

  const last = data.active.pauses[data.active.pauses.length - 1];
  last.resumedAt = Date.now();

  if (!writeToDisk()) {
    last.resumedAt = null;
    return { ok: false, error: 'Could not save the resume.' };
  }
  return { ok: true, active: data.active };
}

/**
 * Stop the timer and save it as a finished 'live' session.
 * Trust rule R1: entryType records that this was really clocked,
 * and it never changes afterwards.
 */
export function stopSession(note = '') {
  ensureLoaded();
  if (!data.active) return { ok: false, error: 'Nothing is running.' };

  const active = data.active;
  const endedAt = Date.now();

  // Close an open pause at the moment we stop, so the record has
  // no dangling half-pause in it.
  const pauses = active.pauses.map((p) => ({
    pausedAt: p.pausedAt,
    resumedAt: p.resumedAt === null || p.resumedAt === undefined ? endedAt : p.resumedAt,
  }));

  const session = {
    id: newId(),
    studentId: active.studentId,
    startedAt: active.startedAt,
    endedAt,
    pauses,
    netSeconds: netSecondsOf(active, endedAt),   // R5: elapsed minus paused
    entryType: 'live',                            // R1: really clocked
    note: String(note || '').trim(),
    edits: [],                                    // R2: the trust trail
    locked: false,                                // R4: set when shared
    createdAt: endedAt,                           // when the record was made
  };

  data.sessions.push(session);
  data.active = null;

  if (!writeToDisk()) {
    // Put everything back so nothing is silently lost.
    data.sessions.pop();
    data.active = active;
    return { ok: false, error: 'Could not save the session.' };
  }
  return { ok: true, session };
}

/**
 * Throw away a running session without saving it.
 * Used only for a timer started by mistake.
 */
export function discardSession() {
  ensureLoaded();
  const previous = data.active;
  data.active = null;
  if (!writeToDisk()) {
    data.active = previous;
    return { ok: false, error: 'Could not discard the session.' };
  }
  return { ok: true };
}

/* ============================================================
   Reading sessions
   ============================================================ */

/** One saved lesson by id. */
export function getSession(id) {
  ensureLoaded();
  return data.sessions.find((s) => s.id === id) || null;
}

/**
 * What this lesson said before anyone corrected it.
 *
 * The first Edit's oldValue is the original by definition, because
 * edits are only ever appended - so edits[0] always holds the value
 * the lesson had when it was first saved.
 */
export function originalNetSeconds(session) {
  if (!session.edits || session.edits.length === 0) return session.netSeconds;
  return session.edits[0].oldValue;
}

/**
 * Correct how long a lesson was.
 *
 * TRUST RULE R2 - the spine of this whole app:
 * this NEVER quietly overwrites. It changes the value AND appends an
 * Edit recording what it used to be, what it became, when the change
 * was made, and why. Nothing is erased, so the parent's summary can
 * later say "1h 05m (adjusted from 1h 15m - 'ended early, kid
 * unwell')".
 *
 * A tutor who corrects an honest mistake should look honest. That is
 * only possible if the original survives.
 */
export function correctSessionLength(sessionId, { minutes, reason = '' }) {
  ensureLoaded();

  const index = data.sessions.findIndex((s) => s.id === sessionId);
  if (index === -1) return { ok: false, error: 'That lesson no longer exists.' };

  const before = data.sessions[index];

  const mins = Number.parseFloat(minutes);
  if (!Number.isFinite(mins) || mins <= 0) {
    return { ok: false, error: 'Enter how many minutes it should be.' };
  }
  if (mins > MAX_MANUAL_MINUTES) {
    return { ok: false, error: 'That is longer than a whole day - check the minutes.' };
  }

  const newValue = Math.round(mins * 60);
  if (newValue === before.netSeconds) {
    return { ok: false, error: 'That is already its length.' };
  }

  const edit = {
    editedAt: Date.now(),
    field: 'netSeconds',
    oldValue: before.netSeconds,
    newValue,
    reason: String(reason || '').trim(),
  };

  // Build a new object rather than mutating, so a failed write can
  // be rolled back to exactly what was there before.
  data.sessions[index] = {
    ...before,
    netSeconds: newValue,
    edits: [...before.edits, edit],
  };

  if (!writeToDisk()) {
    data.sessions[index] = before;
    return { ok: false, error: 'Could not save the correction.' };
  }
  return { ok: true, session: data.sessions[index] };
}

/** Finished sessions for one student, newest first. */
export function sessionsFor(studentId) {
  ensureLoaded();
  return data.sessions
    .filter((s) => s.studentId === studentId)
    .sort((a, b) => b.startedAt - a.startedAt);
}

/**
 * Totals across every saved session for a student.
 * Does not include a session still running - that one is not a
 * fact yet, and the dashboard shows it separately.
 */
export function totalsFor(studentId) {
  ensureLoaded();
  const student = getStudent(studentId);
  const list = sessionsFor(studentId);
  const seconds = list.reduce((sum, s) => sum + s.netSeconds, 0);
  return {
    count: list.length,
    seconds,
    amount: student && student.hourlyRate > 0
      ? (seconds / 3600) * student.hourlyRate
      : 0,
  };
}

/* Longest lesson we will accept as a manual entry. Anything past
   this is much more likely to be a typo than a real lesson. */
const MAX_MANUAL_MINUTES = 24 * 60;

/**
 * Add a lesson that happened before the app was installed, or one
 * where the tutor forgot to press start.
 *
 * Trust rule R1: this is saved as entryType 'manual' and can never
 * be confused with a session that was really clocked. That honesty
 * is the point - a parent seeing "manual" knows exactly what they
 * are looking at.
 */
export function addManualSession({ studentId, minutes, note = '', at }) {
  ensureLoaded();

  if (!getStudent(studentId)) return { ok: false, error: 'That student no longer exists.' };

  const mins = Number.parseFloat(minutes);
  if (!Number.isFinite(mins) || mins <= 0) {
    return { ok: false, error: 'Enter how many minutes the lesson lasted.' };
  }
  if (mins > MAX_MANUAL_MINUTES) {
    return { ok: false, error: 'That is longer than a whole day - check the minutes.' };
  }

  const when = Number.isFinite(at) ? at : Date.now();
  // Allow a minute of slack so "today" never trips this at midnight.
  if (when > Date.now() + 60000) {
    return { ok: false, error: 'That day is in the future.' };
  }

  const netSeconds = Math.round(mins * 60);
  const session = {
    id: newId(),
    studentId,
    startedAt: when,
    endedAt: when + netSeconds * 1000,
    pauses: [],
    netSeconds,
    entryType: 'manual',          // R1: typed in, not clocked
    note: String(note || '').trim(),
    edits: [],                    // R2: the trust trail, used from Step 4
    locked: false,                // R4: set when included in a summary
    createdAt: Date.now(),        // when it was typed in, vs when it happened
  };

  data.sessions.push(session);

  if (!writeToDisk()) {
    data.sessions.pop();
    return { ok: false, error: 'Could not save the lesson.' };
  }
  return { ok: true, session };
}

/**
 * Lessons for a student inside a date range, newest first.
 * `to` is inclusive of the whole day.
 */
export function sessionsInRange(studentId, from, to) {
  return sessionsFor(studentId).filter((s) => s.startedAt >= from && s.startedAt <= to);
}

/**
 * Mark lessons as included in a summary that has been sent.
 *
 * TRUST RULE R4: once numbers have gone to a parent they should not
 * change quietly behind their back. Locking does NOT freeze a lesson
 * - the tutor can still correct it - it just means the correction
 * takes a deliberate extra confirmation and, as always, is recorded.
 */
export function lockSessions(sessionIds) {
  ensureLoaded();

  const wanted = new Set(sessionIds);
  const previous = data.sessions;
  let changed = 0;

  data.sessions = data.sessions.map((s) => {
    if (!wanted.has(s.id) || s.locked) return s;
    changed += 1;
    return { ...s, locked: true, lockedAt: Date.now() };
  });

  if (changed === 0) return { ok: true, locked: 0 };

  if (!writeToDisk()) {
    data.sessions = previous;
    return { ok: false, error: 'Could not lock the lessons.' };
  }
  return { ok: true, locked: changed };
}

/** Midnight on Monday of the current week, as a timestamp. */
export function startOfWeek(at = Date.now()) {
  const d = new Date(at);
  const daysSinceMonday = (d.getDay() + 6) % 7; // getDay(): Sunday is 0
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - daysSinceMonday);
  return d.getTime();
}

/** Midnight on the first day of the current month. */
export function startOfMonth(at = Date.now()) {
  const d = new Date(at);
  d.setHours(0, 0, 0, 0);
  d.setDate(1);
  return d.getTime();
}

/**
 * Billable seconds logged for a student this week. Includes the
 * running session, so the dashboard total moves while you teach.
 */
export function weekSecondsFor(studentId, at = Date.now()) {
  ensureLoaded();
  const from = startOfWeek(at);

  let total = data.sessions
    .filter((s) => s.studentId === studentId && s.startedAt >= from)
    .reduce((sum, s) => sum + s.netSeconds, 0);

  const active = getActive();
  if (active && active.studentId === studentId && active.startedAt >= from) {
    total += netSecondsOf(active, at);
  }
  return total;
}
