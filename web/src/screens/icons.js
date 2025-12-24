import { isDarkTheme } from '../theme.js';

// Angular, straight-line glyphs to match the site's sharp-cornered,
// terminal-styled UI - rounded/organic icons (circles, bezier crescents)
// read as off-brand next to bordered rectangular buttons and monospace text.
const SUN = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <rect x="8.6" y="8.6" width="6.8" height="6.8" transform="rotate(45 12 12)"/>
    <path d="M12 1v3M12 20v3M1 12h3M20 12h3M4.75 4.75l2.1 2.1M17.15 17.15l2.1 2.1M19.25 4.75l-2.1 2.1M7.15 17.15l-2.1 2.1"/>
</svg>`;

// A true cut-out crescent (fill-rule evenodd punches a hexagonal hole out of
// a larger hexagon) rather than a color-matched overlay, so it renders
// correctly against every theme's background without special-casing.
const MOON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
    <path fill-rule="evenodd" clip-rule="evenodd" d="M12 2L20 6.5V17.5L12 22L4 17.5V6.5L12 2ZM14.3 5.6L19 8.3V15.7L14.3 18.4L16.2 12L14.3 5.6Z"/>
</svg>`;

// Shows the icon for the theme currently active (moon while in any
// dark-family theme, sun while in Light) rather than just checking for the
// literal string "dark" - that missed every gallery theme (Dracula, Nord,
// etc.), which are all dark-background but not literally named "dark".
export function themeIcon(theme) {
    return isDarkTheme(theme) ? MOON : SUN;
}

export const STATS_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
    <rect x="3" y="13" width="4" height="8"/>
    <rect x="10" y="8" width="4" height="13"/>
    <rect x="17" y="3" width="4" height="18"/>
</svg>`;

// Three sliders (an equalizer/preferences glyph) - the hex-nut-with-teeth
// gear this replaced still read too much like the hexagon family shared by
// Moon/Account/Friends at a glance despite the teeth. This is unambiguous as
// "settings" on its own and shares no shape language with anything else in
// the icon set.
export const SETTINGS_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
    <line x1="3" y1="6" x2="21" y2="6"/>
    <rect x="13" y="4" width="4" height="4" fill="currentColor" stroke="none"/>
    <line x1="3" y1="12" x2="21" y2="12"/>
    <rect x="6" y="10" width="4" height="4" fill="currentColor" stroke="none"/>
    <line x1="3" y1="18" x2="21" y2="18"/>
    <rect x="16" y="16" width="4" height="4" fill="currentColor" stroke="none"/>
</svg>`;

// Two overlapping triangle "figures" - same flat-geometric language as the
// other corner icons, reads as "two players" without a literal person glyph.
export const MULTIPLAYER_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
    <path d="M7 3L12.5 13H1.5L7 3Z"/>
    <path d="M17 3L22.5 13H11.5L17 3Z" opacity="0.55"/>
</svg>`;

export const LEADERBOARD_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
    <path d="M6 2H18V9C18 13 15.5 15.5 12 15.5C8.5 15.5 6 13 6 9V2Z"/>
    <rect x="10" y="15.5" width="4" height="3"/>
    <rect x="6.5" y="18.5" width="11" height="2.5"/>
</svg>`;

// Two overlapping copies of ACCOUNT_ICON's head-and-shoulders figure - two
// small bare hexagons (an earlier draft) blurred into two indistinct dots at
// this icon's actual render size; a head+shoulders silhouette keeps reading
// as "people" even that small.
export const FRIENDS_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
    <path d="M8 2L11 3.9V7.5L8 9.4L5 7.5V3.9L8 2Z"/>
    <path d="M2 21L3.6 14.5H12.4L14 21H2Z"/>
    <path d="M16.5 5L19.3 6.7V10L16.5 11.7L13.7 10V6.7L16.5 5Z" opacity="0.55"/>
    <path d="M11 22L12.4 16.2H20.6L22 22H11Z" opacity="0.55"/>
</svg>`;

export const ACCOUNT_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2L16.5 4.6V9.8L12 12.4L7.5 9.8V4.6L12 2Z"/>
    <path d="M4 22L6.5 15H17.5L20 22H4Z"/>
</svg>`;

// A price tag - angular throughout (straight edges, a punched square hole
// instead of a round one), matching the rest of the set.
export const STORE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
    <path fill-rule="evenodd" clip-rule="evenodd" d="M11 2H21V12L12 21L3 12L11 2ZM14.5 6H17.5V9H14.5V6Z"/>
</svg>`;

// A stroked chevron - an SVG path centers and scales identically everywhere,
// unlike a unicode "▾" glyph, whose vertical metrics vary by font and don't
// sit centered in a fixed-size box the way this does.
export const CHEVRON_DOWN_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M5 9L12 16L19 9"/>
</svg>`;

