use serde::{Deserialize, Deserializer, Serialize};
use serde_json::Value;

// ── OpenAI tool types ─────────────────────────────────────────────────────────

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ToolFunction {
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub parameters: Option<Value>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ToolDefinition {
    #[serde(rename = "type", default = "default_tool_type")]
    pub tool_type: String,
    pub function: ToolFunction,
}

fn default_tool_type() -> String {
    "function".to_string()
}

#[derive(Debug, Clone, Serialize)]
pub struct ToolCall {
    pub id: String,
    #[serde(rename = "type")]
    pub call_type: String,
    pub function: ToolCallFunction,
}

#[derive(Debug, Clone, Serialize)]
pub struct ToolCallFunction {
    pub name: String,
    pub arguments: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    #[serde(default, deserialize_with = "deserialize_message_content")]
    pub content: String,
    #[serde(default, deserialize_with = "deserialize_tool_calls")]
    pub tool_calls: Vec<ToolCall>,
    #[serde(default)]
    pub tool_call_id: Option<String>,
}

// ── Message content (string | null | multipart array) ─────────────────────────

pub fn deserialize_message_content<'de, D>(deserializer: D) -> Result<String, D::Error>
where
    D: Deserializer<'de>,
{
    let value = Value::deserialize(deserializer)?;
    Ok(message_content_to_string(&value))
}

pub fn message_content_to_string(value: &Value) -> String {
    match value {
        Value::String(s) => s.clone(),
        Value::Null => String::new(),
        Value::Array(parts) => parts
            .iter()
            .filter_map(|part| {
                part.get("text")
                    .and_then(|x| x.as_str())
                    .map(|x| x.to_string())
            })
            .collect::<Vec<_>>()
            .join("\n"),
        Value::Object(obj) => obj
            .get("text")
            .and_then(|x| x.as_str())
            .unwrap_or_default()
            .to_string(),
        _ => String::new(),
    }
}

fn deserialize_tool_calls<'de, D>(deserializer: D) -> Result<Vec<ToolCall>, D::Error>
where
    D: Deserializer<'de>,
{
    let value = Option::<Value>::deserialize(deserializer)?;
    let Some(value) = value else {
        return Ok(Vec::new());
    };
    if value.is_null() {
        return Ok(Vec::new());
    }
    let Some(raw_calls) = value.as_array() else {
        return Ok(Vec::new());
    };
    let mut out = Vec::new();
    for (i, item) in raw_calls.iter().enumerate() {
        let name = item
            .get("function")
            .and_then(|f| f.get("name"))
            .and_then(|n| n.as_str())
            .unwrap_or_default()
            .trim()
            .to_string();
        if name.is_empty() {
            continue;
        }
        let args_raw = item
            .get("function")
            .and_then(|f| f.get("arguments"))
            .cloned()
            .unwrap_or(Value::Object(Default::default()));
        let args = normalize_function_arguments_value(&args_raw)
            .unwrap_or_else(|| "{}".to_string());
        let id = item
            .get("id")
            .and_then(|x| x.as_str())
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string())
            .unwrap_or_else(|| format!("call_local_{:03}", i + 1));
        let call_type = item
            .get("type")
            .and_then(|x| x.as_str())
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string())
            .unwrap_or_else(|| "function".to_string());
        out.push(ToolCall {
            id,
            call_type,
            function: ToolCallFunction { name, arguments: args },
        });
    }
    Ok(out)
}

// ── Prompt building (ported from ai-browser-token playwright_runner) ──────────

