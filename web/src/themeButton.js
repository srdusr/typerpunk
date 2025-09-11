import { getTheme, setTheme, toggleTheme, onThemeChange, THEMES } from './theme.js';
import { themeIcon } from './screens/icons.js';
import { escapeHtml } from './util.js';
import { attachTooltips } from './tooltip.js';

const HOLD_MS = 450;

// Every screen showed a theme button advertising "Hold for more themes" in
// its tooltip, but only the main menu actually wired up the hold gesture --
// everywhere else it was a plain click-only toggle, so the tooltip was
// lying. One shared implementation instead of six copies of the same
// click/hold/popover logic, so the behavior can't drift out of sync again.
export function renderThemeButton(root) {
    const wrap = document.createElement('div');
    wrap.className = 'theme-control';
    wrap.innerHTML = `
        <button class="theme-toggle" data-tooltip="Hold for more themes" aria-label="Toggle theme"></button>
        <div class="theme-gallery-popover" hidden>
            <div class="theme-gallery">
                ${THEMES.map(t => `
                    <button class="theme-swatch${getTheme() === t.id ? ' active' : ''}" data-theme-id="${t.id}">
                        <span class="theme-swatch-preview" data-swatch="${t.id}"></span>
                        <span class="theme-swatch-label">${escapeHtml(t.label)}</span>
                    </button>
                `).join('')}
            </div>
        </div>
    `;
    root.appendChild(wrap);
    attachTooltips(wrap);

    const button = wrap.querySelector('.theme-toggle');
    const popover = wrap.querySelector('.theme-gallery-popover');
    const paint = () => { button.innerHTML = themeIcon(getTheme()); };
    paint();
    const unsubscribeTheme = onThemeChange(paint);

    let holdTimer = null;
    let heldOpen = false;
    button.addEventListener('pointerdown', () => {
        heldOpen = false;
        holdTimer = setTimeout(() => { heldOpen = true; popover.hidden = false; }, HOLD_MS);
    });
    const cancelHold = () => clearTimeout(holdTimer);
    button.addEventListener('pointerup', cancelHold);
    button.addEventListener('pointerleave', cancelHold);
    button.addEventListener('click', () => {
        if (heldOpen) { heldOpen = false; return; }
        toggleTheme();
    });

    wrap.querySelectorAll('.theme-swatch').forEach(swatch => {
        swatch.addEventListener('click', () => {
            setTheme(swatch.dataset.themeId);
            wrap.querySelectorAll('.theme-swatch').forEach(b => b.classList.toggle('active', b === swatch));
            popover.hidden = true;
        });
    });

    const handleOutsideClick = e => {
        if (!popover.hidden && !wrap.contains(e.target)) popover.hidden = true;
    };
    document.addEventListener('click', handleOutsideClick);

    return () => {
        unsubscribeTheme();
        document.removeEventListener('click', handleOutsideClick);
        wrap.remove();
    };
}
