import React, { useState, useEffect } from "react";

// ─────────────────────────────────────────────────────────────
// TutorClock — prototype v2
// Same validated flow as v1, wearing the harvested Tutorly design
// system (violet on light canvas). Phone-first. In-memory only.
// ─────────────────────────────────────────────────────────────

const T = {
  ink: "#22213a",
  muted: "#7d7c91",
  line: "#e9e8f0",
  canvas: "#f7f7fb",
  purple: "#6657df",
  purpleDark: "#4e42c1",
  purpleSoft: "#efedff",
  green: "#18a67e",
  orange: "#ed825c",
  blue: "#4b8de8",
  white: "#ffffff",
};

const SHADOW_CARD = "0 3px 12px #2d29450a";
const SHADOW_PURPLE = "0 8px 20px #6657df38";
const SHADOW_MODAL = "0 15px 40px #28243e20";

const AVATAR_COLORS = [T.purple, T.orange, T.blue, T.green, "#c77dbb", "#e0685f", "#4ca3c4", "#8a7ae8"];

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
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}
function money(n, cur) {
  return `${cur || "ETB"} ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}
function dayLabel(ts) {
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function toDateInput(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function startOfWeek() {
  const d = new Date();
  const day = (d.getDay() + 6) % 7;
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
  const [, setTick] = useState(0);
  const [active, setActive] = useState(null);

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

  function addStudent(name, rate, colorIdx) {
    setStudents((p) => [
      ...p,
      {
        id: uid(),
        name: name.trim(),
        rate: Number(rate) || 0,
        currency: "ETB",
        color: AVATAR_COLORS[colorIdx % AVATAR_COLORS.length],
        createdAt: now(),
      },
    ]);
  }

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
      }
      return { ...a, paused: true, pauses: [...a.pauses, { pausedAt: now(), resumedAt: null }] };
    });
  }
  function stopSession(note) {
    const a = active;
    if (!a) return;
    const pauses = a.pauses.map((p) => ({ ...p, resumedAt: p.resumedAt || now() }));
    let paused = 0;
    for (const p of pauses) paused += p.resumedAt - p.pausedAt;
    setSessions((prev) => [
      ...prev,
      {
        id: uid(),
        studentId: a.studentId,
        startedAt: a.startedAt,
        endedAt: now(),
        pauses,
        netSeconds: Math.round((now() - a.startedAt - paused) / 1000),
        entryType: "live",
        note: note || "",
        edits: [],
        locked: false,
      },
    ]);
    setActive(null);
    setScreen({ name: "student", id: a.studentId });
  }
  function addManual(studentId, minutes, note, whenTs) {
    const net = Math.round(Number(minutes) * 60);
    setSessions((p) => [
      ...p,
      {
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
      },
    ]);
  }
  function editSession(sessionId, newMinutes, reason) {
    setSessions((p) =>
      p.map((s) => {
        if (s.id !== sessionId) return s;
        const newNet = Math.round(Number(newMinutes) * 60);
        return {
          ...s,
          netSeconds: newNet,
          edits: [...s.edits, { editedAt: now(), field: "netSeconds", oldValue: s.netSeconds, newValue: newNet, reason: reason || "" }],
        };
      })
    );
  }

  const activeStudent = active ? studentById(active.studentId) : null;

  return (
    <div style={S.viewport}>
      <div style={S.phone}>
        <div style={S.notch} />
        <div style={S.screenArea}>
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
              onSave={(n, r, c) => {
                addStudent(n, r, c);
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
              onManual={(m, n, ts) => addManual(screen.id, m, n, ts)}
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
      <p style={S.caption}>Prototype v2 · harvested Tutorly design · data resets on refresh</p>
    </div>
  );
}

// ───────────────────────── Dashboard ─────────────────────────
function Dashboard({ students, sessions, active, activeStudent, netOf, onAdd, onStart, onOpen, onResumeActive }) {
  const weekStart = startOfWeek();
  const weekSecFor = (id) =>
    sessions.filter((s) => s.studentId === id && s.startedAt >= weekStart).reduce((a, s) => a + s.netSeconds, 0);
  const weekTotal = sessions.filter((s) => s.startedAt >= weekStart).reduce((a, s) => a + s.netSeconds, 0);

  return (
    <div style={S.pane}>
      <div style={S.topBar}>
        <div style={S.brandMark}>◷</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 17, color: T.ink, letterSpacing: -0.3 }}>TutorClock</div>
          <div style={{ fontSize: 12, color: T.muted }}>
            {weekTotal > 0 ? `${fmtDur(weekTotal)} tracked this week` : "No sessions yet this week"}
          </div>
        </div>
      </div>

      {active && activeStudent && (
        <button style={S.liveBanner} onClick={onResumeActive}>
          <span style={active.paused ? S.dotIdle : S.dotLive} />
          <div style={{ textAlign: "left", flex: 1, minWidth: 0 }}>
            <div style={S.eyebrowLive}>{active.paused ? "PAUSED" : "SESSION RUNNING"}</div>
            <div style={{ fontSize: 14.5, color: T.ink, fontWeight: 700 }}>{activeStudent.name}</div>
          </div>
          <div style={{ fontSize: 19, fontWeight: 800, color: active.paused ? T.muted : T.orange, fontVariantNumeric: "tabular-nums" }}>
            {fmt(netOf(active))}
          </div>
        </button>
      )}

      <div style={{ flex: 1, overflowY: "auto", paddingBottom: 8 }}>
        {students.length === 0 && (
          <div style={S.empty}>
            <div style={S.emptyIcon}>＋</div>
            <div style={{ fontWeight: 700, color: T.ink, marginBottom: 6 }}>No students yet</div>
            <div style={{ color: T.muted, fontSize: 13.5, lineHeight: 1.6, maxWidth: 230 }}>
              Add the first student you tutor, then tap Start when your lesson begins.
            </div>
          </div>
        )}

        {students.map((s) => {
          const wk = weekSecFor(s.id);
          const isActive = active && active.studentId === s.id;
          return (
            <div key={s.id} style={{ ...S.card, ...(isActive ? S.cardActive : {}) }}>
              <button style={S.cardMain} onClick={() => onOpen(s.id)}>
                <div style={{ ...S.avatar, background: s.color }}>{s.name.charAt(0).toUpperCase()}</div>
                <div style={{ textAlign: "left", flex: 1, minWidth: 0 }}>
                  <div style={S.cardName}>{s.name}</div>
                  <div style={S.cardMeta}>
                    {wk > 0 ? `${fmtDur(wk)} this week` : "Nothing this week"}
                    {s.rate > 0 && <span style={{ color: T.muted }}> · {money(s.rate, s.currency)}/hr</span>}
                  </div>
                </div>
              </button>
              <button
                style={{ ...S.startBtn, ...(isActive ? S.startBtnOn : {}), ...(active && !isActive ? S.startBtnOff : {}) }}
                onClick={() => (isActive ? onResumeActive() : onStart(s.id))}
                disabled={active && !isActive}
              >
                {isActive ? "Open" : "Start"}
              </button>
            </div>
          );
        })}
      </div>

      <button style={S.primaryBtn} onClick={onAdd}>＋  Add student</button>
    </div>
  );
}

// ───────────────────────── Add student ─────────────────────────
function AddStudent({ existingCount, onCancel, onSave }) {
  const [name, setName] = useState("");
  const [rate, setRate] = useState("");
  const [colorIdx, setColorIdx] = useState(existingCount % AVATAR_COLORS.length);

  return (
    <div style={S.pane}>
      <Header title="Add student" onBack={onCancel} />
      <div style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "center", margin: "6px 0 22px" }}>
          <div style={{ ...S.avatarBig, background: AVATAR_COLORS[colorIdx] }}>
            {name ? name.charAt(0).toUpperCase() : "?"}
          </div>
        </div>

        <label style={S.label}>Name</label>
        <input autoFocus style={S.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Meron" />

        <label style={S.label}>Hourly rate</label>
        <div style={{ position: "relative" }}>
          <span style={S.inputPrefix}>ETB</span>
          <input
            style={{ ...S.input, paddingLeft: 54 }}
            value={rate}
            onChange={(e) => setRate(e.target.value.replace(/[^0-9.]/g, ""))}
            placeholder="400"
            inputMode="decimal"
          />
        </div>

        <label style={S.label}>Colour</label>
        <div style={S.swatchRow}>
          {AVATAR_COLORS.map((col, i) => (
            <button
              key={col}
              onClick={() => setColorIdx(i)}
              style={{
                ...S.swatch,
                background: col,
                boxShadow: i === colorIdx ? `0 0 0 3px ${T.white}, 0 0 0 5px ${col}` : "none",
              }}
            />
          ))}
        </div>
      </div>

      <button style={{ ...S.primaryBtn, opacity: name.trim() ? 1 : 0.45 }} disabled={!name.trim()} onClick={() => onSave(name, rate, colorIdx)}>
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
    <div style={S.pane}>
      <Header title="" onBack={onBack} ghost />

      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div style={{ ...S.avatarBig, background: student.color, marginBottom: 14 }}>
          {student.name.charAt(0).toUpperCase()}
        </div>
        <div style={{ fontSize: 17, fontWeight: 700, color: T.ink }}>{student.name}</div>

        <div
          style={{
            fontSize: 58,
            fontWeight: 800,
            letterSpacing: -1.5,
            fontVariantNumeric: "tabular-nums",
            color: paused ? T.muted : T.orange,
            margin: "14px 0 6px",
            transition: "color .3s",
          }}
        >
          {fmt(net)}
        </div>

        <div style={{ ...S.pill, background: paused ? T.line : "#fdefe9", color: paused ? T.muted : "#c25a34" }}>
          {!paused && <span style={S.dotLive} />}
          {paused ? "PAUSED" : "RUNNING"}
        </div>

        {student.rate > 0 && (
          <div style={{ fontSize: 13, color: T.muted, marginTop: 16 }}>
            ≈ <b style={{ color: T.ink }}>{money((net / 3600) * student.rate, student.currency)}</b> so far
          </div>
        )}
        {active.pauses.length > 0 && (
          <div style={{ fontSize: 12, color: T.muted, marginTop: 5 }}>
            {active.pauses.length} break{active.pauses.length > 1 ? "s" : ""} · not billed
          </div>
        )}
      </div>

      {!confirming ? (
        <div style={{ display: "flex", gap: 10 }}>
          <button style={S.pauseBtn} onClick={onPauseToggle}>{paused ? "▶  Resume" : "❚❚  Pause"}</button>
          <button style={S.stopBtn} onClick={() => setConfirming(true)}>■  Stop</button>
        </div>
      ) : (
        <div style={S.sheet}>
          <div style={{ color: T.ink, fontWeight: 700, fontSize: 15.5, marginBottom: 3 }}>End this session?</div>
          <div style={{ color: T.muted, fontSize: 13, marginBottom: 12 }}>
            <b style={{ color: T.ink }}>{fmtDur(net)}</b> will be saved for {student.name}.
          </div>
          <input style={S.input} placeholder="Note (optional) — e.g. Algebra ch.4" value={note} onChange={(e) => setNote(e.target.value)} />
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
            <button style={S.primaryBtn} onClick={() => onStop(note)}>Save session</button>
            <button style={S.ghostBtn} onClick={() => setConfirming(false)}>Keep going</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ───────────────────────── Student detail ─────────────────────────
function StudentDetail({ student, sessions, onBack, onStart, onManual, onEdit, onSummary }) {
  const [manualOpen, setManualOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  if (!student) return null;

  const total = sessions.reduce((a, s) => a + s.netSeconds, 0);
  const earned = (total / 3600) * student.rate;

  return (
    <div style={S.pane}>
      <Header title={student.name} onBack={onBack} />

      <div style={S.statGrid}>
        <div style={S.stat}>
          <div style={S.statNum}>{sessions.length}</div>
          <div style={S.statLbl}>sessions</div>
        </div>
        <div style={S.stat}>
          <div style={S.statNum}>{fmtDur(total)}</div>
          <div style={S.statLbl}>total</div>
        </div>
        {student.rate > 0 && (
          <div style={{ ...S.stat, background: T.purpleSoft, borderColor: "#ddd8ff" }}>
            <div style={{ ...S.statNum, color: T.purpleDark }}>{money(earned, student.currency)}</div>
            <div style={{ ...S.statLbl, color: T.purple }}>earned</div>
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <button style={S.miniPrimary} onClick={onStart}>▶  Start session</button>
        <button style={S.miniGhost} onClick={() => setManualOpen((v) => !v)}>＋ Past</button>
        <button style={{ ...S.miniGhost, opacity: sessions.length ? 1 : 0.45 }} onClick={onSummary} disabled={!sessions.length}>
          Summary
        </button>
      </div>

      {manualOpen && <ManualForm onAdd={(m, n, ts) => { onManual(m, n, ts); setManualOpen(false); }} onCancel={() => setManualOpen(false)} />}

      <div style={{ flex: 1, overflowY: "auto" }}>
        {sessions.length === 0 && !manualOpen && (
          <div style={S.empty}>
            <div style={{ color: T.muted, fontSize: 13.5, maxWidth: 220, lineHeight: 1.6 }}>
              No sessions yet. Tap <b style={{ color: T.ink }}>Start session</b> when your lesson begins.
            </div>
          </div>
        )}
        {sessions.map((s) => (
          <SessionRow key={s.id} s={s} rate={student.rate} cur={student.currency} onEdit={() => setEditing(s)} />
        ))}
      </div>

      {editing && (
        <EditModal s={editing} onClose={() => setEditing(null)} onSave={(m, r) => { onEdit(editing.id, m, r); setEditing(null); }} />
      )}
    </div>
  );
}

function SessionRow({ s, rate, cur, onEdit }) {
  const edited = s.edits.length > 0;
  return (
    <div style={S.sessionRow}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap", rowGap: 4 }}>
          <span style={{ fontWeight: 700, color: T.ink, fontSize: 15 }}>{fmtDur(s.netSeconds)}</span>
          <span style={{ color: T.muted, fontSize: 12 }}>{dayLabel(s.startedAt)}</span>
          {s.entryType === "manual" ? <Badge text="manual" c={T.muted} bg="#f0eff4" /> : <Badge text="live" c={T.green} bg="#e6f6f1" />}
          {edited && <Badge text="edited" c="#c25a34" bg="#fdefe9" />}
        </div>
        <div style={{ fontSize: 12, color: T.muted, overflowWrap: "anywhere" }}>
          {s.pauses.length > 0 && `${s.pauses.length} break${s.pauses.length > 1 ? "s" : ""} · `}
          {s.note || "No note"}
        </div>
        {edited && (
          <div style={{ fontSize: 11.5, color: "#c25a34", marginTop: 4, overflowWrap: "anywhere" }}>
            adjusted from {fmtDur(s.edits[0].oldValue)}
            {s.edits[s.edits.length - 1].reason ? ` — "${s.edits[s.edits.length - 1].reason}"` : ""}
          </div>
        )}
      </div>
      <div style={{ textAlign: "right", marginLeft: 10, flexShrink: 0 }}>
        {rate > 0 && <div style={{ color: T.ink, fontWeight: 700, fontSize: 14 }}>{money((s.netSeconds / 3600) * rate, cur)}</div>}
        <button style={S.editLink} onClick={onEdit}>Correct</button>
      </div>
    </div>
  );
}

function ManualForm({ onAdd, onCancel }) {
  const [min, setMin] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(toDateInput(now()));
  const today = toDateInput(now());
  const ts = date ? new Date(date + "T12:00:00").getTime() : now();
  const friendly = date
    ? new Date(date + "T12:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
    : "";

  return (
    <div style={S.sheet}>
      <div style={{ color: T.ink, fontWeight: 700, fontSize: 15, marginBottom: 3 }}>Add a past session</div>
      <div style={{ color: T.muted, fontSize: 12, marginBottom: 10 }}>
        Logged as “manual” so it’s honestly marked apart from clocked sessions.
      </div>
      <label style={S.labelTight}>Minutes</label>
      <input style={S.input} inputMode="numeric" value={min} onChange={(e) => setMin(e.target.value.replace(/[^0-9]/g, ""))} placeholder="60" />
      <label style={S.labelTight}>Day of the session</label>
      <input style={S.input} type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
      {friendly && (
        <div style={{ fontSize: 11.5, color: T.muted, marginTop: 5 }}>{date === today ? `Today · ${friendly}` : friendly}</div>
      )}
      <label style={S.labelTight}>Note (optional)</label>
      <input style={S.input} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. make-up lesson" />
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
        <button style={{ ...S.primaryBtn, opacity: min && date ? 1 : 0.45 }} disabled={!min || !date} onClick={() => onAdd(min, note, ts)}>
          Add session
        </button>
        <button style={S.ghostBtn} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function EditModal({ s, onClose, onSave }) {
  const [min, setMin] = useState(String(Math.round(s.netSeconds / 60)));
  const [reason, setReason] = useState("");
  return (
    <div style={S.modalWrap} onClick={onClose}>
      <div style={S.modal} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontWeight: 700, color: T.ink, fontSize: 16.5, marginBottom: 5 }}>Correct session</div>
        <div style={{ color: T.muted, fontSize: 13, marginBottom: 14, lineHeight: 1.6 }}>
          Currently <b style={{ color: T.ink }}>{fmtDur(s.netSeconds)}</b>. Your change is saved openly — the parent’s summary shows the original and your reason.
        </div>
        <label style={S.labelTight}>New length (minutes)</label>
        <input style={S.input} autoFocus inputMode="numeric" value={min} onChange={(e) => setMin(e.target.value.replace(/[^0-9]/g, ""))} />
        <label style={S.labelTight}>Reason (shown to parent)</label>
        <input style={S.input} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. ended early, kid unwell" />
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
          <button style={S.primaryBtn} onClick={() => onSave(min, reason)}>Save correction</button>
          <button style={S.ghostBtn} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────── Summary ─────────────────────────
function SummaryScreen({ student, sessions, onBack }) {
  const [range, setRange] = useState("month");
  const [from_, setFrom] = useState(toDateInput(now() - 13 * 86400000));
  const [to_, setTo] = useState(toDateInput(now()));
  if (!student) return null;

  let from = 0;
  let to = Infinity;
  if (range === "week") from = startOfWeek();
  else if (range === "month") from = startOfMonth();
  else if (range === "custom") {
    from = from_ ? new Date(from_ + "T00:00:00").getTime() : 0;
    to = to_ ? new Date(to_ + "T23:59:59").getTime() : Infinity;
  }

  const inRange = sessions.filter((s) => s.startedAt >= from && s.startedAt <= to);
  const total = inRange.reduce((a, s) => a + s.netSeconds, 0);
  const owed = (total / 3600) * student.rate;
  const anyEdited = inRange.some((s) => s.edits.length > 0);
  const anyManual = inRange.some((s) => s.entryType === "manual");

  return (
    <div style={S.pane}>
      <Header title="Summary" onBack={onBack} />

      <div style={S.segment}>
        {[["week", "Week"], ["month", "Month"], ["all", "All"], ["custom", "Custom"]].map(([k, lbl]) => (
          <button key={k} style={{ ...S.segBtn, ...(range === k ? S.segBtnOn : {}) }} onClick={() => setRange(k)}>
            {lbl}
          </button>
        ))}
      </div>

      {range === "custom" && (
        <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <label style={S.labelTight}>From</label>
            <input type="date" style={S.input} value={from_} max={to_} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={S.labelTight}>To</label>
            <input type="date" style={S.input} value={to_} min={from_} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
      )}

      <div style={S.paper}>
        <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 16 }}>
          <div style={{ ...S.avatar, background: student.color }}>{student.name.charAt(0).toUpperCase()}</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 800, color: T.ink, fontSize: 16 }}>{student.name}</div>
            <div style={{ fontSize: 12, color: T.muted }}>
              {range === "week"
                ? "This week"
                : range === "month"
                ? "This month"
                : range === "all"
                ? "All sessions"
                : `${dayLabel(new Date(from_ + "T12:00:00").getTime())} – ${dayLabel(new Date(to_ + "T12:00:00").getTime())}`}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 18, marginBottom: 16, flexWrap: "wrap", rowGap: 12 }}>
          <div>
            <div style={S.paperBig}>{fmtDur(total)}</div>
            <div style={S.paperLbl}>tutored</div>
          </div>
          <div>
            <div style={S.paperBig}>{inRange.length}</div>
            <div style={S.paperLbl}>sessions</div>
          </div>
          {student.rate > 0 && (
            <div>
              <div style={{ ...S.paperBig, color: T.purpleDark }}>{money(owed, student.currency)}</div>
              <div style={S.paperLbl}>total</div>
            </div>
          )}
        </div>

        <div style={{ borderTop: `1px solid ${T.line}`, paddingTop: 10 }}>
          {inRange.length === 0 && <div style={{ color: T.muted, fontSize: 13 }}>No sessions in this range.</div>}
          {inRange.map((s) => (
            <div key={s.id} style={S.paperRow}>
              <span style={{ color: T.ink, minWidth: 0, overflowWrap: "anywhere", marginRight: 8 }}>
                {dayLabel(s.startedAt)} · {fmtDur(s.netSeconds)}
                {s.entryType === "manual" && <span style={{ color: T.muted }}> (manual)</span>}
                {s.edits.length > 0 && <span style={{ color: "#c25a34" }}> (adjusted)</span>}
              </span>
              {student.rate > 0 && (
                <span style={{ color: T.ink, fontWeight: 700, whiteSpace: "nowrap", flexShrink: 0 }}>
                  {money((s.netSeconds / 3600) * student.rate, student.currency)}
                </span>
              )}
            </div>
          ))}
        </div>

        {(anyEdited || anyManual) && (
          <div style={S.trustNote}>
            {anyManual && "Some sessions were entered manually. "}
            {anyEdited && "Adjusted sessions show their original time. "}
            Nothing here is hidden.
          </div>
        )}

        <div style={{ marginTop: 14, textAlign: "center", fontSize: 10, color: T.muted, letterSpacing: 0.6 }}>
          tracked with TutorClock
        </div>
      </div>

      <button
        style={S.primaryBtn}
        onClick={() => alert("In the real app this exports a PDF / image you send to the parent.\n\n(Prototype can't generate files.)")}
      >
        ⬇  Export & share
      </button>
    </div>
  );
}

// ───────────────────────── shared ─────────────────────────
function Header({ title, onBack, ghost }) {
  return (
    <div style={{ ...S.header, ...(ghost ? { borderBottom: "none", marginBottom: 0 } : {}) }}>
      {onBack ? <button style={S.backBtn} onClick={onBack}>‹</button> : <div style={{ width: 34 }} />}
      <div style={{ flex: 1, textAlign: "center", fontWeight: 800, color: T.ink, fontSize: 16.5, letterSpacing: -0.2 }}>
        {title}
      </div>
      <div style={{ width: 34 }} />
    </div>
  );
}

function Badge({ text, c, bg }) {
  return (
    <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.5, color: c, background: bg, padding: "2px 7px", borderRadius: 7, textTransform: "uppercase" }}>
      {text}
    </span>
  );
}

const S = {
  viewport: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    background: "#e7e6ef",
    padding: "24px 12px",
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
  },
  phone: {
    width: 340,
    height: 700,
    background: T.canvas,
    borderRadius: 38,
    border: "10px solid #2a2740",
    boxShadow: "0 30px 80px #15122640",
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
    width: 128,
    height: 22,
    background: "#2a2740",
    borderRadius: "0 0 16px 16px",
    zIndex: 20,
  },
  screenArea: { flex: 1, display: "flex", flexDirection: "column", paddingTop: 26 },
  pane: { flex: 1, display: "flex", flexDirection: "column", padding: "10px 16px 16px", minHeight: 0 },
  caption: { color: "#8f8da3", fontSize: 12, marginTop: 16, textAlign: "center" },

  topBar: { display: "flex", alignItems: "center", gap: 11, paddingBottom: 14 },
  brandMark: {
    width: 38,
    height: 38,
    borderRadius: 12,
    background: T.purple,
    color: "#fff",
    display: "grid",
    placeItems: "center",
    boxShadow: SHADOW_PURPLE,
    fontSize: 19,
    flexShrink: 0,
  },

  header: { display: "flex", alignItems: "center", paddingBottom: 12, marginBottom: 12, borderBottom: `1px solid ${T.line}` },
  backBtn: {
    width: 34,
    height: 34,
    borderRadius: 11,
    border: `1px solid ${T.line}`,
    background: T.white,
    color: T.ink,
    fontSize: 22,
    lineHeight: "28px",
    cursor: "pointer",
    fontWeight: 700,
    flexShrink: 0,
  },

  empty: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 26 },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 17,
    background: T.purpleSoft,
    color: T.purple,
    fontSize: 27,
    display: "grid",
    placeItems: "center",
    marginBottom: 15,
  },

  card: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    background: T.white,
    borderRadius: 15,
    padding: 9,
    marginBottom: 9,
    border: `1px solid ${T.line}`,
    boxShadow: SHADOW_CARD,
  },
  cardActive: { borderColor: "#f6cdbb", background: "#fffaf8" },
  cardMain: { display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0, background: "none", border: "none", cursor: "pointer", padding: 4 },
  cardName: { fontWeight: 700, color: T.ink, fontSize: 15.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  cardMeta: { fontSize: 12.5, color: T.muted, marginTop: 2 },

  avatar: { width: 44, height: 44, borderRadius: 13, display: "grid", placeItems: "center", color: "#fff", fontWeight: 800, fontSize: 18, flexShrink: 0 },
  avatarBig: { width: 80, height: 80, borderRadius: 24, display: "grid", placeItems: "center", color: "#fff", fontWeight: 800, fontSize: 34 },

  startBtn: {
    background: T.purple,
    color: "#fff",
    border: "none",
    borderRadius: 11,
    padding: "11px 17px",
    fontWeight: 700,
    fontSize: 14,
    cursor: "pointer",
    flexShrink: 0,
    boxShadow: SHADOW_PURPLE,
  },
  startBtnOn: { background: T.orange, boxShadow: "0 8px 20px #ed825c38" },
  startBtnOff: { background: T.line, color: T.muted, boxShadow: "none", cursor: "default" },

  liveBanner: {
    display: "flex",
    alignItems: "center",
    gap: 11,
    background: "#fdefe9",
    border: "1px solid #f6cdbb",
    borderRadius: 15,
    padding: "12px 14px",
    marginBottom: 12,
    cursor: "pointer",
    width: "100%",
  },
  eyebrowLive: { fontSize: 10.5, letterSpacing: 0.9, fontWeight: 800, color: "#c25a34" },
  dotLive: { width: 9, height: 9, borderRadius: "50%", background: T.orange, animation: "tcpulse 1.6s infinite", flexShrink: 0 },
  dotIdle: { width: 9, height: 9, borderRadius: "50%", background: T.muted, flexShrink: 0 },

  pill: { display: "flex", alignItems: "center", gap: 7, fontSize: 11.5, fontWeight: 800, letterSpacing: 1, padding: "6px 13px", borderRadius: 20 },

  primaryBtn: {
    background: T.purple,
    color: "#fff",
    border: "none",
    borderRadius: 14,
    padding: "15px",
    fontWeight: 700,
    fontSize: 15.5,
    cursor: "pointer",
    width: "100%",
    flexShrink: 0,
    boxShadow: SHADOW_PURPLE,
  },
  ghostBtn: {
    background: T.white,
    color: T.ink,
    border: `1px solid ${T.line}`,
    borderRadius: 14,
    padding: "15px",
    fontWeight: 600,
    fontSize: 15,
    cursor: "pointer",
    width: "100%",
  },
  pauseBtn: { flex: 1, background: T.white, color: T.ink, border: `1px solid ${T.line}`, borderRadius: 15, padding: "16px", fontWeight: 700, fontSize: 15.5, cursor: "pointer" },
  stopBtn: { flex: 1, background: T.ink, color: "#fff", border: "none", borderRadius: 15, padding: "16px", fontWeight: 700, fontSize: 15.5, cursor: "pointer" },

  label: { display: "block", color: T.ink, fontSize: 13, fontWeight: 700, margin: "15px 0 6px" },
  labelTight: { display: "block", color: T.ink, fontSize: 12.5, fontWeight: 700, margin: "10px 0 5px" },
  input: {
    width: "100%",
    boxSizing: "border-box",
    background: T.white,
    border: `1px solid ${T.line}`,
    borderRadius: 12,
    padding: "13px 14px",
    color: T.ink,
    fontSize: 15,
    outline: "none",
    fontFamily: "inherit",
  },
  inputPrefix: { position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: T.muted, fontSize: 14, fontWeight: 700 },
  swatchRow: { display: "flex", flexWrap: "wrap", gap: 14, marginTop: 6 },
  swatch: { width: 28, height: 28, borderRadius: "50%", border: "none", cursor: "pointer" },

  sheet: { background: T.white, border: `1px solid ${T.line}`, borderRadius: 16, padding: 15, marginBottom: 10, boxShadow: SHADOW_CARD },

  statGrid: { display: "flex", gap: 8, marginBottom: 14 },
  stat: { flex: 1, background: T.white, border: `1px solid ${T.line}`, borderRadius: 13, padding: "12px 8px", textAlign: "center", boxShadow: SHADOW_CARD },
  statNum: { fontWeight: 800, color: T.ink, fontSize: 16.5 },
  statLbl: { fontSize: 10.5, color: T.muted, marginTop: 3, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 700 },

  miniPrimary: { flex: 1.5, background: T.purple, color: "#fff", border: "none", borderRadius: 12, padding: "12px 8px", fontWeight: 700, fontSize: 13.5, cursor: "pointer", boxShadow: SHADOW_PURPLE },
  miniGhost: { flex: 1, background: T.white, color: T.ink, border: `1px solid ${T.line}`, borderRadius: 12, padding: "12px 8px", fontWeight: 600, fontSize: 13, cursor: "pointer" },

  sessionRow: { display: "flex", alignItems: "flex-start", background: T.white, border: `1px solid ${T.line}`, borderRadius: 13, padding: "12px 14px", marginBottom: 8, boxShadow: SHADOW_CARD },
  editLink: { background: "none", border: "none", color: T.purple, fontSize: 12, cursor: "pointer", marginTop: 4, fontWeight: 600, padding: 0 },

  modalWrap: { position: "absolute", inset: 0, background: "#211d3d88", display: "flex", alignItems: "flex-end", zIndex: 30 },
  modal: { background: T.white, borderRadius: "20px 20px 0 0", padding: 20, width: "100%", boxSizing: "border-box", boxShadow: SHADOW_MODAL },

  segment: { display: "flex", background: "#eeedf4", borderRadius: 12, padding: 4, marginBottom: 14, gap: 4 },
  segBtn: { flex: 1, background: "none", border: "none", color: T.muted, padding: "9px 4px", borderRadius: 9, fontSize: 12.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" },
  segBtnOn: { background: T.white, color: T.ink, boxShadow: SHADOW_CARD },

  paper: { background: T.white, borderRadius: 17, padding: 18, marginBottom: 14, flex: 1, overflowY: "auto", border: `1px solid ${T.line}`, boxShadow: SHADOW_CARD, minHeight: 0 },
  paperBig: { fontWeight: 800, color: T.ink, fontSize: 20 },
  paperLbl: { fontSize: 10.5, color: T.muted, textTransform: "uppercase", letterSpacing: 0.6, marginTop: 2, fontWeight: 700 },
  paperRow: { display: "flex", justifyContent: "space-between", fontSize: 13, padding: "7px 0", borderBottom: `1px solid ${T.canvas}` },

  trustNote: { marginTop: 14, background: "#fdefe9", border: "1px solid #f6cdbb", borderRadius: 11, padding: "9px 11px", fontSize: 11.5, color: "#a94f2c", lineHeight: 1.6 },
};

if (typeof document !== "undefined" && !document.getElementById("tc2-kf")) {
  const st = document.createElement("style");
  st.id = "tc2-kf";
  st.textContent =
    "@keyframes tcpulse{0%{box-shadow:0 0 0 0 #ed825c99}70%{box-shadow:0 0 0 8px #ed825c00}100%{box-shadow:0 0 0 0 #ed825c00}}";
  document.head.appendChild(st);
}
