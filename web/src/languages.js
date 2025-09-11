// Typing languages: which vocabulary the generated-word modes (Words, Timed,
// Zen, Practice) draw from. This is the text being typed, not the language of
// the interface - the same distinction MonkeyType and 10FastFingers make.
//
// Each list is that language's own high-frequency vocabulary, not a
// translation of the English one. Accented characters are kept as written;
// typing them is the point of picking the language.
//
// Adding a language means adding an entry here and nothing else.

const EN = [
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
];

const ES = [
    'el', 'la', 'de', 'que', 'y', 'a', 'en', 'un', 'ser', 'se',
    'no', 'haber', 'por', 'con', 'su', 'para', 'como', 'estar', 'tener', 'le',
    'lo', 'todo', 'pero', 'más', 'hacer', 'o', 'poder', 'decir', 'este', 'ir',
    'otro', 'ese', 'si', 'me', 'ya', 'ver', 'porque', 'dar', 'cuando', 'muy',
    'sin', 'vez', 'mucho', 'saber', 'qué', 'sobre', 'mi', 'alguno', 'mismo', 'yo',
    'también', 'hasta', 'año', 'dos', 'querer', 'entre', 'así', 'primero', 'desde', 'grande',
    'eso', 'ni', 'nos', 'llegar', 'pasar', 'tiempo', 'ella', 'sí', 'día', 'uno',
    'bien', 'poco', 'deber', 'entonces', 'poner', 'cosa', 'tanto', 'hombre', 'parecer', 'nuestro',
    'tan', 'donde', 'ahora', 'parte', 'después', 'vida', 'quedar', 'siempre', 'creer', 'hablar',
    'llevar', 'dejar', 'nada', 'cada', 'seguir', 'menos', 'nuevo', 'encontrar', 'algo', 'sólo',
];

const FR = [
    'le', 'de', 'un', 'être', 'et', 'à', 'il', 'avoir', 'ne', 'je',
    'son', 'que', 'se', 'qui', 'ce', 'dans', 'en', 'du', 'elle', 'au',
    'pour', 'pas', 'que', 'vous', 'par', 'sur', 'faire', 'plus', 'dire', 'me',
    'on', 'mon', 'lui', 'nous', 'comme', 'mais', 'pouvoir', 'avec', 'tout', 'y',
    'aller', 'voir', 'bien', 'où', 'sans', 'tu', 'ou', 'leur', 'homme', 'si',
    'deux', 'mari', 'moi', 'vouloir', 'te', 'même', 'venir', 'quand', 'grand', 'celui',
    'si', 'notre', 'devoir', 'là', 'jour', 'prendre', 'très', 'peu', 'encore', 'aussi',
    'quelque', 'dont', 'tout', 'mer', 'trouver', 'donner', 'temps', 'ça', 'peut', 'chose',
    'vie', 'année', 'monde', 'main', 'jamais', 'sous', 'passer', 'toujours', 'rien', 'falloir',
    'parler', 'sembler', 'depuis', 'moment', 'partir', 'penser', 'enfant', 'entre', 'aimer', 'mot',
];

const DE = [
    'der', 'die', 'und', 'in', 'den', 'von', 'zu', 'das', 'mit', 'sich',
    'des', 'auf', 'für', 'ist', 'im', 'dem', 'nicht', 'ein', 'eine', 'als',
    'auch', 'es', 'an', 'werden', 'aus', 'er', 'hat', 'dass', 'sie', 'nach',
    'bei', 'um', 'noch', 'wie', 'über', 'nur', 'oder', 'aber', 'vor', 'bis',
    'mehr', 'durch', 'man', 'sein', 'wurde', 'sei', 'wir', 'was', 'wenn', 'haben',
    'kann', 'ihre', 'dann', 'unter', 'wieder', 'zwei', 'schon', 'jahr', 'diese', 'wird',
    'kein', 'immer', 'zeit', 'doch', 'ihr', 'weil', 'ganz', 'zwischen', 'leben', 'sehr',
    'selbst', 'gegen', 'stadt', 'drei', 'hier', 'gut', 'wo', 'ohne', 'seine', 'jetzt',
    'weiter', 'menschen', 'land', 'welt', 'tag', 'hand', 'frage', 'seit', 'gehen', 'kommen',
    'große', 'teil', 'arbeit', 'ende', 'haus', 'frau', 'mann', 'kind', 'wasser', 'wort',
];

