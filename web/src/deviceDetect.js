// Coarse touch/mobile detection for the "match/rank against desktop only"
// preference - not trying to be a precise device fingerprint, just enough
// to separate "typed on a physical keyboard" from "typed on a touchscreen"
// for fairness purposes (see anticheat.rs's comment on why this is opt-in
// tagging, not a default exclusion).
export function detectDeviceType() {
    const coarsePointer = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
    const touchPoints = navigator.maxTouchPoints > 0;
    return coarsePointer && touchPoints ? 'mobile' : 'desktop';
}