// Cosmetic flair badges (see cosmetics.rs) - angular throughout like every
// other icon here, a 4-point sparkle instead of a rounded star so it
// doesn't stand out as the one curved glyph in the set.
export const FLAIR_ICONS = {
    star: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L14.2 9.8L22 12L14.2 14.2L12 22L9.8 14.2L2 12L9.8 9.8Z"/></svg>`,
    bolt: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L4 14H11L10 22L20 9H13L14 2Z"/></svg>`,
    skull: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L20 6.5V14.5C20 17 18.5 19 16.5 20L15 22H9L7.5 20C5.5 19 4 17 4 14.5V6.5L12 2Z"/><rect x="8" y="12" width="3" height="3"/><rect x="13" y="12" width="3" height="3"/></svg>`,
};

// Typing-language picker. The convention for this control is a glyph pair --
// one letterform from a non-Latin script beside a Latin "A" - which is what
// 10FastFingers, MonkeyType and browser translate buttons all use. Drawn as
// straight-edged strokes rather than set in a font, so it matches the rest of
// this angular set and does not depend on a CJK face being installed.
export const LANGUAGE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square">
    <path d="M3 5H11"/>
    <path d="M7 3V5"/>
    <path d="M9.5 8.5C8.5 12 6 14 3.5 15.5"/>
    <path d="M5 11C6.5 13.5 8.5 15 10.5 16"/>
    <path d="M13 21L17 11L21 21"/>
    <path d="M14.4 18H19.6"/>
</svg>`;

// Close. A plain X drawn as two strokes rather than a "×" glyph, so it
// matches the weight and corner style of the rest of this set at any size.
export const CLOSE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="square">
    <path d="M5 5L19 19"/>
    <path d="M19 5L5 19"/>
</svg>`;

// Racer sprites. One per player in a multiplayer race, so a bar is a
// character rather than a coloured line with a name attached. Drawn in the
// same angular language as the rest of this set: straight edges, flat fill,
// no gradients, and they take their colour from the racer they belong to.
//
// Six of them, which is the room capacity, so no two racers in a full room
// share a sprite.
export const RACER_SPRITES = {
    // A forward-leaning chevron, the fastest-reading shape in the set.
    dart: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M3 4L17 12L3 20L7 12Z"/><rect x="19" y="10" width="3" height="4"/></svg>`,
    // A blocky rocket.
    rocket: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L16 8V16H8V8Z"/><path d="M8 16L5 21L9 19Z"/><path d="M16 16L19 21L15 19Z"/><rect x="10" y="6" width="4" height="4" fill="var(--background-color)"/></svg>`,
    // A visored helmet.
    helm: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M4 11L12 3L20 11V18H4Z"/><rect x="7" y="11" width="10" height="4" fill="var(--background-color)"/><rect x="4" y="18" width="16" height="3"/></svg>`,
    // A hexagonal core.
    core: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L20 7V17L12 22L4 17V7Z"/><rect x="9" y="9" width="6" height="6" fill="var(--background-color)"/></svg>`,
    // A signal mast.
    signal: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><rect x="11" y="8" width="2" height="14"/><path d="M4 3L8 7L4 11Z"/><path d="M20 3L16 7L20 11Z"/><rect x="8" y="6" width="8" height="2"/></svg>`,
    // A pair of stacked blades.
    blade: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M2 6H14L18 10H6Z"/><path d="M6 14H18L22 18H10Z"/></svg>`,
};

export const RACER_SPRITE_IDS = Object.keys(RACER_SPRITES);

// Flair added alongside the original three. Same construction: flat fill,
// straight edges, readable at 16px beside a username.
Object.assign(FLAIR_ICONS, {
    crown: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M3 7L7 12L12 5L17 12L21 7V19H3Z"/></svg>`,
    circuit: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><rect x="9" y="9" width="6" height="6"/><rect x="11" y="2" width="2" height="6"/><rect x="11" y="16" width="2" height="6"/><rect x="2" y="11" width="6" height="2"/><rect x="16" y="11" width="6" height="2"/></svg>`,
    eye: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M2 12L7 6H17L22 12L17 18H7Z"/><rect x="10" y="10" width="4" height="4" fill="var(--background-color)"/></svg>`,
    shard: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L18 10L12 22L6 10Z"/></svg>`,
    moth: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 4L4 8L6 16L12 13Z"/><path d="M12 4L20 8L18 16L12 13Z"/><rect x="11" y="4" width="2" height="16"/></svg>`,
    reactor: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L21 20H3Z"/><rect x="10" y="12" width="4" height="5" fill="var(--background-color)"/></svg>`,
});
