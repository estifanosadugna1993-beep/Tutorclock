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

/* Inline SVG icons, so the app needs no icon font and no network. */
const icon = {
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>',
  people: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
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
  if (screen.name === 'dashboard') app.innerHTML = Dashboard();
  else if (screen.name === 'addStudent') app.innerHTML = StudentForm(null);
  else if (screen.name === 'editStudent') app.innerHTML = StudentForm(getStudent(screen.id));
  else app.innerHTML = Dashboard();

  wireUp();
}

/* ------------------------------------------------------------
   Screen 1 — Dashboard (the home screen)
   ------------------------------------------------------------ */

function Dashboard() {
  const students = listStudents();
  const archived = listArchivedStudents();

  const warning = isStorageBroken()
    ? `<div class="empty" style="padding:14px 0 0">
         <p style="color:var(--danger);max-width:none">
           This browser is blocking storage, so students will not
           survive a restart. Try a normal (non-private) window.
         </p>
       </div>`
    : '';

  const body = students.length === 0 && archived.length === 0
    ? `<div class="empty">
         <span>${icon.people}</span>
         <h3>No students yet</h3>
         <p>Add the first student you tutor. Their hourly rate turns
            logged time into an amount later on.</p>
       </div>`
    : `<div class="student-list">${students.map(studentRow).join('')}</div>
       ${archived.length ? `
         <div class="list-heading">Archived</div>
         <div class="student-list">${archived.map(studentRow).join('')}</div>
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

function studentRow(student) {
  const rate = student.hourlyRate > 0
    ? `${money(student.hourlyRate, student.currency)}/hr`
    : 'No rate set';

  return `
    <button class="student-row" data-action="edit-student" data-id="${esc(student.id)}">
      <span class="avatar" style="background:${esc(student.color)}">
        ${esc(initialOf(student.name))}
      </span>
      <span class="row-text">
        <b>${esc(student.name)}</b>
        <small>${esc(rate)}</small>
      </span>
      ${student.archived ? '<span class="status archived">Archived</span>' : ''}
      <span class="chevron">${icon.chevron}</span>
    </button>
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
    } else if (action === 'cancel') {
      draftColor = null;
      go({ name: 'dashboard' });
    } else if (action === 'save') {
      saveStudent();
    }
  };

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
