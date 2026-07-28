import React, { useState, useEffect, useRef } from "react";

// ─────────────────────────────────────────────────────────────
// TutorClock — v1 clickable prototype
// Phone-shaped. Empty to start. In-memory only (no persistence yet).
// This is a design sketch to FEEL the flow, not the shippable app.
// ─────────────────────────────────────────────────────────────

const C = {
  bg: "#0F2027",
  surface: "#16323B",
  surface2: "#1D414C",
  line: "#2A5561",
  text: "#EAF3F2",
  dim: "#8FB3B0",
  faint: "#5E8480",
  accent: "#12A594",   // brand teal
  live: "#E8963A",     // warm amber = timer running (the ONE bold color)
  liveSoft: "#3A2E1C",
  danger: "#D4665F",
};

const CARD_COLORS = ["#12A594", "#E8963A", "#6C8AE4", "#C77DBB", "#4FB477", "#E0685F", "#4CA3C4", "#B78BE0"];

const uid = () => Math.random().toString(36).slice(2, 9);
const now = () => Date.now();

function fmt(sec) {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
function fmtDur(sec) {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}m`;
}
function money(n, cur) {
  return `${cur || "ETB"} ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}
function dayLabel(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function toDateInput(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function startOfWeek() {
  const d = new Date();
  const day = (d.getDay() + 6) % 7; // Monday start
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day);
  return d.getTime();
}
function startOfMonth() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(1);
  return d.getTime();
}

export default function App() {
  const [students, setStudents] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [screen, setScreen] = useState({ name: "dashboard" });
  const [tick, setTick] = useState(0);

  // active running/paused session lives here
  const [active, setActive] = useState(null);
  // active = { studentId, startedAt, pauses:[{pausedAt,resumedAt}], paused:bool }

  // heartbeat so timers re-render
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 250);
    return () => clearInterval(t);
  }, []);

  const studentById = (id) => students.find((s) => s.id === id);
  const sessionsFor = (id) => sessions.filter((s) => s.studentId === id).sort((a, b) => b.startedAt - a.startedAt);

  function netOf(a) {
    if (!a) return 0;
    let paused = 0;
    for (const p of a.pauses) paused += (p.resumedAt || now()) - p.pausedAt;
    return (now() - a.startedAt - paused) / 1000;
  }

  // ── student ops
  function addStudent(name, rate, colorIdx) {
    const s = {
      id: uid(),
      name: name.trim(),
      rate: Number(rate) || 0,
      currency: "ETB",
      color: CARD_COLORS[colorIdx % CARD_COLORS.length],
      createdAt: now(),
    };
    setStudents((p) => [...p, s]);
    return s;
  }

  // ── timer ops
  function startSession(studentId) {
    setActive({ studentId, startedAt: now(), pauses: [], paused: false });
    setScreen({ name: "timer" });
  }
  function togglePause() {
    setActive((a) => {
      if (!a) return a;
      if (a.paused) {
        const pauses = [...a.pauses];
        pauses[pauses.length - 1].resumedAt = now();
        return { ...a, paused: false, pauses };
      } else {
        return { ...a, paused: true, pauses: [...a.pauses, { pausedAt: now(), resumedAt: null }] };
      }
    });
  }
  function stopSession(note) {
    const a = active;
    if (!a) return;
    const pauses = a.pauses.map((p) => ({ ...p, resumedAt: p.resumedAt || now() }));
    let paused = 0;
    for (const p of pauses) paused += p.resumedAt - p.pausedAt;
    const net = Math.round((now() - a.startedAt - paused) / 1000);
    const s = {
      id: uid(),
      studentId: a.studentId,
      startedAt: a.startedAt,
      endedAt: now(),
      pauses,
      netSeconds: net,
      entryType: "live",
      note: note || "",
      edits: [],
      locked: false,
    };
    setSessions((p) => [...p, s]);
    setActive(null);
    setScreen({ name: "student", id: a.studentId });
  }

  function addManual(studentId, minutes, note, whenTs) {
    const net = Math.round(Number(minutes) * 60);
    const s = {
      id: uid(),
      studentId,
      startedAt: whenTs,
      endedAt: whenTs + net * 1000,
      pauses: [],
      netSeconds: net,
      entryType: "manual",
      note: note || "",
      edits: [],
      locked: false,
    };
    setSessions((p) => [...p, s]);
  }

  function editSession(sessionId, newMinutes, reason) {
    setSessions((p) =>
      p.map((s) => {
        if (s.id !== sessionId) return s;
        const newNet = Math.round(Number(newMinutes) * 60);
        return {
          ...s,
          netSeconds: newNet,
          edits: [
            ...s.edits,
            { editedAt: now(), field: "netSeconds", oldValue: s.netSeconds, newValue: newNet, reason: reason || "" },
          ],
        };
      })
    );
  }

  const activeStudent = active ? studentById(active.studentId) : null;

  return (
    <div style={styles.viewport}>
      <div style={styles.phone}>
        {/* status bar hint */}
        <div style={styles.notch} />

        <div style={styles.screenArea}>
          {screen.name === "dashboard" && (
            <Dashboard
              students={students}
              sessions={sessions}
              active={active}
              activeStudent={activeStudent}
              netOf={netOf}
              onAdd={() => setScreen({ name: "addStudent" })}
              onStart={startSession}
              onOpen={(id) => setScreen({ name: "student", id })}
              onResumeActive={() => setScreen({ name: "timer" })}
            />
          )}

          {screen.name === "addStudent" && (
            <AddStudent
              existingCount={students.length}
              onCancel={() => setScreen({ name: "dashboard" })}
              onSave={(name, rate, colorIdx) => {
                addStudent(name, rate, colorIdx);
                setScreen({ name: "dashboard" });
              }}
            />
          )}

          {screen.name === "timer" && active && activeStudent && (
            <TimerScreen
              student={activeStudent}
              active={active}
              net={netOf(active)}
              onPauseToggle={togglePause}
              onStop={stopSession}
              onBack={() => setScreen({ name: "dashboard" })}
            />
          )}

          {screen.name === "student" && (
            <StudentDetail
              student={studentById(screen.id)}
              sessions={sessionsFor(screen.id)}
              onBack={() => setScreen({ name: "dashboard" })}
              onStart={() => startSession(screen.id)}
              onManual={(min, note, ts) => addManual(screen.id, min, note, ts)}
              onEdit={editSession}
              onSummary={() => setScreen({ name: "summary", id: screen.id })}
            />
          )}

          {screen.name === "summary" && (
            <SummaryScreen
              student={studentById(screen.id)}
              sessions={sessionsFor(screen.id)}
              onBack={() => setScreen({ name: "student", id: screen.id })}
            />
          )}
        </div>
      </div>

      <p style={styles.caption}>
        Prototype · data resets when you refresh · exports & phone install come in the real build
      </p>
    </div>
  );
}

