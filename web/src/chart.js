export function buildGraphPoints(charTimings, stats, keypressHistory) {
    // Prefer keypressHistory: it's an append-only log of every keystroke as
    // it actually happened, so a mistake you later backspaced away still
    // shows up as a real event at the time it occurred. charTimings is
    // current-state-only - backspacing overwrites the slot for that
    // position, so a corrected mistake leaves no trace by the end of the
    // test, and raw silently collapses onto wpm for the whole graph.
    let timings = (keypressHistory && keypressHistory.length > 0) ? keypressHistory : charTimings;
    if (!timings || timings.length === 0) {
        if (!(stats.time > 0 && stats.totalChars > 0)) return [];
        const total = stats.correctChars + stats.incorrectChars;
        timings = [];
        for (let i = 0; i < total; i++) {
            timings.push({ time: (i / total) * stats.time, isCorrect: i < stats.correctChars });
        }
    }

    const maxTime = Math.max(timings[timings.length - 1].time, stats.time);
    const seconds = Math.max(1, Math.ceil(maxTime));
    // Cap the number of plotted buckets regardless of how long the test
    // actually took wall-clock-wise (nothing stops a test from sitting open,
    // unfinished, for hours) by widening the bucket instead of the point
    // count. For any normal-length test (<= 300s) this divides out to 1s
    // buckets exactly as before - pure safety net, no behavior change.
    const MAX_BUCKETS = 300;
    const bucketSeconds = Math.max(1, Math.ceil(seconds / MAX_BUCKETS));
    const bucketCount = Math.ceil(seconds / bucketSeconds);

    const buckets = Array.from({ length: bucketCount }, () => ({ total: 0, correct: 0 }));
    for (const c of timings) {
        const idx = Math.min(bucketCount - 1, Math.floor(c.time / bucketSeconds));
        if (idx < 0) continue;
        buckets[idx].total++;
        if (c.isCorrect) buckets[idx].correct++;
    }

    // Each point is a sliding window over the last ~3 seconds, not just its
    // own isolated bucket. A single 1-second bucket with zero keystrokes is
    // completely normal human behavior (the brief pause between words), but
    // read in isolation it computes as a hard 0 WPM - a sharp, unrealistic
    // spike to the graph's floor that doesn't happen on MonkeyType/TypeRacer
    // because they smooth over exactly this kind of momentary gap. A real
    // multi-second stall still shows up as a real dip; it just isn't a
    // razor to zero from one quiet second.
    const minutesPerBucket = bucketSeconds / 60;
    const windowBuckets = Math.max(1, Math.round(3 / bucketSeconds));
    return buckets.map((_, i) => {
        const start = Math.max(0, i - windowBuckets + 1);
        let correctSum = 0;
        let totalSum = 0;
        for (let j = start; j <= i; j++) {
            correctSum += buckets[j].correct;
            totalSum += buckets[j].total;
        }
        const windowMinutes = (i - start + 1) * minutesPerBucket;
        return {
            time: (i + 1) * bucketSeconds,
            wpm: (correctSum / 5) / windowMinutes,
            raw: (totalSum / 5) / windowMinutes,
        };
    });
}

/// Consistency: how steady the WPM stayed across the test, expressed as a
/// percentage (100 = perfectly even pace). Same coefficient-of-variation
/// approach MonkeyType uses: lower spread relative to the average pace
/// scores higher.
export function calculateConsistency(graphPoints) {
    const values = graphPoints.map(p => p.wpm).filter(v => v > 0);
    if (values.length < 2) return 100;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    if (mean === 0) return 100;
    const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
    const stddev = Math.sqrt(variance);
    const coefficientOfVariation = stddev / mean;
    return Math.max(0, Math.min(100, Math.round((1 - coefficientOfVariation) * 100)));
}

export function buildErrorPoints(graphPoints, keypressHistory, charTimings) {
    const source = (keypressHistory && keypressHistory.length > 0) ? keypressHistory : charTimings;
    if (!source || source.length === 0 || graphPoints.length === 0) return [];
    // One marker per bucket, sitting on the wpm line at the moment the mistake
    // happened. `count` is carried for the hover text only - errors are not
    // plotted against a scale of their own, because their height would then
    // imply a magnitude that a mistake does not have.
    const byBucket = new Map();
    for (const { time, isCorrect, index } of source) {
        if (isCorrect) continue;
        const closest = graphPoints.reduce((prev, curr) =>
            Math.abs(curr.time - time) < Math.abs(prev.time - time) ? curr : prev, graphPoints[0]);
        const entry = byBucket.get(closest.time);
        if (entry) entry.count += 1;
        else byBucket.set(closest.time, { x: closest.time, y: closest.wpm, count: 1, index });
    }
    return [...byBucket.values()].sort((a, b) => a.x - b.x);
}

export function niceStep(maxValue, plotSize, pxPerLabel) {
    const maxLabels = Math.max(2, Math.floor(plotSize / pxPerLabel));
    const rawStep = (maxValue || 1) / maxLabels;
    const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const residual = rawStep / magnitude;
    const niceResidual = residual > 5 ? 10 : residual > 2 ? 5 : residual > 1 ? 2 : 1;
    return Math.max(1, niceResidual * magnitude);
}

