import "dart:async";

import "package:flutter/material.dart";
import "package:provider/provider.dart";

import "../config/theme.dart";
import "../models/models.dart";
import "../providers/auth_provider.dart";
import "../services/api_client.dart";
import "../utils/helpers.dart";
import "../widgets/common.dart";

class SupportScreen extends StatefulWidget {
  const SupportScreen({super.key, this.videoId, this.videoTitle});

  final int? videoId;
  final String? videoTitle;

  @override
  State<SupportScreen> createState() => _SupportScreenState();
}

class _SupportScreenState extends State<SupportScreen> {
  final _text = TextEditingController();
  final _scroll = ScrollController();
  List<SupportMessage> _messages = [];
  bool _loading = true;
  bool _sending = false;
  String? _error;
  Timer? _poll;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _load();
      _poll = Timer.periodic(const Duration(seconds: 5), (_) => _load(silent: true));
    });
  }

  @override
  void dispose() {
    _poll?.cancel();
    _text.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _load({bool silent = false}) async {
    if (!silent) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    try {
      final list = await context.read<AuthProvider>().loadSupportMessages(videoId: widget.videoId);
      if (!mounted) return;
      setState(() {
        _messages = list;
        _loading = false;
      });
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (_scroll.hasClients) {
          _scroll.jumpTo(_scroll.position.maxScrollExtent);
        }
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        if (!silent) _error = e is ApiException ? e.message : "Ошибка загрузки";
      });
    }
  }

  Future<void> _send() async {
    final clean = _text.text.trim();
    if (clean.isEmpty) return;
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      await context.read<AuthProvider>().sendSupportMessage(clean, videoId: widget.videoId);
      _text.clear();
      await _load(silent: true);
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } catch (_) {
      setState(() => _error = "Ошибка отправки");
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final profile = context.watch<AuthProvider>().profile;
    final title = widget.videoId != null ? "Вопросы к уроку" : "Чат с ментором";

    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const PageKicker("Помощь"),
            Text(title),
          ],
        ),
      ),
      body: Column(
        children: [
          if (widget.videoTitle != null && widget.videoTitle!.isNotEmpty)
            Container(
              width: double.infinity,
              margin: const EdgeInsets.fromLTRB(16, 8, 16, 0),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppColors.primaryWeak,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text(
                "Урок: ${widget.videoTitle}",
                style: const TextStyle(color: AppColors.primaryHover, fontWeight: FontWeight.w600),
              ),
            ),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.all(12),
              child: Text(_error!, style: const TextStyle(color: AppColors.danger)),
            ),
          Expanded(
            child: _loading && _messages.isEmpty
                ? const LoadingBlock(label: "Загрузка чата…")
                : ListView.builder(
                    controller: _scroll,
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
                    itemCount: _messages.length,
                    itemBuilder: (context, index) {
                      final m = _messages[index];
                      final mine = m.isMine;
                      return Align(
                        alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
                        child: Container(
                          margin: const EdgeInsets.only(bottom: 10),
                          padding: const EdgeInsets.all(12),
                          constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * 0.82),
                          decoration: BoxDecoration(
                            color: mine ? AppColors.primary : AppColors.surface,
                            borderRadius: BorderRadius.circular(14),
                            border: mine ? null : Border.all(color: AppColors.border),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                mine ? (profile?.nickname ?? "Вы") : "Ментор",
                                style: TextStyle(
                                  fontWeight: FontWeight.w700,
                                  fontSize: 12,
                                  color: mine ? Colors.white70 : AppColors.textMuted,
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                m.text,
                                style: TextStyle(color: mine ? Colors.white : AppColors.text, height: 1.4),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                formatMessageTime(m.createdAt),
                                style: TextStyle(
                                  fontSize: 11,
                                  color: mine ? Colors.white60 : AppColors.textMuted,
                                ),
                              ),
                            ],
                          ),
                        ),
                      );
                    },
                  ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _text,
                      minLines: 1,
                      maxLines: 4,
                      decoration: InputDecoration(
                        hintText: widget.videoId != null
                            ? "Задайте вопрос по этому уроку…"
                            : "Напишите сообщение ментору…",
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  IconButton.filled(
                    onPressed: _sending ? null : _send,
                    icon: _sending
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                          )
                        : const Icon(Icons.send_rounded),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
