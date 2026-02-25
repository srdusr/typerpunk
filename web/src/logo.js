// The TyperPunk mark.
//
// The mark is a prompt: a chevron, a baseline, and a block cursor resting on
// it. It says "text being entered at a terminal" without spelling anything
// out, and it stays legible at 16 pixels, which a more detailed drawing would
// not. The chevron is drawn twice, the lower copy offset and in the secondary
// colour, which is the one deliberate stylistic note.
//
// Everything is drawn in currentColor and the theme's own variables, so the
// mark follows the palette rather than carrying its own.

/// The mark on its own, for a favicon, a tab, or anywhere the name is already
/// present. Sized by its container.
export const LOGO_MARK = `
<svg class="logo-mark" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
    <g fill="none" stroke-width="3" stroke-linecap="square" stroke-linejoin="miter">
        <polyline class="logo-mark-ghost" points="7,10 13,16 7,22" />
        <polyline class="logo-mark-chevron" points="7,9 13,15 7,21" />
    </g>
    <rect class="logo-mark-baseline" x="6" y="24" width="20" height="2.5" />
    <rect class="logo-mark-cursor" x="16" y="15" width="9" height="9" />
</svg>`;

/// Mark and wordmark together. The wordmark is split so the two halves of the
/// name carry different weight: "Typer" is what it does, "Punk" is what it
/// looks like, and the accent colour goes on the second.
export function logoLockup({ tag = 'div', className = 'logo', action = 'menu' } = {}) {
    return `<${tag} class="${className}"${action ? ` data-action="${action}"` : ''}>
        ${LOGO_MARK}
        <span class="logo-word"><span class="logo-word-a">Typer</span><span class="logo-word-b">Punk</span></span>
    </${tag}>`;
}

/// The same mark as a standalone SVG document, for the favicon. Colours are
/// literal here because a favicon is rendered outside the page and cannot
/// read its variables.
export function faviconDataUri({ accent = '#00ff9d', ghost = '#00e5ff', background = '#000000' } = {}) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">`
        + `<rect width="32" height="32" fill="${background}"/>`
        + `<polyline points="7,10 13,16 7,22" fill="none" stroke="${ghost}" stroke-width="3" stroke-linecap="square"/>`
        + `<polyline points="7,9 13,15 7,21" fill="none" stroke="${accent}" stroke-width="3" stroke-linecap="square"/>`
        + `<rect x="6" y="24" width="20" height="2.5" fill="${accent}"/>`
        + `<rect x="16" y="15" width="9" height="9" fill="${accent}"/>`
        + `</svg>`;
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
