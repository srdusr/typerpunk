// The TyperPunk mark.
//
// The mark is a shell prompt: a chevron and the underscore cursor that sits
// after it, waiting for input. Two shapes, nothing else. It reads at 16
// pixels, which is the only size that really has to work, and it is the
// gesture anyone who has used a terminal recognises without being told.
//
// An earlier version stacked a chevron, a full-width baseline and a large
// filled block, plus an offset ghost copy of the chevron behind it. Five
// shapes in a 32 pixel square is a drawing, not a mark: the parts crowded
// each other and none of them read.
//
// Everything is drawn in currentColor and the theme's own variables, so the
// mark follows the palette rather than carrying its own.

/// The mark on its own, for a favicon, a tab, or anywhere the name is already
/// present. Sized by its container.
export const LOGO_MARK = `
<svg class="logo-mark" viewBox="0 0 28 28" aria-hidden="true" focusable="false">
    <g class="logo-mark-chevron" fill="none" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="4,7 11,14 4,21" />
    </g>
    <rect class="logo-mark-cursor" x="15" y="17.6" width="9" height="3.4" rx="0.6" />
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
export function faviconDataUri({ accent = '#00ff9d', background = '#000000' } = {}) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28">`
        + `<rect width="28" height="28" fill="${background}"/>`
        + `<polyline points="4,7 11,14 4,21" fill="none" stroke="${accent}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`
        + `<rect x="15" y="17.6" width="9" height="3.4" rx="0.6" fill="${accent}"/>`
        + `</svg>`;
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
