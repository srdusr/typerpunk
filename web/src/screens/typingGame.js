import { calculateStats, emptyStats } from '../stats.js';
import { logoLockup } from '../logo.js';
import { escapeHtml } from '../util.js';
import { highlightClasses } from '../customText.js';
import { getSettings } from '../settings.js';
import { renderCornerRail } from '../cornerRail.js';
import { renderTopRail } from '../topRail.js';
import { attachTooltips } from '../tooltip.js';
import { playKeySound } from '../keySounds.js';
import { recordKeystroke } from '../keyStats.js';
import { getUser } from '../auth.js';
import { api } from '../api.js';

export function renderTypingGame(root, { game, text, attribution, category, explanation, language, progress, timeLimit, modeKey, zenMode, multiplayer, onFinish, onMainMenu, onRestart, onShowStats, onShowPlaceholder, onShowAccount, onShowLeaderboard, onShowFriends, onShowMultiplayer, onShowStore }) {
    const syntaxClasses = language ? highlightClasses(text, language) : null;
    const { hideLiveStats, caretBlink, blindMode } = getSettings();
    root.innerHTML = `
        <div class="typing-game${hideLiveStats ? ' hide-live-stats' : ''}${caretBlink ? '' : ' no-caret-blink'}">
            ${logoLockup()}
            ${progress ? `<div class="segment-progress">${escapeHtml(progress)}</div>` : ''}
            <div class="text-container">
                <div class="text-display${language ? ' code' : ''}"></div>
                <input class="typing-input" type="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" />
            </div>
            <div class="attribution">- ${escapeHtml(attribution || 'Unknown')}</div>
            ${explanation && !multiplayer ? `<div class="code-explainer"><span class="code-explainer-label">What this does</span>${escapeHtml(explanation)}</div>` : ''}
            <div class="wpm-stat"><div class="stat-label">WPM</div><div class="stat-value" data-field="wpm">0</div></div>
            <div class="acc-stat"><div class="stat-label">ACC</div><div class="stat-value" data-field="acc">100%</div></div>
            <div class="time-stat"><div class="stat-label">TIME</div><div class="stat-value" data-field="time">0.0</div></div>
            ${zenMode ? `<button class="zen-finish-button" data-action="zen-finish">Finish</button>` : ''}
            ${onRestart ? `<button class="restart-toggle" data-action="restart" aria-label="Restart" data-tooltip="Restart (Tab)">&#8635;</button>` : ''}
        </div>
    `;

    const textDisplay = root.querySelector('.text-display');
    const input = root.querySelector('.typing-input');
    const wpmField = root.querySelector('[data-field="wpm"]');
    const accField = root.querySelector('[data-field="acc"]');
    const timeField = root.querySelector('[data-field="time"]');

    attachTooltips(root);
    // Restart and Zen Finish used to fixed-position themselves at hardcoded
    // right offsets (4.25rem and 7.5rem) that assumed the theme toggle was the
    // only thing to their right. The top rail is wider than that now, so they
    // are handed to it as row members instead of guessing where the row ends.
    const railExtras = [];
    const zenBtn = root.querySelector('[data-action="zen-finish"]');
    if (zenBtn) railExtras.push(zenBtn);
    const restartBtn = root.querySelector('[data-action="restart"]');
    if (restartBtn) railExtras.push(restartBtn);
    const cleanupTheme = renderTopRail(root, { onShowAccount, onShowFriends, extras: railExtras });

    // Equipped caret color (see cosmetics.rs) overrides the theme's default
    // --caret-color on this screen only, via the CSS custom property the
    // caret's ::after rule already reads - no equipped caret just leaves
    // the theme default in place.
    let caretColorTorndown = false;
    if (getUser()) {
        Promise.all([api.get('/api/cosmetics/me'), api.get('/api/cosmetics')])
            .then(([mine, catalog]) => {
                if (caretColorTorndown || !mine.equipped_caret) return;
                const item = catalog.find(i => i.id === mine.equipped_caret);
                if (item && item.value) {
                    root.querySelector('.typing-game')?.style.setProperty('--caret-color', item.value);
                }
            })
            .catch(() => {});
    }

    root.querySelector('[data-action="menu"]').addEventListener('click', onMainMenu);
    root.querySelector('[data-action="restart"]')?.addEventListener('click', () => onRestart());

    let finished = false;
    let startTime = null;
    let keystrokes = [];
    let charTimings = [];
    let intervalId = null;
    // Persistent, never-decremented count of every forward keystroke made,
    // including ones later backspaced away - feeds raw WPM (see stats.js).
    let totalKeystrokes = 0;
    let lastInputLength = 0;
    // Accuracy from the wasm engine is cumulative (tracks every mistake ever
    // made, even ones since backspaced away) - the interval below has no
    // fresh keystroke to read it from, so it needs its own last-known copy
    // instead of falling back to stats.js's current-input-only calculation,
    // which forgets a mistake the moment it's corrected.
    let lastAccuracy = 100;
    // Idle/AFK timeout: a test left running with no keystrokes for this long
    // auto-finishes with whatever was typed so far, instead of sitting open
    // indefinitely. Applies to every standard mode (quote/words/time) --
    // there's no reason a stalled tab should keep accumulating elapsed time
    // and (before the chart's own bucket cap) inflating the graph.
    const IDLE_TIMEOUT_MS = 180000;
    let lastActivityTime = null;

    function renderText(currentInput) {
        const inputChars = currentInput.split('');
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
                    // Blind Mode: no correct/incorrect feedback while typing
                    // (not even which character was actually typed for a
                    // mistake) - the WASM engine still tracks correctness
                    // normally underneath for accuracy/stats, this only
                    // changes what gets rendered live. Revealed as usual on
                    // the end screen, which does its own independent diff.
                    if (blindMode) {
                        className = 'typed';
                    } else {
                        className = inputChar === char ? 'correct' : 'incorrect';
                        if (className === 'incorrect') displayChar = inputChar;
                    }
                } else if (syntaxClasses && syntaxClasses[charIndex]) {
                    className += ` ${syntaxClasses[charIndex]}`;
                }
                if (!finished && charIndex === currentInput.length) className += ' current';
                html.push(`<span class="${className}">${escapeHtml(displayChar)}</span>`);
                charIndex++;
            }
            html.push('</span>');
        }
        textDisplay.innerHTML = html.join('');
    }

    let lastKeystrokeAt = null;
    function recordChar(index, isCorrect, time) {
        keystrokes.push({ time, index, isCorrect });
        charTimings = charTimings.slice(0, index);
        charTimings.push({ time, isCorrect, index });

        // Skips the very first keystroke of the test - "time since start"
        // isn't a meaningful per-key latency the way "time since the last
        // keystroke" is for every one after it.
        if (lastKeystrokeAt != null) {
            recordKeystroke(text[index], isCorrect, (time - lastKeystrokeAt) * 1000);
        }
        lastKeystrokeAt = time;
    }

    function liveStats(currentInput) {
        if (!startTime) return emptyStats();
        return calculateStats(currentInput, text, (Date.now() - startTime) / 1000, totalKeystrokes);
    }

    function paintStats(stats, accuracy) {
        wpmField.textContent = String(Math.round(stats.wpm));
        accField.textContent = `${Math.round(accuracy ?? stats.accuracy)}%`;
        // Time mode counts down to zero instead of counting up, since the
        // test ends on the clock rather than at the end of the text.
        timeField.textContent = timeLimit
            ? Math.max(0, timeLimit - stats.time).toFixed(1)
            : stats.time.toFixed(1);

        // Single hook point for every caller of paintStats (each keystroke,
        // the 100ms live-stats interval, backspace) rather than scattering a
        // sendProgress call at each call site.
        if (multiplayer && stats.totalChars > 0) {
            const percent = ((stats.correctChars + stats.incorrectChars) / stats.totalChars) * 100;
            multiplayer.connection.sendProgress(percent, stats.wpm);
        }
    }

    function finish(accuracy, mistakes, finalInput) {
        finished = true;
        input.disabled = true;
        if (intervalId) clearInterval(intervalId);
        const elapsed = startTime ? (Date.now() - startTime) / 1000 : 0;
        // Time/Zen mode's text is a long word buffer sized to outlast the
        // clock (or, for Zen, just sized generously since there's no clock
        // at all) - trim it to what was actually reached so the end screen
        // doesn't try to render hundreds of untyped words.
        const finalText = (timeLimit || zenMode) ? text.slice(0, finalInput.length) : text;
        const stats = calculateStats(finalInput, finalText, elapsed, totalKeystrokes);
        stats.accuracy = accuracy;
        stats.incorrectChars = mistakes;
        if (multiplayer) multiplayer.connection.sendFinish(stats.wpm, accuracy, elapsed);
        onFinish({ stats, text: finalText, attribution, category, explanation, userInput: finalInput, charTimings, keypressHistory: keystrokes, modeKey });
    }

    function handleChange() {
        if (finished || !game) return;
        const value = input.value;
        if (value.length > text.length) {
            input.value = value.slice(0, text.length);
            return;
        }
        if (!startTime) startTime = Date.now();
        lastActivityTime = Date.now();
        const elapsed = (Date.now() - startTime) / 1000;

        try {
            game.handle_input(value);
            const [wasmInput, accuracy, mistakes] = game.get_stats_and_input();
            input.value = wasmInput;
            if (wasmInput.length > lastInputLength) {
                totalKeystrokes += wasmInput.length - lastInputLength;
                playKeySound();
            }
            lastInputLength = wasmInput.length;
            if (wasmInput.length > 0) {
                const idx = wasmInput.length - 1;
                recordChar(idx, wasmInput[idx] === text[idx], elapsed);
            }
            renderText(wasmInput);
            lastAccuracy = accuracy;
            paintStats(liveStats(wasmInput), accuracy);

            if (game.is_finished()) {
                finish(accuracy, mistakes, wasmInput);
            }
        } catch (err) {
            console.error('WASM input error:', err);
        }
    }

    async function handleKeydown(e) {
        if (finished || !game) return;
        if (e.key === 'Tab') {
            // Quick restart: abandon the current attempt and start a fresh
            // one of the same mode, without reaching for the mouse.
            e.preventDefault();
            if (onRestart) onRestart();
            return;
        }
        const ctrlOrMeta = e.ctrlKey || e.metaKey;
        // Some platforms bind native readline-style line-editing to text
        // inputs (Ctrl+U "clear to start of line", Ctrl+K "clear to end").
        // Left unblocked, these silently wipe the whole typed input via the
        // browser's own text-field editing, bypassing our backspace rules
        // entirely - block them outright rather than let them fire.
        if (ctrlOrMeta && (e.key === 'u' || e.key === 'U' || e.key === 'k' || e.key === 'K')) {
            e.preventDefault();
            return;
        }
        if (e.key !== 'Backspace') return;
        e.preventDefault();
        try {
            const ctrl = ctrlOrMeta;
            const success = await game.handle_backspace(ctrl);
            if (success) {
                lastActivityTime = Date.now();
                const [wasmInput, accuracy] = await game.get_stats_and_input();
                input.value = wasmInput;
                lastInputLength = wasmInput.length;
                charTimings = charTimings.slice(0, wasmInput.length);
                renderText(wasmInput);
                lastAccuracy = accuracy;
                paintStats(liveStats(wasmInput), accuracy);
            }
        } catch (err) {
            console.error('WASM backspace error:', err);
        }
    }

    input.addEventListener('input', handleChange);
    input.addEventListener('keydown', handleKeydown);
    input.addEventListener('blur', () => {
        if (!finished) setTimeout(() => input.focus(), 10);
    });

    // Zen has no timer and no fixed length, so unlike every other mode it
    // never ends on its own - this is the only way to actually finish one.
    const zenFinishBtn = root.querySelector('[data-action="zen-finish"]');
    if (zenFinishBtn) {
        zenFinishBtn.addEventListener('click', () => {
            if (finished || !game || !startTime) return;
            const [wasmInput, accuracy, mistakes] = game.get_stats_and_input();
            finish(accuracy, mistakes, wasmInput);
        });
    }

    renderText('');
    paintStats(emptyStats(), 100);
    setTimeout(() => input.focus(), 50);

    intervalId = setInterval(() => {
        if (finished || !startTime) return;
        const elapsed = (Date.now() - startTime) / 1000;
        if (timeLimit && elapsed >= timeLimit) {
            const [wasmInput, accuracy, mistakes] = game.get_stats_and_input();
            finish(accuracy, mistakes, wasmInput);
            return;
        }
        if (lastActivityTime && Date.now() - lastActivityTime >= IDLE_TIMEOUT_MS) {
            const [wasmInput, accuracy, mistakes] = game.get_stats_and_input();
            finish(accuracy, mistakes, wasmInput);
            return;
        }
        paintStats(liveStats(input.value), lastAccuracy);
    }, 100);

    const cleanupRail = renderCornerRail(root, { onShowStats, onShowPlaceholder, onShowAccount, onShowLeaderboard, onShowFriends, onShowMultiplayer, onShowStore });
    // No Tab-restart shortcut mid-multiplayer-race (onRestart is null there,
    // same guard the restart-toggle button itself uses) - falls back to
    // the plain version stamp instead of advertising a shortcut that does
    // nothing.

    return () => {
        caretColorTorndown = true;
        cleanupTheme();
        if (intervalId) clearInterval(intervalId);
        cleanupRail();
    };
}