pub fn build_prompt(messages: &[ChatMessage], tools: &[ToolDefinition]) -> String {
    let mut system = String::new();
    let mut turns: Vec<String> = Vec::new();
    let mut has_tool_result = false;

    for m in messages {
        match m.role.as_str() {
            "system" if system.trim().is_empty() => {
                system = m.content.trim().to_string();
            }
            "user" => {
                turns.push(format!("[USER]\n{}", m.content.trim()));
            }
            "assistant" => {
                let content = m.content.trim();
                if !content.is_empty() {
                    turns.push(format!("[ASSISTANT]\n{content}"));
                }
                if !m.tool_calls.is_empty() {
                    let lines: Vec<String> = m
                        .tool_calls
                        .iter()
                        .map(|tc| {
                            let args = if tc.function.arguments.trim().is_empty() {
                                "{}".to_string()
                            } else {
                                tc.function.arguments.clone()
                            };
                            format!(
                                "- id={} name={} args={}",
                                tc.id, tc.function.name, args
                            )
                        })
                        .collect();
                    turns.push(format!("[ASSISTANT_TOOL_CALLS]\n{}", lines.join("\n")));
                }
            }
            "tool" => {
                has_tool_result = true;
                let tool_text = if m.content.trim().is_empty() {
                    "{}".to_string()
                } else {
                    m.content.trim().to_string()
                };
                let tid = m.tool_call_id.as_deref().unwrap_or("").trim();
                turns.push(format!("[TOOL_RESULT id={tid}]\n{tool_text}"));
            }
            _ => {
                let body = m.content.trim();
                if !body.is_empty() {
                    turns.push(format!("[{}]\n{body}", m.role.to_uppercase()));
                }
            }
        }
    }

    if turns.is_empty() {
        turns.push("[USER]\nXin hãy trả lời.".to_string());
    }

    let mut prompt = turns.join("\n\n");
    if !system.is_empty() {
        prompt = format!("[SYSTEM INSTRUCTION]\n{system}\n[/SYSTEM INSTRUCTION]\n\n{prompt}");
    }

    if !tools.is_empty() {
        prompt.push_str("\n\n[TOOLS]\n");
        prompt.push_str(&render_tools_for_prompt(tools));
        prompt.push_str(
            "\n[/TOOLS]\n\n\
            Nếu cần gọi tool, chỉ trả về JSON object theo format theo chuẩn OpenAI API:\n\
            {\"tool_calls\": [ { \"id\": \"call_abc\", \"type\": \"function\", \"function\": { \"name\": \"<tool_name>\", \"arguments\": \"{\\\"<arg1>\\\":\\\"<value>\\\"}\" } } ]}\n\
            Không thêm markdown/code fence/giải thích.",
        );
        if has_tool_result {
            prompt.push_str(
                "\n\nBạn đã có TOOL_RESULT trong hội thoại. \
                Hãy ưu tiên trả lời cuối cùng cho người dùng dựa trên TOOL_RESULT. \
                Chỉ gọi tool lại nếu thực sự thiếu dữ liệu để trả lời.",
            );
        }
    }

    prompt
}

fn render_tools_for_prompt(tools: &[ToolDefinition]) -> String {
    let mut lines: Vec<String> = Vec::new();
    for t in tools {
        let name = t.function.name.trim();
        if name.is_empty() {
            continue;
        }
        let desc = t
            .function
            .description
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or("N/A");
        let params = t
            .function
            .parameters
            .as_ref()
            .and_then(|p| serde_json::to_string(p).ok())
            .unwrap_or_else(|| "{}".to_string());
        lines.push(format!("- {name}: {desc} | parameters={params}"));
    }
    lines.sort();
    if lines.is_empty() {
        "Không có tool khả dụng.".to_string()
    } else {
        lines.join("\n")
    }
}

// ── Extract tool_calls from assistant text ────────────────────────────────────

/// Try every salvage strategy (plain JSON, markdown fences, embedded blobs).
pub fn resolve_tool_calls(text: &str, defs: &[ToolDefinition]) -> Vec<ToolCall> {
    for candidate in collect_parse_candidates(text) {
        let repaired = repair_unescaped_arguments_json(&candidate);
        for variant in [&candidate, &repaired] {
            let calls = extract_tool_calls_from_text(variant, defs);
            if !calls.is_empty() {
                return calls;
            }
            // Model may use a different name (e.g. ToolSearch vs search_browser_tool).
            let any_name = extract_tool_calls_any_name(variant);
            if !any_name.is_empty() {
                return align_tool_names(any_name, defs);
            }
        }
    }
    Vec::new()
}

/// Like [resolve_tool_calls], but if the payload looks like tool JSON and strict names fail,
/// accept any function name and align to request `tools` when possible.
pub fn resolve_tool_calls_relaxed(text: &str, defs: &[ToolDefinition]) -> Vec<ToolCall> {
    let calls = resolve_tool_calls(text, defs);
    if !calls.is_empty() || !looks_like_tool_calls_json(text) {
        return calls;
    }
    let any = resolve_tool_calls(text, &[]);
    if any.is_empty() {
        return any;
    }
    align_tool_names(any, defs)
}

