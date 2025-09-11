use crate::text::Text;

#[test]
fn test_text_creation() {
    let content = "Hello, world!";
    let text = Text::new(content);
    assert_eq!(text.content(), content);
    assert_eq!(text.words().len(), 2);
}

#[test]
fn test_text_word_count() {
    let text = Text::new("Hello world! This is a test.");
    assert_eq!(text.words().len(), 6);
}

#[test]
fn test_text_empty() {
    let text = Text::new("");
    assert_eq!(text.content(), "");
    assert_eq!(text.words().len(), 0);
}

#[test]
fn test_text_with_special_chars() {
    let text = Text::new("Hello, world! This is a test...");
    assert_eq!(text.words().len(), 7);
    assert_eq!(text.content(), "Hello, world! This is a test...");
}

#[test]
fn test_text_word_boundaries() {
    let text = Text::new("Hello-world! This_is_a_test.");
    assert_eq!(text.words().len(), 4);
}

#[test]
fn test_text_multiple_spaces() {
    let text = Text::new("Hello    world!    This   is   a   test.");
    assert_eq!(text.words().len(), 6);
}

#[test]
fn test_text_with_numbers() {
    let text = Text::new("Hello 123 world! 456 test.");
    assert_eq!(text.words().len(), 4);
}

#[test]
fn test_text_with_punctuation() {
    let text = Text::new("Hello, world! This is a test...");
    assert_eq!(text.words().len(), 7);
}

#[test]
fn test_text_with_mixed_case() {
    let text = Text::new("Hello WORLD! This IS a TEST.");
    assert_eq!(text.words().len(), 6);
}

#[test]
fn test_text_with_unicode() {
    let text = Text::new("Hello 世界! This is a テスト.");
    assert_eq!(text.words().len(), 6);
}

#[test]
fn test_text_with_emojis() {
    let text = Text::new("Hello 👋 world! This is a test 🎯.");
    assert_eq!(text.words().len(), 7);
}

#[test]
fn test_text_with_tabs() {
    let text = Text::new("Hello\tworld!\tThis\tis\ta\ttest.");
    assert_eq!(text.words().len(), 6);
}

#[test]
fn test_text_with_newlines() {
    let text = Text::new("Hello\nworld!\nThis\nis\na\ntest.");
    assert_eq!(text.words().len(), 6);
} 