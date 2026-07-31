/* ============================================================
   app.js — screens and interaction.
   ------------------------------------------------------------
   Step 1 only: list students, add a student, edit a student,
   archive a student. The timer arrives in Step 2.

   The flow follows TutorClock_Prototype.jsx: one screen at a
   time, phone-first, actions pinned in thumb reach at the bottom.
   The look follows the harvested CSS.

   There is no framework here on purpose. A "screen" is just a
   function that returns HTML, and render() swaps it into the
   page. Small enough to read top to bottom.
   ============================================================ */

import {
  load,
  listStudents,
  listArchivedStudents,
  getStudent,
  addStudent,
  updateStudent,
  suggestColor,
  isStorageBroken,
  getActive,
  netSecondsOf,
  isPaused,
  startSession,
  pauseSession,
  resumeSession,
  stopSession,
  discardSession,
  weekSecondsFor,
  STUDENT_COLORS,
  DEFAULT_CURRENCY,
} from './store.js';

/* ------------------------------------------------------------
   Tiny helpers
   ------------------------------------------------------------ */

const app = document.getElementById('app');

/* Escape anything that came from the user before putting it in
   HTML. A student called  <b>Meron  should show as text, not
   turn into markup. */
function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function initialOf(name) {
  const trimmed = String(name || '').trim();
  // Use the first character of the name. [...trimmed] splits by
  // character properly, so Amharic and emoji don't get mangled.
  return trimmed ? [...trimmed][0].toUpperCase() : '?';
}

