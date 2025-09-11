import { LANGUAGE_ICON, FRIENDS_ICON } from './screens/icons.js';
import { LANGUAGES, languageLabel } from './languages.js';
import { getSettings, updateSettings } from './settings.js';
import { renderThemeButton } from './themeButton.js';
import { getUser, onAuthChange } from './auth.js';
import { onCountsChange, getCounts } from './counts.js';
import { attachTooltips } from './tooltip.js';
import { escapeHtml } from './util.js';

// The top-right cluster: the typing language, the theme, and who you are --
// Friends sits directly beside the account control because the two are the
// same thing, your identity and who it connects you to. These are the app's own chrome --
// they belong together and away from the bottom rail's per-screen
// navigation. Screens with their own top-right controls (the typing screen's
// Restart and Zen Finish) pass them in as `extras` so everything shares one
// row instead of each fixed-positioning itself into a collision.
export function renderTopRail(root, { onShowAccount, onShowFriends, extras = [] } = {}) {
    const wrap = document.createElement('div');
    wrap.className = 'top-rail';
    root.appendChild(wrap);

    for (const el of extras) wrap.appendChild(el);

    const langGroup = document.createElement('div');
    langGroup.className = 'lang-group';
    langGroup.innerHTML = `
        <button class="corner-icon-button" data-action="lang" aria-label="Typing language" data-tooltip="Typing language">${LANGUAGE_ICON}</button>
        <div class="lang-popover" hidden>
            <div class="lang-heading">Typing language</div>
            ${LANGUAGES.map(l => `
                <button class="lang-item" data-lang="${escapeHtml(l.id)}">${escapeHtml(l.label)}</button>
            `).join('')}
            <div class="lang-note">Applies to Words, Timed, Zen and Practice.</div>
        </div>
    `;
    wrap.appendChild(langGroup);

    const cleanupTheme = renderThemeButton(wrap);

    const friends = document.createElement('div');
    friends.className = 'friends-control';
    if (onShowFriends) {
        friends.innerHTML = `<button class="corner-icon-button has-badge" data-action="rail-friends" aria-label="Friends" data-tooltip="Friends">${FRIENDS_ICON}<span class="rail-badge" data-badge="friends" hidden></span></button>`;
    }
    wrap.appendChild(friends);

    const auth = document.createElement('div');
    auth.className = 'auth-control';
    wrap.appendChild(auth);

    attachTooltips(wrap);

    // Language ------------------------------------------------------------
    const langPopover = langGroup.querySelector('.lang-popover');
    function paintLang() {
        const current = getSettings().language || 'en';
        langGroup.querySelectorAll('.lang-item').forEach(item => {
            item.classList.toggle('active', item.dataset.lang === current);
        });
        langGroup.querySelector('[data-action="lang"]').dataset.tooltip = `Typing language: ${languageLabel(current)}`;
    }
    paintLang();
    langGroup.querySelector('[data-action="lang"]').addEventListener('click', e => {
        e.stopPropagation();
        langPopover.hidden = !langPopover.hidden;
    });
    langGroup.querySelectorAll('.lang-item').forEach(item => {
        item.addEventListener('click', () => {
            updateSettings({ language: item.dataset.lang });
            paintLang();
            langPopover.hidden = true;
        });
    });

    // Identity ------------------------------------------------------------
    function paintAuth() {
        const user = getUser();
        auth.innerHTML = user
            ? `<button class="top-rail-link signed-in" data-action="account" data-tooltip="Your account">${escapeHtml(user.username)}</button>`
            : `<button class="top-rail-link" data-action="signin" data-tooltip="Sign in to save stats and join the leaderboard">Sign In</button>
               <button class="top-rail-link accent" data-action="signup" data-tooltip="Create an account">Sign Up</button>`;
        attachTooltips(auth);
        auth.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('click', () => onShowAccount?.());
        });
    }
    paintAuth();
    const unsubscribeAuth = onAuthChange(paintAuth);

    // Friends ------------------------------------------------------------
    const friendsBtn = friends.querySelector('[data-action="rail-friends"]');
    if (friendsBtn) friendsBtn.addEventListener('click', onShowFriends);
    const friendsBadge = friends.querySelector('[data-badge="friends"]');
    function paintCounts({ friends: friendCount }) {
        if (!friendsBadge) return;
        friendsBadge.hidden = !friendCount;
        friendsBadge.textContent = String(friendCount);
    }
    paintCounts(getCounts());
    const unsubscribeCounts = onCountsChange(paintCounts);

    const handleOutsideClick = e => {
        if (!langPopover.hidden && !langGroup.contains(e.target)) langPopover.hidden = true;
    };
    document.addEventListener('click', handleOutsideClick);

    return () => {
        unsubscribeCounts();
        document.removeEventListener('click', handleOutsideClick);
        unsubscribeAuth();
        cleanupTheme();
        wrap.remove();
    };
}
