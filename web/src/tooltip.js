// Custom-styled tooltip, replacing the browser's own native title="" popup --
// that one can't be styled at all (OS-drawn box, inconsistent font/delay
// across browsers), which reads as an unpolished, "browser default" element
// sitting next to an otherwise fully custom UI.
let tooltipEl = null;

function getTooltipEl() {
    if (!tooltipEl) {
        tooltipEl = document.createElement('div');
        tooltipEl.className = 'app-tooltip';
        tooltipEl.hidden = true;
        document.body.appendChild(tooltipEl);
    }
    return tooltipEl;
}

// Short delay before showing. Without one, sweeping the pointer across the
// icon rail fires a tooltip per icon passed over, which flickers.
const SHOW_DELAY_MS = 350;
let showTimer = null;

function showTooltip(target) {
    const text = target.dataset.tooltip;
    if (!text) return;
    const tip = getTooltipEl();
    tip.textContent = text;
    tip.hidden = false;

    const rect = target.getBoundingClientRect();
    const tipRect = tip.getBoundingClientRect();
    let left = rect.left + rect.width / 2 - tipRect.width / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - tipRect.width - 8));
    let top = rect.top - tipRect.height - 8;
    if (top < 8) top = rect.bottom + 8;
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
}

function scheduleTooltip(target) {
    clearTimeout(showTimer);
    showTimer = setTimeout(() => showTooltip(target), SHOW_DELAY_MS);
}

function hideTooltip() {
    clearTimeout(showTimer);
    if (tooltipEl) tooltipEl.hidden = true;
}

// Wires every [data-tooltip] element under root - call once after the
// screen's markup is in the DOM. Hides on scroll too, since a fixed-position
// tooltip left open would otherwise drift away from the element it's
// pointing at.
export function attachTooltips(root) {
    root.querySelectorAll('[data-tooltip]').forEach(el => {
        el.addEventListener('mouseenter', () => scheduleTooltip(el));
        el.addEventListener('mouseleave', hideTooltip);
        // Acting on a control dismisses its tooltip. Without this it stays up
        // over whatever the click just opened - the mode popover, or the
        // control sitting above the button that was pressed.
        el.addEventListener('mousedown', hideTooltip);
        el.addEventListener('click', hideTooltip);
        el.addEventListener('focus', () => showTooltip(el));
        el.addEventListener('blur', hideTooltip);
    });
    window.addEventListener('scroll', hideTooltip, { capture: true, passive: true });
}
