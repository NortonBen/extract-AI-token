import 'dart:io';

/// Rust API server binary bundled with the desktop app (distinct from CLI `extract-ai-token`).
const String kBackendBinaryBase = 'extract-ai-token-backend';

String backendBinaryFileName() =>
    Platform.isWindows ? '$kBackendBinaryBase.exe' : kBackendBinaryBase;

/// Dev / CI artifact under `<repo>/build/`.
String devBackendBuildArtifact() {
  if (Platform.isMacOS) return 'macos-$kBackendBinaryBase';
  if (Platform.isWindows) return 'windows-$kBackendBinaryBase.exe';
  if (Platform.isLinux) return 'linux-$kBackendBinaryBase';
  return kBackendBinaryBase;
}