/// Gemini often returns invalid JSON: `"arguments": "{"query":"x"}"` (inner quotes not escaped).
pub fn repair_unescaped_arguments_json(input: &str) -> String {
    const KEY: &str = "\"arguments\"";
    let mut result = input.to_string();
    let mut search = 0usize;
    while let Some(rel) = result[search..].find(KEY) {
        let key_pos = search + rel;
        let mut i = key_pos + KEY.len();
        let bytes = result.as_bytes();
        while i < bytes.len() && bytes[i].is_ascii_whitespace() {
            i += 1;
        }
        if i < bytes.len() && bytes[i] == b':' {
            i += 1;
            while i < bytes.len() && bytes[i].is_ascii_whitespace() {
                i += 1;
            }
        }
        if i + 1 < bytes.len() && bytes[i] == b'"' && bytes[i + 1] == b'{' {
            let obj_start = i + 1;
            let Some((inner, consumed)) = extract_brace_object(&result[obj_start..]) else {
                search = key_pos + 1;
                continue;
            };
            let Ok(quoted) = serde_json::to_string(inner) else {
                search = key_pos + 1;
                continue;
            };
            let mut end = obj_start + consumed;
            if end < bytes.len() && bytes[end] == b'"' {
                end += 1;
            }
            let colon_pos = result[key_pos..end]
                .find(':')
                .map(|p| key_pos + p)
                .unwrap_or(key_pos + KEY.len());
            result.replace_range(colon_pos..end, &format!(": {quoted}"));
            search = colon_pos + quoted.len() + 2;
            continue;
        }
        search = key_pos + 1;
    }
    result
}

fn extract_brace_object(s: &str) -> Option<(&str, usize)> {
    if !s.starts_with('{') {
        return None;
    }
    let bytes = s.as_bytes();
    let mut depth = 0i32;
    for (offset, &b) in bytes.iter().enumerate() {
        match b {
            b'{' => depth += 1,
            b'}' => {
                depth -= 1;
                if depth == 0 {
                    return Some((&s[..=offset], offset + 1));
                }
            }
            _ => {}
        }
    }
    None
}

fn extract_tool_calls_any_name(text: &str) -> Vec<ToolCall> {
    extract_tool_calls_with_filter(text, |_| true)
}

fn align_tool_names(mut calls: Vec<ToolCall>, defs: &[ToolDefinition]) -> Vec<ToolCall> {
    if defs.is_empty() {
        return calls;
    }
    for tc in &mut calls {
        let model_name = tc.function.name.trim();
        if defs.iter().any(|d| d.function.name.trim() == model_name) {
            continue;
        }
        if let Some(found) = defs
            .iter()
            .find(|d| d.function.name.trim().eq_ignore_ascii_case(model_name))
        {
            tc.function.name = found.function.name.trim().to_string();
            continue;
        }
        if defs.len() == 1 {
            tc.function.name = defs[0].function.name.trim().to_string();
        }
    }
    calls
}

pub fn looks_like_tool_calls_json(text: &str) -> bool {
    let stripped = strip_code_fence(text);
    stripped.contains("\"tool_calls\"")
}

pub fn extract_tool_calls_from_text(text: &str, defs: &[ToolDefinition]) -> Vec<ToolCall> {
    let allowed: std::collections::HashSet<String> = defs
        .iter()
        .map(|d| d.function.name.trim().to_string())
        .filter(|n| !n.is_empty())
        .collect();
    let filter_by_name = !allowed.is_empty();
    extract_tool_calls_with_filter(text, |name| {
        let name = name.trim();
        if name.is_empty() {
            return false;
        }
        !filter_by_name || allowed.contains(name)
    })
}

fn extract_tool_calls_with_filter(
    text: &str,
    accepts: impl Fn(&str) -> bool + Copy,
) -> Vec<ToolCall> {
    let text = text.trim();
    if text.is_empty() {
        return Vec::new();
    }
    let Ok(parsed) = serde_json::from_str::<Value>(text) else {
        return Vec::new();
    };
    parse_value_for_tool_calls(&parsed, accepts)
}