/// Shared plot geometry so hit-testing (hover) can map mouse coordinates the
/// same way drawChart maps data coordinates.
export function getPlotGeometry(canvas, graphPoints, xMax) {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    // Left and right match. The left needs 52px for the rotated axis title and
    // its tick labels; leaving the right at 20 centred the plot inside the
    // canvas but not inside .graph-container's visible panel, which read as a
    // wider empty margin down the left-hand side.
    const margin = { top: 14, right: 52, bottom: 42, left: 52 };
    const plotW = Math.max(1, width - margin.left - margin.right);
    const plotH = Math.max(1, height - margin.top - margin.bottom);
    const maxWpm = Math.max(1, ...graphPoints.map(p => Math.max(p.wpm, p.raw)), 1);
    const yStep = niceStep(maxWpm, plotH, 28);
    const yMax = Math.max(yStep, Math.ceil(maxWpm / yStep) * yStep);

    return {
        xToPx: t => margin.left + (t / (xMax || 1)) * plotW,
        yToPx: v => margin.top + plotH - (v / yMax) * plotH,
        margin, plotW, plotH, yMax,
    };
}

// Canvas fillStyle/strokeStyle can't take a CSS var() directly, so the
// chart's colors are read from the active theme's actual custom properties
// instead of being hardcoded - otherwise every non-default theme (Dracula,
// Nord, etc.) would show a graph in colors that don't match anything else
// on the page.
export function themeColors() {
    const style = getComputedStyle(document.documentElement);
    const get = (name, fallback) => style.getPropertyValue(name).trim() || fallback;
    return {
        primary: get('--primary-color', '#00ff9d'),
        secondary: get('--secondary-color', '#00cc8f'),
        error: get('--error-color', '#ff3b3b'),
        sub: get('--sub-color', '#646669'),
    };
}

export function drawChart(canvas, { graphPoints, errorPoints, xMax }) {
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width === 0 || height === 0) return;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    if (graphPoints.length === 0) return;

    const { xToPx, yToPx, margin, yMax } = getPlotGeometry(canvas, graphPoints, xMax);
    const yStep = niceStep(yMax, canvas.clientHeight - margin.top - margin.bottom, 28);
    const colors = themeColors();

    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.strokeStyle = 'rgba(100,102,105,0.15)';
    ctx.fillStyle = colors.sub;
    ctx.lineWidth = 1;
    for (let v = 0; v <= yMax; v += yStep) {
        const y = yToPx(v);
        ctx.beginPath();
        ctx.moveTo(margin.left, y);
        ctx.lineTo(width - margin.right, y);
        ctx.stroke();
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(Math.round(v)), margin.left - 6, y);
    }

    // Start at xStep, not 0 - the y-axis already prints its own "0" right
    // at the origin corner, and a second "0" from the x-axis lands on top
    // of it.
    const xStep = niceStep(xMax, canvas.clientWidth - margin.left - margin.right, 40);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let t = xStep; t <= xMax; t += xStep) {
        ctx.fillText(String(t), xToPx(t), height - margin.bottom + 6);
    }

    // Axis titles. The x axis had none at all, so its numbers could have been
    // seconds, words or buckets.
    drawAxisTitle(ctx, 'words per minute', 12, margin.top + (height - margin.top - margin.bottom) / 2, -Math.PI / 2, colors.sub);
    drawAxisTitle(ctx, 'seconds', margin.left + (width - margin.left - margin.right) / 2, height - 6, 0, colors.sub);

    const drawLine = (key, color, dashed) => {
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = dashed ? 1.5 : 2;
        ctx.setLineDash(dashed ? [6, 5] : []);
        const pts = graphPoints.map(p => ({ x: xToPx(p.time), y: yToPx(p[key]) }));
        strokeSmooth(ctx, pts);
        ctx.stroke();
        ctx.setLineDash([]);
    };
    drawLine('raw', colors.secondary, true);
    drawLine('wpm', colors.primary, false);

    // On the line, at the moment the mistake happened.
    ctx.fillStyle = colors.error;
    for (const p of errorPoints) {
        ctx.beginPath();
        ctx.arc(xToPx(p.x), yToPx(p.y), 3.5, 0, Math.PI * 2);
        ctx.fill();
    }

    drawLegend(ctx, width, colors, margin);
}

// A rotated axis caption. Canvas has no text-orientation, so the context is
// rotated around the label's own centre and restored immediately.
function drawAxisTitle(ctx, text, x, y, angle, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillText(text, 0, 0);
    ctx.restore();
    ctx.font = '11px "JetBrains Mono", monospace';
}

