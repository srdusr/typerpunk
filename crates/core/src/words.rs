use rand::Rng;

const COMMON_WORDS: &[&str] = &[
    "the", "be", "to", "of", "and", "a", "in", "that", "have", "it",
    "for", "not", "on", "with", "he", "as", "you", "do", "at", "this",
    "but", "his", "by", "from", "they", "we", "say", "her", "she", "or",
    "an", "will", "my", "one", "all", "would", "there", "their", "what", "so",
    "up", "out", "if", "about", "who", "get", "which", "go", "me", "when",
    "make", "can", "like", "time", "no", "just", "him", "know", "take", "people",
    "into", "year", "your", "good", "some", "could", "them", "see", "other", "than",
    "then", "now", "look", "only", "come", "its", "over", "think", "also", "back",
    "after", "use", "two", "how", "our", "work", "first", "well", "way", "even",
    "new", "want", "because", "any", "these", "give", "day", "most", "us", "water",
    "long", "find", "here", "thing", "place", "hand", "part", "child", "eye", "life",
    "world", "school", "state", "family", "student", "group", "country", "problem", "fact", "month",
    "right", "study", "book", "word", "business", "issue", "side", "kind", "head", "house",
    "service", "friend", "father", "power", "hour", "game", "line", "end", "member", "law",
    "car", "city", "community", "name", "president", "team", "minute", "idea", "body", "information",
    "parent", "face", "others", "level", "office", "door", "health", "person", "art", "war",
    "history", "party", "result", "change", "morning", "reason", "research", "girl", "guy", "moment",
    "air", "teacher", "force", "education", "foot", "boy", "age", "policy", "process", "music",
    "market", "sense", "nation", "plan", "college", "interest", "death", "experience", "effect", "model",
];

/// Builds a random passage of the given word count: a flat stream of common
/// words with no fixed meaning, used for count-based practice instead of a
/// memorized quote. `numbers` occasionally swaps a word for a random number;
/// `punctuation` breaks the stream into capitalized, comma- and
/// period-punctuated "sentences" - mirrors web/src/wordGenerator.js.
pub fn generate_words(count: usize, punctuation: bool, numbers: bool) -> String {
    let mut rng = rand::thread_rng();
    let mut words: Vec<String> = Vec::with_capacity(count);
    let mut since_comma = 0i32;
    let mut since_sentence_start = 0i32;

    for i in 0..count {
        let mut word = if numbers && rng.gen_bool(0.12) {
            rng.gen_range(0..1000).to_string()
        } else {
            COMMON_WORDS[rng.gen_range(0..COMMON_WORDS.len())].to_string()
        };

        if punctuation {
            if since_sentence_start == 0 {
                word = capitalize(&word);
            }
            since_comma += 1;
            since_sentence_start += 1;

            let at_end = i == count - 1;
            if at_end {
                word.push('.');
            } else if since_sentence_start >= 6 && rng.gen_bool(0.15) {
                word.push('.');
                since_sentence_start = 0;
            } else if since_comma >= 4 && rng.gen_bool(0.2) {
                word.push(',');
                since_comma = 0;
            }
        }

        words.push(word);
    }
    words.join(" ")
}

fn capitalize(word: &str) -> String {
    let mut chars = word.chars();
    match chars.next() {
        Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
        None => String::new(),
    }
}

/// For time-based mode the buffer has to outlast the timer regardless of how
/// fast the typist is. 6 words/sec (360 WPM) is well past the sustained
/// world-record typing speed (~216 WPM), so this is generous headroom rather
/// than a tight fit.
pub fn word_count_for_duration(seconds: u64) -> usize {
    ((seconds * 6) as usize).max(20)
}