fn parse_value_for_tool_calls(
    parsed: &Value,
    accepts: impl Fn(&str) -> bool + Copy,
) -> Vec<ToolCall> {
    // Form 1: {"name": "...", "arguments": ...}
    if let Some(name) = parsed.get("name").and_then(|x| x.as_str()) {
        if !name.trim().is_empty() {
            if let Some(args) = parsed.get("arguments") {
                if let Some(tc) = try_build_tool_call(name, args, 0, accepts) {
                    return vec![tc];
                }
            }
        }
    }

    // Form 2: single OpenAI tool_call object
    if let Some(func) = parsed.get("function") {
        if let Some(name) = func.get("name").and_then(|x| x.as_str()) {
            if accepts(name) {
                if let Some(args) = func.get("arguments") {
                    if let Some(mut tc) = try_build_tool_call(name, args, 0, accepts) {
                        apply_tool_call_meta(&mut tc, parsed);
                        return vec![tc];
                    }
                }
            }
        }
    }

    // Form 3: {"tool_calls": [...]}
    if let Some(arr) = parsed.get("tool_calls").and_then(|x| x.as_array()) {
        if let Some(out) = tool_calls_from_array(arr, accepts) {
            return out;
        }
    }

    // Form 4: top-level array of tool_call objects
    if let Value::Array(arr) = parsed {
        if let Some(out) = tool_calls_from_array(arr, accepts) {
            return out;
        }
    }

    Vec::new()
}

fn tool_calls_from_array(
    arr: &[Value],
    accepts: impl Fn(&str) -> bool + Copy,
) -> Option<Vec<ToolCall>> {
    let mut out = Vec::new();
    for (i, item) in arr.iter().enumerate() {
        let name = item
            .get("function")
            .and_then(|f| f.get("name"))
            .and_then(|n| n.as_str())
            .unwrap_or_default();
        if !accepts(name) {
            continue;
        }
        let args = item
            .get("function")
            .and_then(|f| f.get("arguments"))
            .cloned()
            .unwrap_or(Value::Null);
        if let Some(mut tc) = try_build_tool_call(name, &args, i, accepts) {
            apply_tool_call_meta(&mut tc, item);
            out.push(tc);
        }
    }
    if out.is_empty() {
        None
    } else {
        Some(out)
    }
}

fn apply_tool_call_meta(tc: &mut ToolCall, obj: &Value) {
    if let Some(id) = obj.get("id").and_then(|x| x.as_str()) {
        if !id.is_empty() {
            tc.id = id.to_string();
        }
    }
    if let Some(typ) = obj.get("type").and_then(|x| x.as_str()) {
        if !typ.is_empty() {
            tc.call_type = typ.to_string();
        }
    }
}

fn collect_parse_candidates(text: &str) -> Vec<String> {
    let mut seen = std::collections::HashSet::new();
    let mut out = Vec::new();
    let mut push = |s: String| {
        let t = s.trim().to_string();
        if t.is_empty() || !seen.insert(t.clone()) {
            return;
        }
        out.push(t);
    };

    push(text.to_string());
    push(strip_code_fence(text));
    push(strip_all_code_fences(text));

    if let Some(blob) = extract_balanced_json(text) {
        push(blob);
    }
    for fenced in extract_fenced_json_blocks(text) {
        push(fenced);
    }
    if text.contains("\"tool_calls\"") {
        if let Some(pos) = text.find("\"tool_calls\"") {
            if let Some(start) = text[..pos].rfind('{') {
                if let Some(blob) = extract_balanced_json(&text[start..]) {
                    push(blob);
                }
            }
        }
    }

    out
}

fn extract_balanced_json(s: &str) -> Option<String> {
    let start = s.find('{')?;
    let bytes = s.as_bytes();
    let mut depth = 0i32;
    for (offset, &b) in bytes.iter().enumerate().skip(start) {
        match b {
            b'{' => depth += 1,
            b'}' => {
                depth -= 1;
                if depth == 0 {
                    return Some(s[start..=offset].to_string());
                }
            }
            _ => {}
        }
    }
    None
}

