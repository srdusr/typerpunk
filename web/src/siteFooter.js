import { attachTooltips } from './tooltip.js';

// The links every site is expected to carry: where the source lives, who made
// it, and what it does with your data. Kept to one line at the foot of the
// menu rather than a page of its own, because there is very little to say and
// a whole screen would overstate it.
//
// Edit these to point at the real destinations.
export const LINKS = {
    github: 'https://github.com/srdusr/typerpunk',
    privacy: '#privacy',
};

// Share is a Web Share invocation where the browser has one (every mobile
// browser, Safari, and Edge), and a clipboard copy everywhere else. Neither
// needs a network call or a third-party button, so there is no tracking
// script here and nothing to consent to.
async function share(result) {
    const url = window.location.origin;
    const text = result
        ? `I just typed ${Math.round(result.wpm)} wpm at ${Math.round(result.accuracy)}% accuracy on TyperPunk.`
        : 'TyperPunk - competitive typing in the terminal and the browser.';

    if (navigator.share) {
        try {
            await navigator.share({ title: 'TyperPunk', text, url });
            return 'shared';
        } catch {
            // A cancelled share sheet is not a failure; fall through to copy.
        }
    }
    try {
        await navigator.clipboard.writeText(`${text} ${url}`);
        return 'copied';
    } catch {
        return 'failed';
    }
}

/// `result` is optional: with one, Share offers the score just achieved;
/// without, it offers the site.
export function renderSiteFooter(root, { result, onShowPrivacy, onShowContribute } = {}) {
    const wrap = document.createElement('div');
    wrap.className = 'site-footer';
    wrap.innerHTML = `
        <button class="site-footer-link" data-action="share" data-tooltip="${result ? 'Share this result' : 'Share TyperPunk'}">Share</button>
        <span class="site-footer-sep">·</span>
        <a class="site-footer-link" href="${LINKS.github}" target="_blank" rel="noopener noreferrer" data-tooltip="Source on GitHub">GitHub</a>
        <span class="site-footer-sep">·</span>
        <button class="site-footer-link" data-action="contribute" data-tooltip="Submit a passage for other people to type">Contribute</button>
        <span class="site-footer-sep">·</span>
        <button class="site-footer-link" data-action="privacy" data-tooltip="What this site stores">Privacy</button>
        <span class="site-footer-sep">·</span>
        <span class="site-footer-version">v0.1.0</span>
    `;
    root.appendChild(wrap);
    attachTooltips(wrap);

    const shareBtn = wrap.querySelector('[data-action="share"]');
    shareBtn.addEventListener('click', async () => {
        const outcome = await share(result);
        shareBtn.textContent = outcome === 'copied' ? 'Copied' : outcome === 'failed' ? 'Copy failed' : 'Shared';
        setTimeout(() => { shareBtn.textContent = 'Share'; }, 1800);
    });
    wrap.querySelector('[data-action="privacy"]').addEventListener('click', () => onShowPrivacy?.());
    wrap.querySelector('[data-action="contribute"]').addEventListener('click', () => onShowContribute?.());

    return () => wrap.remove();
}
