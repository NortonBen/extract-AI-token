//! Token estimates (ported from old/ai-browser-token handlers/token_usage.go).

use crate::tools::{ToolCall, ToolDefinition};

pub fn estimate_text_tokens(text: &str) -> i64 {
    let text = text.trim();
    if text.is_empty() {
        return 0;
    }
    let word_based = text.split_whitespace().count() as i64;
    let rune_based = (text.chars().count() as i64 + 3) / 4;
    word_based.max(rune_based)
}

pub fn estimate_prompt_tokens(prompt: &str, tools: &[ToolDefinition]) -> i64 {
    let mut total = estimate_text_tokens(prompt);
    for t in tools {
        total += estimate_text_tokens(t.function.name.trim());
        if let Some(desc) = &t.function.description {
            total += estimate_text_tokens(desc);
        }
        if let Some(params) = &t.function.parameters {
            if let Ok(s) = serde_json::to_string(params) {
                total += estimate_text_tokens(&s);
            }
        }
    }
    total
}

pub fn estimate_output_tokens(text: &str, tool_calls: &[ToolCall]) -> i64 {
    let mut total = estimate_text_tokens(text);
    for tc in tool_calls {
        total += estimate_text_tokens(&tc.function.name);
        total += estimate_text_tokens(&tc.function.arguments);
    }
    total
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn estimate_nonempty() {
        assert!(estimate_text_tokens("hello world") >= 2);
    }

    #[test]
    fn estimate_empty() {
        assert_eq!(estimate_text_tokens("   "), 0);
    }
}