fn extract_fenced_json_blocks(text: &str) -> Vec<String> {
    let mut blocks = Vec::new();
    let mut rest = text;
    while let Some(start) = rest.find("```") {
        let after_tick = &rest[start + 3..];
        let content_start = after_tick
            .find('\n')
            .map(|i| start + 3 + i + 1)
            .unwrap_or(start + 3);
        if content_start >= rest.len() {
            break;
        }
        if let Some(end_rel) = rest[content_start..].find("```") {
            let inner = rest[content_start..content_start + end_rel].trim();
            if !inner.is_empty() {
                blocks.push(inner.to_string());
            }
            rest = &rest[content_start + end_rel + 3..];
        } else {
            break;
        }
    }
    blocks
}

fn strip_all_code_fences(text: &str) -> String {
    let mut result = String::new();
    let mut rest = text;
    while let Some(start) = rest.find("```") {
        result.push_str(&rest[..start]);
        let after_tick = &rest[start + 3..];
        let content_start = after_tick
            .find('\n')
            .map(|i| start + 3 + i + 1)
            .unwrap_or(start + 3);
        if content_start >= rest.len() {
            break;
        }
        if let Some(end_rel) = rest[content_start..].find("```") {
            let inner = rest[content_start..content_start + end_rel].trim();
            if !inner.is_empty() {
                if !result.is_empty() && !result.ends_with('\n') {
                    result.push('\n');
                }
                result.push_str(inner);
                result.push('\n');
            }
            rest = &rest[content_start + end_rel + 3..];
        } else {
            break;
        }
    }
    result.push_str(rest);
    result.trim().to_string()
}

fn try_build_tool_call(
    name: &str,
    raw_args: &Value,
    index: usize,
    accepts: impl Fn(&str) -> bool,
) -> Option<ToolCall> {
    if !accepts(name) {
        return None;
    }
    let args = normalize_function_arguments_value(raw_args)?;
    Some(ToolCall {
        id: format!("call_local_{:03}", index + 1),
        call_type: "function".to_string(),
        function: ToolCallFunction {
            name: name.trim().to_string(),
            arguments: args,
        },
    })
}

fn normalize_function_arguments_value(raw: &Value) -> Option<String> {
    match raw {
        Value::Null => Some("{}".to_string()),
        Value::String(s) => {
            let inner = s.trim();
            if inner.is_empty() {
                return Some("{}".to_string());
            }
            if serde_json::from_str::<Value>(inner).is_ok() {
                return Some(inner.to_string());
            }
            if inner.starts_with('{') {
                if let Some((obj, _)) = extract_brace_object(inner) {
                    if serde_json::from_str::<Value>(obj).is_ok() {
                        return Some(obj.to_string());
                    }
                }
            }
            serde_json::to_string(&serde_json::json!({ "input": inner })).ok()
        }
        Value::Object(_) | Value::Array(_) => serde_json::to_string(raw).ok(),
        _ => serde_json::to_string(raw).ok(),
    }
}

fn strip_code_fence(text: &str) -> String {
    if !text.starts_with("```") {
        return text.to_string();
    }
    let Some((_, rest)) = text.split_once('\n') else {
        return text.to_string();
    };
    if let Some(idx) = rest.rfind("```") {
        rest[..idx].trim().to_string()
    } else {
        text.to_string()
    }
}

/// OpenAI `chat.completion` assistant message when returning tool calls.
pub fn openai_tool_message(tool_calls: &[ToolCall]) -> Value {
    serde_json::json!({
        "role": "assistant",
        "content": null,
        "tool_calls": openai_tool_calls_array(tool_calls)
    })
}

