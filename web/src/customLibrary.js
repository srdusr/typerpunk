const STORAGE_KEY = 'typerpunk:library';
// A document is stored whole so it can be re-chunked later - switching
// markdown between stripped and verbatim needs the original, not the chunks.
// Ten is enough for the notes someone is actually working through, and keeps
// localStorage well clear of its quota.
const MAX_DOCUMENTS = 10;
const MAX_RAW_CHARS = 400_000;

// Imported documents, kept between visits.
//
// Custom text used to live only in memory: import a set of notes, reload the
// page, and it was gone. That is fine for pasting a paragraph to race, and
// useless for working through a file over several sittings - which is what
// people actually do with their own notes.
//
// Everything here stays on the device. Notes are not uploaded anywhere.

function load() {
    try {
        const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
        return Array.isArray(raw) ? raw : [];
    } catch {
        return [];
    }
}

function save(docs) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(docs));
        return true;
    } catch {
        // Quota, or storage disabled. The document still works for this
        // session; it simply will not be there next time.
        return false;
    }
}

export function listDocuments() {
    return load().sort((a, b) => (b.lastOpened || 0) - (a.lastOpened || 0));
}

export function getDocument(id) {
    return load().find(d => d.id === id) || null;
}

/// Stores a document, replacing any earlier import of the same name so
/// re-importing an edited file updates it in place rather than accumulating
/// copies. Returns the stored record.
export function saveDocument({ name, raw, chunkCount }) {
    const docs = load().filter(d => d.name !== name);
    const existing = load().find(d => d.name === name);
    const doc = {
        id: existing?.id || `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name,
        raw: raw.slice(0, MAX_RAW_CHARS),
        chunkCount,
        // Re-importing an edited file keeps your place only if it still makes
        // sense: past the end of the new version, start again.
        position: Math.min(existing?.position || 0, Math.max(0, chunkCount - 1)),
        addedAt: existing?.addedAt || Date.now(),
        lastOpened: Date.now(),
    };
    docs.unshift(doc);
    save(docs.slice(0, MAX_DOCUMENTS));
    return doc;
}

/// Records how far through a document you have typed.
export function setPosition(id, position) {
    const docs = load();
    const doc = docs.find(d => d.id === id);
    if (!doc) return;
    doc.position = Math.max(0, position);
    doc.lastOpened = Date.now();
    save(docs);
}

export function removeDocument(id) {
    save(load().filter(d => d.id !== id));
}

/// How far through a document you are, as a percentage.
export function progressOf(doc) {
    if (!doc || !doc.chunkCount) return 0;
    return Math.min(100, Math.round((doc.position / doc.chunkCount) * 100));
}
