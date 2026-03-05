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
// supporter flag. Never shown while typing: interrupting somebody mid-test is
// the one placement that would cost more than it earns.
//
// The slot sits across the top of the page, where a site's navigation bar
// usually goes, and the header moves down to make room rather than being
// covered. Screens that must not carry it call setAdBannerScreen with their
// own name.

const SIZES = {
    // A full banner, and the mobile banner below the breakpoint. Both are
    // standard units. The taller 728x90 leaderboard was used first and is the
    // more common desktop size, but at 90px it was deeper than the icon rail
    // beside it, so it set how far down the whole page started. At 60px it is
    // shorter than the rail and costs the layout nothing.
    banner: { w: 468, h: 60, mobileW: 320, mobileH: 50 },
    // A wide skyscraper, the usual unit for a page margin.
    skyscraper: { w: 160, h: 600, mobileW: 160, mobileH: 600 },
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


// The two page margins. They appear only where there is genuinely room for
// them beside the content, which the stylesheet decides, and they are the
// first thing dropped on a narrow window.
export function mountSideAdRails() {
    const rails = ['left', 'right'].map(side => {
        const rail = document.createElement('div');
        rail.className = `ad-rail ad-rail-${side}`;
        document.body.appendChild(rail);
        return { rail, cleanup: renderAdSlot(rail, { size: 'skyscraper' }) };
    });

    let screenName = 'menu';
    function paint() {
        const show = shouldShowAds() && !HIDDEN_ON.has(screenName);
        for (const { rail } of rails) rail.hidden = !show;
    }
    paint();
    const unsubscribe = onAuthChange(paint);

    return {
        setScreen(name) { screenName = name; paint(); },
        cleanup() {
            unsubscribe();
            for (const { rail, cleanup } of rails) { cleanup(); rail.remove(); }
        },
    };
}

// Screens the banner stays off. Typing and passive reading are both somebody
// working through a text, and the race lobby leads straight into typing.
const HIDDEN_ON = new Set(['typing', 'passive', 'multiplayer']);

/// Mounts the top banner once, outside the screen root so that redrawing a
/// screen does not reload it. Returns a function that takes the current
/// screen name.
export function mountTopAdBanner() {
    const bar = document.createElement('div');
    bar.className = 'ad-banner-top';
    document.body.insertBefore(bar, document.body.firstChild);

    const inner = document.createElement('div');
    inner.className = 'ad-banner-inner';
    bar.appendChild(inner);
    const cleanupSlot = renderAdSlot(inner);

    let screenName = 'menu';

    function paint() {
        const show = shouldShowAds() && !HIDDEN_ON.has(screenName);
        bar.hidden = !show;
        // The wordmark and the top rail are fixed to the top of the viewport
        // and the content column is offset from it, so all three have to know
        // the banner's height or the banner would sit on top of them.
        document.documentElement.style.setProperty(
            '--ad-banner-h', show ? 'var(--ad-banner-height)' : '0px');
    }

    paint();
    const unsubscribe = onAuthChange(paint);

    return {
        setScreen(name) { screenName = name; paint(); },
        cleanup() {
            unsubscribe();
            cleanupSlot();
            bar.remove();
            document.documentElement.style.removeProperty('--ad-banner-h');
        },
    };
}
