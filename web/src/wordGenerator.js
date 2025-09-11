import { languageWords } from './languages.js';

const COMMON_WORDS = [
    'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'it',
    'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at', 'this',
    'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she', 'or',
    'an', 'will', 'my', 'one', 'all', 'would', 'there', 'their', 'what', 'so',
    'up', 'out', 'if', 'about', 'who', 'get', 'which', 'go', 'me', 'when',
    'make', 'can', 'like', 'time', 'no', 'just', 'him', 'know', 'take', 'people',
    'into', 'year', 'your', 'good', 'some', 'could', 'them', 'see', 'other', 'than',
    'then', 'now', 'look', 'only', 'come', 'its', 'over', 'think', 'also', 'back',
    'after', 'use', 'two', 'how', 'our', 'work', 'first', 'well', 'way', 'even',
    'new', 'want', 'because', 'any', 'these', 'give', 'day', 'most', 'us', 'water',
    'long', 'find', 'here', 'thing', 'place', 'hand', 'part', 'child', 'eye', 'life',
    'world', 'school', 'state', 'family', 'student', 'group', 'country', 'problem', 'fact', 'month',
    'right', 'study', 'book', 'word', 'business', 'issue', 'side', 'kind', 'head', 'house',
    'service', 'friend', 'father', 'power', 'hour', 'game', 'line', 'end', 'member', 'law',
    'car', 'city', 'community', 'name', 'president', 'team', 'minute', 'idea', 'body', 'information',
    'parent', 'face', 'others', 'level', 'office', 'door', 'health', 'person', 'art', 'war',
    'history', 'party', 'result', 'change', 'morning', 'reason', 'research', 'girl', 'guy', 'moment',
    'air', 'teacher', 'force', 'education', 'foot', 'boy', 'age', 'policy', 'process', 'music',
    'market', 'sense', 'nation', 'plan', 'college', 'interest', 'death', 'experience', 'effect', 'model',
];

// Longer, less-frequent words - layered on top of COMMON_WORDS for the
// "extended" tier rather than replacing it, so that tier is strictly harder
// (more variety, longer words) instead of just different.
const EXTENDED_WORDS = [
    'available', 'benefit', 'community', 'consider', 'determine', 'discover', 'economic', 'establish',
    'evidence', 'example', 'experience', 'feature', 'function', 'general', 'government', 'however',
    'important', 'include', 'increase', 'individual', 'information', 'international', 'involve', 'language',
    'material', 'measure', 'medical', 'military', 'natural', 'necessary', 'opportunity', 'organization',
    'particular', 'perform', 'physical', 'political', 'population', 'position', 'positive', 'possible',
    'practice', 'prepare', 'present', 'pressure', 'probably', 'produce', 'product', 'program',
    'protect', 'provide', 'quality', 'question', 'reality', 'receive', 'recognize', 'record',
    'relationship', 'remember', 'require', 'resource', 'response', 'result', 'security', 'several',
    'significant', 'similar', 'situation', 'social', 'society', 'special', 'specific', 'standard',
    'structure', 'suggest', 'support', 'system', 'technology', 'therefore', 'together', 'traditional',
    'training', 'travel', 'treatment', 'understand', 'university', 'various', 'through', 'without',
];

// Uncommon, technical, or irregularly-spelled words - deliberately picks
// for awkward letter combinations and length rather than just obscurity, so
// "hard" is actually harder to type, not just harder to recognize.
const HARD_WORDS = [
    'rhythm', 'bureaucracy', 'conscience', 'entrepreneur', 'idiosyncrasy', 'juxtaposition', 'onomatopoeia',
    'paradigm', 'pharaoh', 'phenomenon', 'protagonist', 'quintessential', 'silhouette', 'subtlety',
    'synchronize', 'unprecedented', 'vacuum', 'wednesday', 'xylophone', 'zeitgeist', 'acquaintance',
    'archipelago', 'camaraderie', 'chrysanthemum', 'circumference', 'colonel', 'conscientious', 'exacerbate',
    'exaggerate', 'extraordinary', 'gargantuan', 'hierarchical', 'hypothesis', 'inconsequential', 'labyrinth',
    'maneuver', 'mischievous', 'nostalgia', 'omniscient', 'perpendicular', 'questionnaire', 'reconnaissance',
    'rendezvous', 'sovereignty', 'surveillance', 'threshold', 'tuberculosis', 'ubiquitous', 'vicissitude',
    'wherewithal',
];

