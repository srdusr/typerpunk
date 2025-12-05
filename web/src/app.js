import { renderMainMenu } from './screens/mainMenu.js';
import { renderTypingGame } from './screens/typingGame.js';
import { renderEndScreen } from './screens/endScreen.js';
import { renderPassiveMode } from './screens/passiveMode.js';
import { renderStatsScreen } from './screens/statsScreen.js';
import { renderPlaceholderScreen } from './screens/placeholderScreen.js';
import { renderAccountScreen } from './screens/accountScreen.js';
import { renderLeaderboardScreen } from './screens/leaderboardScreen.js';
import { renderFriendsScreen } from './screens/friendsScreen.js';
import { renderMultiplayerScreen } from './screens/multiplayerScreen.js';
import { renderLyricsScreen } from './screens/lyricsScreen.js';
import { renderPublicProfileScreen } from './screens/publicProfileScreen.js';
import { renderStoreScreen } from './screens/storeScreen.js';
import { createGame, freeGame } from './game.js';
import { getSettings } from './settings.js';
import { generateWordStream, generateWeakKeyStream, wordCountForDuration } from './wordGenerator.js';
import { getWeakChars } from './keyStats.js';

const FALLBACK_TEXT = { category: 'general', content: 'The quick brown fox jumps over the lazy dog.', attribution: 'Traditional pangram' };

function uniqueCategories(items) {
    const set = new Set();
    for (const t of items) if (t.category) set.add(t.category);
    return Array.from(set).sort();
}

function pickRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function getRandomTextItem(items, category) {
    const pool = category && category !== 'random' ? items.filter(t => t.category === category) : items;
    return pool.length ? pickRandom(pool) : FALLBACK_TEXT;
}

