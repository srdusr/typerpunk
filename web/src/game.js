import init, { TyperPunkGame } from '../wasm/typerpunk_wasm.js';

const ready = init();

export async function createGame() {
    await ready;
    return new TyperPunkGame('');
}

export function freeGame(game) {
    if (!game) return;
    try {
        game.free();
    } catch (err) {
        console.error('Error freeing game:', err);
    }
}
