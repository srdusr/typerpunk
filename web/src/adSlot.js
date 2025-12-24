import { getUser, onAuthChange } from './auth.js';

// Reserved space for advertising.
//
// This renders an empty, correctly sized box. It loads nothing, calls
// nothing, and tracks nobody. Its only job is to hold the space so that
// wiring a real network later does not move the rest of the page around
// after it loads, which is the usual way ads ruin a layout.
//
// Before any network goes in, three things have to change together:
//
//   1. The Content-Security-Policy in web/serve.mjs forbids third-party
//      script, frame and image sources. An ad network needs all three, and
//      relaxing them is the single largest change to this app's security
//      posture. script-src in particular currently has no third-party source
//      at all.
//   2. The privacy page in app.js says there is no advertising and no
//      third-party script. That becomes untrue the moment a tag is added.
//   3. An ad network sets cookies and profiles visitors, which brings
//      consent requirements with it. There is no consent mechanism here.
//
// Shown to signed-out visitors and to signed-in accounts without the
// supporter flag. Never shown on the typing screen: interrupting somebody
// mid-test is the one placement that would cost more than it earns.

const SIZES = {
    // Roughly a leaderboard unit, and a mobile banner below the breakpoint.
    banner: { w: 728, h: 90, mobileW: 320, mobileH: 100 },
};

export function shouldShowAds() {
    const user = getUser();
    // A signed-out visitor is a free user for this purpose.
    return !user || !user.is_supporter;
}

/// Renders the slot into `root`. Returns a cleanup function.
export function renderAdSlot(root, { size = 'banner', label = 'Advertisement' } = {}) {
    const spec = SIZES[size] || SIZES.banner;
    const wrap = document.createElement('div');
    wrap.className = `ad-slot ad-slot-${size}`;
    wrap.style.setProperty('--ad-w', `${spec.w}px`);
    wrap.style.setProperty('--ad-h', `${spec.h}px`);
    wrap.style.setProperty('--ad-mobile-w', `${spec.mobileW}px`);
    wrap.style.setProperty('--ad-mobile-h', `${spec.mobileH}px`);
    // Labelled for what it is. An unlabelled empty box reads as a bug.
    wrap.innerHTML = `<span class="ad-slot-label">${label}</span>`;

    function paint() {
        wrap.hidden = !shouldShowAds();
    }
    paint();
    const unsubscribe = onAuthChange(paint);

    root.appendChild(wrap);
    return () => {
        unsubscribe();
        wrap.remove();
    };
}
