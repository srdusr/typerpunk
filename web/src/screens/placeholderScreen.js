import { escapeHtml } from '../util.js';
import { renderCornerRail } from '../cornerRail.js';
import { attachTooltips } from '../tooltip.js';
import { renderTopRail } from '../topRail.js';

// Shared shell for any feature that has a nav entry point but no real screen
// yet (Multiplayer, Friends - Account and Leaderboard have since become
// real screens and moved out of here) - one implementation to swap out per
// feature as each gets built, instead of a copy of the same "coming soon"
// markup per feature.
export function renderPlaceholderScreen(root, { title, description, onBack, onShowStats, onShowPlaceholder, onShowAccount, onShowLeaderboard, onShowFriends, onShowMultiplayer, onShowStore }) {
    root.innerHTML = `
        <div class="stats-screen">
            <div class="logo" data-action="menu">TyperPunk</div>
            <h2>${escapeHtml(title)}</h2>
            <div class="stats-placeholder">${escapeHtml(description)}</div>
            <button class="menu-button small ghost" data-action="menu">Back</button>
        </div>
    `;

    root.querySelectorAll('[data-action="menu"]').forEach(el => el.addEventListener('click', onBack));
    attachTooltips(root);
    const cleanupTheme = renderTopRail(root, { onShowAccount, onShowFriends });

    const cleanupRail = renderCornerRail(root, { onShowStats, onShowPlaceholder, onShowAccount, onShowLeaderboard, onShowFriends, onShowMultiplayer, onShowStore });

    return () => {
        cleanupTheme();
        cleanupRail();
    };
}
