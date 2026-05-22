import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'log_format.dart';

const _kPortKey = 'backend_port';
const _kPublicBindKey = 'backend_public_bind';
/// Giữ ít dòng để giảm RAM (ListView + Text widgets).
const _kMaxLogLines = 200;
const _kMaxLogLineChars = 480;
const _kHealthInterval = Duration(seconds: 20);
const _kDashboardInterval = Duration(seconds: 12);

// ─── BackendStatus ────────────────────────────────────────────────────────────

enum BackendStatus { starting, running, stopped, failed }

// ─── DashboardData ────────────────────────────────────────────────────────────

class DashboardData {
  const DashboardData({
    required this.accountCount,
    required this.enabledAccountCount,
    required this.busyCount,
    required this.historyCount,
  });

  final int accountCount;
  final int enabledAccountCount;
  final int busyCount;
  final int historyCount;

  @override
  bool operator ==(Object other) {
    return other is DashboardData &&
        accountCount == other.accountCount &&
        enabledAccountCount == other.enabledAccountCount &&
        busyCount == other.busyCount &&
        historyCount == other.historyCount;
  }

  @override
  int get hashCode => Object.hash(
        accountCount,
        enabledAccountCount,
        busyCount,
        historyCount,
      );
}

// ─── AppState ─────────────────────────────────────────────────────────────────

class AppState extends ChangeNotifier {
  AppState._();

  static final AppState instance = AppState._();

  // Settings
  int port = 9516;
  bool publicBind = false;

  // Runtime
  BackendStatus status = BackendStatus.stopped;
  String? errorMessage;
  DashboardData? dashboard;
  final List<String> logs = [];

  final _BackendLauncher _launcher = _BackendLauncher();
  final http.Client _http = http.Client();
  Timer? _healthTimer;
  Timer? _dashboardTimer;
  Timer? _logNotifyDebounce;

  /// 0=Dashboard, 1=Logs, 2=Settings — dùng để giảm poll/rebuild khi không xem tab.
  int activeTab = 0;

  // ── Initialise (load prefs, start) ──────────────────────────────────────────

  Future<void> init() async {
    final prefs = await SharedPreferences.getInstance();
    port = prefs.getInt(_kPortKey) ?? 9516;
    publicBind = prefs.getBool(_kPublicBindKey) ?? false;
    _launcher._onLog = _addLog;
    await start();
  }

  // ── Public actions ───────────────────────────────────────────────────────────

  Future<void> start() async {
    if (status == BackendStatus.starting) return;
    _setStatus(BackendStatus.starting);
    _log('--- Starting backend on port $port ---');
    try {
      await _launcher.start(port: port, publicBind: publicBind);
      await _waitForHealth();
      _startTimers();
    } catch (e) {
      _log('ERROR: $e');
      _setStatus(BackendStatus.failed, error: e.toString());
    }
  }

  Future<void> stop() async {
    _healthTimer?.cancel();
    _dashboardTimer?.cancel();
    await _launcher.stop();
    _setStatus(BackendStatus.stopped);
    dashboard = null;
  }

  Future<void> restart() async {
    await stop();
    await start();
  }

  Future<void> applySettings({required int newPort, required bool newPublicBind}) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setInt(_kPortKey, newPort);
    await prefs.setBool(_kPublicBindKey, newPublicBind);
    port = newPort;
    publicBind = newPublicBind;
    notifyListeners();
    await restart();
  }

  void clearLogs() {
    logs.clear();
    notifyListeners();
  }

  void setActiveTab(int index) {
    if (activeTab == index) return;
    activeTab = index;
    _syncPollingTimers();
    if (index == 1) {
      _logNotifyDebounce?.cancel();
      notifyListeners();
    }
  }

  // ── Internals ────────────────────────────────────────────────────────────────

  /// Gọi khi [status] đổi — refresh tray (old app không refresh mỗi log/poll).
  static void Function()? onTrayRefresh;

  void _setStatus(BackendStatus s, {String? error}) {
    status = s;
    errorMessage = error;
    notifyListeners();
    onTrayRefresh?.call();
    if (s == BackendStatus.running) {
      _syncPollingTimers();
    } else {
      _dashboardTimer?.cancel();
      _dashboardTimer = null;
    }
  }

  void _addLog(String line) {
    var clean = stripAnsiEscapes(line);
    if (clean.isEmpty) return;
    if (clean.length > _kMaxLogLineChars) {
      clean = '${clean.substring(0, _kMaxLogLineChars)}…';
    }
    logs.add(clean);
    if (logs.length > _kMaxLogLines) logs.removeAt(0);
    if (activeTab == 1) {
      _scheduleLogNotify();
    }
  }

  void _scheduleLogNotify() {
    _logNotifyDebounce?.cancel();
    _logNotifyDebounce = Timer(const Duration(milliseconds: 200), () {
      notifyListeners();
    });
  }

  void _log(String msg) => _addLog(msg);

  Future<void> _waitForHealth() async {
    final deadline = DateTime.now().add(const Duration(seconds: 30));
    Object? last;
    while (DateTime.now().isBefore(deadline)) {
      try {
        await _ping();
        _setStatus(BackendStatus.running);
        return;
      } catch (e) {
        last = e;
        await Future<void>.delayed(const Duration(milliseconds: 300));
      }
    }
    throw Exception('Backend not healthy after 30s: $last');
  }

  Future<void> _ping() async {
    final res = await _http
        .get(Uri.parse('http://127.0.0.1:$port/health'))
        .timeout(const Duration(seconds: 2));
    if (res.statusCode != 200) throw Exception('status ${res.statusCode}');
  }

  void _startTimers() {
    _healthTimer?.cancel();
    _healthTimer = Timer.periodic(_kHealthInterval, (_) => _refreshHealth());
    _syncPollingTimers();
  }

  void _syncPollingTimers() {
    _dashboardTimer?.cancel();
    _dashboardTimer = null;
    if (status == BackendStatus.running && activeTab == 0) {
      unawaited(_refreshDashboard());
      _dashboardTimer = Timer.periodic(_kDashboardInterval, (_) => _refreshDashboard());
    }
  }

  Future<void> _refreshHealth() async {
    try {
      await _ping();
      if (status != BackendStatus.running) _setStatus(BackendStatus.running);
    } catch (_) {
      if (status == BackendStatus.running) _setStatus(BackendStatus.failed);
    }
  }

  Future<void> _refreshDashboard() async {
    if (status != BackendStatus.running || activeTab != 0) return;
    try {
      final res = await _http
          .get(Uri.parse('http://127.0.0.1:$port/v1/dashboard'))
          .timeout(const Duration(seconds: 2));
      if (res.statusCode == 200) {
        final j = jsonDecode(res.body) as Map<String, dynamic>;
        final next = DashboardData(
          accountCount: (j['account_count'] as num?)?.toInt() ?? 0,
          enabledAccountCount: (j['enabled_account_count'] as num?)?.toInt() ?? 0,
          busyCount: (j['busy_count'] as num?)?.toInt() ?? 0,
          historyCount: (j['history_count'] as num?)?.toInt() ?? 0,
        );
        if (dashboard == next) return;
        dashboard = next;
        notifyListeners();
      }
    } catch (_) {}
  }
}

