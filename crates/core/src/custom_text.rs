#[derive(Debug, Clone)]
pub struct CustomChunk {
    pub content: String,
    pub time: Option<f64>,
}

#[derive(Debug, Clone)]
pub struct CustomText {
    pub name: String,
    pub chunks: Vec<CustomChunk>,
    pub language: Option<String>,
    pub timed: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SynClass {
    Keyword,
    StringLit,
    Comment,
    Number,
}

fn language_for_filename(filename: &str) -> Option<&'static str> {
    let ext = filename.rsplit('.').next().unwrap_or("").to_lowercase();
    match ext.as_str() {
        "js" | "jsx" | "mjs" | "ts" | "tsx" => Some("javascript"),
        "py" => Some("python"),
        "rs" => Some("rust"),
        "c" | "h" | "cpp" | "hpp" | "cc" | "java" | "go" | "cs" => Some("clike"),
        "sh" | "bash" | "zsh" => Some("shell"),
        _ => None,
    }
}

fn keywords_for(language: &str) -> &'static [&'static str] {
    match language {
        "javascript" => &[
            "const", "let", "var", "function", "return", "if", "else", "for", "while", "class",
            "import", "export", "from", "new", "this", "async", "await", "try", "catch",
            "switch", "case", "break", "continue", "typeof", "null", "undefined", "true", "false",
        ],
        "python" => &[
            "def", "return", "if", "elif", "else", "for", "while", "class", "import", "from",
            "as", "try", "except", "with", "lambda", "None", "True", "False", "pass", "break",
            "continue", "yield", "self",
        ],
        "rust" => &[
            "fn", "let", "mut", "return", "if", "else", "for", "while", "loop", "match",
            "struct", "enum", "impl", "trait", "pub", "use", "mod", "self", "Self", "true",
            "false", "const", "static",
        ],
        "clike" => &[
            "int", "float", "double", "char", "void", "if", "else", "for", "while", "return",
            "struct", "class", "public", "private", "static", "const", "new", "true", "false",
            "null",
        ],
        "shell" => &[
            "if", "then", "else", "fi", "for", "do", "done", "while", "function", "echo",
            "export", "local",
        ],
        _ => &[],
    }
}

fn line_comment_for(language: &str) -> &'static str {
    match language {
        "javascript" | "rust" | "clike" => "//",
        "shell" | "python" => "#",
        _ => "",
    }
}

/// Per-character syntax class for the neutral (untyped) portion of a line of
/// code. Best-effort: a small hand-rolled tokenizer, not a real parser.
pub fn highlight_classes(text: &str, language: Option<&str>) -> Vec<Option<SynClass>> {
    let chars: Vec<char> = text.chars().collect();
    let mut classes = vec![None; chars.len()];
    let Some(language) = language else { return classes };
    let keywords = keywords_for(language);
    let comment_marker = line_comment_for(language);

    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];

        if c == '"' || c == '\'' || c == '`' {
            let quote = c;
            let start = i;
            i += 1;
            while i < chars.len() && chars[i] != quote {
                if chars[i] == '\\' && i + 1 < chars.len() {
                    i += 1;
                }
                i += 1;
            }
            if i < chars.len() {
                i += 1;
            }
            for j in start..i {
                classes[j] = Some(SynClass::StringLit);
            }
            continue;
        }

        if !comment_marker.is_empty() && matches_at(&chars, i, comment_marker) {
            let start = i;
            while i < chars.len() && chars[i] != '\n' {
                i += 1;
            }
            for j in start..i {
                classes[j] = Some(SynClass::Comment);
            }
            continue;
        }

        if c.is_ascii_digit() {
            let start = i;
            while i < chars.len() && (chars[i].is_ascii_digit() || chars[i] == '.') {
                i += 1;
            }
            for j in start..i {
                classes[j] = Some(SynClass::Number);
            }
            continue;
        }

        if c.is_alphabetic() || c == '_' {
            let start = i;
            while i < chars.len() && (chars[i].is_alphanumeric() || chars[i] == '_') {
                i += 1;
            }
            let word: String = chars[start..i].iter().collect();
            if keywords.contains(&word.as_str()) {
                for j in start..i {
                    classes[j] = Some(SynClass::Keyword);
                }
            }
            continue;
        }

        i += 1;
    }

    classes
}

fn matches_at(chars: &[char], pos: usize, marker: &str) -> bool {
    let marker_chars: Vec<char> = marker.chars().collect();
    if pos + marker_chars.len() > chars.len() {
        return false;
    }
    chars[pos..pos + marker_chars.len()] == marker_chars[..]
}

fn split_long(s: &str, max_len: usize) -> Vec<String> {
    if s.chars().count() <= max_len {
        return vec![s.to_string()];
    }
    let chars: Vec<char> = s.chars().collect();
    let mut parts = Vec::new();
    let mut start = 0;
    while start < chars.len() {
        let end = (start + max_len).min(chars.len());
        let slice = &chars[start..end];
        let min_cut = (max_len as f64 * 0.4) as usize;
        let last_newline = slice.iter().rposition(|&c| c == '\n');
        let last_space = slice.iter().rposition(|&c| c == ' ');
        let cut = match (last_newline, last_space) {
            (Some(n), _) if n > min_cut => n + 1,
            (_, Some(sp)) if sp > min_cut => sp + 1,
            _ => slice.len(),
        };
        parts.push(chars[start..start + cut].iter().collect::<String>());
        start += cut;
    }
    parts
}