export function startApp(root, localTexts) {
    let allTexts = localTexts;
    let categories = uniqueCategories(localTexts);
    let selectedCategory = localStorage.getItem('typerpunk:last_mode') || 'time';
    let customText = null; // { name, chunks: [{content, time}], language, timed }
    let session = { type: 'random', customIndex: 0 };
    let game = null;
    let cleanupScreen = null;

    const onlineUrl = window.TYPERPUNK_TEXTS_URL;
    if (onlineUrl) {
        fetch(onlineUrl, { cache: 'no-store' })
            .then(res => (res.ok ? res.json() : null))
            .then(data => {
                if (Array.isArray(data)) {
                    allTexts = data;
                    categories = uniqueCategories(data);
                }
            })
            .catch(() => {});
    }

    function teardown() {
        if (cleanupScreen) {
            cleanupScreen();
            cleanupScreen = null;
        }
    }

    // Which screen is showing, and whether leaving it costs the user
    // something. Escape is a global "get me out of here", but walking out of a
    // live race drops you from it for everyone else in the room too, so that
    // one case asks first.
    let currentScreenName = 'menu';
    let escapeIsCostly = () => false;

    function setScreen(name, costly = () => false) {
        currentScreenName = name;
        escapeIsCostly = costly;
    }

    function handleGlobalEscape(e) {
        if (e.key !== 'Escape') return;
        // Let an open popover close itself first - one Escape should not both
        // dismiss a menu and navigate away from the screen behind it.
        const openPopover = document.querySelector(
            '.mode-popover:not([hidden]), .rail-settings-panel:not([hidden]), .lang-popover:not([hidden]), .theme-gallery-popover:not([hidden])');
        if (openPopover) {
            openPopover.hidden = true;
            return;
        }
        if (currentScreenName === 'menu') return;
        if (escapeIsCostly() && !window.confirm('Leave the race? Your opponents will see you drop out.')) return;
        showMainMenu();
    }
    document.addEventListener('keydown', handleGlobalEscape);

    function showMainMenu() {
        teardown();
        freeGame(game);
        game = null;
        setScreen('menu');
        cleanupScreen = renderMainMenu(root, {
            onStartGame: () => { session = { type: 'random', customIndex: 0 }; startGame(); },
            categories,
            selectedCategory,
            onSelectCategory: cat => {
                selectedCategory = cat;
                try { localStorage.setItem('typerpunk:last_mode', cat); } catch {}
                showMainMenu();
            },
            // Picking a mode from the Single Player menu starts that mode --
            // choosing what to type and starting it are one action now, not a
            // selection followed by a second click on the same button.
            onPickAndStart: cat => {
                selectedCategory = cat;
                try { localStorage.setItem('typerpunk:last_mode', cat); } catch {}
                session = { type: 'random', customIndex: 0 };
                startGame();
            },
            customText,
            onLoadCustom: loaded => {
                customText = loaded;
                showMainMenu();
            },
            onClearCustom: () => {
                customText = null;
                showMainMenu();
            },
            onStartCustom: () => {
                session = { type: 'custom', customIndex: 0 };
                startGame();
            },
            onStartPassive: startPassive,
            onShowStats: showStats,
            onShowPlaceholder: showPlaceholder,
            onShowAccount: showAccount,
            onShowLeaderboard: showLeaderboard,
            onShowFriends: showFriends,
            onShowMultiplayer: showMultiplayer,
            onShowStore: showStore,
            onShowLyrics: showLyrics,
            onShowPrivacy: showPrivacy,
            onSimulateTest: simulateTest,
        });
    }

    // Dev-only shortcut: jumps straight to the end screen with synthetic
    // results, no actual typing needed - for iterating on the end screen's
    // design without retyping a full passage every time.
    function simulateTest() {
        teardown();
        const text = 'The quick brown fox jumps over the lazy dog while typing very quickly today, right now, in this exact moment.';
        const wpm = 70 + Math.random() * 90;
        const accuracy = 85 + Math.random() * 15;
        const time = 8 + Math.random() * 15;
        const charTimings = [];
        const keypressHistory = [];
        for (let i = 0; i < text.length; i++) {
            const t = (i / text.length) * time;
            const isCorrect = Math.random() * 100 < accuracy;
            charTimings.push({ time: t, isCorrect, index: i });
            keypressHistory.push({ time: t, isCorrect, index: i });
        }
        const incorrectChars = charTimings.filter(c => !c.isCorrect).length;
        const stats = {
            wpm, rawWpm: wpm * 1.08, accuracy, time,
            correctChars: text.length - incorrectChars, incorrectChars, totalChars: text.length,
            currentStreak: 0, bestStreak: Math.floor(text.length / 3),
        };
        showEndScreen({ stats, text, userInput: text, charTimings, keypressHistory, modeKey: null });
    }

    function showStats() {
        teardown();
        setScreen('stats');
        cleanupScreen = renderStatsScreen(root, { onBack: showMainMenu, onShowPlaceholder: showPlaceholder, onShowAccount: showAccount, onShowLeaderboard: showLeaderboard, onShowFriends: showFriends, onShowMultiplayer: showMultiplayer, onShowStore: showStore });
    }

    // Written from what the code actually does, not from a template: this app
    // has no analytics, no third-party scripts and no npm runtime dependencies,
    // so there is genuinely very little to disclose.
    function showPrivacy() {
        showPlaceholder('Privacy', [
            'On this device, in your browser: your theme, typing settings, personal bests, lifetime stats and per-key accuracy. Clearing site data removes all of it. Nothing here is sent anywhere unless you sign in.',
            '',
            'On the server, only if you create an account: your username, a hash of your password (never the password), your completed results, your friendships, and anything you equip from the store. Sessions expire. If you connect Spotify, its access token is stored so Lyrics mode can read what is playing.',
            '',
            'Multiplayer sends the name you race under, your live progress and your final result to the other people in your room, for as long as the race lasts.',
            '',
            'There are no analytics, no advertising and no third-party scripts - the site loads no code it does not ship itself. Nothing is sold or shared.',
        ].join('\n'));
    }

    function showPlaceholder(title, description) {
        teardown();
        setScreen('placeholder');
        cleanupScreen = renderPlaceholderScreen(root, { title, description, onBack: showMainMenu, onShowStats: showStats, onShowPlaceholder: showPlaceholder, onShowAccount: showAccount, onShowLeaderboard: showLeaderboard, onShowFriends: showFriends, onShowMultiplayer: showMultiplayer, onShowStore: showStore });
    }

    function showAccount() {
        teardown();
        setScreen('account');
        cleanupScreen = renderAccountScreen(root, { onBack: showMainMenu, onShowStats: showStats, onShowPlaceholder: showPlaceholder, onShowLeaderboard: showLeaderboard, onShowFriends: showFriends, onShowMultiplayer: showMultiplayer, onShowStore: showStore });
    }

    function showLeaderboard() {
        teardown();
        setScreen('leaderboard');
        cleanupScreen = renderLeaderboardScreen(root, { onBack: showMainMenu, onShowPublicProfile: showPublicProfile, onShowStats: showStats, onShowPlaceholder: showPlaceholder, onShowAccount: showAccount, onShowFriends: showFriends, onShowMultiplayer: showMultiplayer, onShowStore: showStore });
    }

    function showPublicProfile(username) {
        teardown();
        setScreen('profile');
        cleanupScreen = renderPublicProfileScreen(root, { username, onBack: showLeaderboard, onShowStats: showStats, onShowPlaceholder: showPlaceholder, onShowAccount: showAccount, onShowLeaderboard: showLeaderboard, onShowFriends: showFriends, onShowMultiplayer: showMultiplayer, onShowStore: showStore });
    }

    function showFriends() {
        teardown();
        setScreen('friends');
        cleanupScreen = renderFriendsScreen(root, { onBack: showMainMenu, onShowStats: showStats, onShowPlaceholder: showPlaceholder, onShowAccount: showAccount, onShowLeaderboard: showLeaderboard, onShowMultiplayer: showMultiplayer, onShowStore: showStore });
    }

    function showMultiplayer() {
        teardown();
        setScreen('multiplayer', () => !!document.querySelector('.mp-opponents'));
        cleanupScreen = renderMultiplayerScreen(root, { onBack: showMainMenu, onFinish: showEndScreen, onShowStats: showStats, onShowPlaceholder: showPlaceholder, onShowAccount: showAccount, onShowLeaderboard: showLeaderboard, onShowFriends: showFriends, onShowStore: showStore });
    }

    function showStore() {
        teardown();
        setScreen('store');
        cleanupScreen = renderStoreScreen(root, { onBack: showMainMenu, onShowStats: showStats, onShowPlaceholder: showPlaceholder, onShowAccount: showAccount, onShowLeaderboard: showLeaderboard, onShowFriends: showFriends, onShowMultiplayer: showMultiplayer });
    }

    function showLyrics() {
        teardown();
        setScreen('lyrics');
        cleanupScreen = renderLyricsScreen(root, {
            onBack: showMainMenu,
            onLyricsReady: loaded => {
                customText = loaded;
                session = { type: 'custom', customIndex: 0 };
                startGame();
            },
            onShowStats: showStats,
            onShowPlaceholder: showPlaceholder,
            onShowAccount: showAccount,
            onShowLeaderboard: showLeaderboard,
            onShowFriends: showFriends,
            onShowMultiplayer: showMultiplayer,
            onShowStore: showStore,
        });
    }

    async function startGame() {
        teardown();
        let content;
        let attribution;
        let explanation;
        let language;
        let progress;
        let timeLimit;
        // Custom text has no stable, repeatable challenge to compare against,
        // so it's excluded from personal-best tracking (stays undefined).
        let modeKey;

        if (session.type === 'custom' && customText) {
            const chunk = customText.chunks[session.customIndex];
            content = chunk.content;
            attribution = customText.name;
            language = customText.language;
            progress = `${customText.name} · segment ${session.customIndex + 1}/${customText.chunks.length}`;
        } else if (selectedCategory === 'words') {
            const s = getSettings();
            content = generateWordStream(s.wordCount || 25, { punctuation: s.wordsPunctuation, numbers: s.wordsNumbers, tier: s.wordListTier, language: s.language });
            modeKey = `words-${s.wordCount || 25}`;
        } else if (selectedCategory === 'time') {
            const s = getSettings();
            timeLimit = s.timeDuration || 30;
            content = generateWordStream(wordCountForDuration(timeLimit), { punctuation: s.wordsPunctuation, numbers: s.wordsNumbers, tier: s.wordListTier, language: s.language });
            modeKey = `time-${timeLimit}`;
        } else if (selectedCategory === 'zen') {
            // No timer, no fixed length - type until you choose to stop (the
            // visible Finish button in the typing screen). No modeKey: like
            // custom text, there's no fixed-length challenge to compare a
            // "personal best" against since every session covers a different
            // amount of text.
            const s = getSettings();
            content = generateWordStream(800, { punctuation: s.wordsPunctuation, numbers: s.wordsNumbers, tier: s.wordListTier, language: s.language });
        } else if (selectedCategory === 'practice') {
            // Adaptive, personal, and different every time by nature - no
            // modeKey, same reasoning as Zen/Custom: there's no fixed
            // challenge here to compare a "personal best" against.
            const s = getSettings();
            const weakChars = getWeakChars();
            content = generateWeakKeyStream(wordCountForDuration(30), weakChars, { punctuation: s.wordsPunctuation, numbers: s.wordsNumbers });
        } else {
            const item = getRandomTextItem(allTexts, selectedCategory);
            content = item.content;
            attribution = item.attribution;
            // Code snippets highlight themselves; prose packs have no language
            // and fall through as plain text.
            language = item.language || undefined;
            explanation = item.explanation || undefined;
            modeKey = `quote-${selectedCategory || 'random'}`;
        }

        try {
            game = await createGame();
            game.set_text(content);
        } catch (err) {
            console.error('Failed to start game:', err);
            showMainMenu();
            return;
        }
        setScreen('typing');
        cleanupScreen = renderTypingGame(root, {
            game,
            text: content,
            attribution,
            explanation,
            language,
            progress,
            timeLimit,
            modeKey,
            zenMode: selectedCategory === 'zen' && !(session.type === 'custom' && customText),
            onFinish: showEndScreen,
            onMainMenu: showMainMenu,
            onRestart: startGame,
            onShowStats: showStats,
            onShowPlaceholder: showPlaceholder,
            onShowAccount: showAccount,
            onShowLeaderboard: showLeaderboard,
            onShowFriends: showFriends,
            onShowMultiplayer: showMultiplayer,
            onShowStore: showStore,
            onShowPrivacy: showPrivacy,
        });
    }

    function playAgain() {
        if (session.type === 'custom' && customText) {
            if (session.customIndex + 1 < customText.chunks.length) {
                session.customIndex += 1;
            } else {
                showMainMenu();
                return;
            }
        }
        startGame();
    }

    function showEndScreen(result) {
        teardown();
        setScreen('end');
        cleanupScreen = renderEndScreen(root, {
            ...result,
            onPlayAgain: playAgain,
            onMainMenu: showMainMenu,
            onShowStats: showStats,
            onShowPlaceholder: showPlaceholder,
            onShowAccount: showAccount,
            onShowLeaderboard: showLeaderboard,
            onShowFriends: showFriends,
            onShowMultiplayer: showMultiplayer,
            onShowStore: showStore,
        });
    }

    function startPassive() {
        teardown();
        if (!customText) {
            showMainMenu();
            return;
        }
        setScreen('passive');
        cleanupScreen = renderPassiveMode(root, {
            name: customText.name,
            chunks: customText.chunks,
            onExit: showMainMenu,
        });
    }

    const { skipMenu, favoriteMode } = getSettings();
    const bootMode = favoriteMode || selectedCategory;
    if (skipMenu && bootMode !== 'custom') {
        selectedCategory = bootMode;
        try { localStorage.setItem('typerpunk:last_mode', bootMode); } catch {}
        session = { type: 'random', customIndex: 0 };
        startGame();
    } else {
        showMainMenu();
    }
}
