import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../app_state.dart';
import '../main.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  late final TextEditingController _portCtrl;
  late bool _publicBind;
  bool _dirty = false;
  bool _saving = false;
  String? _portError;

  @override
  void initState() {
    super.initState();
    final state = context.read<AppState>();
    _portCtrl = TextEditingController(text: '${state.port}');
    _publicBind = state.publicBind;
    _portCtrl.addListener(_validate);
  }

  @override
  void dispose() {
    _portCtrl.dispose();
    super.dispose();
  }

  void _validate() {
    final v = int.tryParse(_portCtrl.text);
    setState(() {
      _portError = (v == null || v < 1024 || v > 65535)
          ? 'Port must be 1024–65535'
          : null;
      _dirty = true;
    });
  }

  Future<void> _save() async {
    final v = int.tryParse(_portCtrl.text);
    if (v == null || v < 1024 || v > 65535) return;
    setState(() => _saving = true);
    final state = context.read<AppState>();
    await state.applySettings(newPort: v, newPublicBind: _publicBind);
    if (!mounted) return;
    setState(() {
      _saving = false;
      _dirty = false;
    });
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Settings saved — backend restarted'),
        width: 280,
        duration: Duration(seconds: 3),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();

    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(
        backgroundColor: AppColors.surface,
        title: const Text('Settings'),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(1),
          child: Container(height: 1, color: AppColors.border),
        ),
        actions: [
          if (_dirty && _portError == null)
            Padding(
              padding: const EdgeInsets.only(right: 12),
              child: FilledButton(
                onPressed: _saving ? null : _save,
                child: _saving
                    ? const SizedBox(
                        width: 14,
                        height: 14,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.black),
                      )
                    : const Text('Save & Restart'),
              ),
            ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          // ── Server section ────────────────────────────────────────────────
          _SectionHeader(
            icon: Icons.dns_rounded,
            title: 'Server',
            subtitle: 'Configure the local API server',
          ),
          const SizedBox(height: 12),

          // Port
          _SettingsCard(
            children: [
              _SettingsRow(
                label: 'Port',
                description: 'The port the backend listens on',
                trailing: SizedBox(
                  width: 120,
                  child: TextField(
                    controller: _portCtrl,
                    keyboardType: TextInputType.number,
                    inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w500,
                      color: AppColors.textPrimary,
                      fontFamily: 'monospace',
                    ),
                    decoration: InputDecoration(
                      hintText: '9516',
                      errorText: _portError,
                      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                      isDense: true,
                    ),
                  ),
                ),
              ),
              const _Divider(),
              _SettingsRow(
                label: 'Public bind',
                description: _publicBind
                    ? 'Accessible from the network (0.0.0.0)'
                    : 'Localhost only (127.0.0.1) — recommended',
                trailing: Switch(
                  value: _publicBind,
                  onChanged: (v) => setState(() {
                    _publicBind = v;
                    _dirty = true;
                  }),
                ),
              ),
            ],
          ),

          const SizedBox(height: 24),

          // ── Info section ──────────────────────────────────────────────────
          _SectionHeader(
            icon: Icons.info_outline_rounded,
            title: 'Info',
            subtitle: 'Current connection details',
          ),
          const SizedBox(height: 12),

          _SettingsCard(
            children: [
              _InfoRow(
                label: 'API URL',
                value: 'http://127.0.0.1:${state.port}',
                monospace: true,
                copyable: true,
              ),
              const _Divider(),
              _InfoRow(label: 'Status', value: state.status.name),
            ],
          ),

          const SizedBox(height: 24),

          // ── Actions section ───────────────────────────────────────────────
          _SectionHeader(
            icon: Icons.bolt_rounded,
            title: 'Actions',
          ),
          const SizedBox(height: 12),

          _SettingsCard(
            children: [
              _ActionRow(
                icon: Icons.restart_alt_rounded,
                label: 'Restart Backend',
                description: 'Stop and start the backend process',
                enabled: state.status == BackendStatus.running,
                onTap: state.restart,
              ),
              const _Divider(),
              _ActionRow(
                icon: Icons.copy_rounded,
                label: 'Copy API URL',
                description: 'Copy base URL to clipboard',
                enabled: state.status == BackendStatus.running,
                onTap: () async {
                  await Clipboard.setData(
                    ClipboardData(text: 'http://127.0.0.1:${state.port}'),
                  );
                  if (!context.mounted) return;
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('URL copied'),
                      width: 180,
                      duration: Duration(seconds: 2),
                    ),
                  );
                },
              ),
            ],
          ),
        ],
      ),
    );
  }
}

