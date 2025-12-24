import { STATS_ICON, SETTINGS_ICON, CHEVRON_DOWN_ICON, LEADERBOARD_ICON, STORE_ICON } from './icons.js';
import { parseCustomContent } from '../customText.js';
import { escapeHtml } from '../util.js';
import { getSettings, updateSettings } from '../settings.js';
import { getProfileStats } from '../profileStats.js';
import { attachTooltips } from '../tooltip.js';
import { wordListTiers } from '../wordGenerator.js';
import { renderTopRail } from '../topRail.js';
import { renderSiteFooter } from '../siteFooter.js';

function label(m) {
    if (m === 'random') return 'Random';
    if (m === 'words') return 'Words';
    // "Time" read as a duplicate of the Rules panel's "Time: 30s" duration
    // control - this is the mode (type until the clock runs out), that's a
    // setting (how long the clock runs), so they needed visibly different
    // names.
    if (m === 'time') return 'Timed';
    if (m === 'custom') return 'Custom';
    return m.charAt(0).toUpperCase() + m.slice(1);
}

const MODE_DESCRIPTIONS = {
    random: 'A random passage from any category below.',
    words: 'Type a fixed number of random words (set in Rules).',
    time: 'Type as many words as you can before the clock runs out (duration set in Rules).',
    general: 'Random passages from the general text collection.',
    literature: 'Passages from literature.',
    programming: 'Passages of real code.',
    quotes: 'Short standalone quotes.',
    custom: 'Paste or upload your own text to type.',
    zen: 'No timer, no word limit - type for as long as you want, then finish whenever you\'re ready.',
    practice: 'Words chosen to target the letters you personally mistype or slow down on most, based on your recent tests.',
};

function modeDescription(m) {
    return MODE_DESCRIPTIONS[m] || '';
}

// Rough binary-file detector: a file that decoded to mostly control chars or
// Unicode replacement characters (U+FFFD, inserted for invalid UTF-8 byte
// sequences) is almost certainly not text, even though `.text()` never
// throws on it.
function looksLikeText(str) {
    if (!str) return false;
    const sample = str.slice(0, 2000);
    let suspicious = 0;
    for (const ch of sample) {
        const code = ch.codePointAt(0);
        if (code === 0xfffd || (code < 32 && code !== 9 && code !== 10 && code !== 13)) suspicious++;
    }
    return suspicious / sample.length < 0.05;
}

const WORD_COUNTS = [10, 25, 50, 100];
const TIME_DURATIONS = [15, 30, 60, 120];
const SOUND_THEMES = ['off', 'click', 'mech'];
function soundThemeLabel(theme) {
    if (theme === 'click') return 'Click';
    if (theme === 'mech') return 'Mechanical';
    return 'Off';
}

function wordListTierLabel(tier) {
    if (tier === 'extended') return 'Extended';
    if (tier === 'hard') return 'Hard';
    return 'Common';
}

