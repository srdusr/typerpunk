import { LANGUAGE_ICON, FRIENDS_ICON, ACCOUNT_ICON, SOUND_ON_ICON, SOUND_OFF_ICON } from './screens/icons.js';
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
/// The letter shown on an account's avatar. Falls back to a dot rather than
/// an empty circle for a name that starts with something unprintable.
function initialOf(username) {
    const ch = (username || '').trim()[0];
    return ch ? ch.toUpperCase() : '\u00b7';
}

/// A stable colour per account, from a hash of the whole name rather than the
/// first letter, so two people whose names start alike still look different.
function avatarColour(username) {
    let hash = 0;
    for (const ch of username || '') hash = (hash * 31 + ch.codePointAt(0)) >>> 0;
    return `hsl(${hash % 360} 65% 45%)`;
}

export function renderTopRail(root, { onShowAccount, onShowFriends, extras = [] } = {}) {
    const wrap = document.createElement('div');
    wrap.className = 'top-rail';
    root.appendChild(wrap);

    // Row one holds every icon. Row two holds the sign-in links, which used
    // to sit inline and made the row far wider than the icons needed.
    const icons = document.createElement('div');
    icons.className = 'top-rail-icons';
    wrap.appendChild(icons);

    for (const el of extras) icons.appendChild(el);

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
    icons.appendChild(langGroup);

    const cleanupTheme = renderThemeButton(icons);

    // Keystroke sound. It was a line inside the settings dialog and off by
    // default, so the usual way to discover it was to be told it existed.
    const sound = document.createElement('div');
    sound.className = 'sound-control';
    icons.appendChild(sound);

    const friends = document.createElement('div');
    friends.className = 'friends-control';
    if (onShowFriends) {
        // The count sits under the icon rather than beside it, so it does not
        // widen the row and reads as a property of the button above it.
        friends.innerHTML = `<button class="corner-icon-button" data-action="rail-friends" aria-label="Friends" data-tooltip="Friends">${FRIENDS_ICON}</button>
                             <span class="online-count" data-badge="friends-online" hidden></span>`;
    }
    icons.appendChild(friends);

    // The account control, immediately right of Friends: your identity and
    // who it connects you to, in that order.
    const accountIcon = document.createElement('div');
    accountIcon.className = 'account-icon-control';
    icons.appendChild(accountIcon);

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

        // Signed out it is a plain person icon; signed in it is the account's
        // own picture. There is no avatar upload, so the picture is built
        // from the name: the initial over a colour derived from the whole
        // username, which gives every account a stable, distinct mark.
        accountIcon.innerHTML = user
            ? `<button class="corner-icon-button rail-avatar" data-action="account" aria-label="Your account" data-tooltip="Signed in as ${escapeHtml(user.username)}">
                   <span class="rail-avatar-initial">${escapeHtml(initialOf(user.username))}</span>
               </button>`
            : `<button class="corner-icon-button" data-action="account" aria-label="Account" data-tooltip="Sign in to save stats and join the leaderboard">${ACCOUNT_ICON}</button>`;
        const avatarBtn = accountIcon.querySelector('.rail-avatar');
        if (avatarBtn) avatarBtn.style.setProperty('--avatar-colour', avatarColour(user.username));

        // Signed in, the name is already on the avatar's tooltip, so the row
        // below is only needed while signed out.
        auth.hidden = !!user;
        auth.innerHTML = user
            ? ''
            : `<button class="top-rail-link" data-action="signin" data-tooltip="Sign in to save stats and join the leaderboard">Sign In</button>
               <span class="top-rail-sep">|</span>
               <button class="top-rail-link accent" data-action="signup" data-tooltip="Create an account">Sign Up</button>`;
        attachTooltips(auth);
        attachTooltips(accountIcon);
        [...auth.querySelectorAll('button'), ...accountIcon.querySelectorAll('button')]
            .forEach(btn => btn.addEventListener('click', () => onShowAccount?.()));
    }
    // The rail is one row when signed in and two when signed out, so its
    // height is not a constant the stylesheet can hold. Everything that has to
    // start below it - the content column, and the close button at that
    // column's top-right - reads this. Without it the close button sat under
    // the rail again the moment the rail grew a second row.
    function publishHeight() {
        const h = Math.round(wrap.getBoundingClientRect().height);
        if (h > 0) document.documentElement.style.setProperty('--top-rail-h', `${h}px`);
    }

    function paintAuthAndMeasure() {
        paintAuth();
        // After layout, not during: the row has to exist before it can be
        // measured.
        requestAnimationFrame(publishHeight);
    }

    paintAuthAndMeasure();
    const unsubscribeAuth = onAuthChange(paintAuthAndMeasure);
    window.addEventListener('resize', publishHeight);

    // Sound ---------------------------------------------------------------
    // On by default, set to the mechanical tone. The speaker here is how it
    // gets turned off, which is why it is in the rail rather than buried in
    // the settings dialog where it used to live.
    const SOUND_THEMES = ['off', 'click', 'mech'];
    const SOUND_LABELS = { off: 'Off', click: 'Click', mech: 'Mechanical' };

    function paintSound() {
        const current = getSettings().soundTheme || 'off';
        const on = current !== 'off';
        sound.innerHTML = `<button class="corner-icon-button${on ? ' active' : ''}" data-action="rail-sound"
                aria-label="Keystroke sound: ${SOUND_LABELS[current]}"
                data-tooltip="Keystroke sound: ${SOUND_LABELS[current]}. Click to cycle.">${on ? SOUND_ON_ICON : SOUND_OFF_ICON}</button>`;
        attachTooltips(sound);
        sound.querySelector('button').addEventListener('click', () => {
            const now = getSettings().soundTheme || 'off';
            const next = SOUND_THEMES[(SOUND_THEMES.indexOf(now) + 1) % SOUND_THEMES.length];
            updateSettings({ soundTheme: next });
            paintSound();
        });
    }
    paintSound();

    // Friends ------------------------------------------------------------
    const friendsBtn = friends.querySelector('[data-action="rail-friends"]');
    if (friendsBtn) friendsBtn.addEventListener('click', onShowFriends);
    // How many friends are online, not how many you have - a total is a fact
    // about your account, whereas "2 online" is a reason to open the screen.
    const friendsOnlineEl = friends.querySelector('[data-badge="friends-online"]');
    function paintCounts({ friends: friendCount, friendsOnline }) {
        if (friendsBtn) {
            friendsBtn.dataset.tooltip = !friendCount
                ? 'Friends'
                : (friendsOnline ? `Friends - ${friendsOnline} of ${friendCount} online` : `Friends - ${friendCount}, none online`);
        }
        if (!friendsOnlineEl) return;
        friendsOnlineEl.hidden = !friendsOnline;
        friendsOnlineEl.textContent = String(friendsOnline);
    }
    paintCounts(getCounts());
    const unsubscribeCounts = onCountsChange(paintCounts);

    const handleOutsideClick = e => {
        if (!langPopover.hidden && !langGroup.contains(e.target)) langPopover.hidden = true;
    };
    document.addEventListener('click', handleOutsideClick);

    return () => {
        window.removeEventListener('resize', publishHeight);
        unsubscribeCounts();
        document.removeEventListener('click', handleOutsideClick);
        unsubscribeAuth();
        cleanupTheme();
        wrap.remove();
    };
}