pub fn chunk_plain_text(raw: &str) -> Vec<CustomChunk> {
    let normalized = raw.replace("\r\n", "\n");
    let trimmed = normalized.trim();
    if trimmed.is_empty() {
        return Vec::new();
    }

    let paragraphs: Vec<&str> = trimmed
        .split("\n\n")
        .map(|p| p.trim())
        .filter(|p| !p.is_empty())
        .collect();
    let source: Vec<&str> = if paragraphs.len() > 1 {
        paragraphs
    } else {
        trimmed
            .split('\n')
            .map(|l| l.trim())
            .filter(|l| !l.is_empty())
            .collect()
    };

    let mut chunks = Vec::new();
    for block in source {
        for piece in split_long(block, 400) {
            let piece = piece.trim();
            if !piece.is_empty() {
                chunks.push(CustomChunk { content: piece.to_string(), time: None });
            }
        }
    }
    chunks
}

fn time_to_seconds(s: &str) -> Option<f64> {
    let normalized = s.replace(',', ".");
    let parts: Vec<&str> = normalized.split(':').collect();
    let nums: Result<Vec<f64>, _> = parts.iter().map(|p| p.parse::<f64>()).collect();
    let nums = nums.ok()?;
    match nums.len() {
        3 => Some(nums[0] * 3600.0 + nums[1] * 60.0 + nums[2]),
        2 => Some(nums[0] * 60.0 + nums[1]),
        1 => Some(nums[0]),
        _ => None,
    }
}

fn parse_srt(raw: &str) -> Vec<CustomChunk> {
    let normalized = raw.replace("\r\n", "\n");
    let mut chunks = Vec::new();
    for block in normalized.trim().split("\n\n") {
        let lines: Vec<&str> = block.lines().filter(|l| !l.is_empty()).collect();
        if lines.is_empty() {
            continue;
        }
        let mut idx = 0;
        if lines[idx].trim().chars().all(|c| c.is_ascii_digit()) {
            idx += 1;
        }
        let mut time = None;
        if idx < lines.len() && lines[idx].contains("-->") {
            if let Some(start) = lines[idx].split("-->").next() {
                time = time_to_seconds(start.trim());
            }
            idx += 1;
        }
        let text = lines[idx..].join(" ");
        let text = strip_tags(&text);
        if !text.trim().is_empty() {
            chunks.push(CustomChunk { content: text.trim().to_string(), time });
        }
    }
    chunks
}

fn parse_vtt(raw: &str) -> Vec<CustomChunk> {
    let normalized = raw.replace("\r\n", "\n");
    let body = normalized.trim();
    let body = body.strip_prefix("WEBVTT").map(|s| s.trim_start()).unwrap_or(body);
    let mut chunks = Vec::new();
    for block in body.split("\n\n") {
        let lines: Vec<&str> = block.lines().filter(|l| !l.is_empty()).collect();
        if lines.is_empty() {
            continue;
        }
        let mut idx = 0;
        if !lines[idx].contains("-->") {
            idx += 1;
        }
        let mut time = None;
        if idx < lines.len() && lines[idx].contains("-->") {
            if let Some(start) = lines[idx].split("-->").next() {
                time = time_to_seconds(start.trim());
            }
            idx += 1;
        }
        if idx > lines.len() {
            continue;
        }
        let text = lines[idx.min(lines.len())..].join(" ");
        let text = strip_tags(&text);
        if !text.trim().is_empty() {
            chunks.push(CustomChunk { content: text.trim().to_string(), time });
        }
    }
    chunks
}

fn parse_lrc(raw: &str) -> Vec<CustomChunk> {
    let normalized = raw.replace("\r\n", "\n");
    let mut chunks = Vec::new();
    for line in normalized.lines() {
        let line = line.trim();
        if !line.starts_with('[') {
            continue;
        }
        let mut rest = line;
        let mut first_time = None;
        while let Some(close) = rest.find(']') {
            if !rest.starts_with('[') {
                break;
            }
            let stamp = &rest[1..close];
            if stamp.len() >= 5 && stamp.chars().next().unwrap().is_ascii_digit() {
                if first_time.is_none() {
                    first_time = time_to_seconds(stamp);
                }
                rest = &rest[close + 1..];
            } else {
                break;
            }
        }
        let text = rest.trim();
        if !text.is_empty() {
            chunks.push(CustomChunk { content: text.to_string(), time: first_time });
        }
    }
    chunks
}

fn strip_tags(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut in_tag = false;
    for c in s.chars() {
        match c {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => out.push(c),
            _ => {}
        }
    }
    out
}

pub fn parse_custom_content(raw: &str, filename: &str) -> CustomText {
    let ext = filename.rsplit('.').next().unwrap_or("").to_lowercase();
    let name = filename.to_string();
    match ext.as_str() {
        "srt" => CustomText { name, chunks: parse_srt(raw), language: None, timed: true },
        "vtt" => CustomText { name, chunks: parse_vtt(raw), language: None, timed: true },
        "lrc" => CustomText { name, chunks: parse_lrc(raw), language: None, timed: true },
        _ => {
            let language = language_for_filename(filename).map(|s| s.to_string());
            CustomText { name, chunks: chunk_plain_text(raw), language, timed: false }
        }
    }
}