export function renderMainMenu(root, props) {
    const { onStartGame, onPickAndStart, onShowPrivacy, onShowContribute, documents, onOpenDocument, onRemoveDocument, categories, selectedCategory, onSelectCategory, customText, onLoadCustom, onClearCustom, onStartCustom, onStartPassive, onShowStats, onShowPlaceholder, onShowAccount, onShowLeaderboard, onShowFriends, onShowMultiplayer, onShowLyrics, onShowStore, onSimulateTest } = props;
    const modes = ['random', 'words', 'time', 'zen', 'practice', ...categories, 'custom'];
    // The picker used to be one flat list of 18 entries mixing two unrelated
    // things: how a test is generated (Random/Words/Timed/Zen/Practice/Custom)
    // and which body of text it draws from (Literature, Science, ...). Split
    // and shown side by side, it fits without scrolling and can be scanned.
    const GAME_MODES = ['random', 'words', 'time', 'zen', 'practice'];
    const gameModes = [...GAME_MODES.filter(m => modes.includes(m)), 'custom'];
    const textCategories = modes.filter(m => !gameModes.includes(m));
    const modeItem = m => `<button class="mode-popover-item${m === currentMode ? ' active' : ''}" data-mode="${escapeHtml(m)}" data-tooltip="${escapeHtml(modeDescription(m))}">${escapeHtml(label(m))}</button>`;
    const currentIndex = Math.max(0, modes.indexOf(selectedCategory || 'random'));
    const currentMode = modes[currentIndex] || 'random';
    const isCustom = currentMode === 'custom';
    const isWords = currentMode === 'words';
    const isTime = currentMode === 'time';

    // No "Start:" prefix - it's the one big button in the middle of the
    // screen, clicking it obviously starts things; the label's job is just
    // to say which mode/text it'll start.
    let startLabel = label(currentMode);
    if (isCustom) {
        startLabel = customText ? customText.name : 'Load Custom Text';
    }

    const settings = getSettings();
    const isFavorite = settings.favoriteMode === currentMode;
    const wordCount = WORD_COUNTS.includes(settings.wordCount) ? settings.wordCount : 25;
    const timeDuration = TIME_DURATIONS.includes(settings.timeDuration) ? settings.timeDuration : 30;
    const profile = getProfileStats();

    // Shows what Start will actually generate without opening Settings --
    // only Words/Timed have rules to summarize; the quote-based modes and
    // Custom don't use word count/punctuation/numbers at all.
    let rulesSummary = '';
    if (isWords || isTime) {
        const parts = [isWords ? `${wordCount} words` : `${timeDuration}s`];
        if (settings.wordsPunctuation) parts.push('punctuation');
        if (settings.wordsNumbers) parts.push('numbers');
        rulesSummary = parts.join(' · ');
    }

    root.innerHTML = `
        <div class="main-menu">
            <h1>TyperPunk</h1>
            <div class="menu-options">
                <div class="start-group sp-group">
                    <button class="menu-button start-main" data-action="pick-mode">Single Player</button>
                    <div class="mode-popover sp-popover" hidden>
                        <div class="mode-popover-group">
                            <div class="mode-popover-heading">Modes</div>
                            ${gameModes.map(modeItem).join('')}
                            <button class="mode-popover-item" data-action="mode-lyrics" data-tooltip="Connect Spotify and type along to whatever's playing.">Lyrics</button>
                        </div>
                        <div class="mode-popover-group">
                            <div class="mode-popover-heading">Text</div>
                            ${textCategories.map(modeItem).join('')}
                        </div>
                    </div>
                </div>
                <div class="start-group mp-group">
                    <button class="menu-button start-main" data-action="mode-multiplayer" data-tooltip="Race other typists live.">Multi-Player</button>
                </div>

                <div class="start-caption sp-caption">${escapeHtml(label(currentMode))}${rulesSummary ? ` &middot; ${escapeHtml(rulesSummary)}` : ''}</div>
                ${isCustom && customText && customText.timed ? `<button class="menu-button" data-action="start-passive">Passive Mode</button>` : ''}
                ${isCustom && customText ? `<button class="menu-button" data-action="clear-custom">Clear Custom Text</button>` : ''}
            </div>

            <div class="settings-panel" hidden>
                <label class="settings-row">
                    <input type="checkbox" class="settings-skip-menu"${settings.skipMenu ? ' checked' : ''} />
                    Start directly into a game, skip this menu
                </label>
                <button class="menu-button small quiet" data-action="toggle-favorite">
                    ${isFavorite ? `★ Favorite (${escapeHtml(label(currentMode))})` : `☆ Set "${escapeHtml(label(currentMode))}" as favorite`}
                </button>
                <div class="settings-columns">
                ${(isWords || isTime) ? `
                <div class="settings-column">
                <div class="settings-hint">Rules</div>
                <div class="settings-row-group">
                    ${isWords ? `<button class="menu-button small quiet" data-action="cycle-word-count" data-tooltip="How many words the Words mode generates. Click to cycle.">Words: ${wordCount}</button>` : ''}
                    ${isTime ? `<button class="menu-button small quiet" data-action="cycle-time-duration" data-tooltip="How long the clock runs in Timed mode. Click to cycle.">Time: ${timeDuration}s</button>` : ''}
                    <button class="menu-button small quiet" data-action="toggle-punctuation" data-tooltip="Include punctuation (commas, periods) in generated text.">Punctuation: ${settings.wordsPunctuation ? 'On' : 'Off'}</button>
                    <button class="menu-button small quiet" data-action="toggle-numbers" data-tooltip="Include numbers in generated text.">Numbers: ${settings.wordsNumbers ? 'On' : 'Off'}</button>
                    <button class="menu-button small quiet" data-action="cycle-word-list-tier" data-tooltip="Common (short, everyday words), Extended (adds longer/less frequent words), or Hard (technical and irregularly-spelled words). Click to cycle.">Word List: ${wordListTierLabel(settings.wordListTier)}</button>
                </div>
                </div>` : ''}
                <div class="settings-column">
                <div class="settings-hint">Typing</div>
                <div class="settings-row-group">
                    <button class="menu-button small quiet" data-action="toggle-live-stats" data-tooltip="Show WPM/ACC while you type, or only reveal them on the end screen.">Live Stats: ${settings.hideLiveStats ? 'Off' : 'On'}</button>
                    <button class="menu-button small quiet" data-action="toggle-caret-blink" data-tooltip="Make the current-character caret blink, or keep it solid.">Blink Caret: ${settings.caretBlink ? 'On' : 'Off'}</button>
                    <button class="menu-button small quiet" data-action="toggle-blind-mode" data-tooltip="Hide correct/incorrect coloring while typing - only revealed on the end screen.">Blind Mode: ${settings.blindMode ? 'On' : 'Off'}</button>
                    <button class="menu-button small quiet" data-action="cycle-sound-theme" data-tooltip="Play a sound on each keystroke. Click to cycle.">Sound: ${escapeHtml(soundThemeLabel(settings.soundTheme))}</button>
                </div>
                </div>
                </div>
                <div class="settings-hint">Dev</div>
                <button class="menu-button small" data-action="simulate-test" data-tooltip="Jump straight to the end screen with fake results, no typing required.">Simulate Test &rarr; End Screen</button>
                <button class="menu-button small quiet" data-action="close-settings">Close</button>
            </div>

            <div class="custom-panel" hidden>
                <div class="custom-hint">Paste text, notes, code, subtitles (.srt/.vtt), or lyrics (.lrc) - typed in order, not randomized. Drag a file in, or:</div>
                <textarea class="custom-textarea" placeholder="Paste text, notes, code, or lyrics here... (or drop a file anywhere in this box)"></textarea>
                <div class="custom-stats" hidden></div>
                <div class="custom-panel-row">
                    <label class="menu-button small file-label">
                        Choose file
                        <input type="file" class="custom-file-input" accept=".txt,.md,.srt,.vtt,.lrc,.rs,.js,.ts,.jsx,.tsx,.py,.c,.h,.cpp,.hpp,.go,.java,.cs,.sh" hidden />
                    </label>
                    <span class="custom-file-name"></span>
                </div>
                ${documents && documents.length ? `
                <div class="custom-library">
                    <div class="settings-hint">Your documents</div>
                    ${documents.map(d => `
                        <div class="custom-doc" data-doc="${escapeHtml(d.id)}">
                            <button class="custom-doc-open" data-action="open-doc" data-doc="${escapeHtml(d.id)}">
                                <span class="custom-doc-name">${escapeHtml(d.name)}</span>
                                <span class="custom-doc-progress">${Math.min(100, Math.round((d.position / Math.max(1, d.chunkCount)) * 100))}% &middot; ${d.chunkCount} segments</span>
                            </button>
                            <button class="custom-doc-remove" data-action="remove-doc" data-doc="${escapeHtml(d.id)}" aria-label="Remove" data-tooltip="Remove from your documents">&times;</button>
                        </div>
                    `).join('')}
                </div>` : ''}
                <div class="custom-panel-row">
                    <button class="menu-button small" data-action="use-pasted">Use this text</button>
                    <button class="menu-button small quiet" data-action="close-custom">Cancel</button>
                </div>
                <div class="custom-error"></div>
            </div>

            <div class="logo">TyperPunk</div>

            <div class="menu-key-hint">Enter to start &middot; Esc for the menu</div>

            <div class="corner-rail-left">
                <button class="corner-icon-button" data-action="settings" aria-label="Settings" data-tooltip="Settings">${SETTINGS_ICON}</button>
                <button class="corner-icon-button" data-action="store" aria-label="Store" data-tooltip="Store">${STORE_ICON}</button>
            </div>

            <div class="corner-rail-right">
                ${profile.testsCompleted > 0 ? `<div class="stats-corner-figures" data-tooltip="Your average WPM across every test, and your best single result.">
                    <div class="stats-corner-avg">avg ${profile.averageWpm}</div>
                    <div class="stats-corner-pb">pb ${Math.round(profile.bestWpm)}</div>
                </div>` : ''}
                <button class="corner-icon-button" data-action="stats" aria-label="Stats" data-tooltip="Stats">${STATS_ICON}</button>
                <button class="corner-icon-button" data-action="leaderboard" aria-label="Leaderboard" data-tooltip="Leaderboard">${LEADERBOARD_ICON}</button>
            </div>

        </div>
    `;

    attachTooltips(root);
    const cleanupTheme = renderTopRail(root, { onShowAccount, onShowFriends });
    const cleanupFooter = renderSiteFooter(root, { onShowPrivacy, onShowContribute });

    // Friends-online lives in the top rail beside the Friends control.

    // Clicking a chevron reveals every mode as a direct pick, rather than
    // cycling blind through them one click at a time - Custom and the text
    // categories were otherwise invisible unless you clicked through the
    // whole list first. Shared between the Singleplayer and Multiplayer
    // split-buttons instead of duplicated, since both need the exact same
    // "position, open downward, cap to available height" behavior.
    const outsideClickHandlers = [];
    function setupDropdown(groupEl, chevronEl, popoverEl, hideElWhileOpen) {
        function position() {
            const rect = groupEl.getBoundingClientRect();
            const gap = 8;
            // Clear of the bottom edge: the corner rails and the footer live
            // down there, and a panel that runs to the last pixel of the
            // window reads as cut off rather than as a menu.
            const bottomInset = 88;
            const spaceBelow = window.innerHeight - rect.bottom - gap - bottomInset;
            const spaceAbove = rect.top - gap - 16;

            popoverEl.style.left = `${rect.left}px`;
            popoverEl.style.width = `${rect.width}px`;
            // Opens upward when there is more room there, which is what a
            // short window leaves.
            if (spaceBelow < 220 && spaceAbove > spaceBelow) {
                popoverEl.style.top = 'auto';
                popoverEl.style.bottom = `${window.innerHeight - rect.top + gap}px`;
                popoverEl.style.maxHeight = `${Math.max(140, spaceAbove)}px`;
            } else {
                popoverEl.style.top = `${rect.bottom + gap}px`;
                popoverEl.style.bottom = 'auto';
                popoverEl.style.maxHeight = `${Math.max(140, spaceBelow)}px`;
            }
        }
        chevronEl.addEventListener('click', e => {
            e.stopPropagation();
            const opening = popoverEl.hidden;
            popoverEl.hidden = !popoverEl.hidden;
            if (opening) position();
            // The popover opens flush against the button's own bottom edge,
            // the same spot this occupies in normal flow - left showing,
            // the two sat directly on top of each other.
            if (hideElWhileOpen) hideElWhileOpen.style.visibility = opening ? 'hidden' : '';
        });
        const handleOutsideClick = e => {
            if (!popoverEl.hidden && !groupEl.contains(e.target)) {
                popoverEl.hidden = true;
                if (hideElWhileOpen) hideElWhileOpen.style.visibility = '';
            }
        };
        document.addEventListener('click', handleOutsideClick);
        outsideClickHandlers.push(handleOutsideClick);
    }

    setupDropdown(
        root.querySelector('.sp-group'),
        root.querySelector('[data-action="pick-mode"]'),
        root.querySelector('.sp-popover'),
        root.querySelector('.sp-caption'),
    );
    root.querySelectorAll('.sp-popover .mode-popover-item[data-mode]').forEach(item => {
        item.addEventListener('click', () => {
            const mode = item.dataset.mode;
            // Custom is the one mode that cannot always start on being picked:
            // with no text loaded it hands off to the paste/upload panel, and
            // only starts once there is something to type. Selecting it
            // without either of those left it unstartable.
            if (mode === 'custom') {
                if (customText) onStartCustom();
                else onSelectCategory(mode);
                return;
            }
            onPickAndStart(mode);
        });
    });
    root.querySelector('[data-action="mode-lyrics"]').addEventListener('click', onShowLyrics);

    root.querySelector('[data-action="mode-multiplayer"]').addEventListener('click', onShowMultiplayer);

    const startBtn = root.querySelector('.sp-group .start-main');
    const panel = root.querySelector('.custom-panel');
    // No click handler of its own: setupDropdown above owns this button and
    // opens the mode picker with it. Starting happens when a mode is chosen.

    // Landing on Custom with nothing loaded goes straight to the paste/upload
    // panel - there is nothing to start until text exists.
    if (isCustom && !customText) panel.hidden = false;

    // Matches the "Enter to start" hint in the bottom-right corner. Skipped
    // while typing into a text field or with any popover/panel open, so it
    // doesn't hijack Enter from the custom-text textarea, a form, or a mode
    // picker where Enter has no obvious meaning.
    const handleEnterToStart = e => {
        if (e.key !== 'Enter') return;
        const tag = document.activeElement?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        if (root.querySelector('.mode-popover:not([hidden])')) return;
        // The theme gallery is owned by renderThemeButton now, not this
        // screen's own state - re-queried fresh rather than kept as a
        // local reference, since it doesn't exist until that call runs.
        const themePopover = root.querySelector('.theme-gallery-popover');
        if (!settingsPanel.hidden || (themePopover && !themePopover.hidden) || !panel.hidden) return;
        startBtn.click();
    };
    document.addEventListener('keydown', handleEnterToStart);

    root.querySelectorAll('[data-action="open-doc"]').forEach(el => {
        el.addEventListener('click', () => onOpenDocument(el.dataset.doc));
    });
    root.querySelectorAll('[data-action="remove-doc"]').forEach(el => {
        el.addEventListener('click', e => {
            e.stopPropagation();
            onRemoveDocument(el.dataset.doc);
        });
    });

    root.querySelector('[data-action="stats"]').addEventListener('click', onShowStats);

    root.querySelector('[data-action="leaderboard"]').addEventListener('click', onShowLeaderboard);
    root.querySelector('[data-action="store"]').addEventListener('click', onShowStore);
    // Friends and Account are the top rail's controls now, wired there.

    const settingsPanel = root.querySelector('.settings-panel');
    root.querySelector('[data-action="settings"]').addEventListener('click', () => {
        settingsPanel.hidden = false;
    });
    root.querySelector('[data-action="close-settings"]').addEventListener('click', () => {
        settingsPanel.hidden = true;
    });
    root.querySelector('.settings-skip-menu').addEventListener('change', e => {
        updateSettings({ skipMenu: e.target.checked });
    });

    const favoriteBtn = root.querySelector('[data-action="toggle-favorite"]');
    favoriteBtn.addEventListener('click', () => {
        const nowFavorite = getSettings().favoriteMode !== currentMode;
        updateSettings({ favoriteMode: nowFavorite ? currentMode : null });
        favoriteBtn.textContent = nowFavorite
            ? `★ Favorite (${label(currentMode)})`
            : `☆ Set "${label(currentMode)}" as favorite`;
    });

    // These update settings in place (text content patched directly) rather
    // than going through onSelectCategory's full menu re-render - none of
    // them change the selected mode, and a full re-render was resetting
    // .settings-panel back to hidden on every single click, forcing you to
    // reopen Settings after each change.
    // The rules line under the mode bar, for the modes that have rules.
    const startSubEl = root.querySelector('.sp-caption');
    function refreshRulesSummary() {
        if (!startSubEl) return;
        const s = getSettings();
        const parts = [isWords ? `${liveWordCount} words` : `${liveTimeDuration}s`];
        if (s.wordsPunctuation) parts.push('punctuation');
        if (s.wordsNumbers) parts.push('numbers');
        startSubEl.textContent = parts.join(' · ');
    }

    let liveWordCount = wordCount;
    const wordCountBtn = root.querySelector('[data-action="cycle-word-count"]');
    if (wordCountBtn) {
        wordCountBtn.addEventListener('click', () => {
            liveWordCount = WORD_COUNTS[(WORD_COUNTS.indexOf(liveWordCount) + 1) % WORD_COUNTS.length];
            updateSettings({ wordCount: liveWordCount });
            wordCountBtn.textContent = `Words: ${liveWordCount}`;
            refreshRulesSummary();
        });
    }

    let liveTimeDuration = timeDuration;
    const timeDurationBtn = root.querySelector('[data-action="cycle-time-duration"]');
    if (timeDurationBtn) {
        timeDurationBtn.addEventListener('click', () => {
            liveTimeDuration = TIME_DURATIONS[(TIME_DURATIONS.indexOf(liveTimeDuration) + 1) % TIME_DURATIONS.length];
            updateSettings({ timeDuration: liveTimeDuration });
            timeDurationBtn.textContent = `Time: ${liveTimeDuration}s`;
            refreshRulesSummary();
        });
    }

    const punctuationBtn = root.querySelector('[data-action="toggle-punctuation"]');
    if (punctuationBtn) {
        punctuationBtn.addEventListener('click', () => {
            const next = !getSettings().wordsPunctuation;
            updateSettings({ wordsPunctuation: next });
            punctuationBtn.textContent = `Punctuation: ${next ? 'On' : 'Off'}`;
            refreshRulesSummary();
        });
    }
    const numbersBtn = root.querySelector('[data-action="toggle-numbers"]');
    if (numbersBtn) {
        numbersBtn.addEventListener('click', () => {
            const next = !getSettings().wordsNumbers;
            updateSettings({ wordsNumbers: next });
            numbersBtn.textContent = `Numbers: ${next ? 'On' : 'Off'}`;
            refreshRulesSummary();
        });
    }
    const wordListTierBtn = root.querySelector('[data-action="cycle-word-list-tier"]');
    if (wordListTierBtn) {
        const tiers = wordListTiers();
        wordListTierBtn.addEventListener('click', () => {
            const current = getSettings().wordListTier;
            const next = tiers[(tiers.indexOf(current) + 1) % tiers.length];
            updateSettings({ wordListTier: next });
            wordListTierBtn.textContent = `Word List: ${wordListTierLabel(next)}`;
        });
    }

    const liveStatsBtn = root.querySelector('[data-action="toggle-live-stats"]');
    liveStatsBtn.addEventListener('click', () => {
        const next = !getSettings().hideLiveStats;
        updateSettings({ hideLiveStats: next });
        liveStatsBtn.textContent = `Live Stats: ${next ? 'Off' : 'On'}`;
    });
    const caretBlinkBtn = root.querySelector('[data-action="toggle-caret-blink"]');
    caretBlinkBtn.addEventListener('click', () => {
        const next = !getSettings().caretBlink;
        updateSettings({ caretBlink: next });
        caretBlinkBtn.textContent = `Blink Caret: ${next ? 'On' : 'Off'}`;
    });
    const blindModeBtn = root.querySelector('[data-action="toggle-blind-mode"]');
    blindModeBtn.addEventListener('click', () => {
        const next = !getSettings().blindMode;
        updateSettings({ blindMode: next });
        blindModeBtn.textContent = `Blind Mode: ${next ? 'On' : 'Off'}`;
    });
    const soundThemeBtn = root.querySelector('[data-action="cycle-sound-theme"]');
    soundThemeBtn.addEventListener('click', () => {
        const current = getSettings().soundTheme;
        const next = SOUND_THEMES[(SOUND_THEMES.indexOf(current) + 1) % SOUND_THEMES.length];
        updateSettings({ soundTheme: next });
        soundThemeBtn.textContent = `Sound: ${soundThemeLabel(next)}`;
    });

    root.querySelector('[data-action="simulate-test"]').addEventListener('click', onSimulateTest);

    const passiveBtn = root.querySelector('[data-action="start-passive"]');
    if (passiveBtn) passiveBtn.addEventListener('click', onStartPassive);

    const clearBtn = root.querySelector('[data-action="clear-custom"]');
    if (clearBtn) clearBtn.addEventListener('click', onClearCustom);

    const closeBtn = root.querySelector('[data-action="close-custom"]');
    closeBtn.addEventListener('click', () => { panel.hidden = true; });

    const fileInput = root.querySelector('.custom-file-input');
    const fileNameLabel = root.querySelector('.custom-file-name');
    const textarea = root.querySelector('.custom-textarea');
    const customStats = root.querySelector('.custom-stats');
    const errorBox = root.querySelector('.custom-error');
    let pickedFile = null;

    // Word/character count of whatever's currently loaded (pasted or a
    // picked file) - shown before you commit to it, since a file's content
    // isn't otherwise visible until you've already started typing it.
    async function refreshCustomStats() {
        let raw = pickedFile ? await pickedFile.text() : textarea.value;
        if (!raw || !raw.trim()) {
            customStats.hidden = true;
            return;
        }
        const words = raw.trim().split(/\s+/).filter(Boolean).length;
        const chars = raw.length;
        customStats.hidden = false;
        customStats.textContent = `${words} words · ${chars} characters`;
    }

    function setPickedFile(file) {
        pickedFile = file || null;
        fileNameLabel.textContent = pickedFile ? pickedFile.name : '';
        if (pickedFile) textarea.value = '';
        refreshCustomStats();
    }

    fileInput.addEventListener('change', () => setPickedFile(fileInput.files[0]));
    textarea.addEventListener('input', () => {
        if (pickedFile) setPickedFile(null);
        else refreshCustomStats();
    });

    // Drag-and-drop a file directly onto the textarea, instead of only
    // through the file picker button.
    textarea.addEventListener('dragover', e => {
        e.preventDefault();
        textarea.classList.add('drag-over');
    });
    textarea.addEventListener('dragleave', () => textarea.classList.remove('drag-over'));
    textarea.addEventListener('drop', e => {
        e.preventDefault();
        textarea.classList.remove('drag-over');
        const file = e.dataTransfer.files && e.dataTransfer.files[0];
        if (file) setPickedFile(file);
    });

    root.querySelector('[data-action="use-pasted"]').addEventListener('click', async () => {
        errorBox.textContent = '';
        try {
            let raw;
            let name;
            if (pickedFile) {
                raw = await pickedFile.text();
                name = pickedFile.name;
            } else {
                raw = textarea.value;
                name = 'Pasted text';
            }
            if (!raw || !raw.trim()) {
                errorBox.textContent = 'Paste some text or choose a file first.';
                return;
            }
            if (pickedFile && !looksLikeText(raw)) {
                errorBox.textContent = "That file doesn't look like text - try a .txt, .md, or code file.";
                return;
            }
            const { chunks, language, timed, markdown } = parseCustomContent(raw, name);
            if (chunks.length === 0) {
                errorBox.textContent = 'Could not find any typeable text in that content.';
                return;
            }
            // `raw` travels with it so the document can be stored and
            // re-chunked later - switching a markdown file between prose and
            // verbatim needs the original, not the chunks.
            onLoadCustom({ name, chunks, language, timed, markdown, raw });
        } catch (err) {
            console.error('Failed to load custom text:', err);
            errorBox.textContent = 'Failed to read that file.';
        }
    });

    return () => {
        cleanupTheme();
        cleanupFooter();
        document.removeEventListener('keydown', handleEnterToStart);
        outsideClickHandlers.forEach(h => document.removeEventListener('click', h));
    };
}
