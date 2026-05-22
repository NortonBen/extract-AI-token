/// Strips ANSI color / style escape sequences from backend (tracing) output.
final RegExp _ansiEscape = RegExp(
  r'\x1B\[[0-9;]*[a-zA-Z]|\x1B\][^\x07]*\x07',
);

String stripAnsiEscapes(String line) => line.replaceAll(_ansiEscape, '').trimRight();
