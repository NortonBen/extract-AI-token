import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:tray_manager/tray_manager.dart';
import 'package:window_manager/window_manager.dart';

import 'api_url.dart';
import 'app_state.dart';
import 'screens/dashboard_screen.dart';
import 'screens/log_screen.dart';
import 'screens/settings_screen.dart';

// ─── Design tokens ────────────────────────────────────────────────────────────

class AppColors {
  static const bg = Color(0xff0d1117);
  static const surface = Color(0xff161b22);
  static const card = Color(0xff1c2128);
  static const border = Color(0xff30363d);
  static const accent = Color(0xff10b981); // emerald-500
  static const accentDim = Color(0xff065f46);
  static const textPrimary = Color(0xffe6edf3);
  static const textSecondary = Color(0xff8b949e);
  static const error = Color(0xfff85149);
  static const warning = Color(0xffd29922);
}

// ─── Theme ────────────────────────────────────────────────────────────────────

ThemeData _buildTheme() {
  return ThemeData(
    useMaterial3: true,
    brightness: Brightness.dark,
    scaffoldBackgroundColor: AppColors.bg,
    colorScheme: const ColorScheme.dark(
      brightness: Brightness.dark,
      primary: AppColors.accent,
      onPrimary: Colors.black,
      secondary: AppColors.accent,
      onSecondary: Colors.black,
      surface: AppColors.surface,
      onSurface: AppColors.textPrimary,
      surfaceContainerLow: AppColors.card,
      surfaceContainerHighest: AppColors.border,
      outline: AppColors.border,
      outlineVariant: Color(0xff21262d),
      error: AppColors.error,
      onError: Colors.white,
    ),
    dividerColor: AppColors.border,
    cardColor: AppColors.card,
    cardTheme: const CardThemeData(
      elevation: 0,
      color: AppColors.card,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.all(Radius.circular(12)),
        side: BorderSide(color: AppColors.border),
      ),
    ),
    appBarTheme: const AppBarTheme(
      backgroundColor: AppColors.surface,
      foregroundColor: AppColors.textPrimary,
      elevation: 0,
      surfaceTintColor: Colors.transparent,
      titleTextStyle: TextStyle(
        color: AppColors.textPrimary,
        fontSize: 15,
        fontWeight: FontWeight.w600,
        letterSpacing: 0.2,
      ),
      iconTheme: IconThemeData(color: AppColors.textSecondary),
    ),
    textTheme: const TextTheme(
      displayLarge: TextStyle(color: AppColors.textPrimary),
      displayMedium: TextStyle(color: AppColors.textPrimary),
      displaySmall: TextStyle(color: AppColors.textPrimary),
      headlineLarge: TextStyle(color: AppColors.textPrimary),
      headlineMedium: TextStyle(color: AppColors.textPrimary),
      headlineSmall: TextStyle(color: AppColors.textPrimary),
      titleLarge: TextStyle(color: AppColors.textPrimary, fontWeight: FontWeight.w600),
      titleMedium: TextStyle(color: AppColors.textPrimary),
      titleSmall: TextStyle(color: AppColors.textSecondary),
      bodyLarge: TextStyle(color: AppColors.textPrimary),
      bodyMedium: TextStyle(color: AppColors.textPrimary),
      bodySmall: TextStyle(color: AppColors.textSecondary),
      labelLarge: TextStyle(color: AppColors.textPrimary, fontWeight: FontWeight.w500),
      labelMedium: TextStyle(color: AppColors.textSecondary),
      labelSmall: TextStyle(color: AppColors.textSecondary),
    ),
    iconTheme: const IconThemeData(color: AppColors.textSecondary),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: AppColors.accent,
        foregroundColor: Colors.black,
        textStyle: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: AppColors.textPrimary,
        side: const BorderSide(color: AppColors.border),
        textStyle: const TextStyle(fontWeight: FontWeight.w500, fontSize: 13),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: AppColors.bg,
      labelStyle: const TextStyle(color: AppColors.textSecondary),
      hintStyle: const TextStyle(color: AppColors.textSecondary),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: const BorderSide(color: AppColors.border),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: const BorderSide(color: AppColors.border),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: const BorderSide(color: AppColors.accent, width: 1.5),
      ),
      errorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: const BorderSide(color: AppColors.error),
      ),
      focusedErrorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: const BorderSide(color: AppColors.error, width: 1.5),
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
    ),
    snackBarTheme: SnackBarThemeData(
      backgroundColor: AppColors.card,
      contentTextStyle: const TextStyle(color: AppColors.textPrimary),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(8),
        side: const BorderSide(color: AppColors.border),
      ),
      behavior: SnackBarBehavior.floating,
    ),
    switchTheme: SwitchThemeData(
      thumbColor: WidgetStateProperty.resolveWith((states) {
        if (states.contains(WidgetState.selected)) return Colors.black;
        return AppColors.textSecondary;
      }),
      trackColor: WidgetStateProperty.resolveWith((states) {
        if (states.contains(WidgetState.selected)) return AppColors.accent;
        return AppColors.border;
      }),
    ),
    floatingActionButtonTheme: const FloatingActionButtonThemeData(
      backgroundColor: AppColors.card,
      foregroundColor: AppColors.accent,
    ),
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await windowManager.ensureInitialized();

  // Configure window before hiding.
  await windowManager.waitUntilReadyToShow(
    WindowOptions(
      title: 'Extract AI Token',
      size: const Size(760, 540),
      minimumSize: const Size(580, 420),
      center: true,
      titleBarStyle: TitleBarStyle.normal,
      backgroundColor: AppColors.bg,
    ),
  );
  // Hide window on startup — runs as background tray app.
  await windowManager.hide();
  await windowManager.setPreventClose(true);

  // Init state (loads prefs, starts backend).
  await AppState.instance.init();

  // Install tray.
  await _DesktopTray.instance.install();

  runApp(
    ChangeNotifierProvider.value(
      value: AppState.instance,
      child: const _App(),
    ),
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

class _App extends StatelessWidget {
  const _App();

  @override
  Widget build(BuildContext context) {
    // Rebuild tray whenever state changes.
    context.watch<AppState>();
    WidgetsBinding.instance.addPostFrameCallback(
      (_) => unawaited(_DesktopTray.instance.refresh()),
    );

    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'Extract AI Token',
      theme: _buildTheme(),
      darkTheme: _buildTheme(),
      themeMode: ThemeMode.dark,
      home: _Shell(key: _shellKey),
    );
  }
}

