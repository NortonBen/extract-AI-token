import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../app_state.dart';
import '../main.dart';

class DashboardScreen extends StatelessWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();

    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(
        backgroundColor: AppColors.surface,
        title: const Text('Dashboard'),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(1),
          child: Container(height: 1, color: AppColors.border),
        ),
        actions: [
          if (state.status == BackendStatus.running ||
              state.status == BackendStatus.failed)
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: IconButton(
                tooltip: 'Restart backend',
                icon: const Icon(Icons.restart_alt_rounded, size: 20),
                style: IconButton.styleFrom(
                  hoverColor: AppColors.card,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                ),
                onPressed: state.restart,
              ),
            ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          _StatusCard(state: state),
          const SizedBox(height: 12),
          if (state.status == BackendStatus.running) ...[
            _UrlCard(port: state.port),
            const SizedBox(height: 12),
            _StatsCard(data: state.dashboard),
          ],
          if (state.status == BackendStatus.failed && state.errorMessage != null) ...[
            const SizedBox(height: 12),
            _ErrorCard(message: state.errorMessage!),
          ],
        ],
      ),
    );
  }
}

// ── Status card ───────────────────────────────────────────────────────────────

class _StatusCard extends StatelessWidget {
  const _StatusCard({required this.state});
  final AppState state;

  @override
  Widget build(BuildContext context) {
    final (color, bgColor, icon, label) = switch (state.status) {
      BackendStatus.starting => (
          AppColors.warning,
          AppColors.warning.withValues(alpha: 0.08),
          Icons.sync_rounded,
          'Starting…',
        ),
      BackendStatus.running => (
          AppColors.accent,
          AppColors.accent.withValues(alpha: 0.08),
          Icons.check_circle_rounded,
          'Running',
        ),
      BackendStatus.stopped => (
          AppColors.textSecondary,
          AppColors.textSecondary.withValues(alpha: 0.06),
          Icons.stop_circle_outlined,
          'Stopped',
        ),
      BackendStatus.failed => (
          AppColors.error,
          AppColors.error.withValues(alpha: 0.08),
          Icons.error_rounded,
          'Failed',
        ),
    };

    return Container(
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.border),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
        child: Row(
          children: [
            // Status indicator
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: bgColor,
                borderRadius: BorderRadius.circular(10),
              ),
              child: state.status == BackendStatus.starting
                  ? Padding(
                      padding: const EdgeInsets.all(10),
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: color,
                      ),
                    )
                  : Icon(icon, color: color, size: 22),
            ),
            const SizedBox(width: 14),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                    color: color,
                  ),
                ),
                Text(
                  'Backend server',
                  style: const TextStyle(
                    fontSize: 12,
                    color: AppColors.textSecondary,
                  ),
                ),
              ],
            ),
            const Spacer(),
            _ActionButton(state: state),
          ],
        ),
      ),
    );
  }
}

class _ActionButton extends StatelessWidget {
  const _ActionButton({required this.state});
  final AppState state;

  @override
  Widget build(BuildContext context) {
    switch (state.status) {
      case BackendStatus.stopped:
      case BackendStatus.failed:
        return FilledButton.icon(
          onPressed: state.start,
          icon: const Icon(Icons.play_arrow_rounded, size: 16),
          label: const Text('Start'),
        );
      case BackendStatus.running:
        return OutlinedButton.icon(
          onPressed: state.stop,
          icon: const Icon(Icons.stop_rounded, size: 16, color: AppColors.error),
          label: const Text('Stop', style: TextStyle(color: AppColors.error)),
          style: OutlinedButton.styleFrom(
            side: const BorderSide(color: AppColors.error),
            foregroundColor: AppColors.error,
          ),
        );
      case BackendStatus.starting:
        return const SizedBox.shrink();
    }
  }
}

// ── URL card ──────────────────────────────────────────────────────────────────

class _UrlCard extends StatefulWidget {
  const _UrlCard({required this.port});
  final int port;

  @override
  State<_UrlCard> createState() => _UrlCardState();
}

class _UrlCardState extends State<_UrlCard> {
  bool _copied = false;

  Future<void> _copy() async {
    final url = 'http://127.0.0.1:${widget.port}';
    await Clipboard.setData(ClipboardData(text: url));
    setState(() => _copied = true);
    await Future<void>.delayed(const Duration(seconds: 2));
    if (mounted) setState(() => _copied = false);
  }