function money(amount, currency = DEFAULT_CURRENCY) {
  return `${currency} ${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

/* The big ticking clock: 5:03 under an hour, 1:05:03 over it. */
function clockText(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

/* A settled duration, for lists and totals: "1h 05m" or "45m". */
function durationText(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.round((s % 3600) / 60);
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  return `${minutes}m`;
}

/* Clock time like 14:32, for the "started at" line. */
function timeOfDay(timestamp) {
  return new Date(timestamp).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/* Inline SVG icons, so the app needs no icon font and no network. */
const icon = {
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>',
  people: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13a1 1 0 0 0 1.5.87l11-6.5a1 1 0 0 0 0-1.74l-11-6.5A1 1 0 0 0 8 5.5z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1.2"/><rect x="14" y="5" width="4" height="14" rx="1.2"/></svg>',
  stop: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
  pencil: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
};

/* ------------------------------------------------------------
   Toast — harvested .toast, used for "saved" confirmations
   ------------------------------------------------------------ */

let toastTimer = null;

function toast(message) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  clearTimeout(toastTimer);

  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.innerHTML = `${icon.check}<span>${esc(message)}</span>`;
  document.body.appendChild(el);

  // Sit the toast just above the pinned button bar. That bar is a
  // different height on different screens (one button vs two), so
  // measure it rather than guessing - otherwise the toast lands on
  // top of the button and you cannot read either.
  const actions = app.querySelector('.screen-actions');
  const clearance = actions ? actions.getBoundingClientRect().height + 14 : 22;
  el.style.bottom = `calc(${clearance}px + env(safe-area-inset-bottom))`;

  toastTimer = setTimeout(() => el.remove(), 2600);
}

/* ------------------------------------------------------------
   Router — which screen is showing.
   Kept as a plain object, exactly like the prototype's
   `screen` state.
   ------------------------------------------------------------ */

let screen = { name: 'dashboard' };

function go(next) {
  screen = next;
  render();
  // Always start a new screen scrolled to the top.
  const body = app.querySelector('.screen-body');
  if (body) body.scrollTop = 0;
}

function render() {
  // If the timer screen is showing but nothing is running any more,
  // fall back to the dashboard rather than rendering an empty screen.
  if (screen.name === 'timer' && !getActive()) screen = { name: 'dashboard' };

  if (screen.name === 'dashboard') app.innerHTML = Dashboard();
  else if (screen.name === 'addStudent') app.innerHTML = StudentForm(null);
  else if (screen.name === 'editStudent') app.innerHTML = StudentForm(getStudent(screen.id));
  else if (screen.name === 'timer') app.innerHTML = TimerScreen();
  else app.innerHTML = Dashboard();

  wireUp();
  tickClocks(); // paint the clocks immediately, don't wait for the first tick
}

/* ------------------------------------------------------------
   Screen 1 — Dashboard (the home screen)
   ------------------------------------------------------------ */

function Dashboard() {
  const students = listStudents();
  const archived = listArchivedStudents();
  const active = getActive();

  const warning = isStorageBroken()
    ? `<div class="empty" style="padding:14px 0 0">
         <p style="color:var(--danger);max-width:none">
           This browser is blocking storage, so your work will not
           survive a restart. Try a normal (non-private) window.
         </p>
       </div>`
    : '';

  const body = students.length === 0 && archived.length === 0
    ? `<div class="empty">
         <span>${icon.people}</span>
         <h3>No students yet</h3>
         <p>Add the first student you tutor, then tap Start when
            your lesson begins.</p>
       </div>`
    : `<div class="student-list">${students.map((s) => studentRow(s, active)).join('')}</div>
       ${archived.length ? `
         <div class="list-heading">Archived</div>
         <div class="student-list">${archived.map((s) => studentRow(s, active)).join('')}</div>
       ` : ''}`;

  return `
    <div class="screen">
      <header class="app-header">
        <div class="brand-mark">${icon.clock}</div>
        <div class="head-text">
          <h1>TutorClock</h1>
          <p>${students.length
            ? `${students.length} student${students.length === 1 ? '' : 's'}`
            : 'Your students'}</p>
        </div>
      </header>

      <div class="screen-body">
        ${warning}
        ${active ? liveBanner(active) : ''}
        ${body}
      </div>

      <div class="screen-actions">
        <button class="primary" data-action="add-student">
          ${icon.plus} Add student
        </button>
      </div>
    </div>
  `;
}

/* The pinned "a session is running" bar. The build plan asks for
   this so a forgotten timer is impossible to miss. */
function liveBanner(active) {
  const student = getStudent(active.studentId);
  if (!student) return '';
  const paused = isPaused(active);

  return `
    <button class="live-banner ${paused ? 'is-paused' : ''}" data-action="open-timer">
      <span class="live-dot"></span>
      <span class="live-text">
        <b>${paused ? 'Paused' : 'Session running'}</b>
        <small>${esc(student.name)}</small>
      </span>
      <span class="live-clock" data-clock>${clockText(netSecondsOf(active))}</span>
    </button>
  `;
}

function studentRow(student, active) {
  const isRunning = Boolean(active && active.studentId === student.id);
  const someoneElseRunning = Boolean(active && !isRunning);

  const week = weekSecondsFor(student.id);

  /* Keep this line short enough to stay on one line on a phone.
     When there is nothing logged this week we simply leave that
     part out rather than spending the width saying so. */
  const parts = [];
  if (student.archived) parts.push('Archived');
  if (week > 0) parts.push(`${durationText(week)} this week`);
  parts.push(student.hourlyRate > 0
    ? `${money(student.hourlyRate, student.currency)}/hr`
    : 'No rate set');
  const meta = parts.join(' · ');

  /* The whole row starts the lesson. Starting a timer is the thing
     you do every single lesson, so it gets the big thumb target;
     editing a name or rate is rare and sits behind the small
     pencil instead. */
  return `
    <div class="student-row ${isRunning ? 'is-running' : ''}">
      <button class="row-main"
              data-action="${isRunning ? 'open-timer' : 'start-session'}"
              data-id="${esc(student.id)}"
              ${someoneElseRunning ? 'disabled' : ''}>
        <span class="avatar" style="background:${esc(student.color)}">
          ${esc(initialOf(student.name))}
        </span>
        <span class="row-text">
          <b>${esc(student.name)}</b>
          <small>${esc(meta)}</small>
        </span>
        <span class="row-start ${isRunning ? 'is-running' : ''}">
          ${isRunning ? 'Open' : `${icon.play} Start`}
        </span>
      </button>

      <button class="edit-btn" data-action="edit-student" data-id="${esc(student.id)}"
              aria-label="Edit ${esc(student.name)}">
        ${icon.pencil}
      </button>
    </div>
  `;
}

/* ------------------------------------------------------------
   Screen 2 — Live timer (the core moment)
   ------------------------------------------------------------
   Note what is NOT here: any variable holding "seconds so far".
   The clock is drawn from netSecondsOf(), which recalculates from
   the stored start timestamp every time. That is the whole reason
   the timer survives the phone locking or the app being killed.
   ------------------------------------------------------------ */

/* True while the "End this session?" panel is open. */
let confirmingStop = false;

function TimerScreen() {
  const active = getActive();
  const student = getStudent(active.studentId);
  const paused = isPaused(active);
  const net = netSecondsOf(active);

  const pauseCount = active.pauses.length;
  const pauseNote = pauseCount > 0
    ? `${pauseCount} break${pauseCount === 1 ? '' : 's'} &middot; not billed`
    : '';

  const earned = student.hourlyRate > 0
    ? `<p class="timer-earned" data-amount>${esc(money((net / 3600) * student.hourlyRate, student.currency))} so far</p>`
    : '';

  return `
    <div class="screen timer-screen ${paused ? 'is-paused' : ''}">
      <header class="app-header">
        <button class="back-button" data-action="go-dashboard" aria-label="Back to students">
          ${icon.back}
        </button>
        <div class="head-text">
          <h1>${esc(student.name)}</h1>
          <p>Started ${esc(timeOfDay(active.startedAt))}</p>
        </div>
      </header>

      <div class="screen-body timer-body">
        <span class="avatar avatar-xl" style="background:${esc(student.color)}">
          ${esc(initialOf(student.name))}
        </span>

        <div class="big-clock" data-clock aria-live="off">${clockText(net)}</div>

        <div class="timer-status">
          ${paused ? '' : '<span class="live-dot"></span>'}
          ${paused ? 'PAUSED' : 'RUNNING'}
        </div>

        ${earned}
        ${pauseNote ? `<p class="timer-breaks">${pauseNote}</p>` : ''}
      </div>

      ${confirmingStop ? stopPanel(student, net, active) : ''}

      <div class="screen-actions">
        ${confirmingStop ? '' : `
          <div class="timer-controls">
            <button class="pause-btn" data-action="toggle-pause">
              ${paused ? icon.play : icon.pause}
              ${paused ? 'Resume' : 'Pause'}
            </button>
            <button class="stop-btn" data-action="ask-stop">
              ${icon.stop} Stop
            </button>
          </div>
        `}
      </div>
    </div>
  `;
}

/* The "are you sure" step when stopping. Shows start and end time
   so a session you forgot to stop is obvious before you save it. */
function stopPanel(student, net, active) {
  return `
    <div class="stop-panel">
      <b>End this session?</b>
      <p><strong data-duration>${esc(durationText(net))}</strong> will be saved for ${esc(student.name)}.</p>
      <p class="stop-times">
        ${esc(timeOfDay(active.startedAt))} &rarr; ${esc(timeOfDay(Date.now()))}
      </p>

      <label class="field-label">
        <span>Note <span class="label-note">(optional)</span></span>
        <input class="field" id="note" placeholder="e.g. Algebra ch.4" maxlength="120">
      </label>

      <div class="stop-actions">
        <button class="primary" data-action="confirm-stop">Save session</button>
        <button class="secondary" data-action="cancel-stop">Keep going</button>
        <button class="text-button danger" data-action="discard">Discard without saving</button>
      </div>
    </div>
  `;
}

/* ------------------------------------------------------------
   Screen 5 — Add / edit student
   One form serves both. `student` is null when adding.
   ------------------------------------------------------------ */

/* The colour chosen in the form before it is saved. */
let draftColor = null;

function StudentForm(student) {
  const isEdit = Boolean(student);

  // When adding, pre-pick a colour nobody is using yet so students
  // look different from each other without any effort.
  if (draftColor === null) {
    draftColor = isEdit ? student.color : suggestColor();
  }

  const name = isEdit ? student.name : '';
  const rate = isEdit && student.hourlyRate > 0 ? String(student.hourlyRate) : '';

  return `
    <div class="screen">
      <header class="app-header">
        <button class="back-button" data-action="cancel" aria-label="Go back">
          ${icon.back}
        </button>
        <div class="head-text">
          <h1>${isEdit ? 'Edit student' : 'Add student'}</h1>
          <p>${isEdit ? 'Changes save to this device' : 'Name and colour are all you need'}</p>
        </div>
      </header>

      <div class="screen-body">
        <div class="avatar-preview">
          <span class="avatar avatar-xl" id="preview"
                style="background:${esc(draftColor)}">${esc(initialOf(name))}</span>
        </div>

        <form class="form" id="student-form" autocomplete="off">
          <label class="field-label">
            Name
            <input class="field" id="name" name="name" value="${esc(name)}"
                   placeholder="e.g. Meron" maxlength="60" required>
          </label>

          <label class="field-label">
            <span>Hourly rate <span class="label-note">(optional)</span></span>
            <span class="field-wrap">
              <span class="field-prefix">${esc(DEFAULT_CURRENCY)}</span>
              <input class="field" id="rate" name="rate" value="${esc(rate)}"
                     placeholder="0" inputmode="decimal">
              <span class="field-suffix">per hour</span>
            </span>
            <span class="field-hint">Used later to turn tracked time into an amount.</span>
          </label>

          <div class="field-label">
            Colour
            <div class="swatch-row" id="swatches" role="group" aria-label="Student colour">
              ${STUDENT_COLORS.map((color) => `
                <button type="button" class="swatch" data-color="${esc(color)}"
                        style="background:${esc(color)}"
                        aria-label="Colour ${esc(color)}"
                        aria-pressed="${color === draftColor}"></button>
              `).join('')}
            </div>
          </div>

          ${isEdit ? `
            <label class="toggle-row">
              <span class="toggle-text">
                <b>Archive this student</b>
                <small>Hides them from the main list. Nothing is deleted &mdash;
                       their history stays, and you can bring them back anytime.</small>
              </span>
              <input type="checkbox" id="archived" ${student.archived ? 'checked' : ''}>
            </label>
          ` : ''}
        </form>
      </div>

      <div class="screen-actions">
        <button class="primary" data-action="save" ${name.trim() ? '' : 'disabled'}>
          ${isEdit ? 'Save changes' : 'Save student'}
        </button>
        <button class="secondary" data-action="cancel">Cancel</button>
      </div>
    </div>
  `;
}

/* ------------------------------------------------------------
   The ticking
   ------------------------------------------------------------
   This ONLY rewrites the text inside the clock elements. It never
   re-renders the screen, because doing that four times a second
   would wipe out whatever you were typing in the note box and
   steal focus mid-keystroke.

   The interval is not the source of truth for elapsed time - it
   just decides how often we re-read the real clock.
   ------------------------------------------------------------ */

function tickClocks() {
  const active = getActive();
  if (!active) return;

  const net = netSecondsOf(active);
  const student = getStudent(active.studentId);

  document.querySelectorAll('[data-clock]').forEach((el) => {
    const next = clockText(net);
    if (el.textContent !== next) el.textContent = next;
  });

  const amount = document.querySelector('[data-amount]');
  if (amount && student && student.hourlyRate > 0) {
    const next = `${money((net / 3600) * student.hourlyRate, student.currency)} so far`;
    if (amount.textContent !== next) amount.textContent = next;
  }

  // While the confirm panel is open, keep its duration honest too -
  // the lesson is still running until you actually press save.
  const duration = document.querySelector('[data-duration]');
  if (duration) {
    const next = durationText(net);
    if (duration.textContent !== next) duration.textContent = next;
  }
}

setInterval(tickClocks, 250);

/* Phones aggressively freeze background tabs, so the interval may
   not have run while the screen was off. Recompute the moment we
   become visible again - the numbers jump straight to correct
   because they come from timestamps, not from a counter. */
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) tickClocks();
});
window.addEventListener('focus', tickClocks);
window.addEventListener('pageshow', tickClocks);

/* ------------------------------------------------------------
   Wiring — attach behaviour after every render
   ------------------------------------------------------------ */

function wireUp() {
  // One click handler for the whole screen. Buttons declare what
  // they do with data-action, which keeps this readable.
  app.onclick = (event) => {
    const trigger = event.target.closest('[data-action]');
    if (!trigger) return;

    const action = trigger.dataset.action;

    if (action === 'add-student') {
      draftColor = null;
      go({ name: 'addStudent' });
    } else if (action === 'edit-student') {
      draftColor = null;
      go({ name: 'editStudent', id: trigger.dataset.id });
    } else if (action === 'cancel' || action === 'go-dashboard') {
      draftColor = null;
      go({ name: 'dashboard' });
    } else if (action === 'save') {
      saveStudent();

    // ---- timer ----
    } else if (action === 'start-session') {
      const result = startSession(trigger.dataset.id);
      if (!result.ok) { toast(result.error); return; }
      confirmingStop = false;
      go({ name: 'timer' });
    } else if (action === 'open-timer') {
      confirmingStop = false;
      go({ name: 'timer' });
    } else if (action === 'toggle-pause') {
      const active = getActive();
      const result = isPaused(active) ? resumeSession() : pauseSession();
      if (!result.ok) { toast(result.error); return; }
      render();
    } else if (action === 'ask-stop') {
      confirmingStop = true;
      render();
    } else if (action === 'cancel-stop') {
      confirmingStop = false;
      render();
    } else if (action === 'confirm-stop') {
      finishSession();
    } else if (action === 'discard') {
      discardActiveSession();
    }
  };

  // Focus the note box as soon as the confirm panel opens.
  const note = document.getElementById('note');
  if (note) note.focus();

  const form = document.getElementById('student-form');
  if (!form) return;

  const nameInput = document.getElementById('name');
  const rateInput = document.getElementById('rate');
  const preview = document.getElementById('preview');
  const saveButton = app.querySelector('[data-action="save"]');

  // Live avatar preview + enable Save only once there is a name.
  nameInput.oninput = () => {
    preview.textContent = initialOf(nameInput.value);
    saveButton.disabled = !nameInput.value.trim();
  };

  // Keep the rate field to digits and a single decimal point.
  rateInput.oninput = () => {
    const cleaned = rateInput.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
    if (cleaned !== rateInput.value) rateInput.value = cleaned;
  };

  // Colour swatches
  document.getElementById('swatches').onclick = (event) => {
    const swatch = event.target.closest('.swatch');
    if (!swatch) return;
    draftColor = swatch.dataset.color;
    preview.style.background = draftColor;
    document.querySelectorAll('.swatch').forEach((el) => {
      el.setAttribute('aria-pressed', String(el.dataset.color === draftColor));
    });
  };

  // Enter in a text field saves, like you'd expect on a phone keyboard.
  form.onsubmit = (event) => {
    event.preventDefault();
    saveStudent();
  };

  if (screen.name === 'addStudent') nameInput.focus();
}

function saveStudent() {
  const nameInput = document.getElementById('name');
  const rateInput = document.getElementById('rate');
  if (!nameInput) return;

  const name = nameInput.value.trim();
  if (!name) {
    toast('Please enter a name.');
    nameInput.focus();
    return;
  }

  const values = {
    name,
    hourlyRate: rateInput.value,
    color: draftColor,
  };

  // Note which mode we were in BEFORE navigating away - go() replaces
  // `screen`, so checking it afterwards would always read 'dashboard'.
  const wasEdit = screen.name === 'editStudent';

  let result;
  if (wasEdit) {
    const archivedInput = document.getElementById('archived');
    values.archived = archivedInput ? archivedInput.checked : false;
    result = updateStudent(screen.id, values);
  } else {
    result = addStudent(values);
  }

  if (!result.ok) {
    // Say what actually happened rather than quietly failing.
    toast(result.error || 'Could not save.');
    return;
  }

  draftColor = null;
  go({ name: 'dashboard' });

  if (wasEdit) {
    toast(values.archived ? `${result.student.name} archived` : 'Student saved');
  } else {
    toast(`${result.student.name} added`);
  }
}

/* Stop the timer and save the lesson. */
function finishSession() {
  const noteInput = document.getElementById('note');
  const result = stopSession(noteInput ? noteInput.value : '');

  if (!result.ok) {
    toast(result.error);
    return;
  }

  const student = getStudent(result.session.studentId);
  confirmingStop = false;
  go({ name: 'dashboard' });
  toast(`${durationText(result.session.netSeconds)} saved for ${student ? student.name : 'student'}`);
}

/* Throw away a timer started by mistake. Asks first, because
   unlike an edit this really does leave no record. */
function discardActiveSession() {
  const active = getActive();
  const net = active ? netSecondsOf(active) : 0;

  const sure = window.confirm(
    `Discard this session?\n\n${durationText(net)} will not be saved, and there will be no record of it.`
  );
  if (!sure) return;

  const result = discardSession();
  if (!result.ok) {
    toast(result.error);
    return;
  }
  confirmingStop = false;
  go({ name: 'dashboard' });
  toast('Session discarded');
}

/* ------------------------------------------------------------
   Start
   ------------------------------------------------------------ */

load();
render();

/* Register the service worker so the app installs to your home
   screen and opens offline. It needs a real http:// address, so
   it quietly does nothing if you opened the file directly. */
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch((err) => {
      console.warn('TutorClock: service worker not registered', err);
    });
  });
}
