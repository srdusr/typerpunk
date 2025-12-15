import { escapeHtml } from '../util.js';
import { renderCornerRail } from '../cornerRail.js';
import { attachTooltips } from '../tooltip.js';
import { renderTopRail } from '../topRail.js';
import { api, ApiError } from '../api.js';
import { getUser } from '../auth.js';
import { FLAIR_ICONS, CLOSE_ICON } from './icons.js';

function formatPrice(cents) {
    return `$${(cents / 100).toFixed(2)}`;
}

function categoryLabel(category) {
    return category === 'caret' ? 'Caret Colors' : 'Flair';
}

// Real purchase/equip flow against the catalog, but purchase is a stub --
// it grants ownership immediately with no actual charge, since real payment
// processing needs the project owner's own Stripe (or other processor)
// account. Parked as a question rather than assumed: see nightshift
// questions.
export function renderStoreScreen(root, { onBack, onShowStats, onShowPlaceholder, onShowAccount, onShowLeaderboard, onShowFriends, onShowMultiplayer }) {
    let catalog = [];
    let mine = { owned: [], equipped_caret: null, equipped_flair: null };
    let status = 'loading';
    let message = '';
    let stopped = false;

    function itemMarkup(item) {
        const signedOut = status === 'signed-out';
        const owned = !signedOut && mine.owned.includes(item.id);
        const equipped = !signedOut && (mine.equipped_caret === item.id || mine.equipped_flair === item.id);
        const swatch = item.category === 'caret'
            ? `<span class="store-swatch" data-swatch-colour="${escapeHtml(item.value)}"></span>`
            : `<span class="store-swatch store-flair-swatch">${FLAIR_ICONS[item.value] || ''}</span>`;
        return `
            <div class="leaderboard-row store-item-row">
                ${swatch}
                <div class="leaderboard-name">${escapeHtml(item.name)}</div>
                ${!owned ? `<div class="leaderboard-acc">${formatPrice(item.price_cents)}</div>` : ''}
                ${owned
                    ? `<button class="menu-button small${equipped ? '' : ' ghost'}" data-action="${equipped ? 'unequip' : 'equip'}" data-id="${item.id}" data-category="${item.category}" data-tooltip="${equipped ? 'Unequip - back to the default look' : `Replaces whichever ${categoryLabel(item.category).toLowerCase()} you have equipped now`}">${equipped ? 'Equipped' : 'Equip'}</button>`
                    : `<button class="menu-button small${signedOut ? ' ghost' : ''}" data-action="${signedOut ? 'go-account' : 'buy'}" data-id="${item.id}"${signedOut ? ' data-tooltip="Sign in to buy this"' : ''}>Buy</button>`}
            </div>
        `;
    }

    function bodyMarkup() {
        if (status === 'loading') return `<div class="stats-empty">Loading...</div>`;
        if (status === 'error') return `<div class="stats-empty">${escapeHtml(message)}</div>`;

        const signedOut = status === 'signed-out';
        const banner = signedOut
            ? `<div class="store-signin-note">Sign in to buy and equip these.
                 <button class="menu-button small" data-action="go-account">Sign In</button></div>`
            : '';
        const categories = ['caret', 'flair'];
        return banner + categories.map(cat => {
            const items = catalog.filter(i => i.category === cat);
            if (items.length === 0) return '';
            return `<h3>${categoryLabel(cat)}</h3><div class="leaderboard-list">${items.map(itemMarkup).join('')}</div>`;
        }).join('') + `<div class="custom-error store-error"></div>`;
    }

    function render() {
        root.innerHTML = `
            <div class="stats-screen">
                <button class="screen-close" data-action="menu" aria-label="Close" data-tooltip="Close (Esc)">${CLOSE_ICON}</button>
                <div class="logo" data-action="menu">TyperPunk</div>
                <h2>Store</h2>
                ${bodyMarkup()}
            </div>
        `;
        root.querySelectorAll('[data-action="menu"]').forEach(el => el.addEventListener('click', onBack));
        // The swatch colour comes from the catalogue, so it cannot be a class.
        // Set through element.style because a style attribute is blocked by the
        // Content-Security-Policy.
        root.querySelectorAll('[data-swatch-colour]').forEach(el => {
            el.style.background = el.dataset.swatchColour;
        });
        attachTooltips(root);
        const cleanupTheme = renderTopRail(root, { onShowAccount, onShowFriends });

        const goAccount = root.querySelector('[data-action="go-account"]');
        if (goAccount) goAccount.addEventListener('click', onShowAccount);

        const errorEl = root.querySelector('.store-error');
        root.querySelectorAll('[data-action="buy"]').forEach(btn => {
            btn.addEventListener('click', async () => {
                try {
                    await api.post(`/api/cosmetics/${btn.dataset.id}/purchase`);
                    await loadMine();
                    rerender();
                } catch (err) {
                    if (errorEl) errorEl.textContent = err instanceof ApiError ? err.message : 'Could not complete the purchase - try again.';
                }
            });
        });
        root.querySelectorAll('[data-action="equip"]').forEach(btn => {
            btn.addEventListener('click', async () => {
                await api.post(`/api/cosmetics/${btn.dataset.id}/equip`).catch(() => {});
                await loadMine();
                rerender();
            });
        });
        root.querySelectorAll('[data-action="unequip"]').forEach(btn => {
            btn.addEventListener('click', async () => {
                await api.post('/api/cosmetics/unequip', { category: btn.dataset.category }).catch(() => {});
                await loadMine();
                rerender();
            });
        });

        const cleanupRail = renderCornerRail(root, { onShowStats, onShowPlaceholder, onShowAccount, onShowLeaderboard, onShowFriends, onShowMultiplayer });
        return () => { cleanupTheme(); cleanupRail(); };
    }

    let cleanup;
    function rerender() {
        if (stopped) return;
        if (cleanup) cleanup();
        cleanup = render();
    }

    async function loadCatalog() {
        try {
            catalog = await api.get('/api/cosmetics');
        } catch {
            status = 'error';
            message = 'Could not load the store - try again.';
        }
    }

    async function loadMine() {
        if (!getUser()) {
            // The catalogue still renders - only ownership needs an account.
            status = 'signed-out';
            mine = { owned: [], equipped_caret: null, equipped_flair: null };
            return;
        }
        try {
            mine = await api.get('/api/cosmetics/me');
            status = 'ok';
        } catch {
            status = 'error';
            message = 'Could not load your cosmetics - try again.';
        }
    }

    cleanup = render();
    (async () => {
        await loadCatalog();
        await loadMine();
        rerender();
    })();

    return () => {
        stopped = true;
        if (cleanup) cleanup();
    };
}