// ─── Shell (navigation) ───────────────────────────────────────────────────────

final _shellKey = GlobalKey<_ShellState>();

class _Shell extends StatefulWidget {
  const _Shell({super.key});

  @override
  State<_Shell> createState() => _ShellState();
}

class _ShellState extends State<_Shell> with WindowListener {
  int _index = 0;
  bool _sidebarExpanded = true;

  // Called by tray to navigate to a specific tab.
  // ignore: use_setters_to_change_properties
  void navigateTo(int index) => setState(() => _index = index);

  static const _pages = [
    DashboardScreen(),
    LogScreen(),
    SettingsScreen(),
  ];

  static const _navItems = [
    (Icons.dashboard_outlined, Icons.dashboard_rounded, 'Dashboard'),
    (Icons.terminal_outlined, Icons.terminal_rounded, 'Logs'),
    (Icons.settings_outlined, Icons.settings_rounded, 'Settings'),
  ];

  @override
  void initState() {
    super.initState();
    windowManager.addListener(this);
  }

  @override
  void dispose() {
    windowManager.removeListener(this);
    super.dispose();
  }

  // Keep app alive when user closes window — quit only from tray.
  @override
  void onWindowClose() async {
    await windowManager.hide();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg,
      body: Row(
        children: [
          _Sidebar(
            selectedIndex: _index,
            expanded: _sidebarExpanded,
            onSelect: (i) => setState(() => _index = i),
            onToggle: () => setState(() => _sidebarExpanded = !_sidebarExpanded),
            navItems: _navItems,
          ),
          Container(width: 1, color: AppColors.border),
          Expanded(child: _pages[_index]),
        ],
      ),
    );
  }
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