  @override
  Widget build(BuildContext context) {
    final url = 'http://127.0.0.1:${widget.port}';

    return Container(
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.border),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Row(
          children: [
            Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                color: AppColors.accent.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Icon(Icons.link_rounded, size: 16, color: AppColors.accent),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'API Endpoint',
                    style: TextStyle(fontSize: 11, color: AppColors.textSecondary),
                  ),
                  const SizedBox(height: 2),
                  SelectableText(
                    url,
                    style: const TextStyle(
                      fontFamily: 'monospace',
                      fontSize: 13,
                      color: AppColors.accent,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),
            _CopyButton(copied: _copied, onTap: _copy),
          ],
        ),
      ),
    );
  }
}

class _CopyButton extends StatelessWidget {
  const _CopyButton({required this.copied, required this.onTap});
  final bool copied;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return AnimatedSwitcher(
      duration: const Duration(milliseconds: 200),
      child: copied
          ? Container(
              key: const ValueKey('done'),
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: AppColors.accent.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(6),
              ),
              child: const Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.check_rounded, size: 14, color: AppColors.accent),
                  SizedBox(width: 4),
                  Text('Copied', style: TextStyle(fontSize: 12, color: AppColors.accent)),
                ],
              ),
            )
          : IconButton(
              key: const ValueKey('copy'),
              tooltip: 'Copy URL',
              icon: const Icon(Icons.copy_rounded, size: 16, color: AppColors.textSecondary),
              style: IconButton.styleFrom(
                hoverColor: AppColors.card,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
              ),
              onPressed: onTap,
            ),
    );
  }
}

// ── Stats card ────────────────────────────────────────────────────────────────

class _StatsCard extends StatelessWidget {
  const _StatsCard({required this.data});
  final DashboardData? data;

  @override
  Widget build(BuildContext context) {
    final d = data;

    return Container(
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.border),
      ),
      child: d == null
          ? const Padding(
              padding: EdgeInsets.all(24),
              child: Center(child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.accent)),
            )
          : IntrinsicHeight(
              child: Row(
                children: [
                  _StatCell(
                    icon: Icons.person_outline_rounded,
                    value: '${d.accountCount}',
                    label: 'Accounts',
                    color: const Color(0xff60a5fa),
                    isFirst: true,
                  ),
                  _StatCell(
                    icon: Icons.check_circle_outline_rounded,
                    value: '${d.enabledAccountCount}',
                    label: 'Active',
                    color: AppColors.accent,
                  ),
                  _StatCell(
                    icon: Icons.hourglass_top_rounded,
                    value: '${d.busyCount}',
                    label: 'Busy',
                    color: AppColors.warning,
                  ),
                  _StatCell(
                    icon: Icons.history_rounded,
                    value: '${d.historyCount}',
                    label: 'History',
                    color: const Color(0xffc084fc),
                    isLast: true,
                  ),
                ],
              ),
            ),
    );
  }
}

class _StatCell extends StatelessWidget {
  const _StatCell({
    required this.icon,
    required this.value,
    required this.label,
    required this.color,
    this.isFirst = false,
    this.isLast = false,
  });

  final IconData icon;
  final String value;
  final String label;
  final Color color;
  final bool isFirst;
  final bool isLast;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 20, horizontal: 12),
        decoration: BoxDecoration(
          border: Border(
            right: isLast ? BorderSide.none : const BorderSide(color: AppColors.border),
          ),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Icon(icon, size: 18, color: color),
            ),
            const SizedBox(height: 10),
            Text(
              value,
              style: const TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.w700,
                color: AppColors.textPrimary,
                height: 1,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              label,
              style: const TextStyle(
                fontSize: 11,
                color: AppColors.textSecondary,
                fontWeight: FontWeight.w500,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Error card ────────────────────────────────────────────────────────────────

class _ErrorCard extends StatelessWidget {
  const _ErrorCard({required this.message});
  final String message;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.error.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.error.withValues(alpha: 0.3)),
      ),
      padding: const EdgeInsets.all(16),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.error_outline_rounded, color: AppColors.error, size: 20),
          const SizedBox(width: 12),
          Expanded(
            child: SelectableText(
              message,
              style: const TextStyle(
                fontSize: 12,
                color: AppColors.error,
                fontFamily: 'monospace',
              ),
            ),
          ),
        ],
      ),
    );
  }
}
