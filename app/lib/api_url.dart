import 'dart:io';

import 'package:flutter/services.dart';

/// OpenAI SDK `baseURL` — local backend root including `/v1`.
String apiV1Url(int port) => 'http://127.0.0.1:$port/v1';

/// Copy text to the system clipboard. On macOS/Linux desktop, Flutter's
/// [Clipboard] API often fails silently without focus; native tools are tried first.
Future<bool> copyTextToClipboard(String text) async {
  if (Platform.isMacOS) {
    if (await _macPbcopy(text)) return true;
  }
  if (Platform.isLinux) {
    if (await _linuxClipboard(text)) return true;
  }
  try {
    await Clipboard.setData(ClipboardData(text: text));
    return true;
  } catch (_) {
    return false;
  }
}

Future<bool> _macPbcopy(String text) async {
  try {
    final proc = await Process.start('pbcopy', const []);
    proc.stdin.write(text);
    await proc.stdin.close();
    final code = await proc.exitCode.timeout(const Duration(seconds: 2));
    return code == 0;
  } catch (_) {
    return false;
  }
}

Future<bool> _linuxClipboard(String text) async {
  for (final cmd in const [
    ['wl-copy'],
    ['xclip', '-selection', 'clipboard'],
    ['xsel', '--clipboard', '--input'],
  ]) {
    try {
      final proc = await Process.start(cmd.first, cmd.sublist(1));
      proc.stdin.write(text);
      await proc.stdin.close();
      final code = await proc.exitCode.timeout(const Duration(seconds: 2));
      if (code == 0) return true;
    } catch (_) {}
  }
  return false;
}