const IT = [
    'il', 'di', 'che', 'e', 'la', 'in', 'un', 'essere', 'a', 'per',
    'non', 'avere', 'con', 'si', 'da', 'come', 'io', 'questo', 'lo', 'ma',
    'del', 'più', 'fare', 'al', 'tutto', 'anche', 'su', 'lui', 'se', 'dire',
    'me', 'quando', 'lei', 'suo', 'poi', 'o', 'perché', 'cosa', 'ora', 'solo',
    'molto', 'bene', 'dove', 'ancora', 'sempre', 'niente', 'volta', 'grande', 'due', 'vita',
    'uomo', 'anno', 'giorno', 'casa', 'tempo', 'mondo', 'parte', 'mano', 'occhio', 'donna',
    'padre', 'madre', 'lavoro', 'città', 'paese', 'strada', 'notte', 'acqua', 'parola', 'amico',
];

const PT = [
    'o', 'de', 'que', 'e', 'a', 'do', 'da', 'em', 'um', 'para',
    'com', 'não', 'uma', 'os', 'no', 'se', 'na', 'por', 'mais', 'as',
    'dos', 'como', 'mas', 'ao', 'ele', 'das', 'à', 'seu', 'sua', 'ou',
    'quando', 'muito', 'nos', 'já', 'eu', 'também', 'só', 'pelo', 'até', 'isso',
    'ela', 'entre', 'depois', 'sem', 'mesmo', 'aos', 'seus', 'quem', 'nas', 'me',
    'ano', 'dia', 'vez', 'casa', 'tempo', 'vida', 'homem', 'mundo', 'parte', 'lugar',
    'trabalho', 'cidade', 'noite', 'água', 'palavra', 'olho', 'mão', 'pessoa', 'coisa', 'forma',
];

const NL = [
    'de', 'en', 'van', 'het', 'een', 'in', 'is', 'dat', 'op', 'te',
    'zijn', 'met', 'voor', 'niet', 'aan', 'er', 'maar', 'om', 'ook', 'als',
    'dan', 'je', 'die', 'was', 'uit', 'door', 'over', 'ze', 'nog', 'naar',
    'heeft', 'hij', 'kan', 'zich', 'bij', 'onder', 'wij', 'wat', 'meer', 'deze',
    'jaar', 'dag', 'tijd', 'mens', 'werk', 'land', 'huis', 'stad', 'water', 'kind',
    'vrouw', 'man', 'hand', 'weg', 'woord', 'leven', 'wereld', 'nacht', 'oog', 'deel',
];

const SV = [
    'och', 'att', 'det', 'i', 'en', 'som', 'är', 'på', 'för', 'med',
    'av', 'den', 'till', 'har', 'de', 'inte', 'om', 'ett', 'han', 'men',
    'var', 'jag', 'sig', 'från', 'vi', 'så', 'kan', 'man', 'när', 'du',
    'ut', 'över', 'efter', 'bara', 'mycket', 'nu', 'här', 'där', 'eller', 'också',
    'år', 'dag', 'tid', 'liv', 'hand', 'land', 'hus', 'stad', 'vatten', 'barn',
    'kvinna', 'man', 'arbete', 'värld', 'natt', 'ord', 'väg', 'del', 'plats', 'öga',
];