typedef _NavItem = (IconData outlinedIcon, IconData filledIcon, String label);

class _Sidebar extends StatelessWidget {
  const _Sidebar({
    required this.selectedIndex,
    required this.expanded,
    required this.onSelect,
    required this.onToggle,
    required this.navItems,
  });

  final int selectedIndex;
  final bool expanded;
  final ValueChanged<int> onSelect;
  final VoidCallback onToggle;
  final List<_NavItem> navItems;

  @override
  Widget build(BuildContext context) {
    return AnimatedContainer(
      duration: const Duration(milliseconds: 220),
      curve: Curves.easeInOut,
      width: expanded ? 180 : 64,
      color: AppColors.surface,
      child: Column(
        children: [
          // ── Logo + toggle ──────────────────────────────────────────────────
          SizedBox(
            height: 56,
            child: Row(
              children: [
                const SizedBox(width: 16),
                const Icon(Icons.memory_rounded, color: AppColors.accent, size: 24),
                if (expanded) ...[
                  const SizedBox(width: 10),
                  const Expanded(
                    child: Text(
                      'Extract AI',
                      style: TextStyle(
                        color: AppColors.textPrimary,
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 0.3,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ),
                ],
                _ToggleButton(expanded: expanded, onToggle: onToggle),
              ],
            ),
          ),
          Container(height: 1, color: AppColors.border),
          const SizedBox(height: 8),

          // ── Nav items ──────────────────────────────────────────────────────
          ...navItems.indexed.map(((int, _NavItem) entry) {
            final (i, item) = entry;
            final (outlined, filled, label) = item;
            final selected = selectedIndex == i;
            return _NavTile(
              outlinedIcon: outlined,
              filledIcon: filled,
              label: label,
              selected: selected,
              expanded: expanded,
              onTap: () => onSelect(i),
            );
          }),

          const Spacer(),

          // ── Status dot ────────────────────────────────────────────────────
          _StatusDot(expanded: expanded),
          const SizedBox(height: 12),
        ],
      ),
    );
  }
}

class _ToggleButton extends StatelessWidget {
  const _ToggleButton({required this.expanded, required this.onToggle});
  final bool expanded;
  final VoidCallback onToggle;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 40,
      height: 40,
      child: IconButton(
        icon: Icon(
          expanded ? Icons.chevron_left_rounded : Icons.chevron_right_rounded,
          size: 18,
          color: AppColors.textSecondary,
        ),
        onPressed: onToggle,
        tooltip: expanded ? 'Collapse sidebar' : 'Expand sidebar',
        style: IconButton.styleFrom(
          hoverColor: AppColors.card,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
        ),
      ),
    );
  }
}

class _NavTile extends StatelessWidget {
  const _NavTile({
    required this.outlinedIcon,
    required this.filledIcon,
    required this.label,
    required this.selected,
    required this.expanded,
    required this.onTap,
  });

