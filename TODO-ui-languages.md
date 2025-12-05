# Translate the interface

## What exists today

`web/src/languages.js` holds 16 **typing** languages: the vocabulary the
generated-word modes (Words, Timed, Zen, Practice) draw from. The picker in
the top-right rail sets `settings.language`, and `wordGenerator.js` reads it.

That is the same thing MonkeyType and 10FastFingers mean by "language" - what
you type, not what the buttons say. The interface itself is English only.

## What this task is

Making the interface follow that picker, or a second picker beside it.

## Why it is not a small change

Every user-facing string is currently a literal inside the markup that renders
it. There is no catalogue, no lookup, and no plural or interpolation handling.
The work is:

1. **Extract.** Pull every string out of `web/src/**` into a catalogue keyed by
   id. Roughly 250 strings across screens, tooltips, empty states and errors.
   Tooltips are the bulk of it and the easiest to miss, because they live in
   `data-tooltip` attributes rather than in text nodes.
2. **A lookup with interpolation and plurals.** `"{n} racing"` and
   `"{n} players racing now"` already need a plural rule, and Polish, Czech and
   Romanian have more plural forms than English does. Use `Intl.PluralRules`
   rather than an `n === 1` check.
3. **Decide whether the two languages are one setting.** Typing Spanish does
   not mean wanting a Spanish interface, and vice versa. Two pickers is more
   honest; one is fewer controls. This is a product decision, not a technical
   one.
4. **Translate.** 16 locales. This is the part that cannot be done from inside
   this repo with any confidence - see below.
5. **Layout.** German and Finnish compound words are long. The corner rails,
   the mode picker and the end screen's stat labels are all sized to English
   today; several will need to wrap or shrink.

## The honest constraint

Machine-translating 16 locales and shipping them as finished would put text in
front of users that nobody who speaks those languages has read. The word lists
have the same issue but a much smaller blast radius: a slightly odd word in a
typing drill is a curiosity, whereas a mistranslated button is a bug the user
cannot diagnose.

Suggested approach:

- Build the catalogue and lookup, with English as the only complete locale.
- Add one or two further locales fully, to prove the plumbing against real
  translated text of realistic length.
- Ship the rest only as native speakers review them, with the picker listing
  only locales that are actually complete.

## Related

- `web/src/languages.js` - typing vocabulary, and the note there about the
  lists being curated rather than corpus-derived.
- The corpus question is separate and also open: real frequency lists are
  mostly CC BY-SA, which does not sit cleanly in an MIT repo.