// ───────────────────────── Dashboard ─────────────────────────
function Dashboard({ students, sessions, active, activeStudent, netOf, onAdd, onStart, onOpen, onResumeActive }) {
  const weekStart = startOfWeek();
  const weekSecFor = (id) =>
    sessions.filter((s) => s.studentId === id && s.startedAt >= weekStart).reduce((a, s) => a + s.netSeconds, 0);

  return (
    <div style={styles.pane}>
      <Header title="TutorClock" subtitle="Your students" />

      {active && activeStudent && (
        <button style={styles.liveBanner} onClick={onResumeActive}>
          <span style={styles.livePulse} />
          <div style={{ textAlign: "left", flex: 1 }}>
            <div style={{ fontSize: 12, color: C.live, fontWeight: 700, letterSpacing: 0.4 }}>
              {active.paused ? "PAUSED" : "SESSION RUNNING"}
            </div>
            <div style={{ fontSize: 14, color: C.text, fontWeight: 600 }}>{activeStudent.name}</div>
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: C.live, fontVariantNumeric: "tabular-nums" }}>
            {fmt(netOf(active))}
          </div>
        </button>
      )}

      <div style={{ flex: 1, overflowY: "auto", paddingBottom: 8 }}>
        {students.length === 0 && (
          <div style={styles.empty}>
            <div style={styles.emptyIcon}>＋</div>
            <div style={{ fontWeight: 600, color: C.text, marginBottom: 6 }}>No students yet</div>
            <div style={{ color: C.dim, fontSize: 14, lineHeight: 1.5, maxWidth: 240 }}>
              Add the first student you tutor. Then tap their card to start timing a session.
            </div>
          </div>
        )}

        {students.map((s) => {
          const wk = weekSecFor(s.id);
          const isActive = active && active.studentId === s.id;
          return (
            <div key={s.id} style={styles.studentCard}>
              <button style={styles.cardMain} onClick={() => onOpen(s.id)}>
                <div style={{ ...styles.avatar, background: s.color }}>{s.name.charAt(0).toUpperCase()}</div>
                <div style={{ textAlign: "left", flex: 1, minWidth: 0 }}>
                  <div style={styles.cardName}>{s.name}</div>
                  <div style={styles.cardMeta}>
                    {wk > 0 ? `${fmtDur(wk)} this week` : "No sessions this week"}
                    {s.rate > 0 && <span style={{ color: C.faint }}> · {money(s.rate, s.currency)}/hr</span>}
                  </div>
                </div>
              </button>
              <button
                style={{ ...styles.startBtn, ...(isActive ? styles.startBtnOn : {}) }}
                onClick={() => (isActive ? onResumeActive() : onStart(s.id))}
                disabled={active && !isActive}
              >
                {isActive ? "Open" : "Start"}
              </button>
            </div>
          );
        })}
      </div>

      <button style={styles.primaryBtn} onClick={onAdd}>
        ＋ Add student
      </button>
    </div>
  );
}

