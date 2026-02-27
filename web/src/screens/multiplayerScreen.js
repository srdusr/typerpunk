import { escapeHtml } from '../util.js';
import { logoLockup } from '../logo.js';
import { CLOSE_ICON, RACER_SPRITES, RACER_SPRITE_IDS } from './icons.js';
import { renderCornerRail } from '../cornerRail.js';
import { attachTooltips } from '../tooltip.js';
import { renderTopRail } from '../topRail.js';
import { createRoom, quickMatch, connectToRoom } from '../multiplayer.js';
import { getUser } from '../auth.js';
import { createGame, freeGame } from '../game.js';
import { renderTypingGame } from './typingGame.js';

// You are always the theme's own accent; opponents take the --player-N hues
// in the order the server lists them, so the mapping is stable for everyone
// in the room and the same person keeps their colour from lobby to race.
const OPPONENT_COLORS = ['var(--player-2)', 'var(--player-3)', 'var(--player-4)', 'var(--player-5)'];

function racerColors(players, myId) {
    const colors = {};
    let next = 0;
    for (const p of players) {
        if (p.id === myId) {
            colors[p.id] = 'var(--primary-color)';
        } else {
            colors[p.id] = OPPONENT_COLORS[next % OPPONENT_COLORS.length];
            next += 1;
        }
    }
    return colors;
}

// A sprite per racer, assigned from the server's own player order so every
// client in the room draws the same person as the same character. Derived
// rather than stored: the order is identical everywhere, and a race is short
// enough that nobody needs to keep a sprite between rooms.
function racerSprites(players) {
    const sprites = {};
    players.forEach((p, i) => {
        sprites[p.id] = RACER_SPRITE_IDS[i % RACER_SPRITE_IDS.length];
    });
    return sprites;
}

// A style="" attribute in markup is refused by the Content-Security-Policy;
// the same property set through element.style is not. Markup carries the
// value in a data attribute and this applies it.
function applyInlineStyles(container) {
    container.querySelectorAll('[data-racer-color]').forEach(el => {
        el.style.setProperty('--racer-color', el.dataset.racerColor);
    });
    container.querySelectorAll('[data-percent]').forEach(el => {
        el.style.width = `${el.dataset.percent}%`;
    });
    // How far along the track a sprite has travelled, as a fraction. The
    // stylesheet turns it into a position; a percentage on its own would put
    // the sprite's left edge at the finish rather than the sprite itself.
    container.querySelectorAll('[data-progress]').forEach(el => {
        el.style.setProperty('--p', String(Math.max(0, Math.min(1, Number(el.dataset.progress) / 100)) || 0));
    });
}

