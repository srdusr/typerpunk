import { buildGraphPoints, buildErrorPoints, drawChart, hitTestError, hitTestLine, calculateConsistency } from '../chart.js';
import { escapeHtml } from '../util.js';
import { attachTooltips } from '../tooltip.js';
import { recordResult } from '../pb.js';
import { recordTest } from '../profileStats.js';
import { renderCornerRail } from '../cornerRail.js';
import { renderTopRail } from '../topRail.js';
import { submitTestResult } from '../auth.js';
import { detectDeviceType } from '../deviceDetect.js';

export function renderEndScreen(root, { stats, text, attribution, explanation, standings, onStandingsUpdate, onLeaveRace, userInput, charTimings, keypressHistory, modeKey, onPlayAgain, onMainMenu, onShowStats, onShowPlaceholder, onShowAccount, onShowLeaderboard, onShowFriends, onShowMultiplayer, onShowStore }) {
    // Monkeytype's four-way split. "Extra" is anything typed past the end of
    // the passage, "missed" is passage left untyped - neither is visible in
    // a plain correct/incorrect pair, and the two mean very different things
    // about a run that ended early.
    const typedLen = (userInput || '').length;
    const extraChars = Math.max(0, typedLen - (text || '').length);
    const missedChars = Math.max(0, (text || '').length - typedLen);
    const graphPoints = buildGraphPoints(charTimings, stats, keypressHistory);
    const consistency = calculateConsistency(graphPoints);
    const { isNewBest, previous } = recordResult(modeKey, stats.wpm);
    recordTest({ wpm: stats.wpm, accuracy: stats.accuracy, time: stats.time });
    // Same exclusion as recordResult above: custom text/Zen have no stable,
    // repeatable challenge, so there's no meaningful leaderboard entry for
    // them either.
    if (modeKey) {
        // Inter-keystroke gaps (not raw timestamps) - the server's
        // anti-cheat check only cares about the *variance* between
        // consecutive keystrokes, not when the test started.
        const source = keypressHistory && keypressHistory.length > 1 ? keypressHistory : null;
        const keystrokeIntervalsMs = source
            ? source.slice(1).map((k, i) => (k.time - source[i].time) * 1000).filter(ms => ms >= 0)
            : undefined;
        submitTestResult({
            mode_key: modeKey,
            wpm: stats.wpm,
            raw_wpm: stats.rawWpm,
            accuracy: stats.accuracy,
            time_seconds: stats.time,
            device_type: detectDeviceType(),
            keystroke_intervals_ms: keystrokeIntervalsMs,
        });
    }
    // Don't announce "new best" on a mode's very first-ever run - there's
    // nothing to have beaten yet, so it just silently becomes the baseline.
    // Sits under WPM alongside RAW, in the same label-over-value shape as
    // every other secondary figure rather than as a floating badge.
    const pbLine = !modeKey || previous == null ? '' : isNewBest
        ? '<div class="end-stat pb-new"><div class="stat-label">PB</div><div class="stat-value">NEW BEST</div></div>'
        : `<div class="end-stat"><div class="stat-label">PB</div><div class="stat-value">${Math.round(previous)}</div></div>`;

    root.innerHTML = `
        <div class="end-screen">
            <div class="logo" data-action="menu">TyperPunk</div>
            <div class="end-screen-text"><div class="text-display"></div></div>
            ${attribution ? `<div class="attribution end-screen-attribution">&mdash; ${escapeHtml(attribution)}</div>` : ''}
            ${explanation ? `<div class="code-explainer"><span class="code-explainer-label">What this does</span>${escapeHtml(explanation)}</div>` : ''}
            <div class="end-screen-graph-row">
                <div class="endscreen-side-stat wpm">
                    <div class="end-stat headline"><div class="stat-label">WPM</div><div class="stat-value">${Math.round(stats.wpm)}</div></div>
                    <div class="end-stat"><div class="stat-label">RAW</div><div class="stat-value">${Math.round(stats.rawWpm)}</div></div>
                    ${pbLine}
                </div>
                <div class="graph-container"><canvas></canvas></div>
                <div class="endscreen-side-stat acc">
                    <div class="end-stat headline"><div class="stat-label">ACC</div><div class="stat-value">${Math.round(stats.accuracy)}%</div></div>
                    <div class="end-stat"><div class="stat-label">ERR</div><div class="stat-value">${stats.incorrectChars}</div></div>
                    <div class="end-stat"><div class="stat-label">CONSISTENCY</div><div class="stat-value">${consistency}%</div></div>
                </div>
            </div>
            <div class="end-screen-stat-row">
                <div class="end-stat"><div class="stat-label">KEYSTROKES</div><div class="stat-value">${stats.keystrokes}</div></div>
                <div class="end-stat headline"><div class="stat-label">TIME</div><div class="stat-value">${stats.time.toFixed(1)}s</div></div>
                <div class="end-stat" data-tooltip="Correct / wrong / typed past the end / left untyped">
                    <div class="stat-label">CHARACTERS</div><div class="stat-value">${stats.correctChars}/${stats.incorrectChars}/${extraChars}/${missedChars}</div>
                </div>
            </div>
            ${standings && standings.length ? `
            <div class="mp-standings">
                <div class="mp-standings-heading">Standings</div>
                <div class="mp-standings-rows"></div>
            </div>` : ''}
            <div class="end-screen-buttons">
                <button class="end-screen-button" data-action="again">Play Again</button>
            </div>
        </div>
    `;

    // Rendered separately from the markup above because it keeps changing:
    // finishing first leaves the rest of the field still typing, and their
    // rows fill in as they come home.
    const standingsRows = root.querySelector('.mp-standings-rows');
    function paintStandings(list) {
        if (!standingsRows) return;
        standingsRows.innerHTML = list.map(r => `
            <div class="mp-standings-row${r.me ? ' me' : ''}${r.place ? '' : ' racing'}" style="--racer-color: ${r.color || 'var(--primary-color)'}">
                <span class="mp-standings-place">${r.place ? r.place : '&middot;'}</span>
                <span class="mp-standings-name">${escapeHtml(r.name)}${r.me ? ' (you)' : ''}</span>
                <span class="mp-standings-wpm">${Math.round(r.wpm)} wpm</span>
                <span class="mp-standings-acc">${r.place ? `${Math.round(r.accuracy)}%` : `${Math.round(r.percent)}%`}</span>
            </div>
        `).join('');
    }
    if (standings && standings.length) paintStandings(standings);
    const offStandings = onStandingsUpdate ? onStandingsUpdate(paintStandings) : null;

    const textDisplay = root.querySelector('.text-display');
    const inputChars = userInput ? userInput.split('') : [];
    const wordMatches = text.match(/[^\s]+\s*/g) || [];
    let charIndex = 0;
    const html = [];
    for (const word of wordMatches) {
        html.push('<span>');
        for (const char of word) {
            const inputChar = inputChars[charIndex];
            let className = 'neutral';
            let displayChar = char;
            if (charIndex < inputChars.length) {
                className = inputChar === char ? 'correct' : 'incorrect';
                if (className === 'incorrect') displayChar = inputChar;
            }
            html.push(`<span class="${className}">${escapeHtml(displayChar)}</span>`);
            charIndex++;
        }
        html.push('</span>');
    }
    textDisplay.innerHTML = html.join('');

    attachTooltips(root.querySelector('.end-screen-stat-row'));
    const cleanupTheme = renderTopRail(root, { onShowAccount, onShowFriends });
    root.querySelectorAll('[data-action="menu"]').forEach(el => el.addEventListener('click', onMainMenu));
    root.querySelector('[data-action="again"]').addEventListener('click', onPlayAgain);

    const canvas = root.querySelector('canvas');
    const errorPoints = buildErrorPoints(graphPoints, keypressHistory, charTimings);
    const xMax = Math.max(1, Math.ceil(stats.time));
    const redraw = () => drawChart(canvas, { graphPoints, errorPoints, xMax });
    redraw();
    window.addEventListener('resize', redraw);

    // A long passage wraps to more lines than a short one, growing
    // .end-screen-text's height by an amount no fixed CSS margin/graph-height
    // budget can account for - a static tuning only ever fits whichever
    // passage happened to be on screen when it was measured. This claws the
    // room back in stages instead, each one only kicking in if the last
    // wasn't enough, so the page itself never needs to scroll to reach
    // Play Again: shrink the graph down to a floor, then trim the button's
    // top margin, and only as a last resort (a passage long enough that even
    // both of those can't absorb it - realistically only reachable by
    // pasting the full text-mode word buffer instead of actually typing it
    // in the time given) let the passage preview itself scroll internally,
    // which keeps every control below it reachable without the page
    // scrolling. Runs once after layout settles.
    requestAnimationFrame(() => {
        const doc = document.documentElement;
        // Re-measured after every stage rather than tracked as a running
        // subtraction - margin-collapse and sub-pixel rounding meant an
        // assumed "reduced height X means Y px less overflow" estimate
        // drifted from the DOM's actual scrollHeight, consistently
        // undershooting by a fixed amount however much was cut.
        const overflowNow = () => doc.scrollHeight - doc.clientHeight;
        if (overflowNow() <= 0) return;

        const graphBox = root.querySelector('.graph-container');
        const MIN_GRAPH_HEIGHT = 120;
        const graphHeight = graphBox.getBoundingClientRect().height;
        if (graphHeight > MIN_GRAPH_HEIGHT) {
            const reduceBy = Math.min(overflowNow(), graphHeight - MIN_GRAPH_HEIGHT);
            graphBox.style.height = `${graphHeight - reduceBy}px`;
            redraw();
        }
        if (overflowNow() <= 0) return;

        const buttons = root.querySelector('.end-screen-buttons');
        const buttonsMargin = parseFloat(getComputedStyle(buttons).marginTop);
        if (buttonsMargin > 8) {
            const reduceBy = Math.min(overflowNow(), buttonsMargin - 8);
            buttons.style.marginTop = `${buttonsMargin - reduceBy}px`;
        }
        if (overflowNow() <= 0) return;

        const textBox = root.querySelector('.end-screen-text');
        const textHeight = textBox.getBoundingClientRect().height;
        textBox.style.maxHeight = `${Math.max(80, textHeight - overflowNow() - 4)}px`;
        textBox.style.overflowY = 'auto';
    });

    const tooltip = document.createElement('div');
    tooltip.className = 'chart-tooltip';
    root.querySelector('.graph-container').appendChild(tooltip);

    const handleMove = e => {
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const errorHit = hitTestError(canvas, errorPoints, graphPoints, xMax, mx, my);
        if (errorHit) {
            canvas.style.cursor = 'pointer';
            const word = errorHit.index != null ? wordAt(text, errorHit.index) : '';
            const n = errorHit.count || 1;
            tooltip.textContent = n > 1
                ? `${n} errors${word ? ` · first at "${word}"` : ''}`
                : (word ? `Error: "${word}"` : 'Error');
            tooltip.style.left = `${mx}px`;
            tooltip.style.top = `${my}px`;
            tooltip.style.display = 'block';
            return;
        }
        const linePoint = hitTestLine(canvas, graphPoints, xMax, mx);
        if (linePoint) {
            canvas.style.cursor = 'crosshair';
            // Time last: the figures are what you are reading for, and the
            // second it happened is the qualifier on them.
            tooltip.textContent = `wpm ${Math.round(linePoint.wpm)} · raw ${Math.round(linePoint.raw)} · ${linePoint.time}s`;
            tooltip.style.left = `${mx}px`;
            tooltip.style.top = `${my}px`;
            tooltip.style.display = 'block';
        } else {
            canvas.style.cursor = 'default';
            tooltip.style.display = 'none';
        }
    };
    const handleLeave = () => { tooltip.style.display = 'none'; };
    canvas.addEventListener('mousemove', handleMove);
    canvas.addEventListener('mouseleave', handleLeave);

    // Quick restart: Tab on the results screen is the keyboard equivalent
    // of clicking Play Again.
    const handleKeydown = e => {
        if (e.key === 'Tab') {
            e.preventDefault();
            onPlayAgain();
        }
    };
    document.addEventListener('keydown', handleKeydown);

    const cleanupRail = renderCornerRail(root, { onShowStats, onShowPlaceholder, onShowAccount, onShowLeaderboard, onShowFriends, onShowMultiplayer, onShowStore });

    return () => {
        // Leaving the end screen is what finally drops the race connection --
        // it was kept open so the remaining racers could still come in.
        offStandings?.();
        onLeaveRace?.();
        cleanupTheme();
        window.removeEventListener('resize', redraw);
        canvas.removeEventListener('mousemove', handleMove);
        canvas.removeEventListener('mouseleave', handleLeave);
        document.removeEventListener('keydown', handleKeydown);
        cleanupRail();
    };
}

function wordAt(text, index) {
    let start = index;
    let end = index;
    while (start > 0 && text[start - 1] !== ' ') start--;
    while (end < text.length && text[end] !== ' ') end++;
    return text.slice(start, end).trim();
}