const PL = [
    'w', 'i', 'z', 'na', 'do', 'się', 'nie', 'to', 'że', 'a',
    'o', 'jak', 'po', 'ale', 'za', 'jest', 'co', 'tak', 'od', 'przez',
    'przy', 'ten', 'już', 'tylko', 'bardzo', 'gdy', 'może', 'być', 'mieć', 'ona',
    'oni', 'my', 'wy', 'ja', 'ty', 'jego', 'jej', 'nasz', 'kiedy', 'gdzie',
    'rok', 'dzień', 'czas', 'praca', 'dom', 'człowiek', 'życie', 'woda', 'miasto', 'kraj',
    'ręka', 'słowo', 'noc', 'droga', 'świat', 'część', 'miejsce', 'oko', 'dziecko', 'kobieta',
];

const TR = [
    've', 'bir', 'bu', 'için', 'ile', 'de', 'da', 'ne', 'o', 'çok',
    'daha', 'var', 'gibi', 'ama', 'her', 'sonra', 'kadar', 'en', 'ben', 'sen',
    'biz', 'siz', 'onlar', 'olarak', 'değil', 'kendi', 'zaman', 'göre', 'şey', 'yok',
    'iyi', 'büyük', 'küçük', 'yeni', 'eski', 'uzun', 'kısa', 'önce', 'şimdi', 'burada',
    'yıl', 'gün', 'insan', 'ev', 'su', 'şehir', 'ülke', 'el', 'söz', 'gece',
    'yol', 'dünya', 'yer', 'göz', 'çocuk', 'kadın', 'adam', 'iş', 'hayat', 'baba',
];

const ID = [
    'yang', 'dan', 'di', 'itu', 'dengan', 'untuk', 'tidak', 'ini', 'dari', 'dalam',
    'akan', 'pada', 'juga', 'ke', 'karena', 'ada', 'oleh', 'bisa', 'saya', 'kami',
    'mereka', 'dia', 'kita', 'sudah', 'atau', 'saat', 'lebih', 'tetapi', 'bagi', 'hanya',
    'banyak', 'besar', 'kecil', 'baru', 'lama', 'baik', 'orang', 'tahun', 'hari', 'waktu',
    'rumah', 'air', 'kota', 'negara', 'tangan', 'kata', 'malam', 'jalan', 'dunia', 'bagian',
    'tempat', 'mata', 'anak', 'perempuan', 'laki', 'kerja', 'hidup', 'nama', 'jika', 'sangat',
];

const RO = [
    'de', 'și', 'la', 'în', 'un', 'o', 'cu', 'este', 'pe', 'nu',
    'care', 'ce', 'din', 'se', 'pentru', 'că', 'sunt', 'mai', 'dar', 'sau',
    'am', 'ai', 'are', 'eu', 'tu', 'el', 'ea', 'noi', 'voi', 'ei',
    'când', 'unde', 'cum', 'foarte', 'bine', 'acum', 'aici', 'după', 'fără', 'între',
    'an', 'zi', 'timp', 'casă', 'apă', 'oraș', 'țară', 'mână', 'cuvânt', 'noapte',
    'drum', 'lume', 'parte', 'loc', 'ochi', 'copil', 'femeie', 'om', 'muncă', 'viață',
];

const DA = [
    'og', 'i', 'at', 'det', 'en', 'den', 'til', 'er', 'som', 'på',
    'de', 'med', 'han', 'af', 'for', 'ikke', 'der', 'var', 'mig', 'sig',
    'men', 'et', 'har', 'om', 'vi', 'min', 'havde', 'ham', 'hun', 'nu',
    'over', 'da', 'fra', 'du', 'ud', 'sin', 'dem', 'os', 'op', 'man',
    'år', 'dag', 'tid', 'liv', 'hånd', 'land', 'hus', 'by', 'vand', 'barn',
    'kvinde', 'mand', 'arbejde', 'verden', 'nat', 'ord', 'vej', 'del', 'sted', 'øje',
];