// ───────────────────────── Add Student ─────────────────────────
function AddStudent({ existingCount, onCancel, onSave }) {
  const [name, setName] = useState("");
  const [rate, setRate] = useState("");
  const [colorIdx, setColorIdx] = useState(existingCount % CARD_COLORS.length);

  return (
    <div style={styles.pane}>
      <Header title="Add student" onBack={onCancel} />
      <div style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "center", margin: "8px 0 20px" }}>
          <div style={{ ...styles.avatarBig, background: CARD_COLORS[colorIdx] }}>
            {name ? name.charAt(0).toUpperCase() : "?"}
          </div>
        </div>

        <label style={styles.label}>Name</label>
        <input
          autoFocus
          style={styles.input}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Meron"
        />

        <label style={styles.label}>Hourly rate (optional)</label>
        <div style={{ position: "relative" }}>
          <span style={styles.inputPrefix}>ETB</span>
          <input
            style={{ ...styles.input, paddingLeft: 52 }}
            value={rate}
            onChange={(e) => setRate(e.target.value.replace(/[^0-9.]/g, ""))}
            placeholder="0"
            inputMode="decimal"
          />
        </div>

        <label style={styles.label}>Colour</label>
        <div style={styles.swatchRow}>
          {CARD_COLORS.map((col, i) => (
            <button
              key={col}
              onClick={() => setColorIdx(i)}
              style={{
                ...styles.swatch,
                background: col,
                outline: i === colorIdx ? `2px solid ${C.text}` : "none",
                outlineOffset: 2,
                transform: i === colorIdx ? "scale(1.1)" : "scale(1)",
              }}
            />
          ))}
        </div>
      </div>

      <button
        style={{ ...styles.primaryBtn, opacity: name.trim() ? 1 : 0.4 }}
        disabled={!name.trim()}
        onClick={() => onSave(name, rate, colorIdx)}
      >
        Save student
      </button>
    </div>
  );
}

