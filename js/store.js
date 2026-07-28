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
       sessions: [ ]            // filled in from Step 2 onward
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
  return { version: SCHEMA_VERSION, students: [], sessions: [] };
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
