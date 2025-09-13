import { escapeHtml } from '../util.js';
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

// No account required - a quick race with friends shouldn't need signing
// in, so this only prefills the name field when one exists rather than
// gating the whole feature behind it (unlike Friends/Leaderboard, which
// inherently need an identity to mean anything).
export function renderMultiplayerScreen(root, { onBack, onFinish, onShowStats, onShowPlaceholder, onShowAccount, onShowLeaderboard, onShowFriends, onShowStore }) {
    let connection = null;
    let cleanupInner = null;
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
                <div class="logo" data-action="menu">TyperPunk</div>
                <h2>Multiplayer</h2>
                <div class="account-panel">
                    <input class="account-input" type="text" id="mp-name" placeholder="Your name" value="${escapeHtml(getUser()?.username || '')}">
                    <button class="menu-button small ghost" data-action="toggle-device-filter" data-tooltip="Who you get matched with, and the setting any room you open uses. Joining by code always uses that room's setting.">Match: Everyone</button>
                    <button class="menu-button" data-action="quick" data-tooltip="Drops you straight into a race with whoever else is looking. No code to share.">Find a Race</button>
                    <div class="settings-hint">or race specific people</div>
                    <div class="mp-code-row">
                        <input class="account-input" type="text" id="mp-room-code" placeholder="Room code">
                        <button class="menu-button small ghost" data-action="join">Join</button>
                    </div>
                    <button class="menu-button small ghost" data-action="create" data-tooltip="Opens an empty room and gives you a code to share.">Create a Room</button>
                    <div class="custom-error mp-error">${escapeHtml(landingError || '')}</div>
                </div>
                <button class="menu-button small ghost" data-action="menu">Back</button>
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

    function renderLobby(roomCode, auto = false) {
        root.innerHTML = `
            <div class="stats-screen">
                <div class="logo" data-action="menu">TyperPunk</div>
                <h2>Room ${escapeHtml(roomCode)}</h2>
                <div class="settings-hint">Share this code with whoever you're racing.</div>
                <div class="leaderboard-list mp-player-list"></div>
                <button class="menu-button" data-action="ready">Ready</button>
                <div class="mp-countdown"></div>
                <button class="menu-button ghost" data-action="leave">Leave Room</button>
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
            listEl.innerHTML = players.map(p => `
                <div class="leaderboard-row" style="--racer-color: ${colors[p.id]}">
                    <div class="leaderboard-name"><span class="mp-racer-dot"></span>${escapeHtml(p.name)}${p.id === myId ? ' (you)' : ''}</div>
                    <div class="leaderboard-acc">${p.ready ? 'Ready' : 'Not ready'}</div>
                </div>
            `).join('');
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
            }
        });
        const offPlayerList = connection.on('playerList', list => { players = list; paintPlayers(); });
        const offCountdown = connection.on('countdown', s => {
            root.querySelector('.mp-countdown').textContent = s;
        });
        const offStart = connection.on('start', text => startRace(text));
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
        });
        root.querySelector('[data-action="leave"]').addEventListener('click', () => { leaveRoom(); renderLanding(); });

        cleanupInner = () => {
            offJoined(); offPlayerList(); offCountdown(); offStart(); offError(); offClose();
            cleanupTheme(); cleanupRail();
        };
    }

    async function startRace(text) {
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
            opponents.innerHTML = players.map(p => {
                const me = p.id === myId;
                const prog = progressById[p.id] || {};
                return `
                <div class="mp-racer-row${me ? ' me' : ''}" style="--racer-color: ${colors[p.id]}">
                    <span class="mp-racer-name">${escapeHtml(p.name)}${me ? ' (you)' : ''}</span>
                    <div class="mp-racer-bar"><div class="mp-racer-bar-fill" style="width:${prog.percent || 0}%"></div></div>
                    <span class="mp-racer-wpm">${Math.round(prog.wpm || 0)}</span>
                </div>`;
            }).join('');
        }
        paintOpponents();

        const offProgress = connection.on('playerProgress', (id, percent, wpm) => {
            progressById[id] = { percent, wpm };
            paintOpponents();
        });
        // Reserved for a future shared-standings view - for now the local
        // player just falls through to the normal end screen on their own
        // finish, same as any other mode.
        const offFinished = connection.on('playerFinished', () => {});

        const cleanupTyping = renderTypingGame(root, {
            game, text, modeKey: undefined,
            multiplayer: { connection },
            onFinish: result => {
                offProgress(); offFinished();
                freeGame(game);
                game = null;
                leaveRoom();
                onFinish(result);
            },
            onMainMenu: () => { leaveRoom(); onBack(); },
            onRestart: null,
            onShowStats, onShowPlaceholder, onShowAccount, onShowLeaderboard, onShowFriends,
        });
        root.appendChild(opponents);

        cleanupInner = () => {
            offProgress(); offFinished();
            cleanupTyping();
            opponents.remove();
        };
    }

    renderLanding();
    return () => {
        teardownInner();
        leaveRoom();
        freeGame(game);
    };
}
