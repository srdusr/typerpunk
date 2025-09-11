import { startApp } from './app.js';

async function loadLocalTexts() {
    try {
        const res = await fetch(new URL('./data/texts.json', import.meta.url));
        const data = await res.json();
        return Array.isArray(data) ? data : [];
    } catch (err) {
        console.error('Failed to load local texts:', err);
        return [];
    }
}

loadLocalTexts().then(texts => {
    startApp(document.getElementById('root'), texts);
});
