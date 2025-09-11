import { api } from './api.js';
import { detectDeviceType } from './deviceDetect.js';

// Same base-URL resolution as api.js (window.TYPERPUNK_API_URL override for
// local dev, same-origin otherwise), just converted to a ws:// URL instead
// of being handed to fetch.
function wsBaseUrl() {
    const httpBase = (typeof window !== 'undefined' && window.TYPERPUNK_API_URL) || window.location.origin;
    return httpBase.replace(/^http/, 'ws');
}

export async function createRoom(deviceFilter) {
    const { room_code } = await api.post('/api/multiplayer/rooms', deviceFilter ? { device_filter: deviceFilter } : {});
    return room_code;
}

// Live count of people sitting in multiplayer rooms, for the header's
// ambient "is anyone around to race" indicator. Unauthenticated, like the
// endpoint behind it.
export async function getOnlineCount() {
    return api.get('/api/multiplayer/online');
}

// Auto-matchmaking. The server hands back whichever room is still filling,
// or opens a new one when none is - so the player never sees a room code.
// createRoom stays for the deliberate "race my friends on this code" path.
export async function quickMatch(deviceFilter) {
    const { room_code } = await api.post('/api/multiplayer/quickmatch', deviceFilter ? { device_filter: deviceFilter } : {});
    return room_code;
}

// Pub-sub rather than fixed callbacks passed to connectToRoom - the lobby
// screen and the typing screen both need to react to the same connection's
// messages (player list / countdown during the lobby phase, progress /
// finished during the race), and they're two different pieces of code that
// each attach their own listeners as the room moves between phases, rather
// than one caller owning every handler up front.
export function connectToRoom(roomCode, playerName) {
    const ws = new WebSocket(`${wsBaseUrl()}/ws/multiplayer/${encodeURIComponent(roomCode)}`);
    const listeners = new Map();
    const connection = { playerId: null };

    function emit(event, ...args) {
        for (const fn of listeners.get(event) || []) fn(...args);
    }

    ws.addEventListener('open', () => {
        ws.send(JSON.stringify({ type: 'Join', name: playerName, device_type: detectDeviceType() }));
    });

    ws.addEventListener('message', event => {
        let msg;
        try { msg = JSON.parse(event.data); } catch { return; }
        switch (msg.type) {
            case 'Joined': connection.playerId = msg.player_id; emit('joined', msg.player_id); break;
            case 'PlayerList': emit('playerList', msg.players); break;
            case 'Countdown': emit('countdown', msg.seconds); break;
            case 'Start': emit('start', msg.text); break;
            case 'PlayerProgress': emit('playerProgress', msg.player_id, msg.percent, msg.wpm); break;
            case 'PlayerFinished': emit('playerFinished', msg.player_id, msg.wpm, msg.accuracy, msg.time, msg.place); break;
            case 'RoomClosed': emit('roomClosed', msg.reason); break;
            case 'Error': emit('error', msg.message); break;
        }
    });

    ws.addEventListener('close', () => emit('close'));
    ws.addEventListener('error', () => emit('error', 'connection error'));

    Object.assign(connection, {
        on(event, fn) {
            if (!listeners.has(event)) listeners.set(event, new Set());
            listeners.get(event).add(fn);
            return () => listeners.get(event)?.delete(fn);
        },
        ready: () => ws.send(JSON.stringify({ type: 'Ready' })),
        sendProgress: (percent, wpm) => ws.send(JSON.stringify({ type: 'Progress', percent, wpm })),
        sendFinish: (wpm, accuracy, time) => ws.send(JSON.stringify({ type: 'Finish', wpm, accuracy, time })),
        close: () => ws.close(),
    });
    return connection;
}
