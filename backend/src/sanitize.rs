//! Cleans browser-extracted model output (ported from ai-browser-token `output_sanitize.go`).

use crate::tools::looks_like_tool_calls_json;

/// Normalize UTF-8, unwrap JSON code fences when appropriate, convert HTML → markdown-like text.
pub fn sanitize_model_output(s: &str) -> String {
    let mut s = s.to_string();
    s = trim_artifacts(s);

    if looks_like_html(&s) {
        s = html_to_markdown_like_text(&s);
    }

    // Do not short-circuit on tool-call JSON — callers parse tools from raw text first.
    if s.is_empty() {
        return s;
    }
    if looks_like_tool_calls_json(&s) {
        return s;
    }
    if serde_json::from_str::<serde_json::Value>(&s).is_ok() {
        return s;
    }

    extract_json_blob(&s).unwrap_or(s)
}

fn trim_artifacts(mut val: String) -> String {
    loop {
        let start = val.clone();
        val = val.trim().to_string();
        val = val.trim_matches(|c| "\\\"' \n\r\t".contains(c)).to_string();
        if let Some(inner) = unwrap_json_code_fence(&val) {
            val = inner;
        }
        if val == start {
            break;
        }
    }
    val
}

fn unwrap_json_code_fence(s: &str) -> Option<String> {
    let s = s.trim();
    if !s.starts_with("```") || !s.ends_with("```") {
        return None;
    }
    let first_newline = s.find('\n')?;
    let inner = s[first_newline + 1..s.len().saturating_sub(3)].trim();
    if inner.is_empty() {
        return None;
    }
    if serde_json::from_str::<serde_json::Value>(inner).is_ok()
        || inner.starts_with('{')
        || inner.starts_with('[')
    {
        return Some(inner.to_string());
    }
    None
}

fn looks_like_html(s: &str) -> bool {
    let lower = s.to_lowercase();
    ["<div", "<p", "<ul", "<li", "<h1", "<h2", "<h3"]
        .iter()
        .any(|tag| lower.contains(tag))
}

fn html_to_markdown_like_text(s: &str) -> String {
    let mut out = s
        .replace("<br>", "\n")
        .replace("<br/>", "\n")
        .replace("<br />", "\n")
        .replace("</p>", "\n\n")
        .replace("</li>", "\n")
        .replace("<li>", "- ")
        .replace("<hr>", "\n---\n")
        .replace("<hr/>", "\n---\n")
        .replace("<hr />", "\n---\n")
        .replace("</code>", "`")
        .replace("<code>", "`")
        .replace("</b>", "**")
        .replace("<b>", "**")
        .replace("</strong>", "**")
        .replace("<strong>", "**");

    out = replace_heading_tags(&out);
    out = strip_html_tags(&out);
    out = html_unescape(&out);
    out = out.replace("\r\n", "\n").replace('\r', "\n");

    while out.contains("\n\n\n") {
        out = out.replace("\n\n\n", "\n\n");
    }
    out.trim().to_string()
}

fn replace_heading_tags(s: &str) -> String {
    let mut out = String::new();
    let mut rest = s;
    while let Some(start) = rest.to_lowercase().find("<h") {
        out.push_str(&rest[..start]);
        let tail = &rest[start..];
        let Some(end_tag) = tail.find('>') else {
            out.push_str(tail);
            return out;
        };
        let after_open = &tail[end_tag + 1..];
        let close = after_open.to_lowercase().find("</h");
        if let Some(close_rel) = close {
            let inner = &after_open[..close_rel];
            let close_end = after_open[close_rel..]
                .find('>')
                .map(|i| close_rel + i + 1)
                .unwrap_or(close_rel);
            out.push_str("\n### ");
            out.push_str(&strip_html_tags(inner));
            out.push('\n');
            rest = &after_open[close_end..];
        } else {
            out.push_str(&rest[start..start + 1]);
            rest = &rest[start + 1..];
        }
    }
    out.push_str(rest);
    out
}

fn strip_html_tags(s: &str) -> String {
    let mut out = String::new();
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

fn html_unescape(s: &str) -> String {
    s.replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&apos;", "'")
}

fn extract_json_blob(s: &str) -> Option<String> {
    let first_brace = s.find('{');
    let first_bracket = s.find('[');
    let start_pos = match (first_brace, first_bracket) {
        (Some(b), Some(k)) => Some(b.min(k)),
        (Some(b), None) => Some(b),
        (None, Some(k)) => Some(k),
        (None, None) => return None,
    }?;
    let last_brace = s.rfind('}');
    let last_bracket = s.rfind(']');
    let end_pos = match (last_brace, last_bracket) {
        (Some(b), Some(k)) => Some(b.max(k)),
        (Some(b), None) => Some(b),
        (None, Some(k)) => Some(k),
        (None, None) => return None,
    }?;
    if end_pos <= start_pos {
        return None;
    }
    let candidate = &s[start_pos..=end_pos];
    if serde_json::from_str::<serde_json::Value>(candidate).is_ok() {
        Some(candidate.to_string())
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unwrap_json_fence() {
        assert_eq!(
            sanitize_model_output("```json\n{\"id\": 1}\n```"),
            "{\"id\": 1}"
        );
    }

    #[test]
    fn keep_markdown_fence() {
        let input = "```md\n# Tieu de\n- item 1\n```";
        assert_eq!(sanitize_model_output(input), input);
    }

    #[test]
    fn html_to_markdown() {
        let input = "<div><p>Xin chao <b>ban</b></p><hr><h3>Thong tin</h3><ul><li>Ma: <code>TXN-1</code></li><li>Trang thai: <b>Success</b></li></ul></div>";
        let got = sanitize_model_output(input);
        assert!(got.contains("**ban**"));
        assert!(got.contains("### Thong tin"));
        assert!(got.contains("`TXN-1`"));
        assert!(!got.contains("<div"));
    }
}
