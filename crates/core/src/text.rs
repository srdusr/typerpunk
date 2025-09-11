use std::fmt;

#[derive(Debug, Clone)]
pub struct Text {
    pub content: String,
    pub source: String,
    pub language: String,
    pub category: String,
}

impl Text {
    pub fn new() -> Self {
        Self {
            content: String::new(),
            source: String::new(),
            language: String::new(),
            category: String::new(),
        }
    }

    pub fn from_str(content: &str) -> Self {
        Self {
            content: content.to_string(),
            source: String::new(),
            language: String::new(),
            category: String::new(),
        }
    }

    pub fn from_str_with_source(content: &str, source: &str) -> Self {
        Self {
            content: content.to_string(),
            source: source.to_string(),
            language: String::new(),
            category: String::new(),
        }
    }

    pub fn from_str_with_language(content: &str, language: &str) -> Self {
        Self {
            content: content.to_string(),
            source: String::new(),
            language: language.to_string(),
            category: String::new(),
        }
    }

    pub fn from_str_with_source_and_language(content: &str, source: &str, language: &str) -> Self {
        Self {
            content: content.to_string(),
            source: source.to_string(),
            language: language.to_string(),
            category: String::new(),
        }
    }

    pub fn from_all(content: &str, source: &str, language: &str, category: &str) -> Self {
        Self {
            content: content.to_string(),
            source: source.to_string(),
            language: language.to_string(),
            category: category.to_string(),
        }
    }
}

impl fmt::Display for Text {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.content)
    }
}
 