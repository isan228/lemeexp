import "dart:async";

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
import "../widgets/plan_picker.dart";

class PaymentScreen extends StatefulWidget {
  const PaymentScreen({super.key, this.plan});

  final String? plan;

  @override
  State<PaymentScreen> createState() => _PaymentScreenState();
}

class _PaymentScreenState extends State<PaymentScreen> with WidgetsBindingObserver {
  final _promo = TextEditingController();
  bool _loadingPlan = true;
  bool _pending = false;
  bool _promoPending = false;
  bool _awaitingPayment = false;
  String? _error;
  String? _hint;
  String? _paymentId;
  List<BillingPlan> _plans = const [];
  BillingPlan? _selectedPlan;
  PromoResult? _applied;
  Timer? _pollTimer;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && _awaitingPayment && _paymentId != null) {
      unawaited(_checkPaymentStatus(showWaiting: false));
    }
  }

  Future<void> _load() async {
    final auth = context.read<AuthProvider>();
    if (!auth.isLoggedIn) {
      if (!mounted) return;
      context.go("/login");
      return;
    }
    try {
      final plans = await auth.loadBillingPlans();
      if (!mounted) return;
      setState(() {
        _plans = plans;
        _selectedPlan = pickInitialPlan(plans, widget.plan);
        _loadingPlan = false;
        if (plans.isEmpty) _error = "Сейчас нет доступных тарифов. Попробуйте позже.";
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
    WidgetsBinding.instance.removeObserver(this);
    _pollTimer?.cancel();
    _promo.dispose();
    super.dispose();
  }

  void _selectPlan(BillingPlan plan) {
    if (plan.id == _selectedPlan?.id) return;
    final hadPromo = _applied != null;
    setState(() {
      _selectedPlan = plan;
      _applied = null;
      _error = null;
    });
    if (hadPromo) unawaited(_applyPromo());
  }

  Future<void> _applyPromo() async {
    final code = _promo.text.trim();
    final plan = _selectedPlan;
    if (code.isEmpty || plan == null) return;
    setState(() {
      _promoPending = true;
      _error = null;
    });
    try {
      final result = await context.read<AuthProvider>().validatePromo(code, planId: plan.id);
      if (!mounted || _selectedPlan?.id != plan.id) return;
      setState(() {
        _applied = result;
        _promo.text = result.code;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _applied = null;
        _error = e.message;
      });
    } finally {
      if (mounted) setState(() => _promoPending = false);
    }
  }

  void _startPaymentPolling(String paymentId) {
    _pollTimer?.cancel();
    _paymentId = paymentId;
    _awaitingPayment = true;
    _pollTimer = Timer.periodic(const Duration(seconds: 4), (_) {
      unawaited(_checkPaymentStatus(showWaiting: false));
    });
  }

  Future<void> _checkPaymentStatus({required bool showWaiting}) async {
    final paymentId = _paymentId;
    if (paymentId == null || paymentId.isEmpty) return;
    try {
      final auth = context.read<AuthProvider>();
      final status = await auth.getPaymentStatus(paymentId);
      if (!mounted) return;
      if (status.status == "succeeded") {
        _pollTimer?.cancel();
        _awaitingPayment = false;
        if (status.profile != null) auth.updateProfile(status.profile);
        await auth.loadCatalog();
        if (!mounted) return;
        context.go("/payment/success?paymentId=$paymentId");
        return;
      }
      if (showWaiting) {
        setState(() {
          _hint = "Оплата ещё не подтверждена. Если вы уже заплатили — подождите или нажмите «Проверить оплату».";
        });
      }
    } on ApiException catch (e) {
      if (!mounted) return;
      if (showWaiting) setState(() => _error = e.message);
    } catch (_) {
      // ignore transient poll errors
    }
  }

  Future<void> _pay() async {
    final plan = _selectedPlan;
    if (plan == null) {
      setState(() => _error = "Выберите тариф.");
      return;
    }
    setState(() {
      _pending = true;
      _error = null;
      _hint = null;
    });
    try {
      final auth = context.read<AuthProvider>();
      final result = await auth.createPayment(planId: plan.id, promoCode: _applied?.code);
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
      if (result.paymentId != null && result.paymentId!.isNotEmpty) {
        _startPaymentPolling(result.paymentId!);
        if (!mounted) return;
        setState(() {
          _hint =
              "Открыли страницу оплаты. После оплаты вернитесь в приложение — подписка активируется автоматически.";
        });
      }
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
    final plan = _selectedPlan;
    final amount = _applied?.finalAmount ?? plan?.amount ?? 0;
    final price = _loadingPlan || plan == null ? "…" : formatPlanPrice(amount);
    final struckPrice = plan == null
        ? null
        : _applied != null
            ? (_applied!.finalAmount < plan.amount ? plan.amount : null)
            : plan.oldAmount;

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
              if (_plans.length > 1) ...[
                const Text("Выберите тариф", style: TextStyle(fontWeight: FontWeight.w700)),
                const SizedBox(height: 10),
                PlanPicker(
                  plans: _plans,
                  selectedId: plan?.id,
                  onSelect: _selectPlan,
                  enabled: !_pending && !_promoPending,
                ),
                const SizedBox(height: 6),
              ],
              AppCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(kSubscriptionPlanName, style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
                    if (plan != null) ...[
                      const SizedBox(height: 2),
                      Text("Доступ на ${plan.periodLabel}", style: const TextStyle(color: AppColors.textSecondary)),
                    ],
                    const SizedBox(height: 6),
                    Wrap(
                      crossAxisAlignment: WrapCrossAlignment.end,
                      spacing: 10,
                      children: [
                        if (struckPrice != null)
                          Padding(
                            padding: const EdgeInsets.only(bottom: 3),
                            child: Text(
                              formatPlanPrice(struckPrice),
                              style: const TextStyle(
                                fontSize: 16,
                                color: AppColors.textSecondary,
                                decoration: TextDecoration.lineThrough,
                              ),
                            ),
                          ),
                        Text(price, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: AppColors.primary)),
                      ],
                    ),
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
                        "Применён: ${_applied!.code}${_applied!.discount > 0 ? " (скидка ${formatPlanPrice(_applied!.discount)})" : ""}",
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
              if (_hint != null) ...[
                const SizedBox(height: 12),
                Text(_hint!, style: const TextStyle(color: AppColors.textSecondary)),
              ],
              if (_error != null) ...[
                const SizedBox(height: 12),
                Text(_error!, style: const TextStyle(color: AppColors.danger, fontWeight: FontWeight.w600)),
              ],
              const SizedBox(height: 20),
              FilledButton(
                onPressed: _pending || _loadingPlan || plan == null ? null : _pay,
                child: Text(_pending ? "Оформление…" : kGetAccessLabel),
              ),
              if (_awaitingPayment) ...[
                const SizedBox(height: 10),
                OutlinedButton(
                  onPressed: () => _checkPaymentStatus(showWaiting: true),
                  child: const Text("Проверить оплату"),
                ),
              ],
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
