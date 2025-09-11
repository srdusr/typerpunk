import { getTheme, toggleTheme, onThemeChange } from '../theme.js';
import { themeIcon } from './icons.js';
import { escapeHtml } from '../util.js';

const PACE_WPM = 130;
const LINE_GAP_SECONDS = 0.6;

function buildSchedule(chunks) {
    const allTimed = chunks.every(c => c.time !== null && c.time !== undefined);
    if (allTimed) {
        const base = chunks[0].time;
        return chunks.map(c => c.time - base);
    }
    let t = 0;
    const offsets = [];
    for (const c of chunks) {
        offsets.push(t);
        const duration = (c.content.length / 5) / (PACE_WPM / 60);
        t += duration + LINE_GAP_SECONDS;
    }
    return offsets;
}

function renderLine(content, typed) {
    const inputChars = typed.split('');
    let html = '';
    for (let i = 0; i < content.length; i++) {
        const char = content[i];
        const inputChar = inputChars[i];
        let cls = 'neutral';
        let displayChar = char;
        if (i < inputChars.length) {
            cls = inputChar === char ? 'correct' : 'incorrect';
            if (cls === 'incorrect') displayChar = inputChar;
        }
        html += `<span class="${cls}">${escapeHtml(displayChar)}</span>`;
    }
    return html;
}

export function renderPassiveMode(root, { name, chunks, onExit }) {
    const schedule = buildSchedule(chunks);
    const totalDuration = schedule[schedule.length - 1] + 4; // let the last line linger

    root.innerHTML = `
        <div class="passive-mode">
            <div class="logo" data-action="menu">TyperPunk</div>
            <div class="passive-source">${escapeHtml(name)} · passive mode</div>
            <div class="passive-lines">
                <div class="passive-line prev"></div>
                <div class="passive-line active"></div>
                <div class="passive-line next"></div>
            </div>
            <input class="typing-input passive-input" type="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" />
            <div class="passive-stats">
                <div class="stat-label">ACCURACY</div>
                <div class="stat-value" data-field="acc">100%</div>
            </div>
            <div class="passive-summary" hidden>
                <div class="passive-summary-title">Session complete</div>
                <div class="passive-summary-stats">
                    <div><span class="stat-label">LINES</span><span class="stat-value" data-field="lines">0</span></div>
                    <div><span class="stat-label">ACCURACY</span><span class="stat-value" data-field="final-acc">100%</span></div>
                </div>
                <button class="menu-button" data-action="back">Back to Menu</button>
            </div>
            <button class="theme-toggle" data-action="theme" aria-label="Toggle theme"></button>
        </div>
    `;

    const prevLine = root.querySelector('.passive-line.prev');
    const activeLine = root.querySelector('.passive-line.active');
    const nextLine = root.querySelector('.passive-line.next');
    const input = root.querySelector('.passive-input');
    const accField = root.querySelector('[data-field="acc"]');
    const summary = root.querySelector('.passive-summary');
    const themeButton = root.querySelector('.theme-toggle');

    const paintTheme = () => { themeButton.innerHTML = themeIcon(getTheme()); };
    paintTheme();
    const unsubscribeTheme = onThemeChange(paintTheme);
    themeButton.addEventListener('click', toggleTheme);
    root.querySelector('[data-action="menu"]').addEventListener('click', onExit);

    let activeIndex = -1;
    let typedForActive = '';
    let totalCorrect = 0;
    let totalTyped = 0;
    let done = false;
    const startedAt = Date.now();
    let intervalId = null;

    function paintLines() {
        prevLine.textContent = activeIndex > 0 ? chunks[activeIndex - 1].content : '';
        activeLine.innerHTML = activeIndex >= 0 ? renderLine(chunks[activeIndex].content, typedForActive) : '';
        nextLine.textContent = activeIndex + 1 < chunks.length ? chunks[activeIndex + 1].content : '';
    }

    function paintAccuracy() {
        const acc = totalTyped === 0 ? 100 : Math.round((totalCorrect / totalTyped) * 100);
        accField.textContent = `${acc}%`;
        return acc;
    }

    function finishSession() {
        if (done) return;
        done = true;
        if (intervalId) clearInterval(intervalId);
        input.disabled = true;
        const acc = paintAccuracy();
        summary.querySelector('[data-field="lines"]').textContent = String(chunks.length);
        summary.querySelector('[data-field="final-acc"]').textContent = `${acc}%`;
        summary.hidden = false;
    }

    function advanceTo(index) {
        // Score whatever was typed for the outgoing line before moving on.
        if (activeIndex >= 0) {
            const target = chunks[activeIndex].content;
            for (let i = 0; i < typedForActive.length; i++) {
                totalTyped++;
                if (typedForActive[i] === target[i]) totalCorrect++;
            }
        }
        activeIndex = index;
        typedForActive = '';
        input.value = '';
        paintLines();
        paintAccuracy();
    }

    input.addEventListener('input', () => {
        if (done || activeIndex < 0) return;
        typedForActive = input.value;
        activeLine.innerHTML = renderLine(chunks[activeIndex].content, typedForActive);
    });
    input.addEventListener('blur', () => {
        if (!done) setTimeout(() => input.focus(), 10);
    });

    summary.querySelector('[data-action="back"]').addEventListener('click', onExit);

    setTimeout(() => input.focus(), 50);
    advanceTo(0);

    intervalId = setInterval(() => {
        if (done) return;
        const elapsed = (Date.now() - startedAt) / 1000;
        let target = activeIndex;
        while (target + 1 < schedule.length && elapsed >= schedule[target + 1]) target++;
        if (target !== activeIndex) advanceTo(target);
        if (elapsed >= totalDuration) finishSession();
    }, 150);

    return () => {
        unsubscribeTheme();
        if (intervalId) clearInterval(intervalId);
    };
}
