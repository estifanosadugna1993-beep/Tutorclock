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

/** Finished sessions for one student, newest first. */
export function sessionsFor(studentId) {
  ensureLoaded();
  return data.sessions
    .filter((s) => s.studentId === studentId)
    .sort((a, b) => b.startedAt - a.startedAt);
}

/** Midnight on Monday of the current week, as a timestamp. */
export function startOfWeek(at = Date.now()) {
  const d = new Date(at);
  const daysSinceMonday = (d.getDay() + 6) % 7; // getDay(): Sunday is 0
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - daysSinceMonday);
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