// ── Section header ────────────────────────────────────────────────────────────

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({
    required this.icon,
    required this.title,
    this.subtitle,
  });

  final IconData icon;
  final String title;
  final String? subtitle;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, size: 15, color: AppColors.accent),
        const SizedBox(width: 6),
        Text(
          title,
          style: const TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w600,
            color: AppColors.textPrimary,
          ),
        ),
        if (subtitle != null) ...[
          const SizedBox(width: 8),
          Text(
            '· $subtitle',
            style: const TextStyle(
              fontSize: 12,
              color: AppColors.textSecondary,
            ),
          ),
        ],
      ],
    );
  }
}

// ── Settings card ─────────────────────────────────────────────────────────────

class _SettingsCard extends StatelessWidget {
  const _SettingsCard({required this.children});
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(children: children),
    );
  }
}

class _Divider extends StatelessWidget {
  const _Divider();

  @override
  Widget build(BuildContext context) {
    return Container(height: 1, color: AppColors.border);
  }
}

// ── Settings row ──────────────────────────────────────────────────────────────

class _SettingsRow extends StatelessWidget {
  const _SettingsRow({
    required this.label,
    required this.description,
    required this.trailing,
  });

  final String label;
  final String description;
  final Widget trailing;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w500,
                    color: AppColors.textPrimary,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  description,
                  style: const TextStyle(
                    fontSize: 11,
                    color: AppColors.textSecondary,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 16),
          trailing,
        ],
      ),
    );
  }
}

// ── Info row ──────────────────────────────────────────────────────────────────

class _InfoRow extends StatelessWidget {
  const _InfoRow({
    required this.label,
    required this.value,
    this.monospace = false,
    this.copyable = false,
  });

  final String label;
  final String value;
  final bool monospace;
  final bool copyable;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Row(
        children: [
          SizedBox(
            width: 72,
            child: Text(
              label,
              style: const TextStyle(fontSize: 12, color: AppColors.textSecondary),
            ),
          ),
          Expanded(
            child: SelectableText(
              value,
              style: TextStyle(
                fontSize: 12,
                color: AppColors.textPrimary,
                fontFamily: monospace ? 'monospace' : null,
                fontWeight: monospace ? FontWeight.w500 : null,
              ),
            ),
          ),
          if (copyable)
            IconButton(
              icon: const Icon(Icons.copy_rounded, size: 14, color: AppColors.textSecondary),
              padding: EdgeInsets.zero,
              constraints: const BoxConstraints(minWidth: 28, minHeight: 28),
              tooltip: 'Copy',
              onPressed: () {
                Clipboard.setData(ClipboardData(text: value));
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Copied'), width: 140, duration: Duration(seconds: 2)),
                );
              },
            ),
        ],
      ),
    );
  }
}

// ── Action row ────────────────────────────────────────────────────────────────

class _ActionRow extends StatelessWidget {
  const _ActionRow({
    required this.icon,
    required this.label,
    required this.description,
    required this.enabled,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final String description;
  final bool enabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: enabled ? onTap : null,
      borderRadius: BorderRadius.circular(12),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        child: Row(
          children: [
            Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                color: enabled
                    ? AppColors.accent.withValues(alpha: 0.1)
                    : AppColors.border.withValues(alpha: 0.4),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Icon(
                icon,
                size: 16,
                color: enabled ? AppColors.accent : AppColors.textSecondary,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    label,
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w500,
                      color: enabled ? AppColors.textPrimary : AppColors.textSecondary,
                    ),
                  ),
                  Text(
                    description,
                    style: const TextStyle(fontSize: 11, color: AppColors.textSecondary),
                  ),
                ],
              ),
            ),
            Icon(
              Icons.chevron_right_rounded,
              size: 18,
              color: enabled ? AppColors.textSecondary : AppColors.border,
            ),
          ],
        ),
      ),
    );
  }
}