const CS = [
    'a', 'v', 'se', 'na', 'je', 'že', 'o', 's', 'z', 'do',
    'to', 'ale', 'i', 'za', 'po', 'jako', 'jsem', 'jsou', 'byl', 'může',
    'který', 'jeho', 'její', 'nebo', 'když', 'kde', 'jak', 'velmi', 'jen', 'už',
    'tak', 'ještě', 'také', 'nic', 'vše', 'proto', 'první', 'nový', 'dobrý', 'velký',
    'rok', 'den', 'čas', 'práce', 'dům', 'člověk', 'život', 'voda', 'město', 'země',
    'ruka', 'slovo', 'noc', 'cesta', 'svět', 'část', 'místo', 'oko', 'dítě', 'žena',
];

const FI = [
    'ja', 'on', 'ei', 'että', 'se', 'oli', 'hän', 'ovat', 'mutta', 'kuin',
    'niin', 'jos', 'kun', 'myös', 'vain', 'sitä', 'tai', 'nyt', 'vielä', 'jo',
    'tämä', 'ne', 'me', 'te', 'minä', 'sinä', 'hyvä', 'suuri', 'pieni', 'uusi',
    'vanha', 'pitkä', 'paljon', 'missä', 'mitä', 'miten', 'koska', 'ennen', 'jälkeen', 'kaikki',
    'vuosi', 'päivä', 'aika', 'talo', 'vesi', 'kaupunki', 'maa', 'käsi', 'sana', 'yö',
    'tie', 'maailma', 'osa', 'paikka', 'silmä', 'lapsi', 'nainen', 'mies', 'työ', 'elämä',
];

// Ordered by how widely they are typed, English first as the default.
const AF = [
    'die', 'en', 'van', 'is', 'in', 'het', 'nie', 'te', 'dat', 'op',
    'vir', 'met', 'was', 'sy', 'hy', 'ek', 'ons', 'jy', 'julle', 'hulle',
    'om', 'as', 'maar', 'ook', 'aan', 'by', 'uit', 'oor', 'na', 'deur',
    'kan', 'moet', 'sal', 'wil', 'weet', 'maak', 'gaan', 'kom', 'sien', 'gee',
    'baie', 'nog', 'weer', 'altyd', 'nooit', 'net', 'so', 'dan', 'toe', 'waar',
    'wat', 'wie', 'hoe', 'wanneer', 'omdat', 'sonder', 'tussen', 'onder', 'voor', 'agter',
    'jaar', 'dag', 'tyd', 'mens', 'werk', 'land', 'huis', 'stad', 'water', 'kind',
    'vrou', 'man', 'hand', 'pad', 'woord', 'lewe', 'wêreld', 'nag', 'oog', 'deel',
    'goed', 'groot', 'klein', 'nuwe', 'ou', 'lank', 'kort', 'eerste', 'plek', 'saak',
    'vriend', 'familie', 'skool', 'boek', 'môre', 'gister', 'vandag', 'mooi', 'sleg', 'help',
];

export const LANGUAGES = [
    { id: 'en', label: 'English', words: EN },
    { id: 'es', label: 'Español', words: ES },
    { id: 'fr', label: 'Français', words: FR },
    { id: 'de', label: 'Deutsch', words: DE },
    { id: 'it', label: 'Italiano', words: IT },
    { id: 'pt', label: 'Português', words: PT },
    { id: 'nl', label: 'Nederlands', words: NL },
    { id: 'sv', label: 'Svenska', words: SV },
    { id: 'da', label: 'Dansk', words: DA },
    { id: 'fi', label: 'Suomi', words: FI },
    { id: 'pl', label: 'Polski', words: PL },
    { id: 'cs', label: 'Čeština', words: CS },
    { id: 'ro', label: 'Română', words: RO },
    { id: 'tr', label: 'Türkçe', words: TR },
    { id: 'id', label: 'Bahasa Indonesia', words: ID },
    { id: 'af', label: 'Afrikaans', words: AF },
];

export function languageLabel(id) {
    return LANGUAGES.find(l => l.id === id)?.label || 'English';
}

// Falls back to English for an unknown id - a language removed from this
// file must not leave a stored setting pointing at nothing.
export function languageWords(id) {
    return (LANGUAGES.find(l => l.id === id) || LANGUAGES[0]).words;
}
