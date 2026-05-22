import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../app_state.dart';
import '../log_format.dart';
import '../main.dart';

class LogScreen extends StatefulWidget {
  const LogScreen({super.key});

  @override
  State<LogScreen> createState() => _LogScreenState();
}

class _LogScreenState extends State<LogScreen> {
  final ScrollController _scroll = ScrollController();
  bool _autoScroll = true;

  @override
  void initState() {
    super.initState();
    _scroll.addListener(_onScroll);
  }

  @override
  void dispose() {
    _scroll.removeListener(_onScroll);
    _scroll.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (!_scroll.hasClients) return;
    final atBottom = _scroll.offset >= _scroll.position.maxScrollExtent - 40;
    if (_autoScroll != atBottom) setState(() => _autoScroll = atBottom);
  }

  void _scrollToBottom() {
    if (!_scroll.hasClients) return;
    _scroll.animateTo(
      _scroll.position.maxScrollExtent,
      duration: const Duration(milliseconds: 250),
      curve: Curves.easeOut,
    );
  }

  @override
  Widget build(BuildContext context) {
    final running = context.select<AppState, bool>(
      (s) => s.status == BackendStatus.running,
    );

    return Scaffold(
      backgroundColor: const Color(0xff0d1117),
      appBar: AppBar(
        backgroundColor: AppColors.surface,
        title: Row(
          children: [
            const Text('Logs'),
            const SizedBox(width: 10),
            Selector<AppState, int>(
              selector: (_, s) => s.logs.length,
              builder: (_, count, child) => Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(
                  color: AppColors.card,
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: AppColors.border),
                ),
                child: Text(
                  '$count',
                  style: const TextStyle(
                    fontSize: 11,
                    color: AppColors.textSecondary,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ),
            ),
          ],
        ),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(1),
          child: Container(height: 1, color: AppColors.border),
        ),
        actions: [
          Selector<AppState, List<String>>(
            selector: (_, s) => s.logs,
            builder: (context, logs, _) => Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                IconButton(
                  tooltip: 'Copy all logs',
                  icon: const Icon(Icons.copy_rounded, size: 18),
                  style: IconButton.styleFrom(
                    hoverColor: AppColors.card,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                  ),
                  onPressed: logs.isEmpty
                      ? null
                      : () {
                          Clipboard.setData(ClipboardData(text: logs.join('\n')));
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(
                              content: Text('Logs copied'),
                              width: 180,
                              duration: Duration(seconds: 2),
                            ),
                          );
                        },
                ),
                IconButton(
                  tooltip: 'Clear logs',
                  icon: const Icon(Icons.delete_sweep_rounded, size: 18),
                  style: IconButton.styleFrom(
                    hoverColor: AppColors.card,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                  ),
                  onPressed: logs.isEmpty
                      ? null
                      : context.read<AppState>().clearLogs,
                ),
                const SizedBox(width: 4),
              ],
            ),
          ),
        ],
      ),
      body: Selector<AppState, List<String>>(
        selector: (_, s) => s.logs,
        builder: (context, logs, _) {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (_autoScroll && _scroll.hasClients && logs.isNotEmpty) {
              _scroll.jumpTo(_scroll.position.maxScrollExtent);
            }
          });
          if (logs.isEmpty) {
            return _EmptyLogs(running: running);
          }
          return ListView.builder(
            controller: _scroll,
            padding: const EdgeInsets.symmetric(horizontal: 0, vertical: 8),
            itemCount: logs.length,
            cacheExtent: 240,
            itemBuilder: (context, i) => _LogLine(line: logs[i], index: i),
          );
        },
      ),
      floatingActionButton: _autoScroll
          ? null
          : FloatingActionButton.small(
              tooltip: 'Scroll to bottom',
              backgroundColor: AppColors.card,
              foregroundColor: AppColors.accent,
              elevation: 2,
              onPressed: () {
                setState(() => _autoScroll = true);
                _scrollToBottom();
              },
              child: const Icon(Icons.arrow_downward_rounded, size: 18),
            ),
    );
  }
}

// ── Empty state ───────────────────────────────────────────────────────────────

class _EmptyLogs extends StatelessWidget {
  const _EmptyLogs({required this.running});
  final bool running;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 56,
            height: 56,
            decoration: BoxDecoration(
              color: AppColors.card,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: AppColors.border),
            ),
            child: const Icon(Icons.terminal_rounded, size: 26, color: AppColors.textSecondary),
          ),
          const SizedBox(height: 16),
          const Text(
            'No logs yet',
            style: TextStyle(
              color: AppColors.textSecondary,
              fontSize: 14,
              fontWeight: FontWeight.w500,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            running ? 'Logs will appear when backend is active' : 'Start the backend to see logs',
            style: const TextStyle(color: Color(0xff484f58), fontSize: 12),
          ),
        ],
      ),
    );
  }
}

// ── Log line ──────────────────────────────────────────────────────────────────

class _LogLine extends StatelessWidget {
  const _LogLine({required this.line, required this.index});
  final String line;
  final int index;

  static final _levelRe = RegExp(r'\b(ERROR|WARN|INFO|DEBUG|TRACE)\b', caseSensitive: false);

  Color _lineColor(String text) {
    final l = text.toLowerCase();
    if (l.contains('error') || l.startsWith('err ')) return const Color(0xfff85149);
    if (l.contains('warn')) return const Color(0xffd29922);
    if (l.contains('---') || l.contains('listening') || l.contains('started')) {
      return const Color(0xff10b981);
    }
    return const Color(0xffc9d1d9);
  }

  String? _extractLevel(String text) {
    final m = _levelRe.firstMatch(text);
    return m?.group(0)?.toUpperCase();
  }

  Color _levelColor(String level) {
    return switch (level) {
      'ERROR' => const Color(0xfff85149),
      'WARN' => const Color(0xffd29922),
      'INFO' => const Color(0xff10b981),
      'DEBUG' => const Color(0xff58a6ff),
      _ => const Color(0xff8b949e),
    };
  }

  @override
  Widget build(BuildContext context) {
    final text = stripAnsiEscapes(line);
    final color = _lineColor(text);
    final level = _extractLevel(text);

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 1),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Line number
          SizedBox(
            width: 36,
            child: Text(
              '${index + 1}',
              style: const TextStyle(
                fontFamily: 'monospace',
                fontSize: 11,
                color: Color(0xff3d444d),
                height: 1.6,
              ),
              textAlign: TextAlign.right,
            ),
          ),
          const SizedBox(width: 12),
          // Level badge
          if (level != null) ...[
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
              decoration: BoxDecoration(
                color: _levelColor(level).withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(4),
              ),
              child: Text(
                level,
                style: TextStyle(
                  fontFamily: 'monospace',
                  fontSize: 10,
                  fontWeight: FontWeight.w700,
                  color: _levelColor(level),
                  height: 1.6,
                ),
              ),
            ),
            const SizedBox(width: 6),
          ],
          // Log text
          Expanded(
            child: Text(
              text,
              style: TextStyle(
                fontFamily: 'monospace',
                fontSize: 12,
                height: 1.6,
                color: color,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