// Centripetal-ish Catmull-Rom through the points, emitted as bezier segments.
// A raw polyline made every one-second bucket a hard corner, which read as
// far noisier than the underlying pace actually was.
function strokeSmooth(ctx, pts) {
    if (pts.length === 0) return;
    ctx.moveTo(pts[0].x, pts[0].y);
    if (pts.length < 3) {
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        return;
    }
    for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[i - 1] || pts[i];
        const p1 = pts[i];
        const p2 = pts[i + 1];
        const p3 = pts[i + 2] || p2;
        // 1/6 keeps the curve close to the data; a larger factor overshoots
        // into visible bulges around sharp changes of pace.
        ctx.bezierCurveTo(
            p1.x + (p2.x - p0.x) / 6, p1.y + (p2.y - p0.y) / 6,
            p2.x - (p3.x - p1.x) / 6, p2.y - (p3.y - p1.y) / 6,
            p2.x, p2.y,
        );
    }
}

function drawLegend(ctx, width, colors, margin) {
    const entries = [
        { label: 'wpm', color: colors.primary, dashed: false },
        { label: 'raw', color: colors.secondary, dashed: true },
        { label: 'error', color: colors.error, dot: true },
    ];
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const swatchW = 16;
    const gap = 6;
    const groupGap = 18;
    // Left-aligned inside the plot rather than flush to the right edge, where
    // it sat on top of the error axis's tick labels.
    let x = margin.left + 8;
    const y = 8;
    for (const e of entries) {
        if (e.dot) {
            ctx.fillStyle = e.color;
            ctx.beginPath();
            ctx.arc(x + swatchW / 2, y, 3, 0, Math.PI * 2);
            ctx.fill();
        } else {
            ctx.strokeStyle = e.color;
            ctx.lineWidth = e.dashed ? 1.5 : 2;
            ctx.setLineDash(e.dashed ? [4, 3] : []);
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + swatchW, y);
            ctx.stroke();
            ctx.setLineDash([]);
        }
        ctx.fillStyle = colors.sub;
        ctx.fillText(e.label, x + swatchW + gap, y);
        x += swatchW + gap + ctx.measureText(e.label).width + groupGap;
    }
}

// WPM across recent completed tests (x-axis is test order, not time within a
// single test) - a different shape from drawChart above, which plots one
// test's speed over its own elapsed seconds. Kept separate rather than
// bent to fit drawChart's per-test contract (its legend assumes raw/error
// series that don't exist here).
export function drawProgressChart(canvas, history) {
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width === 0 || height === 0) return;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    if (history.length === 0) return;

    const margin = { top: 12, right: 16, bottom: 22, left: 36 };
    const plotW = Math.max(1, width - margin.left - margin.right);
    const plotH = Math.max(1, height - margin.top - margin.bottom);
    const maxWpm = Math.max(1, ...history.map(h => h.wpm));
    const yStep = niceStep(maxWpm, plotH, 28);
    const yMax = Math.max(yStep, Math.ceil(maxWpm / yStep) * yStep);
    const xMax = Math.max(1, history.length - 1);
    const xToPx = i => margin.left + (i / xMax) * plotW;
    const yToPx = v => margin.top + plotH - (v / yMax) * plotH;

    const colors = themeColors();
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.strokeStyle = 'rgba(100,102,105,0.15)';
    ctx.fillStyle = colors.sub;
    ctx.lineWidth = 1;
    for (let v = 0; v <= yMax; v += yStep) {
        const y = yToPx(v);
        ctx.beginPath();
        ctx.moveTo(margin.left, y);
        ctx.lineTo(width - margin.right, y);
        ctx.stroke();
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(Math.round(v)), margin.left - 6, y);
    }

    ctx.beginPath();
    ctx.strokeStyle = colors.primary;
    ctx.lineWidth = 2;
    history.forEach((h, i) => {
        const x = xToPx(i);
        const y = yToPx(h.wpm);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = colors.sub;
    ctx.fillText('oldest', margin.left, height - margin.bottom + 6);
    ctx.textAlign = 'right';
    ctx.fillText('latest', width - margin.right, height - margin.bottom + 6);
}

/// Returns the graph point nearest to mouseX (by time), for a "hover
/// anywhere on the line" readout - not just the error dots.
export function hitTestLine(canvas, graphPoints, xMax, mouseX) {
    if (graphPoints.length === 0) return null;
    const { xToPx } = getPlotGeometry(canvas, graphPoints, xMax);
    let closest = graphPoints[0];
    let closestDist = Math.abs(xToPx(closest.time) - mouseX);
    for (const p of graphPoints) {
        const dist = Math.abs(xToPx(p.time) - mouseX);
        if (dist < closestDist) {
            closestDist = dist;
            closest = p;
        }
    }
    return closest;
}

/// Returns the closest error point to (mouseX, mouseY) in canvas-local
/// pixels, if within `radius` px, else null. Used to make the error dots
/// respond to hover instead of being purely decorative.
export function hitTestError(canvas, errorPoints, graphPoints, xMax, mouseX, mouseY, radius = 8) {
    if (errorPoints.length === 0) return null;
    const { xToPx, yToPx } = getPlotGeometry(canvas, graphPoints, xMax);
    let closest = null;
    let closestDist = radius;
    for (const p of errorPoints) {
        const px = xToPx(p.x);
        const py = yToPx(p.y);
        const dist = Math.hypot(px - mouseX, py - mouseY);
        if (dist <= closestDist) {
            closestDist = dist;
            closest = p;
        }
    }
    return closest;
}