const WORD_POOLS = {
    common: COMMON_WORDS,
    extended: [...COMMON_WORDS, ...EXTENDED_WORDS],
    hard: [...EXTENDED_WORDS, ...HARD_WORDS],
};

export function wordListTiers() {
    return Object.keys(WORD_POOLS);
}

// The tier ladder (common/extended/hard) is built from the English lists, so
// it only applies to English. Every other language ships one high-frequency
// list, and asking for a harder tier in Spanish must not silently drop you
// back into English words - so a non-English language uses its own list at
// every tier rather than falling through to WORD_POOLS.
function poolFor(tier, language) {
    if (language && language !== 'en') return languageWords(language);
    return WORD_POOLS[tier] || COMMON_WORDS;
}

function pick(tier, language) {
    const pool = poolFor(tier, language);
    return pool[Math.floor(Math.random() * pool.length)];
}

function capitalize(word) {
    return word.charAt(0).toUpperCase() + word.slice(1);
}

// Builds a random passage of the given word count, MonkeyType-style: a flat
// stream of common words with no fixed meaning, used for count- or
// time-based practice instead of a memorized quote. `numbers` occasionally
// swaps a word for a random number; `punctuation` breaks the stream into
// capitalized, comma- and period-punctuated "sentences".
export function generateWordStream(count, options = {}) {
    const { punctuation = false, numbers = false, tier = 'common', language = 'en' } = options;
    const words = [];
    let sinceComma = 0;
    let sinceSentenceStart = 0;
    for (let i = 0; i < count; i++) {
        let word = numbers && Math.random() < 0.12
            ? String(Math.floor(Math.random() * 1000))
            : pick(tier, language);

        if (punctuation) {
            if (sinceSentenceStart === 0) word = capitalize(word);
            sinceComma++;
            sinceSentenceStart++;

            const atEnd = i === count - 1;
            if (atEnd) {
                word += '.';
            } else if (sinceSentenceStart >= 6 && Math.random() < 0.15) {
                word += '.';
                sinceSentenceStart = 0;
            } else if (sinceComma >= 4 && Math.random() < 0.2) {
                word += ',';
                sinceComma = 0;
            }
        }

        words.push(word);
    }
    return words.join(' ');
}

// Weighted toward words containing the caller's weak characters (see
// keyStats.js) instead of a flat random pick - a word with 3 weak letters
// is far more likely to come up than one with none, but every word still
// has some chance (the +1 baseline), so the output stays readable text
// instead of a narrow loop of the same few words.
function pickWeighted(pool, weakSet) {
    const weights = pool.map(word => {
        let score = 1;
        for (const ch of word) if (weakSet.has(ch)) score += 2;
        return score;
    });
    const total = weights.reduce((a, b) => a + b, 0);
    let roll = Math.random() * total;
    for (let i = 0; i < pool.length; i++) {
        roll -= weights[i];
        if (roll <= 0) return pool[i];
    }
    return pool[pool.length - 1];
}

// Falls back to a plain generateWordStream when there isn't enough data
// yet to know what's actually hard for this person (a brand-new install,
// or someone who hasn't typed enough for MIN_SAMPLES to kick in).
export function generateWeakKeyStream(count, weakChars, options = {}) {
    if (!weakChars || weakChars.length === 0) return generateWordStream(count, options);
    const { punctuation = false, numbers = false } = options;
    const weakSet = new Set(weakChars.map(c => c.toLowerCase()));
    const pool = WORD_POOLS.extended;

    const words = [];
    let sinceComma = 0;
    let sinceSentenceStart = 0;
    for (let i = 0; i < count; i++) {
        let word = numbers && Math.random() < 0.12
            ? String(Math.floor(Math.random() * 1000))
            : pickWeighted(pool, weakSet);

        if (punctuation) {
            if (sinceSentenceStart === 0) word = capitalize(word);
            sinceComma++;
            sinceSentenceStart++;
            const atEnd = i === count - 1;
            if (atEnd) {
                word += '.';
            } else if (sinceSentenceStart >= 6 && Math.random() < 0.15) {
                word += '.';
                sinceSentenceStart = 0;
            } else if (sinceComma >= 4 && Math.random() < 0.2) {
                word += ',';
                sinceComma = 0;
            }
        }
        words.push(word);
    }
    return words.join(' ');
}

// For time-based mode the buffer has to outlast the timer regardless of how
// fast the typist is. 6 words/sec (360 WPM) is well past the sustained
// world-record typing speed (~216 WPM), so this is generous headroom rather
// than a tight fit.
export function wordCountForDuration(seconds) {
    return Math.max(20, Math.round(seconds * 6));
}