// ───────────────────────── Timer ─────────────────────────
function TimerScreen({ student, active, net, onPauseToggle, onStop, onBack }) {
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState("");
  const paused = active.paused;

  return (
    <div style={{ ...styles.pane, background: paused ? C.bg : "#12212680" }}>
      <Header title="" onBack={onBack} ghost />

      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
        <div style={{ ...styles.avatarBig, background: student.color, marginBottom: 8 }}>
          {student.name.charAt(0).toUpperCase()}
        </div>
        <div style={{ fontSize: 18, fontWeight: 600, color: C.text }}>{student.name}</div>

        <div
          style={{
            fontSize: 60,
            fontWeight: 700,
            letterSpacing: -1,
            fontVariantNumeric: "tabular-nums",
            color: paused ? C.dim : C.live,
            margin: "10px 0 2px",
            transition: "color .3s",
          }}
        >
          {fmt(net)}
        </div>

        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: 1,
            color: paused ? C.faint : C.live,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          {!paused && <span style={styles.livePulse} />}
          {paused ? "PAUSED" : "RUNNING"}
        </div>

        {student.rate > 0 && (
          <div style={{ fontSize: 13, color: C.faint, marginTop: 10 }}>
            ≈ {money((net / 3600) * student.rate, student.currency)} so far
          </div>
        )}
        {active.pauses.length > 0 && (
          <div style={{ fontSize: 12, color: C.faint, marginTop: 4 }}>
            {active.pauses.length} pause{active.pauses.length > 1 ? "s" : ""} · breaks not billed
          </div>
        )}
      </div>

      {!confirming ? (
        <div style={{ display: "flex", gap: 10 }}>
          <button style={styles.pauseBtn} onClick={onPauseToggle}>
            {paused ? "▶  Resume" : "❚❚  Pause"}
          </button>
          <button style={styles.stopBtn} onClick={() => setConfirming(true)}>
            ■  Stop
          </button>
        </div>
      ) : (
        <div style={styles.confirmBox}>
          <div style={{ color: C.text, fontWeight: 600, marginBottom: 4 }}>End this session?</div>
          <div style={{ color: C.dim, fontSize: 13, marginBottom: 10 }}>
            {fmtDur(net)} will be saved for {student.name}.
          </div>
          <input
            style={styles.input}
            placeholder="Note (optional) — e.g. Algebra ch.4"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
            <button style={styles.primaryBtn} onClick={() => onStop(note)}>
              Save session
            </button>
            <button style={{ ...styles.ghostBtn, width: "100%", flex: "none" }} onClick={() => setConfirming(false)}>
              Keep going
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ───────────────────────── Student Detail ─────────────────────────
function StudentDetail({ student, sessions, onBack, onStart, onManual, onEdit, onSummary }) {
  const [manualOpen, setManualOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  if (!student) return null;
  const total = sessions.reduce((a, s) => a + s.netSeconds, 0);
  const owed = (total / 3600) * student.rate;

  return (
    <div style={styles.pane}>
      <Header title={student.name} onBack={onBack} />

      <div style={styles.statStrip}>
        <div style={styles.stat}>
          <div style={styles.statNum}>{sessions.length}</div>
          <div style={styles.statLbl}>sessions</div>
        </div>
        <div style={styles.stat}>
          <div style={styles.statNum}>{fmtDur(total)}</div>
          <div style={styles.statLbl}>total</div>
        </div>
        {student.rate > 0 && (
          <div style={styles.stat}>
            <div style={styles.statNum}>{money(owed, student.currency)}</div>
            <div style={styles.statLbl}>earned</div>
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button style={styles.miniPrimary} onClick={onStart}>
          ▶ Start session
        </button>
        <button style={styles.miniGhost} onClick={() => setManualOpen((v) => !v)}>
          ＋ Past
        </button>
        <button style={styles.miniGhost} onClick={onSummary} disabled={sessions.length === 0}>
          Summary
        </button>
      </div>

      {manualOpen && <ManualForm onAdd={(m, n, ts) => { onManual(m, n, ts); setManualOpen(false); }} onCancel={() => setManualOpen(false)} />}

      <div style={{ flex: 1, overflowY: "auto" }}>
        {sessions.length === 0 && !manualOpen && (
          <div style={styles.empty}>
            <div style={{ color: C.dim, fontSize: 14, maxWidth: 220, lineHeight: 1.5 }}>
              No sessions yet. Tap <b style={{ color: C.text }}>Start session</b> when your lesson begins.
            </div>
          </div>
        )}

        {sessions.map((s) => (
          <SessionRow key={s.id} s={s} rate={student.rate} cur={student.currency} onEdit={() => setEditing(s)} />
        ))}
      </div>

      {editing && (
        <EditModal
          s={editing}
          onClose={() => setEditing(null)}
          onSave={(min, reason) => {
            onEdit(editing.id, min, reason);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function SessionRow({ s, rate, cur, onEdit }) {
  const edited = s.edits.length > 0;
  const amt = (s.netSeconds / 3600) * rate;
  return (
    <div style={styles.sessionRow}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3, flexWrap: "wrap", rowGap: 4 }}>
          <span style={{ fontWeight: 600, color: C.text, fontSize: 15 }}>{fmtDur(s.netSeconds)}</span>
          <span style={{ color: C.faint, fontSize: 12 }}>{dayLabel(s.startedAt)}</span>
          {s.entryType === "manual" ? (
            <Badge text="manual" color={C.dim} />
          ) : (
            <Badge text="live" color={C.accent} />
          )}
          {edited && <Badge text="edited" color={C.live} />}
        </div>
        <div style={{ fontSize: 12, color: C.faint, overflowWrap: "anywhere" }}>
          {s.pauses.length > 0 && `${s.pauses.length} break${s.pauses.length > 1 ? "s" : ""} · `}
          {s.note ? s.note : "No note"}
        </div>
        {edited && (
          <div style={{ fontSize: 11, color: C.live, marginTop: 3, overflowWrap: "anywhere" }}>
            adjusted from {fmtDur(s.edits[0].oldValue)}
            {s.edits[s.edits.length - 1].reason ? ` — "${s.edits[s.edits.length - 1].reason}"` : ""}
          </div>
        )}
      </div>
      <div style={{ textAlign: "right", marginLeft: 8 }}>
        {rate > 0 && <div style={{ color: C.text, fontWeight: 600, fontSize: 14 }}>{money(amt, cur)}</div>}
        <button style={styles.editLink} onClick={onEdit}>
          Correct
        </button>
      </div>
    </div>
  );
}

function ManualForm({ onAdd, onCancel }) {
  const [min, setMin] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(toDateInput(now()));
  const ts = date ? new Date(date + "T12:00:00").getTime() : now();
  const today = toDateInput(now());
  const friendly = date
    ? new Date(date + "T12:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
    : "";
  return (
    <div style={styles.confirmBox}>
      <div style={{ color: C.text, fontWeight: 600, marginBottom: 2 }}>Add a past session</div>
      <div style={{ color: C.faint, fontSize: 12, marginBottom: 10 }}>
        Logged as “manual” so it’s honestly marked apart from clocked sessions.
      </div>
      <label style={styles.labelTight}>Minutes</label>
      <input style={styles.input} inputMode="numeric" value={min} onChange={(e) => setMin(e.target.value.replace(/[^0-9]/g, ""))} placeholder="60" />
      <label style={styles.labelTight}>Day of the session</label>
      <input style={styles.dateInput} type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
      {friendly && (
        <div style={{ fontSize: 11.5, color: C.faint, marginTop: 5 }}>
          {date === today ? `Today · ${friendly}` : friendly}
        </div>
      )}
      <label style={styles.labelTight}>Note (optional)</label>
      <input style={styles.input} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. make-up lesson" />
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
        <button style={{ ...styles.primaryBtn, opacity: min && date ? 1 : 0.4 }} disabled={!min || !date} onClick={() => onAdd(min, note, ts)}>
          Add session
        </button>
        <button style={{ ...styles.ghostBtn, width: "100%", flex: "none" }} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function EditModal({ s, onClose, onSave }) {
  const [min, setMin] = useState(String(Math.round(s.netSeconds / 60)));
  const [reason, setReason] = useState("");
  return (
    <div style={styles.modalWrap} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontWeight: 600, color: C.text, fontSize: 16, marginBottom: 4 }}>Correct session</div>
        <div style={{ color: C.dim, fontSize: 13, marginBottom: 12, lineHeight: 1.5 }}>
          Currently <b style={{ color: C.text }}>{fmtDur(s.netSeconds)}</b>. Your change is saved openly — the parent’s summary will show both the original and your reason.
        </div>
        <label style={styles.labelTight}>New length (minutes)</label>
        <input style={styles.input} autoFocus inputMode="numeric" value={min} onChange={(e) => setMin(e.target.value.replace(/[^0-9]/g, ""))} />
        <label style={styles.labelTight}>Reason (shown to parent)</label>
        <input style={styles.input} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. ended early, kid unwell" />
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
          <button style={styles.primaryBtn} onClick={() => onSave(min, reason)}>Save correction</button>
          <button style={{ ...styles.ghostBtn, width: "100%", flex: "none" }} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────── Summary ─────────────────────────
function SummaryScreen({ student, sessions, onBack }) {
  const [range, setRange] = useState("month");
  const [customFrom, setCustomFrom] = useState(toDateInput(now() - 13 * 86400000)); // ~2 weeks
  const [customTo, setCustomTo] = useState(toDateInput(now()));
  if (!student) return null;

  let from = 0;
  let to = Infinity;
  if (range === "week") from = startOfWeek();
  else if (range === "month") from = startOfMonth();
  else if (range === "custom") {
    from = customFrom ? new Date(customFrom + "T00:00:00").getTime() : 0;
    to = customTo ? new Date(customTo + "T23:59:59").getTime() : Infinity;
  }
  const inRange = sessions.filter((s) => s.startedAt >= from && s.startedAt <= to);
  const total = inRange.reduce((a, s) => a + s.netSeconds, 0);
  const owed = (total / 3600) * student.rate;
  const anyEdited = inRange.some((s) => s.edits.length > 0);
  const anyManual = inRange.some((s) => s.entryType === "manual");

  return (
    <div style={styles.pane}>
      <Header title="Summary" onBack={onBack} />

      <div style={styles.segment}>
        {[["week", "Week"], ["month", "Month"], ["all", "All"], ["custom", "Custom"]].map(([k, lbl]) => (
          <button
            key={k}
            style={{ ...styles.segBtn, ...(range === k ? styles.segBtnOn : {}) }}
            onClick={() => setRange(k)}
          >
            {lbl}
          </button>
        ))}
      </div>

      {range === "custom" && (
        <div style={styles.dateRow}>
          <div style={{ flex: 1 }}>
            <label style={styles.dateLbl}>From</label>
            <input type="date" style={styles.dateInput} value={customFrom} max={customTo} onChange={(e) => setCustomFrom(e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={styles.dateLbl}>To</label>
            <input type="date" style={styles.dateInput} value={customTo} min={customFrom} onChange={(e) => setCustomTo(e.target.value)} />
          </div>
        </div>
      )}

      {/* the shareable card */}
      <div style={styles.shareCard}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <div style={{ ...styles.avatar, background: student.color }}>{student.name.charAt(0).toUpperCase()}</div>
          <div>
            <div style={{ fontWeight: 700, color: "#0F2027", fontSize: 16 }}>{student.name}</div>
            <div style={{ fontSize: 12, color: "#5E8480" }}>
              {range === "week"
                ? "This week"
                : range === "month"
                ? "This month"
                : range === "all"
                ? "All sessions"
                : `${dayLabel(new Date(customFrom + "T00:00:00").getTime())} – ${dayLabel(new Date(customTo + "T00:00:00").getTime())}`}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 16, marginBottom: 14, flexWrap: "wrap", rowGap: 12 }}>
          <div>
            <div style={styles.shareBig}>{fmtDur(total)}</div>
            <div style={styles.shareLbl}>tutored</div>
          </div>
          <div>
            <div style={styles.shareBig}>{inRange.length}</div>
            <div style={styles.shareLbl}>sessions</div>
          </div>
          {student.rate > 0 && (
            <div>
              <div style={styles.shareBig}>{money(owed, student.currency)}</div>
              <div style={styles.shareLbl}>total</div>
            </div>
          )}
        </div>

        <div style={{ borderTop: "1px solid #D8E6E4", paddingTop: 10 }}>
          {inRange.length === 0 && <div style={{ color: "#5E8480", fontSize: 13 }}>No sessions in this range.</div>}
          {inRange.map((s) => (
            <div key={s.id} style={styles.shareRow}>
              <span style={{ color: "#0F2027", minWidth: 0, overflowWrap: "anywhere", marginRight: 8 }}>
                {dayLabel(s.startedAt)} · {fmtDur(s.netSeconds)}
                {s.entryType === "manual" && <span style={{ color: "#8A8A8A" }}> (manual)</span>}
                {s.edits.length > 0 && <span style={{ color: "#B26A00" }}> (adjusted)</span>}
              </span>
              {student.rate > 0 && (
                <span style={{ color: "#0F2027", fontWeight: 600, whiteSpace: "nowrap", flexShrink: 0 }}>
                  {money((s.netSeconds / 3600) * student.rate, student.currency)}
                </span>
              )}
            </div>
          ))}
        </div>

        {(anyEdited || anyManual) && (
          <div style={styles.trustNote}>
            {anyManual && "Some sessions were entered manually. "}
            {anyEdited && "Adjusted sessions show their original time. "}
            Nothing here is hidden.
          </div>
        )}

        <div style={{ marginTop: 12, textAlign: "center", fontSize: 10, color: "#9AB5B2", letterSpacing: 0.5 }}>
          tracked with TutorClock
        </div>
      </div>

      <button style={styles.primaryBtn} onClick={() => alert("In the real app this exports a PDF / image you send to the parent.\n\n(Prototype can't generate files.)")}>
        ⬇  Export & share
      </button>
    </div>
  );
}

// ───────────────────────── shared bits ─────────────────────────
function Header({ title, subtitle, onBack, ghost }) {
  return (
    <div style={{ ...styles.header, ...(ghost ? { borderBottom: "none", marginBottom: 4 } : {}) }}>
      {onBack ? (
        <button style={styles.backBtn} onClick={onBack}>
          ‹
        </button>
      ) : (
        <div style={{ width: 30 }} />
      )}
      <div style={{ textAlign: "center", flex: 1 }}>
        {title && <div style={{ fontWeight: 700, color: C.text, fontSize: 17 }}>{title}</div>}
        {subtitle && <div style={{ fontSize: 12, color: C.dim }}>{subtitle}</div>}
      </div>
      <div style={{ width: 30 }} />
    </div>
  );
}

function Badge({ text, color }) {
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 0.4,
        color,
        border: `1px solid ${color}55`,
        background: `${color}18`,
        padding: "1px 6px",
        borderRadius: 5,
        textTransform: "uppercase",
      }}
    >
      {text}
    </span>
  );
}

// ───────────────────────── styles ─────────────────────────
const styles = {
  viewport: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    background: "#070E11",
    padding: "24px 12px",
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  phone: {
    width: 340,
    height: 700,
    background: C.bg,
    borderRadius: 38,
    border: "10px solid #05090B",
    boxShadow: "0 30px 70px rgba(0,0,0,.6), inset 0 0 0 1px #ffffff10",
    overflow: "hidden",
    position: "relative",
    display: "flex",
    flexDirection: "column",
  },
  notch: {
    position: "absolute",
    top: 0,
    left: "50%",
    transform: "translateX(-50%)",
    width: 130,
    height: 22,
    background: "#05090B",
    borderRadius: "0 0 16px 16px",
    zIndex: 20,
  },
  screenArea: { flex: 1, display: "flex", flexDirection: "column", paddingTop: 26 },
  pane: { flex: 1, display: "flex", flexDirection: "column", padding: "8px 16px 16px" },
  caption: { color: "#3E5D5A", fontSize: 12, marginTop: 16, textAlign: "center", maxWidth: 320, lineHeight: 1.5 },

  header: {
    display: "flex",
    alignItems: "center",
    paddingBottom: 12,
    marginBottom: 12,
    borderBottom: `1px solid ${C.line}`,
  },
  backBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    border: "none",
    background: C.surface2,
    color: C.text,
    fontSize: 22,
    lineHeight: "26px",
    cursor: "pointer",
    fontWeight: 600,
  },

  empty: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    padding: 30,
    gap: 4,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    background: C.surface2,
    color: C.accent,
    fontSize: 30,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },

  studentCard: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    background: C.surface,
    borderRadius: 14,
    padding: 8,
    marginBottom: 8,
    border: `1px solid ${C.line}`,
  },
  cardMain: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    flex: 1,
    minWidth: 0,
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: 4,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 12,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#fff",
    fontWeight: 700,
    fontSize: 19,
    flexShrink: 0,
  },
  avatarBig: {
    width: 78,
    height: 78,
    borderRadius: 22,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#fff",
    fontWeight: 700,
    fontSize: 34,
  },
  cardName: { fontWeight: 600, color: C.text, fontSize: 16, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  cardMeta: { fontSize: 12.5, color: C.dim, marginTop: 2 },
  startBtn: {
    background: C.accent,
    color: "#04201C",
    border: "none",
    borderRadius: 10,
    padding: "10px 16px",
    fontWeight: 700,
    fontSize: 14,
    cursor: "pointer",
    flexShrink: 0,
  },
  startBtnOn: { background: C.live, color: "#2A1A05" },

  liveBanner: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    background: C.liveSoft,
    border: `1px solid ${C.live}55`,
    borderRadius: 14,
    padding: "12px 14px",
    marginBottom: 12,
    cursor: "pointer",
    width: "100%",
  },
  livePulse: {
    width: 10,
    height: 10,
    borderRadius: "50%",
    background: C.live,
    boxShadow: `0 0 0 0 ${C.live}`,
    animation: "pulse 1.6s infinite",
    flexShrink: 0,
  },

  primaryBtn: {
    background: C.accent,
    color: "#04201C",
    border: "none",
    borderRadius: 13,
    padding: "15px",
    fontWeight: 700,
    fontSize: 15.5,
    cursor: "pointer",
    width: "100%",
    flexShrink: 0,
  },
  ghostBtn: {
    background: C.surface2,
    color: C.text,
    border: "none",
    borderRadius: 13,
    padding: "15px",
    fontWeight: 600,
    fontSize: 15,
    cursor: "pointer",
    flex: 1,
  },

  label: { display: "block", color: C.dim, fontSize: 13, fontWeight: 600, margin: "14px 0 6px" },
  labelTight: { display: "block", color: C.dim, fontSize: 12.5, fontWeight: 600, margin: "10px 0 5px" },
  input: {
    width: "100%",
    boxSizing: "border-box",
    background: C.bg,
    border: `1px solid ${C.line}`,
    borderRadius: 11,
    padding: "13px 14px",
    color: C.text,
    fontSize: 15,
    outline: "none",
    fontFamily: "inherit",
  },
  inputPrefix: {
    position: "absolute",
    left: 14,
    top: "50%",
    transform: "translateY(-50%)",
    color: C.faint,
    fontSize: 14,
    fontWeight: 600,
  },
  swatchRow: { display: "flex", flexWrap: "wrap", gap: 12, marginTop: 4 },
  swatch: { width: 30, height: 30, borderRadius: "50%", border: "none", cursor: "pointer", transition: "transform .15s" },

  pauseBtn: {
    flex: 1,
    background: C.surface2,
    color: C.text,
    border: `1px solid ${C.line}`,
    borderRadius: 14,
    padding: "16px",
    fontWeight: 700,
    fontSize: 16,
    cursor: "pointer",
  },
  stopBtn: {
    flex: 1,
    background: C.danger,
    color: "#fff",
    border: "none",
    borderRadius: 14,
    padding: "16px",
    fontWeight: 700,
    fontSize: 16,
    cursor: "pointer",
  },
  confirmBox: {
    background: C.surface,
    border: `1px solid ${C.line}`,
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
  },

  statStrip: {
    display: "flex",
    gap: 8,
    marginBottom: 14,
  },
  stat: {
    flex: 1,
    background: C.surface,
    border: `1px solid ${C.line}`,
    borderRadius: 12,
    padding: "12px 8px",
    textAlign: "center",
  },
  statNum: { fontWeight: 700, color: C.text, fontSize: 17 },
  statLbl: { fontSize: 11, color: C.dim, marginTop: 2, textTransform: "uppercase", letterSpacing: 0.4 },

  miniPrimary: {
    flex: 1.4,
    background: C.accent,
    color: "#04201C",
    border: "none",
    borderRadius: 11,
    padding: "12px 8px",
    fontWeight: 700,
    fontSize: 14,
    cursor: "pointer",
  },
  miniGhost: {
    flex: 1,
    background: C.surface2,
    color: C.text,
    border: "none",
    borderRadius: 11,
    padding: "12px 8px",
    fontWeight: 600,
    fontSize: 13.5,
    cursor: "pointer",
  },

  sessionRow: {
    display: "flex",
    alignItems: "flex-start",
    background: C.surface,
    border: `1px solid ${C.line}`,
    borderRadius: 12,
    padding: "12px 14px",
    marginBottom: 8,
  },
  editLink: {
    background: "none",
    border: "none",
    color: C.faint,
    fontSize: 12,
    cursor: "pointer",
    marginTop: 4,
    textDecoration: "underline",
    padding: 0,
  },

  modalWrap: {
    position: "absolute",
    inset: 0,
    background: "#00000088",
    display: "flex",
    alignItems: "flex-end",
    zIndex: 30,
    borderRadius: 28,
  },
  modal: {
    background: C.surface,
    borderTop: `1px solid ${C.line}`,
    borderRadius: "20px 20px 0 0",
    padding: 20,
    width: "100%",
    boxSizing: "border-box",
  },

  segment: {
    display: "flex",
    background: C.surface,
    borderRadius: 11,
    padding: 4,
    marginBottom: 14,
    gap: 4,
  },
  segBtn: {
    flex: 1,
    background: "none",
    border: "none",
    color: C.dim,
    padding: "9px 4px",
    borderRadius: 8,
    fontSize: 12.5,
    fontWeight: 600,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  segBtnOn: { background: C.surface2, color: C.text },
  dateRow: { display: "flex", gap: 10, marginBottom: 14 },
  dateLbl: { display: "block", color: C.dim, fontSize: 11.5, fontWeight: 600, marginBottom: 5 },
  dateInput: {
    width: "100%",
    boxSizing: "border-box",
    background: C.bg,
    border: `1px solid ${C.line}`,
    borderRadius: 10,
    padding: "11px 12px",
    color: C.text,
    fontSize: 13.5,
    outline: "none",
    fontFamily: "inherit",
    colorScheme: "dark",
  },

  shareCard: {
    background: "#F3F8F7",
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
    flex: 1,
    overflowY: "auto",
  },
  shareBig: { fontWeight: 700, color: "#0F2027", fontSize: 20 },
  shareLbl: { fontSize: 11, color: "#5E8480", textTransform: "uppercase", letterSpacing: 0.4, marginTop: 1 },
  shareRow: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: 13,
    padding: "6px 0",
    borderBottom: "1px solid #E4EFED",
  },
  trustNote: {
    marginTop: 12,
    background: "#FBF3E6",
    border: "1px solid #E8C99A",
    borderRadius: 9,
    padding: "8px 10px",
    fontSize: 11.5,
    color: "#8A5A00",
    lineHeight: 1.5,
  },
};

// keyframes injected once
if (typeof document !== "undefined" && !document.getElementById("tc-kf")) {
  const st = document.createElement("style");
  st.id = "tc-kf";
  st.textContent =
    "@keyframes pulse{0%{box-shadow:0 0 0 0 rgba(232,150,58,.6)}70%{box-shadow:0 0 0 9px rgba(232,150,58,0)}100%{box-shadow:0 0 0 0 rgba(232,150,58,0)}}";
  document.head.appendChild(st);
}