pub fn openai_tool_calls_array(tool_calls: &[ToolCall]) -> Value {
    Value::Array(
        tool_calls
            .iter()
            .map(|tc| {
                serde_json::json!({
                    "id": tc.id,
                    "type": tc.call_type,
                    "function": {
                        "name": tc.function.name,
                        "arguments": tc.function.arguments
                    }
                })
            })
            .collect(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn build_prompt_with_tools() {
        let messages = vec![ChatMessage {
            role: "user".to_string(),
            content: "What is 2+2?".to_string(),
            tool_calls: vec![],
            tool_call_id: None,
        }];
        let tools = vec![ToolDefinition {
            tool_type: "function".to_string(),
            function: ToolFunction {
                name: "calculator".to_string(),
                description: Some("Do math".to_string()),
                parameters: Some(json!({"type": "object"})),
            },
        }];
        let p = build_prompt(&messages, &tools);
        assert!(p.contains("[TOOLS]"));
        assert!(p.contains("calculator"));
    }

    #[test]
    fn extract_tool_calls_wrapped() {
        let text = r#"{"tool_calls":[{"id":"call_1","type":"function","function":{"name":"get_weather","arguments":"{\"city\":\"Hanoi\"}"}}]}"#;
        let defs = vec![ToolDefinition {
            tool_type: "function".to_string(),
            function: ToolFunction {
                name: "get_weather".to_string(),
                description: None,
                parameters: None,
            },
        }];
        let tcs = extract_tool_calls_from_text(text, &defs);
        assert_eq!(tcs.len(), 1);
        assert_eq!(tcs[0].function.name, "get_weather");
    }

    #[test]
    fn repair_gemini_malformed_arguments() {
        let broken = r#"{"tool_calls": [ { "id": "call_search_browser_tool", "type": "function", "function": { "name": "ToolSearch", "arguments": "{"query":"browser search"}" } } ]}"#;
        assert!(serde_json::from_str::<Value>(broken).is_err());
        let fixed = repair_unescaped_arguments_json(broken);
        assert!(serde_json::from_str::<Value>(&fixed).is_ok());
        let defs = vec![ToolDefinition {
            tool_type: "function".to_string(),
            function: ToolFunction {
                name: "ToolSearch".to_string(),
                description: None,
                parameters: None,
            },
        }];
        let tcs = resolve_tool_calls(broken, &defs);
        assert_eq!(tcs.len(), 1);
        assert_eq!(tcs[0].id, "call_search_browser_tool");
        assert_eq!(tcs[0].function.name, "ToolSearch");
        assert!(tcs[0].function.arguments.contains("browser search"));
    }

    #[test]
    fn align_single_tool_definition_name() {
        let broken = r#"{"tool_calls":[{"id":"call_1","type":"function","function":{"name":"ToolSearch","arguments":"{"q":"1"}"}}]}"#;
        let defs = vec![ToolDefinition {
            tool_type: "function".to_string(),
            function: ToolFunction {
                name: "search_browser_tool".to_string(),
                description: None,
                parameters: None,
            },
        }];
        let tcs = resolve_tool_calls(broken, &defs);
        assert_eq!(tcs.len(), 1);
        assert_eq!(tcs[0].function.name, "search_browser_tool");
    }

    #[test]
    fn extract_tool_calls_with_preamble() {
        let text = "Sure, let me check.\n\n```json\n{\"tool_calls\":[{\"id\":\"call_1\",\"type\":\"function\",\"function\":{\"name\":\"get_weather\",\"arguments\":\"{\\\"city\\\":\\\"Hanoi\\\"}\"}}]}\n```";
        let defs = vec![ToolDefinition {
            tool_type: "function".to_string(),
            function: ToolFunction {
                name: "get_weather".to_string(),
                description: None,
                parameters: None,
            },
        }];
        let tcs = resolve_tool_calls(text, &defs);
        assert_eq!(tcs.len(), 1);
        assert_eq!(tcs[0].function.name, "get_weather");
        assert!(tcs[0].function.arguments.contains("Hanoi"));
    }

    #[test]
    fn openai_tool_message_shape() {
        let tcs = vec![ToolCall {
            id: "call_1".to_string(),
            call_type: "function".to_string(),
            function: ToolCallFunction {
                name: "get_weather".to_string(),
                arguments: r#"{"city":"Hanoi"}"#.to_string(),
            },
        }];
        let msg = openai_tool_message(&tcs);
        assert_eq!(msg["role"], "assistant");
        assert!(msg["content"].is_null());
        assert_eq!(msg["tool_calls"][0]["type"], "function");
        assert!(msg["tool_calls"][0]["function"]["arguments"].is_string());
    }

    #[test]
    fn extract_tool_calls_object_arguments() {
        let text = r#"{"tool_calls":[{"id":"call_1","type":"function","function":{"name":"get_weather","arguments":{"city":"Hanoi"}}}]}"#;
        let defs = vec![ToolDefinition {
            tool_type: "function".to_string(),
            function: ToolFunction {
                name: "get_weather".to_string(),
                description: None,
                parameters: None,
            },
        }];
        let tcs = extract_tool_calls_from_text(text, &defs);
        assert_eq!(tcs.len(), 1);
        assert!(tcs[0].function.arguments.contains("Hanoi"));
    }
}
