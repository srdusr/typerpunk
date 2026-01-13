import { escapeHtml } from '../util.js';
import { renderCornerRail } from '../cornerRail.js';
import { attachTooltips } from '../tooltip.js';
import { renderTopRail } from '../topRail.js';
import { api, ApiError } from '../api.js';
import { getUser } from '../auth.js';
import { FLAIR_ICONS, RACER_SPRITES, CLOSE_ICON } from './icons.js';

function formatPrice(cents) {
    return `$${(cents / 100).toFixed(2)}`;
}

// Enough to show what kind of thing is in a bundle without making one card
// far taller than the others beside it.
const MAX_PREVIEWS = 10;

function categoryLabel(category) {
    if (category === 'caret') return 'Caret Colours';
    if (category === 'sprite') return 'Race Sprites';
    return 'Flair';
}

// Buying sends the browser to the processor's own checkout page. Nothing is
// granted here: the item appears once the processor's webhook reaches the
// server. That is why every Buy button leaves the site rather than updating
// in place.
export function renderStoreScreen(root, { onBack, onShowStats, onShowPlaceholder, onShowAccount, onShowLeaderboard, onShowFriends, onShowMultiplayer }) {
    let catalog = [];
    let bundles = [];
    let mine = { owned: [], equipped_caret: null, equipped_flair: null, equipped_sprite: null, is_supporter: false };
    let status = 'loading';
    let message = '';
    let stopped = false;

    function isOwned(id) {
        return status !== 'signed-out' && mine.owned.includes(id);
    }

    function swatchFor(item) {
        // A caret is a colour, so the swatch is the colour itself; flair and
        // sprites are drawings, so the swatch is the drawing.
        if (item.category === 'caret') {
            return `<span class="store-swatch" data-swatch-colour="${escapeHtml(item.value)}"></span>`;
        }
        const set = item.category === 'sprite' ? RACER_SPRITES : FLAIR_ICONS;
        return `<span class="store-swatch store-flair-swatch">${set[item.value] || ''}</span>`;
    }

    function itemMarkup(item) {
        const signedOut = status === 'signed-out';
        const owned = isOwned(item.id);
        const equipped = !signedOut && (
            mine.equipped_caret === item.id ||
            mine.equipped_flair === item.id ||
            mine.equipped_sprite === item.id
        );
        return `
            <div class="leaderboard-row store-item-row">
                ${swatchFor(item)}
                <div class="leaderboard-name">${escapeHtml(item.name)}</div>
                ${!owned ? `<div class="leaderboard-acc store-price">${formatPrice(item.price_cents)}</div>` : ''}
                ${owned
                    ? `<button class="menu-button small${equipped ? ' active' : ' quiet'}" data-action="${equipped ? 'unequip' : 'equip'}" data-id="${item.id}" data-category="${item.category}" data-tooltip="${equipped ? 'Unequip, back to the default look' : `Replaces whichever ${categoryLabel(item.category).toLowerCase()} you have equipped now`}">${equipped ? 'Equipped' : 'Equip'}</button>`
                    : `<button class="menu-button small${signedOut ? ' quiet' : ''}" data-action="${signedOut ? 'go-account' : 'buy'}" data-id="${item.id}"${signedOut ? ' data-tooltip="Sign in to buy this"' : ''}>Buy</button>`}
            </div>
        `;
    }

    function bundleMarkup(b) {
        const signedOut = status === 'signed-out';
        const items = b.items || [];
        const ownedCount = items.filter(isOwned).length;
        const complete = items.length > 0 && ownedCount === items.length;
        const saving = b.full_price_cents - b.price_cents;

        // The contents are shown as their own swatches: a bundle you cannot
        // see the inside of is a bundle nobody buys. Capped, because The Lot
        // holds every item and its 26 swatches made the card three rows
        // taller than the one beside it, which then sat in dead space.
        const resolved = items.map(id => catalog.find(c => c.id === id)).filter(Boolean);
        const shown = resolved.slice(0, MAX_PREVIEWS);
        const hidden = resolved.length - shown.length;
        const previews = shown
            .map(item => `<span class="bundle-preview-item${isOwned(item.id) ? ' owned' : ''}" data-tooltip="${escapeHtml(item.name)}${isOwned(item.id) ? ' (owned)' : ''}">${swatchFor(item)}</span>`)
            .join('') + (hidden > 0 ? `<span class="bundle-preview-more">+${hidden}</span>` : '');

        return `
            <div class="bundle-card">
                <div class="bundle-head">
                    <div class="bundle-name">${escapeHtml(b.name)}</div>
                    ${saving > 0 ? `<div class="bundle-saving">Save ${formatPrice(saving)}</div>` : ''}
                </div>
                ${b.description ? `<div class="bundle-description">${escapeHtml(b.description)}</div>` : ''}
                <div class="bundle-previews">${previews}</div>
                <div class="bundle-foot">
                    <div class="bundle-prices">
                        <span class="bundle-price">${formatPrice(b.price_cents)}</span>
                        ${saving > 0 ? `<span class="bundle-full-price">${formatPrice(b.full_price_cents)}</span>` : ''}
                    </div>
                    ${complete
                        ? `<span class="bundle-owned">You own all of these</span>`
                        : `<button class="menu-button small${signedOut ? ' quiet' : ' primary'}" data-action="${signedOut ? 'go-account' : 'buy-bundle'}" data-id="${escapeHtml(b.id)}"${signedOut ? ' data-tooltip="Sign in to buy this"' : ''}>Buy${ownedCount ? ` the other ${items.length - ownedCount}` : ''}</button>`}
                </div>
                ${ownedCount && !complete ? `<div class="bundle-note">You already own ${ownedCount} of these ${items.length}. The price does not change.</div>` : ''}
            </div>`;
    }

    function supporterMarkup() {
        if (status === 'signed-out') return '';
        if (mine.is_supporter) {
            return `<div class="store-supporter is-supporter">
                        <div class="store-supporter-text">
                            <strong>You are a supporter.</strong>
                            <span>Thank you. The site runs without ads for you.</span>
                        </div>
                    </div>`;
        }
        return `<div class="store-supporter">
                    <div class="store-supporter-text">
                        <strong>Supporter</strong>
                        <span>Removes the ad slot for 30 days and pays for the servers.</span>
                    </div>
                    <button class="menu-button small primary" data-action="buy-supporter">$3.00</button>
                </div>`;
    }

    function bodyMarkup() {
        if (status === 'loading') return `<div class="stats-empty">Loading...</div>`;
        if (status === 'error') return `<div class="stats-empty">${escapeHtml(message)}</div>`;

        const signedOut = status === 'signed-out';
        const banner = signedOut
            ? `<div class="store-signin-note">Sign in to buy and equip these.
                 <button class="menu-button small" data-action="go-account">Sign In</button></div>`
            : '';

        const bundleSection = bundles.length
            ? `<h3>Bundles</h3><div class="bundle-grid">${bundles.map(bundleMarkup).join('')}</div>`
            : '';

        const categories = ['caret', 'flair', 'sprite'];
        const itemSections = categories.map(cat => {
            const items = catalog.filter(i => i.category === cat);
            if (items.length === 0) return '';
            return `<h3>${categoryLabel(cat)}</h3><div class="leaderboard-list">${items.map(itemMarkup).join('')}</div>`;
        }).join('');

        return banner + supporterMarkup() + bundleSection + itemSections
             + `<div class="custom-error store-error"></div>`;
    }

    /// Starts a checkout and follows the redirect the server returns. A server
    /// with no processor keys answers 501, which is reported rather than
    /// leaving the button looking broken.
    async function startCheckout(path, errorEl) {
        try {
            const data = await api.post(path);
            if (data && data.url) window.location.assign(data.url);
        } catch (err) {
            if (!errorEl) return;
            errorEl.textContent = err instanceof ApiError
                ? err.message
                : 'Could not start checkout. Try again.';
        }
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

        root.querySelectorAll('[data-action="go-account"]').forEach(el => el.addEventListener('click', onShowAccount));

        const errorEl = root.querySelector('.store-error');
        root.querySelectorAll('[data-action="buy"]').forEach(btn => {
            btn.addEventListener('click', () => startCheckout(`/api/billing/checkout/${encodeURIComponent(btn.dataset.id)}`, errorEl));
        });
        root.querySelectorAll('[data-action="buy-bundle"]').forEach(btn => {
            btn.addEventListener('click', () => startCheckout(`/api/billing/bundle/${encodeURIComponent(btn.dataset.id)}`, errorEl));
        });
        root.querySelector('[data-action="buy-supporter"]')
            ?.addEventListener('click', () => startCheckout('/api/billing/supporter', errorEl));

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
            message = 'Could not load the store. Try again.';
            return;
        }
        // A store with no bundles is still a store, so this failing is not an
        // error worth replacing the page with.
        try { bundles = await api.get('/api/cosmetics/bundles'); } catch { bundles = []; }
    }

    async function loadMine() {
        if (!getUser()) {
            // The catalogue still renders; only ownership needs an account.
            status = 'signed-out';
            mine = { owned: [], equipped_caret: null, equipped_flair: null, equipped_sprite: null, is_supporter: false };
            return;
        }
        try {
            mine = await api.get('/api/cosmetics/me');
            status = 'ok';
        } catch {
            status = 'error';
            message = 'Could not load your cosmetics. Try again.';
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
