/* ============================================================
   share-image.js — draws the parent's summary as a PNG.
   ------------------------------------------------------------
   Why draw it by hand instead of using a screenshot library:
   every such library is a dependency to vendor, understand and
   keep working offline. The canvas API is already in the browser
   and costs nothing, and drawing the card ourselves means the
   exported image is identical on every phone rather than
   depending on how that phone renders a web page.

   The layout runs TWICE: once with paint=false purely to measure
   how tall the card needs to be, then again for real. That is why
   every position comes from the running `y` rather than from
   fixed coordinates.

   Trust rule R3 is enforced here: manual and corrected lessons are
   labelled on the parent's copy, and a corrected lesson prints its
   original length alongside the new one. If it is in the log, it
   is in the picture.
   ============================================================ */

const WIDTH = 560;          // logical width; the real canvas is scaled up
const PAD = 38;
const SCALE = 3;            // 3x so the image stays crisp when shared

const INK = '#22213a';
const MUTED = '#7d7c91';
const LINE = '#e9e8f0';
const PURPLE = '#6657df';
const AMBER = '#b26a00';

const FONT = `-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif`;

function font(size, weight = 400) {
  return `${weight} ${size}px ${FONT}`;
}

/* Shorten text with an ellipsis so it can never run past `max`. */
function fit(ctx, text, max) {
  if (ctx.measureText(text).width <= max) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > max) {
    cut = cut.slice(0, -1);
  }
  return `${cut}…`;
}

/* Break text into lines that fit `max`, returning the lines. */
function wrap(ctx, text, max) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > max && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* The little purple clock mark, drawn rather than loaded, so the
   image needs no network and no embedded file. */
function brandMark(ctx, x, y, size) {
  ctx.fillStyle = PURPLE;
  roundRect(ctx, x, y, size, size, size * 0.29);
  ctx.fill();

  const cx = x + size / 2;
  const cy = y + size / 2;
  const r = size * 0.30;

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = size * 0.075;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx, cy - r * 0.55);
  ctx.lineTo(cx, cy);
  ctx.lineTo(cx + r * 0.48, cy + r * 0.30);
  ctx.stroke();
}

/**
 * Lay the card out, and paint it if asked.
 * Returns the total height, which is how the first pass works.
 */
function layout(ctx, data, paint) {
  const { student, periodLabel, lines, totals, currency, tutorNote } = data;
  const inner = WIDTH - PAD * 2;
  let y = PAD;

  const text = (str, x, size, weight, colour, align = 'left') => {
    if (!paint) return;
    ctx.font = font(size, weight);
    ctx.fillStyle = colour;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(str, x, y);
    ctx.textAlign = 'left';
  };

  const rule = () => {
    if (paint) {
      ctx.strokeStyle = LINE;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(PAD, y + 0.5);
      ctx.lineTo(WIDTH - PAD, y + 0.5);
      ctx.stroke();
    }
    y += 1;
  };

  /* ---- brand ---- */
  if (paint) brandMark(ctx, PAD, y, 34);
  y += 24;
  text('TutorClock', PAD + 46, 16, 700, INK);
  y += 34;

  /* ---- who and when ---- */
  y += 14;
  if (paint) ctx.font = font(30, 750);
  text(paint ? fit(ctx, student.name, inner) : student.name, PAD, 30, 750, INK);
  y += 24;
  text(periodLabel, PAD, 15, 500, MUTED);
  y += 30;

  rule();
  y += 26;

  /* ---- the three headline numbers ---- */
  const cols = totals.amount ? 3 : 2;
  const colW = inner / cols;
  const stats = [
    [totals.durationText, 'TUTORED'],
    [String(totals.count), totals.count === 1 ? 'LESSON' : 'LESSONS'],
  ];
  if (totals.amount) stats.push([totals.amount, 'TOTAL']);

  const statTop = y;
  stats.forEach(([value, label], i) => {
    y = statTop;
    const x = PAD + colW * i;
    if (paint) ctx.font = font(23, 750);
    text(paint ? fit(ctx, value, colW - 10) : value, x, 23, 750, INK);
    y += 18;
    text(label, x, 10.5, 800, MUTED);
  });
  y += 26;

  rule();

  /* ---- every lesson, one per row ---- */
  y += 22;
  if (lines.length === 0) {
    text('No lessons in this period.', PAD, 14, 500, MUTED);
    y += 24;
  }

  for (const line of lines) {
    // Measure the right-hand amount first, so the left-hand text
    // knows how much room is left before it has to truncate.
    let amountWidth = 0;
    if (line.amount) {
      ctx.font = font(14.5, 700);
      amountWidth = ctx.measureText(line.amount).width;
      text(line.amount, WIDTH - PAD, 14.5, 700, INK, 'right');
    }

    const room = inner - amountWidth - 16;
    ctx.font = font(14.5, 600);
    text(fit(ctx, line.main, room), PAD, 14.5, 600, INK);
    y += 17;

    /* The honest labels. "Entered by hand" is a neutral fact and
       stays grey; a correction is the notable one and gets the
       amber. Shouting about both would make an honest tutor look
       like a suspect. */
    if (line.manualNote) {
      text(line.manualNote, PAD, 12, 500, MUTED);
      y += 16;
    }
    if (line.adjustedNote) {
      ctx.font = font(12, 600);
      text(fit(ctx, line.adjustedNote, inner), PAD, 12, 600, AMBER);
      y += 16;
    }
    y += 12;

    if (paint) {
      ctx.strokeStyle = '#f2f1f6';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(PAD, y + 0.5);
      ctx.lineTo(WIDTH - PAD, y + 0.5);
      ctx.stroke();
    }
    y += 13;
  }

  /* ---- the trust note ---- */
  if (tutorNote) {
    y += 10;
    if (paint) ctx.font = font(12.5, 500);
    ctx.font = font(12.5, 500);
    const noteLines = wrap(ctx, tutorNote, inner - 28);
    const boxHeight = noteLines.length * 17 + 24;

    if (paint) {
      ctx.fillStyle = '#fdf6ec';
      roundRect(ctx, PAD, y, inner, boxHeight, 10);
      ctx.fill();
      ctx.strokeStyle = '#f0dcc4';
      ctx.lineWidth = 1;
      roundRect(ctx, PAD + 0.5, y + 0.5, inner - 1, boxHeight - 1, 10);
      ctx.stroke();
    }

    y += 29;
    for (const noteLine of noteLines) {
      text(noteLine, PAD + 14, 12.5, 500, AMBER);
      y += 17;
    }
    y += 5;
  }

  /* ---- footer ---- */
  y += 26;
  text('tracked with TutorClock', WIDTH / 2, 11, 600, '#a9a7b5', 'center');
  y += PAD;

  return y;
}

/** Build the summary card as a canvas. */
export function drawSummary(data) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  // Pass one: measure only.
  const height = layout(ctx, data, false);

  // Pass two: size the canvas, then paint for real. Setting width or
  // height resets the context, so the scale is applied after.
  canvas.width = WIDTH * SCALE;
  canvas.height = Math.ceil(height) * SCALE;
  ctx.scale(SCALE, SCALE);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, WIDTH, height);

  layout(ctx, data, true);
  return canvas;
}

/** Canvas -> PNG blob. */
export function toPngBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}