  final IconData outlinedIcon;
  final IconData filledIcon;
  final String label;
  final bool selected;
  final bool expanded;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      child: Tooltip(
        message: expanded ? '' : label,
        preferBelow: false,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(8),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 180),
            height: 40,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(8),
              color: selected ? AppColors.accentDim.withValues(alpha: 0.6) : Colors.transparent,
            ),
            child: Row(
              children: [
                SizedBox(
                  width: 40,
                  child: Icon(
                    selected ? filledIcon : outlinedIcon,
                    size: 20,
                    color: selected ? AppColors.accent : AppColors.textSecondary,
                  ),
                ),
                if (expanded)
                  Expanded(
                    child: Text(
                      label,
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: selected ? FontWeight.w600 : FontWeight.w400,
                        color: selected ? AppColors.accent : AppColors.textSecondary,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _StatusDot extends StatelessWidget {
  const _StatusDot({required this.expanded});
  final bool expanded;

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final (color, label) = switch (state.status) {
      BackendStatus.starting => (AppColors.warning, 'Starting…'),
      BackendStatus.running => (AppColors.accent, 'Running'),
      BackendStatus.stopped => (AppColors.textSecondary, 'Stopped'),
      BackendStatus.failed => (AppColors.error, 'Failed'),
    };

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12),
      child: Tooltip(
        message: expanded ? '' : label,
        child: Row(
          children: [
            Container(
              width: 7,
              height: 7,
              decoration: BoxDecoration(
                color: color,
                shape: BoxShape.circle,
                boxShadow: state.status == BackendStatus.running
                    ? [BoxShadow(color: color.withValues(alpha: 0.5), blurRadius: 6)]
                    : null,
              ),
            ),
            if (expanded) ...[
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  label,
                  style: TextStyle(
                    fontSize: 11,
                    color: color,
                    fontWeight: FontWeight.w500,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

// ─── Desktop Tray ────────────────────────────────────────────────────────────

final class _TrayClickShowsMenu with TrayListener {
  @override
  void onTrayIconMouseUp() => trayManager.popUpContextMenu();

  @override
  void onTrayIconRightMouseUp() => trayManager.popUpContextMenu();
}

class _DesktopTray {
  _DesktopTray._();
  static final _DesktopTray instance = _DesktopTray._();

  final _TrayClickShowsMenu _clickMenu = _TrayClickShowsMenu();
  bool _installed = false;
  Timer? _refreshDebounce;
  bool _refreshing = false;

  Future<void> install() async {
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
        trayManager.addListener(_clickMenu);
        _installed = true;
      }
    } catch (e) {
      debugPrint('Tray install error: $e');
    }
  }

  Future<void> refresh() async {
    // Debounce: state notifications often come in bursts (start → poll →
    // running). Spamming setContextMenu during a user interaction can drop
    // an in-flight click. Coalesce updates to a single push.
    _refreshDebounce?.cancel();
    _refreshDebounce = Timer(const Duration(milliseconds: 150), () async {
      if (!_installed || _refreshing) return;
      _refreshing = true;
      try {
        await trayManager.setToolTip(_tooltip());
        await _pushMenu();
      } catch (e) {
        debugPrint('Tray refresh error: $e');
      } finally {
        _refreshing = false;
      }
    });
  }

  Future<void> dispose() async {
    if (!_installed) return;
    _refreshDebounce?.cancel();
    trayManager.removeListener(_clickMenu);
    _installed = false;
    await trayManager.destroy();
  }

  String _tooltip() {
    final s = AppState.instance;
    final label = switch (s.status) {
      BackendStatus.starting => 'starting…',
      BackendStatus.running => 'running on port ${s.port}',
      BackendStatus.stopped => 'stopped',
      BackendStatus.failed => 'failed',
    };
    return 'Extract AI Token · $label';
  }

  Future<void> _pushMenu() async {
    final s = AppState.instance;
    final running = s.status == BackendStatus.running;
    final busy = s.status == BackendStatus.starting;

    await trayManager.setContextMenu(
      Menu(
        items: [
          // Status label
          MenuItem(
            key: 'status',
            label: switch (s.status) {
              BackendStatus.starting => 'Starting…',
              BackendStatus.running => '● Running  (port ${s.port})',
              BackendStatus.stopped => '○ Stopped',
              BackendStatus.failed => '✕ Failed',
            },
            disabled: true,
          ),
          MenuItem.separator(),

          // Open windows
          MenuItem(
            key: 'open_dashboard',
            label: 'Open Dashboard',
            onClick: (_) => _openWindow(0),
          ),
          MenuItem(
            key: 'open_logs',
            label: 'Open Logs',
            onClick: (_) => _openWindow(1),
          ),
          MenuItem(
            key: 'open_settings',
            label: 'Open Settings',
            onClick: (_) => _openWindow(2),
          ),
          MenuItem.separator(),

          // Copy URL
          MenuItem(
            key: 'copy_url',
            label: 'Copy API URL',
            disabled: !running,
            onClick: (_) => _copyApiUrl(s),
          ),
          MenuItem.separator(),

          // Backend controls
          MenuItem(
            key: 'start',
            label: 'Start Backend',
            disabled: running || busy,
            onClick: (_) => _runBackendAction('start', () => s.start()),
          ),
          MenuItem(
            key: 'restart',
            label: 'Restart Backend',
            disabled: !running,
            onClick: (_) => _runBackendAction('restart', () => s.restart()),
          ),
          MenuItem(
            key: 'stop',
            label: 'Stop Backend',
            disabled: !running,
            onClick: (_) => _runBackendAction('stop', () => s.stop()),
          ),
          MenuItem.separator(),

          MenuItem(
            key: 'quit',
            label: 'Quit',
            onClick: (_) => _quitNow(s),
          ),
        ],
      ),
    );
  }

  /// Wrap a backend control action with logging + an immediate menu push so
  /// the disabled/enabled state of Start/Stop/Restart reflects reality
  /// without waiting for the 150ms debounce.
  Future<void> _runBackendAction(String label, Future<void> Function() action) async {
    debugPrint('[tray] $label backend');
    try {
      await action();
      debugPrint('[tray] $label backend ok');
    } catch (e) {
      debugPrint('[tray] $label backend failed: $e');
    } finally {
      try {
        if (_installed) {
          await trayManager.setToolTip(_tooltip());
          await _pushMenu();
        }
      } catch (_) {}
    }
  }

  Future<void> _copyApiUrl(AppState s) async {
    final url = apiV1Url(s.port);
    final ok = await copyTextToClipboard(url);
    debugPrint('[tray] copy api url → $url  (ok=$ok)');
  }

  Future<void> _quitNow(AppState s) async {
    // Hard-deadline shutdown. Whatever happens in cleanup the process MUST
    // terminate within ~1.5s — otherwise the user sees Quit "doing nothing".
    // setPreventClose is cleared up-front so nothing in the engine layer
    // blocks the exit, and cleanup is fire-and-bounded.
    try {
      await windowManager.setPreventClose(false);
    } catch (_) {}
    try {
      await Future.any<void>([
        _quitCleanup(s),
        Future<void>.delayed(const Duration(milliseconds: 1500)),
      ]);
    } catch (_) {}
    exit(0);
  }

  Future<void> _quitCleanup(AppState s) async {
    try {
      await s.stop();
    } catch (_) {}
    try {
      await dispose();
    } catch (_) {}
  }

  Future<void> _openWindow(int tabIndex) async {
    // Set the target tab early. navigateTo only calls setState; safe even
    // when the shell tree is not yet visible.
    _shellKey.currentState?.navigateTo(tabIndex);

    try {
      // Give the tray menu a moment to fully dismiss so macOS can transfer
      // focus to our window. Without this short yield, the first click often
      // brings up the menu, the second click only triggers onClick and then
      // sometimes the window only actually surfaces on the third try.
      await Future<void>.delayed(const Duration(milliseconds: 40));

      if (await windowManager.isMinimized()) {
        await windowManager.restore();
      }
      if (!await windowManager.isVisible()) {
        await windowManager.show();
      }
      await windowManager.focus();

      // macOS background-tray apps sometimes need a second activation kick
      // because NSApp isn't yet the frontmost app after the menu closes.
      if (Platform.isMacOS) {
        await Future<void>.delayed(const Duration(milliseconds: 80));
        await windowManager.show();
        await windowManager.focus();
      }

      // Ensure the requested tab is selected once the shell rebuilds.
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _shellKey.currentState?.navigateTo(tabIndex);
      });
    } catch (e) {
      debugPrint('[tray] _openWindow failed: $e');
    }
  }
}