// ─── BackendLauncher ─────────────────────────────────────────────────────────

class _BackendLauncher {
  Process? _process;
  void Function(String)? _onLog;

  Future<void> start({required int port, required bool publicBind}) async {
    await stop();
    final binary = await _resolveBinary();
    final dbPath = await _resolveSqlitePath();
    await File(dbPath).parent.create(recursive: true);

    final addr = publicBind ? '0.0.0.0:$port' : '127.0.0.1:$port';
    _process = await Process.start(
      binary,
      const [],
      environment: {
        ...Platform.environment,
        'NO_COLOR': '1',
        'APP_ADDR': addr,
        'SQLITE_PATH': dbPath,
        // Ít log HTTP trace → ít dòng đẩy vào UI Flutter.
        'RUST_LOG': Platform.environment['RUST_LOG'] ?? 'info,tab_debug=info,tower_http=warn,hyper=warn',
      },
      mode: ProcessStartMode.normal,
    );

    final child = _process!;

    child.stdout
        .transform(utf8.decoder)
        .transform(const LineSplitter())
        .listen((line) => _onLog?.call(line));

    child.stderr
        .transform(utf8.decoder)
        .transform(const LineSplitter())
        .listen((line) => _onLog?.call(line));

    unawaited(child.exitCode.then((code) {
      if (_process == child) {
        _process = null;
        _onLog?.call('--- Backend exited (code $code) ---');
      }
    }));
  }

  Future<void> stop() async {
    final proc = _process;
    _process = null;
    if (proc == null) return;
    if (Platform.isWindows) {
      try {
        await Process.run('taskkill', ['/PID', '${proc.pid}', '/F']);
      } catch (_) {}
    } else {
      proc.kill(ProcessSignal.sigterm);
      try {
        await proc.exitCode.timeout(const Duration(seconds: 3));
      } catch (_) {
        proc.kill(ProcessSignal.sigkill);
      }
    }
  }

  Future<String> _resolveSqlitePath() async {
    final support = await getApplicationSupportDirectory();
    return p.join(support.path, 'extract-ai-token', 'app.db');
  }

  Future<String> _resolveBinary() async {
    final env = Platform.environment['AI_BROWSER_BACKEND_BIN']?.trim() ?? '';
    if (env.isNotEmpty && File(env).existsSync()) return env;

    final bundled = _bundledBinary();
    if (bundled != null && File(bundled).existsSync()) return bundled;

    final repo = _findRepoRoot();
    if (repo != null) {
      for (final name in _devBinaryNames()) {
        final dev = p.join(repo, 'build', name);
        if (File(dev).existsSync()) return dev;
      }
    }

    throw Exception(
      'Backend binary not found. Build: cargo build --release\n'
      'Copy to build/${_devBinaryNames().first} or set AI_BROWSER_BACKEND_BIN.',
    );
  }

  List<String> _devBinaryNames() {
    if (Platform.isMacOS) return ['macos-backend'];
    if (Platform.isWindows) return ['windows-backend.exe', 'windows-backend'];
    if (Platform.isLinux) return ['linux-backend'];
    return ['backend'];
  }

  String? _bundledBinary() {
    try {
      final exeDir = File(Platform.resolvedExecutable).parent.path;
      if (Platform.isMacOS) {
        final res = p.join(File(Platform.resolvedExecutable).parent.parent.path, 'Resources');
        final bin = p.join(res, 'backend');
        if (File(bin).existsSync()) return bin;
      } else if (Platform.isWindows) {
        final bin = p.join(exeDir, 'backend.exe');
        if (File(bin).existsSync()) return bin;
      } else if (Platform.isLinux) {
        final bin = p.join(exeDir, 'backend');
        if (File(bin).existsSync()) return bin;
      }
    } catch (_) {}
    return null;
  }

  String? _findRepoRoot() {
    final starts = <String>[Directory.current.path];
    try {
      starts.add(File(Platform.resolvedExecutable).parent.path);
    } catch (_) {}
    for (final start in starts) {
      var dir = start;
      for (var i = 0; i < 12; i++) {
        if (File(p.join(dir, 'backend', 'Cargo.toml')).existsSync()) return dir;
        final parent = p.dirname(dir);
        if (parent == dir) break;
        dir = parent;
      }
    }
    return null;
  }
}
