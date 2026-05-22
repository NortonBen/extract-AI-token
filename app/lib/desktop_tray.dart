import 'dart:async';
import 'dart:io' show Platform, exit;

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:tray_manager/tray_manager.dart';
import 'package:window_manager/window_manager.dart';

import 'api_url.dart';
import 'app_state.dart';

/// tray_manager trên macOS không gán NSStatusItem.menu trong setContextMenu;
/// phải popUpContextMenu khi click icon (giống old/ai-browser-token/app).
final class _TrayClickShowsMenu with TrayListener {
  @override
  void onTrayIconMouseUp() => trayManager.popUpContextMenu();

  @override
  void onTrayIconRightMouseUp() => trayManager.popUpContextMenu();
}

/// Menu bar tray — logic aligned with old/ai-browser-token/app/lib/macos_tray.dart.
class DesktopTray {
  DesktopTray._();

  static final DesktopTray instance = DesktopTray._();

  final _TrayClickShowsMenu _clickMenu = _TrayClickShowsMenu();
  bool _installed = false;

  Future<void> install() async {
    if (kIsWeb) return;
    if (!Platform.isMacOS && !Platform.isWindows && !Platform.isLinux) return;
    try {
      final iconPath =
          Platform.isWindows ? 'assets/tray_icon.ico' : 'assets/tray_icon.png';
      await trayManager.setIcon(
        iconPath,
        isTemplate: Platform.isMacOS,
        iconSize: 22,
      );
      await trayManager.setToolTip(_tooltip());
      await _pushMenu();
      if (!_installed) {
        if (Platform.isMacOS) {
          trayManager.addListener(_clickMenu);
        }
        _installed = true;
      }
    } catch (e, st) {
      debugPrint('DesktopTray.install: $e\n$st');
    }
  }

  /// Direct refresh (no debounce) — same as old MacosTray.refresh.
  Future<void> refresh() async {
    if (!_installed) return;
    try {
      await trayManager.setToolTip(_tooltip());
      await _pushMenu();
    } catch (e, st) {
      debugPrint('DesktopTray.refresh: $e\n$st');
    }
  }

  Future<void> dispose() async {
    if (!_installed) return;
    if (Platform.isMacOS) {
      trayManager.removeListener(_clickMenu);
    }
    _installed = false;
    await trayManager.destroy();
  }

  String _tooltip() {
    final s = AppState.instance;
    final port = s.port;
    if (s.status == BackendStatus.starting) {
      return 'Extract AI Token · port $port · starting…';
    }
    if (s.status == BackendStatus.running) {
      return 'Extract AI Token · port $port · backend running';
    }
    if (s.status == BackendStatus.failed) {
      return 'Extract AI Token · port $port · failed';
    }
    return 'Extract AI Token · port $port · backend stopped';
  }

  Future<void> _pushMenu() async {
    final s = AppState.instance;
    final port = s.port;
    final running = s.status == BackendStatus.running;
    final busy = s.status == BackendStatus.starting;

    await trayManager.setContextMenu(
      Menu(
        items: [
          MenuItem(
            key: 'status',
            label: switch (s.status) {
              BackendStatus.starting => 'Starting… (port $port)',
              BackendStatus.running => '● Running (port $port)',
              BackendStatus.stopped => '○ Stopped (port $port)',
              BackendStatus.failed => '✕ Failed (port $port)',
            },
            disabled: true,
          ),
          MenuItem.separator(),
          MenuItem(
            key: 'show',
            label: 'Open Window',
            onClick: (_) async {
              await windowManager.show();
              await windowManager.focus();
            },
          ),
          MenuItem.separator(),
          MenuItem(
            key: 'copy_url',
            label: 'Copy API URL',
            disabled: busy,
            onClick: (_) async {
              await Clipboard.setData(ClipboardData(text: apiV1Url(port)));
            },
          ),
          MenuItem.separator(),
          MenuItem(
            key: 'start',
            label: 'Start Backend',
            disabled: busy || running,
            onClick: (_) {
              unawaited(s.start());
            },
          ),
          MenuItem(
            key: 'restart',
            label: 'Restart Backend',
            disabled: busy || !running,
            onClick: (_) {
              unawaited(s.restart());
            },
          ),
          MenuItem(
            key: 'stop',
            label: 'Stop Backend',
            disabled: busy || !running,
            onClick: (_) {
              unawaited(s.stop());
            },
          ),
          MenuItem.separator(),
          MenuItem(
            key: 'quit',
            label: 'Quit',
            onClick: (_) => exit(0),
          ),
        ],
      ),
    );
  }
}