// No account required - a quick race with friends shouldn't need signing
// in, so this only prefills the name field when one exists rather than
// gating the whole feature behind it (unlike Friends/Leaderboard, which
// inherently need an identity to mean anything).
export function renderMultiplayerScreen(root, { onBack, onFinish, onShowStats, onShowPlaceholder, onShowAccount, onShowLeaderboard, onShowFriends, onShowStore }) {
    let connection = null;
    let cleanupInner = null;
    // Set when the end screen takes over the live race feed. Both this
    // screen's teardown paths check it: app.js tears the race screen down
    // before rendering the end screen, and the outer cleanup closes the
    // socket - which killed the feed the standings are built from, including
    // your own PlayerFinished, which the server sends back a moment after you
    // finish.
    let handedOff = false;
    let players = [];
    let myId = null;
    let game = null;

    function teardownInner() {
        if (cleanupInner) { cleanupInner(); cleanupInner = null; }
    }

    function leaveRoom() {
        connection?.close();
        connection = null;
    }

    function renderLanding(landingError) {
        teardownInner();
        let deviceFilter = 'everyone';
        root.innerHTML = `
            <div class="stats-screen">
                <button class="screen-close" data-action="menu" aria-label="Close" data-tooltip="Close (Esc)">${CLOSE_ICON}</button>
                ${logoLockup()}
                <h2>Multiplayer</h2>
                <div class="account-panel">
                    <input class="account-input" type="text" id="mp-name" placeholder="Your name" value="${escapeHtml(getUser()?.username || '')}">
                    <button class="menu-button small quiet" data-action="toggle-device-filter" data-tooltip="Who you get matched with, and the setting any room you open uses. Joining by code always uses that room's setting.">Match: Everyone</button>
                    <button class="menu-button primary" data-action="quick" data-tooltip="Drops you straight into a race with whoever else is looking. No code to share.">Find a Race</button>

                    <div class="mp-divider"><span>or race friends</span></div>

                    <div class="mp-code-row">
                        <input class="account-input" type="text" id="mp-room-code" placeholder="CODE" maxlength="5" autocomplete="off" spellcheck="false">
                        <button class="menu-button" data-action="join">Join</button>
                    </div>
                    <button class="menu-button quiet" data-action="create" data-tooltip="Opens an empty room and gives you a code to share.">Create a Room</button>
                    <div class="custom-error mp-error">${escapeHtml(landingError || '')}</div>
                </div>
            </div>
        `;
        root.querySelectorAll('[data-action="menu"]').forEach(el => el.addEventListener('click', onBack));
        attachTooltips(root);
        const cleanupTheme = renderTopRail(root, { onShowAccount, onShowFriends });
        const cleanupRail = renderCornerRail(root, { onShowStats, onShowPlaceholder, onShowAccount, onShowLeaderboard, onShowFriends, onShowStore });

        const nameInput = root.querySelector('#mp-name');
        const errorEl = root.querySelector('.mp-error');

        const deviceFilterBtn = root.querySelector('[data-action="toggle-device-filter"]');
        deviceFilterBtn.addEventListener('click', () => {
            deviceFilter = deviceFilter === 'everyone' ? 'desktop_only' : 'everyone';
            deviceFilterBtn.textContent = `Match: ${deviceFilter === 'everyone' ? 'Everyone' : 'Desktop only'}`;
        });

        const quickBtn = root.querySelector('[data-action="quick"]');
        quickBtn.addEventListener('click', async () => {
            const name = nameInput.value.trim() || 'Player';
            quickBtn.disabled = true;
            quickBtn.textContent = 'Finding a race...';
            try {
                const roomCode = await quickMatch(deviceFilter);
                joinRoom(roomCode, name, true);
            } catch {
                quickBtn.disabled = false;
                quickBtn.textContent = 'Find a Race';
                errorEl.textContent = 'Could not reach matchmaking - try again.';
            }
        });

        root.querySelector('[data-action="create"]').addEventListener('click', async () => {
            const name = nameInput.value.trim() || 'Player';
            try {
                const roomCode = await createRoom(deviceFilter);
                joinRoom(roomCode, name);
            } catch {
                errorEl.textContent = 'Could not create a room - try again.';
            }
        });
        root.querySelector('[data-action="join"]').addEventListener('click', () => {
            const name = nameInput.value.trim() || 'Player';
            const code = root.querySelector('#mp-room-code').value.trim().toUpperCase();
            if (!code) { errorEl.textContent = 'Enter a room code.'; return; }
            joinRoom(code, name);
        });

        cleanupInner = () => { cleanupTheme(); cleanupRail(); };
    }

    // `auto` marks a quick-match join: the player asked to be put in a race,
    // not to sit in a lobby, so they are readied up as soon as the server
    // acknowledges the join and the race starts on its own once someone else
    // is in. A join by room code stays manual - there the lobby is the point,
    // since you are waiting for specific people to arrive.
    function joinRoom(roomCode, name, auto = false) {
        teardownInner();
        players = [];
        myId = null;
        connection = connectToRoom(roomCode, name);
        renderLobby(roomCode, auto);
    }

    // Set by startRace so the lobby's countdown handler can hand off to the
    // race view once the passage is on screen.
    let showCountdown = null;
    let releaseRace = null;

    function renderLobby(roomCode, auto = false) {
        root.innerHTML = `
            <div class="stats-screen">
                <button class="screen-close" data-action="menu" aria-label="Close" data-tooltip="Close (Esc)">${CLOSE_ICON}</button>
                ${logoLockup()}
                <h2>${auto ? 'Finding a race' : `Room ${escapeHtml(roomCode)}`}</h2>
                <div class="settings-hint">${auto
                    ? 'Racing whoever else is looking right now.'
                    : `Share the code <strong>${escapeHtml(roomCode)}</strong> with whoever you're racing.`}</div>
                <div class="mp-countdown" hidden></div>
                <div class="leaderboard-list mp-player-list"></div>
                <button class="menu-button" data-action="ready">Ready</button>
                <button class="menu-button small quiet" data-action="leave">Leave Room</button>
            </div>
        `;
        root.querySelector('[data-action="menu"]').addEventListener('click', () => { leaveRoom(); onBack(); });
        attachTooltips(root);
        const cleanupTheme = renderTopRail(root, { onShowAccount, onShowFriends });
        const cleanupRail = renderCornerRail(root, { onShowStats, onShowPlaceholder, onShowAccount, onShowLeaderboard, onShowFriends, onShowStore });

        const readyBtn = root.querySelector('[data-action="ready"]');
        const listEl = root.querySelector('.mp-player-list');
        function paintPlayers() {
            const colors = racerColors(players, myId);
            const sprites = racerSprites(players);
            listEl.innerHTML = players.map(p => `
                <div class="leaderboard-row" data-racer-color="${colors[p.id]}">
                    <div class="leaderboard-name"><span class="mp-racer-sprite">${RACER_SPRITES[sprites[p.id]]}</span>${escapeHtml(p.name)}${p.id === myId ? ' (you)' : ''}</div>
                    <div class="leaderboard-acc">${p.ready ? 'Ready' : 'Not ready'}</div>
                </div>
            `).join('');
            applyInlineStyles(listEl);
        }
        paintPlayers();

        const offJoined = connection.on('joined', id => {
            myId = id;
            paintPlayers();
            // Ready is sent once, here, rather than on every playerList --
            // the server starts a countdown as soon as everyone present is
            // ready, and re-sending would restart it.
            if (auto) {
                connection.ready();
                readyBtn.textContent = 'Waiting for players...';
                readyBtn.disabled = true;
                readyBtn.classList.add('quiet');
            }
        });
        const offPlayerList = connection.on('playerList', list => { players = list; paintPlayers(); });
        const countdownEl = root.querySelector('.mp-countdown');
        const offCountdown = connection.on('countdown', s => {
            // Once the race view exists the count belongs over the passage, so
            // players read the opening words while it runs. Before that (a
            // slow RaceText) it still shows in the lobby rather than nowhere.
            if (showCountdown) { showCountdown(s); return; }
            countdownEl.hidden = false;
            countdownEl.textContent = s;
            readyBtn.hidden = true;
        });
        // The passage arrives before the countdown so it can be read while the
        // numbers run. The race view is built here, with typing locked; Start
        // only unlocks it.
        const offRaceText = connection.on('raceText', (text, attribution, category) => startRace(text, attribution, category));
        const offStart = connection.on('start', () => releaseRace?.());
        // The server closes the connection right after an Error (e.g. a
        // desktop-only room rejecting a mobile joiner) - 'close' always
        // follows, so it's what actually routes back to the landing screen;
        // this just remembers the message so that screen can show it
        // instead of silently dropping the player back with no explanation.
        let lastError = null;
        const offError = connection.on('error', msg => { lastError = msg; });
        const offClose = connection.on('close', () => renderLanding(lastError));

        readyBtn.addEventListener('click', () => {
            connection.ready();
            readyBtn.textContent = 'Waiting for players...';
            readyBtn.disabled = true;
            readyBtn.classList.add('quiet');
        });
        root.querySelector('[data-action="leave"]').addEventListener('click', () => { leaveRoom(); renderLanding(); });

        cleanupInner = () => {
            offJoined(); offPlayerList(); offCountdown(); offRaceText(); offStart(); offError(); offClose();
            cleanupTheme(); cleanupRail();
        };
    }

    async function startRace(text, attribution, category) {
        teardownInner();
        try {
            game = await createGame();
            game.set_text(text);
        } catch (err) {
            console.error('Failed to start multiplayer race:', err);
            renderLanding();
            return;
        }

        const opponents = document.createElement('div');
        opponents.className = 'mp-racers';
        const progressById = {};
        // Everyone in the room, yourself included. Showing only opponents left
        // you guessing where you actually stood: your own bar is the one you
        // are measuring the others against. The server echoes your Progress
        // back to you along with everyone else's, so your row is fed the same
        // way theirs are.
        function paintOpponents() {
            const colors = racerColors(players, myId);
            const sprites = racerSprites(players);
            opponents.innerHTML = players.map(p => {
                const me = p.id === myId;
                const prog = progressById[p.id] || {};
                const percent = Math.round(prog.percent || 0);
                // The sprite rides the track rather than sitting beside it.
                // A static icon next to a thin bar made the one thing a
                // player owns and can see the least visible part of the race.
                return `
                <div class="mp-racer-row${me ? ' me' : ''}" data-racer-color="${colors[p.id]}">
                    <span class="mp-racer-name">${escapeHtml(p.name)}${me ? ' (you)' : ''}</span>
                    <div class="mp-racer-track">
                        <div class="mp-racer-trail" data-percent="${percent}"></div>
                        <span class="mp-racer-sprite" data-progress="${percent}">${RACER_SPRITES[sprites[p.id]]}</span>
                    </div>
                    <span class="mp-racer-percent">${percent}%</span>
                    <span class="mp-racer-wpm">${Math.round(prog.wpm || 0)}</span>
                </div>`;
            }).join('');
            applyInlineStyles(opponents);
        }
        paintOpponents();

        const offProgress = connection.on('playerProgress', (id, percent, wpm) => {
            progressById[id] = { percent, wpm };
            paintOpponents();
            emitStandings();
        });
        // The whole field, so the end screen can show where everyone placed.
        // Finishing first means the others are still typing, so this keeps
        // filling in after your own race is over rather than freezing on
        // whoever happened to be done at that instant.
        const results = new Map();
        const standingsListeners = new Set();
        function buildStandings() {
            const colors = racerColors(players, myId);
            return players.map(p => {
                const done = results.get(p.id);
                return {
                    id: p.id,
                    name: p.name,
                    me: p.id === myId,
                    color: colors[p.id],
                    place: done ? done.place : null,
                    wpm: done ? done.wpm : (progressById[p.id]?.wpm || 0),
                    accuracy: done ? done.accuracy : null,
                    time: done ? done.time : null,
                    percent: done ? 100 : (progressById[p.id]?.percent || 0),
                };
            }).sort((a, b) => {
                // Finishers first in placing order, then whoever is furthest along.
                if (a.place && b.place) return a.place - b.place;
                if (a.place) return -1;
                if (b.place) return 1;
                return b.percent - a.percent;
            });
        }
        function emitStandings() {
            const snapshot = buildStandings();
            for (const fn of standingsListeners) fn(snapshot);
        }
        const offFinished = connection.on('playerFinished', (id, wpm, accuracy, time, place) => {
            results.set(id, { wpm, accuracy, time, place });
            paintOpponents();
            emitStandings();
        });

        const cleanupTyping = renderTypingGame(root, {
            game, text, attribution, category, modeKey: undefined,
            multiplayer: { connection },
            onFinish: result => {
                freeGame(game);
                game = null;
                // The end screen takes ownership of these subscriptions, so
                // this screen's own teardown must stop dropping them: app.js
                // tears the race screen down before rendering the end screen,
                // which was unsubscribing the very feed the standings need --
                // including your own PlayerFinished, which arrives from the
                // server a moment after this callback runs.
                handedOff = true;
                // The connection stays open: the rest of the field is still
                // typing, and the end screen keeps showing them come in.
                onFinish({
                    ...result,
                    standings: buildStandings(),
                    onStandingsUpdate: fn => {
                        standingsListeners.add(fn);
                        return () => standingsListeners.delete(fn);
                    },
                    onLeaveRace: () => { offProgress(); offFinished(); leaveRoom(); },
                });
            },
            onMainMenu: () => { leaveRoom(); onBack(); },
            onRestart: null,
            onShowStats, onShowPlaceholder, onShowAccount, onShowLeaderboard, onShowFriends,
        });
        root.appendChild(opponents);

        // The passage is on screen but locked until Start. The count sits over
        // it, so the seconds are spent reading the opening words rather than
        // staring at an empty lobby.
        const input = root.querySelector('.typing-input');
        if (input) input.disabled = true;
        const gate = document.createElement('div');
        gate.className = 'mp-race-gate';
        gate.innerHTML = '<div class="mp-race-gate-count"></div><div class="mp-race-gate-label">Get ready</div>';
        root.appendChild(gate);
        const gateCount = gate.querySelector('.mp-race-gate-count');
        // Its own subscription: building this view tears the lobby down, and
        // the lobby owned the only countdown handler - so the count stopped
        // arriving exactly when it was needed on screen.
        const offGateCountdown = connection.on('countdown', seconds => { gateCount.textContent = seconds; });
        // Start has the same problem the countdown did: the lobby's handler is
        // gone by the time this view exists, so the gate would never lift.
        const offGateStart = connection.on('start', () => releaseRace?.());
        showCountdown = seconds => { gateCount.textContent = seconds; };
        releaseRace = () => {
            offGateCountdown();
            offGateStart();
            gate.remove();
            if (input) { input.disabled = false; input.focus(); }
            showCountdown = null;
            releaseRace = null;
        };

        cleanupInner = () => {
            if (!handedOff) { offProgress(); offFinished(); }
            showCountdown = null;
            releaseRace = null;
            offGateCountdown();
            offGateStart();
            gate.remove();
            cleanupTyping();
            opponents.remove();
        };
    }

    renderLanding();
    return () => {
        teardownInner();
        if (!handedOff) leaveRoom();
        freeGame(game);
    };
}
