import "package:flutter/material.dart";
import "package:go_router/go_router.dart";
import "package:provider/provider.dart";
import "package:url_launcher/url_launcher.dart";

import "../config/api_config.dart";
import "../config/theme.dart";
import "../models/models.dart";
import "../providers/auth_provider.dart";
import "../services/api_client.dart";
import "../utils/helpers.dart";
import "../widgets/common.dart";

class PaymentScreen extends StatefulWidget {
  const PaymentScreen({super.key, this.plan});

  final String? plan;

  @override
  State<PaymentScreen> createState() => _PaymentScreenState();
}

class _PaymentScreenState extends State<PaymentScreen> {
  final _promo = TextEditingController();
  bool _loadingPlan = true;
  bool _pending = false;
  bool _promoPending = false;
  String? _error;
  double _baseAmount = 0;
  PromoResult? _applied;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    try {
      final plan = await context.read<AuthProvider>().loadBillingPlan();
      if (!mounted) return;
      setState(() {
        _baseAmount = plan.amount;
        _loadingPlan = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loadingPlan = false;
        _error = e is ApiException ? e.message : "Не удалось загрузить тариф";
      });
    }
  }

  @override
  void dispose() {
    _promo.dispose();
    super.dispose();
  }

  Future<void> _applyPromo() async {
    final code = _promo.text.trim();
    if (code.isEmpty) return;
    setState(() {
      _promoPending = true;
      _error = null;
    });
    try {
      final result = await context.read<AuthProvider>().validatePromo(code);
      if (!mounted) return;
      setState(() {
        _applied = result;
        _promo.text = result.code;
      });
    } on ApiException catch (e) {
      setState(() {
        _applied = null;
        _error = e.message;
      });
    } finally {
      if (mounted) setState(() => _promoPending = false);
    }
  }

  Future<void> _pay() async {
    final planOk = (widget.plan == null || widget.plan == kSubscriptionPlanId);
    if (!planOk) {
      setState(() => _error = "Некорректный тариф.");
      return;
    }
    setState(() {
      _pending = true;
      _error = null;
    });
    try {
      final auth = context.read<AuthProvider>();
      final result = await auth.createPayment(promoCode: _applied?.code);
      if (result.free) {
        if (result.profile != null) auth.updateProfile(result.profile);
        await auth.loadCatalog();
        if (!mounted) return;
        context.go("/payment/success?paymentId=${result.paymentId ?? ""}");
        return;
      }
      final url = result.paymentUrl;
      if (url == null || url.isEmpty) {
        throw ApiException("Не удалось получить ссылку на оплату");
      }
      final uri = Uri.parse(url);
      final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
      if (!ok) throw ApiException("Не удалось открыть страницу оплаты");
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } catch (_) {
      setState(() => _error = "Ошибка оплаты");
    } finally {
      if (mounted) setState(() => _pending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final amount = _applied?.finalAmount ?? _baseAmount;
    final price = _loadingPlan && _applied == null ? "…" : formatPlanPrice(amount);

    return Scaffold(
      appBar: AppBar(title: const Text("Оплата")),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const PageKicker("Подписка"),
              const SizedBox(height: 8),
              Text(
                kGetAccessLabel,
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 16),
              AppCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(kSubscriptionPlanName, style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
                    const SizedBox(height: 6),
                    Text(price, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: AppColors.primary)),
                    const SizedBox(height: 12),
                    for (final b in kSubscriptionBullets)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 6),
                        child: Row(
                          children: [
                            const Icon(Icons.check_circle, color: AppColors.success, size: 18),
                            const SizedBox(width: 8),
                            Expanded(child: Text(b)),
                          ],
                        ),
                      ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              AppCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text("Промокод", style: TextStyle(fontWeight: FontWeight.w700)),
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        Expanded(
                          child: TextField(
                            controller: _promo,
                            decoration: const InputDecoration(hintText: "Введите код"),
                          ),
                        ),
                        const SizedBox(width: 8),
                        OutlinedButton(
                          onPressed: _promoPending ? null : _applyPromo,
                          child: Text(_promoPending ? "…" : "ОК"),
                        ),
                      ],
                    ),
                    if (_applied != null) ...[
                      const SizedBox(height: 8),
                      Text(
                        "Применён: ${_applied!.code}",
                        style: const TextStyle(color: AppColors.success, fontWeight: FontWeight.w600),
                      ),
                      TextButton(
                        onPressed: () => setState(() {
                          _applied = null;
                          _promo.clear();
                        }),
                        child: const Text("Сбросить"),
                      ),
                    ],
                  ],
                ),
              ),
              if (_error != null) ...[
                const SizedBox(height: 12),
                Text(_error!, style: const TextStyle(color: AppColors.danger, fontWeight: FontWeight.w600)),
              ],
              const SizedBox(height: 20),
              FilledButton(
                onPressed: _pending || _loadingPlan ? null : _pay,
                child: Text(_pending ? "Оформление…" : kGetAccessLabel),
              ),
              const SizedBox(height: 10),
              OutlinedButton(
                onPressed: () => context.go("/learning/home"),
                child: const Text("Позже"),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
