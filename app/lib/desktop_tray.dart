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
      return 'Extract AI Token · cổng $port · đang khởi động…';
    }
    if (s.status == BackendStatus.running) {
      return 'Extract AI Token · cổng $port · backend đang chạy';
    }
    if (s.status == BackendStatus.failed) {
      return 'Extract AI Token · cổng $port · lỗi';
    }
    return 'Extract AI Token · cổng $port · backend đã dừng';
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
              BackendStatus.starting => 'Đang khởi động… (cổng $port)',
              BackendStatus.running => '● Đang chạy (cổng $port)',
              BackendStatus.stopped => '○ Đã dừng (cổng $port)',
              BackendStatus.failed => '✕ Lỗi (cổng $port)',
            },
            disabled: true,
          ),
          MenuItem.separator(),
          MenuItem(
            key: 'show',
            label: 'Mở cửa sổ',
            onClick: (_) async {
              await windowManager.show();
              await windowManager.focus();
            },
          ),
          MenuItem.separator(),
          MenuItem(
            key: 'copy_url',
            label: 'Sao chép địa chỉ API',
            disabled: busy,
            onClick: (_) async {
              await Clipboard.setData(ClipboardData(text: apiV1Url(port)));
            },
          ),
          MenuItem.separator(),
          MenuItem(
            key: 'start',
            label: 'Khởi động backend',
            disabled: busy || running,
            onClick: (_) {
              unawaited(s.start());
            },
          ),
          MenuItem(
            key: 'restart',
            label: 'Khởi động lại backend',
            disabled: busy || !running,
            onClick: (_) {
              unawaited(s.restart());
            },
          ),
          MenuItem(
            key: 'stop',
            label: 'Dừng backend',
            disabled: busy || !running,
            onClick: (_) {
              unawaited(s.stop());
            },
          ),
          MenuItem.separator(),
          MenuItem(
            key: 'quit',
            label: 'Thoát ứng dụng',
            onClick: (_) => exit(0),
          ),
        ],
      ),
    );
  }
}
