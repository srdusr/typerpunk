import { getSettings } from './settings.js';

// Synthesized rather than sampled - a couple of short tones via the Web
// Audio API instead of shipping/loading actual click-sample audio files,
// so the feature has zero asset dependencies.
const THEMES = {
    click: { freq: 1800, duration: 0.03, type: 'square' },
    mech: { freq: 180, duration: 0.05, type: 'triangle' },
};

let audioCtx = null;
function getContext() {
    if (!audioCtx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioContextClass();
    }
    return audioCtx;
}

// Browsers refuse to start an AudioContext before a user gesture - the
// first keystroke that reaches here always follows one (focusing/typing
// into the input), so resuming inline rather than requiring a separate
// "enable sound" click.
export function playKeySound() {
    const { soundTheme } = getSettings();
    const theme = THEMES[soundTheme];
    if (!theme) return;

    const ctx = getContext();
    if (ctx.state === 'suspended') ctx.resume();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = theme.type;
    osc.frequency.value = theme.freq;
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + theme.duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + theme.duration);
}
