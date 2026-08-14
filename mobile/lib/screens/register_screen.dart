import "package:flutter/material.dart";
import "package:go_router/go_router.dart";
import "package:provider/provider.dart";

import "../config/api_config.dart";
import "../config/theme.dart";
import "../providers/auth_provider.dart";
import "../services/api_client.dart";
import "../utils/helpers.dart";
import "../widgets/common.dart";

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key, this.isTrial = false});

  final bool isTrial;

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _nick = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _formKey = GlobalKey<FormState>();
  bool _pending = false;
  String? _error;
  String _priceLabel = "…";

  @override
  void initState() {
    super.initState();
    if (!widget.isTrial) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _loadPrice());
    }
  }

  Future<void> _loadPrice() async {
    try {
      final plan = await context.read<AuthProvider>().loadBillingPlan();
      if (!mounted) return;
      setState(() => _priceLabel = "${formatPlanPrice(plan.amount)} / ${plan.periodLabel}");
    } catch (_) {
      if (!mounted) return;
      setState(() => _priceLabel = "цена на сайте");
    }
  }

  @override
  void dispose() {
    _nick.dispose();
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _pending = true;
      _error = null;
    });
    try {
      await context.read<AuthProvider>().register(_email.text, _password.text, _nick.text);
      if (!mounted) return;
      if (widget.isTrial) {
        context.go("/learning/lessons");
      } else {
        context.go("/payment?plan=$kSubscriptionPlanId");
      }
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } catch (_) {
      setState(() => _error = "Ошибка регистрации");
    } finally {
      if (mounted) setState(() => _pending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.isTrial ? "Пробный доступ" : "Регистрация"),
        actions: [
          TextButton(onPressed: () => context.push("/login"), child: const Text("Войти")),
        ],
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  widget.isTrial ? "Создайте аккаунт и смотрите пробники" : "Создание аккаунта",
                  style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 8),
                Text(
                  widget.isTrial
                      ? "После регистрации откроются бесплатные уроки. Остальной каталог — по подписке."
                      : "Зарегистрируйтесь и оформите подписку на все уроки на 1 месяц.",
                  style: const TextStyle(color: AppColors.textSecondary),
                ),
                if (!widget.isTrial) ...[
                  const SizedBox(height: 16),
                  AppCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text("Подписка", style: TextStyle(color: AppColors.primary, fontWeight: FontWeight.w700)),
                        const SizedBox(height: 6),
                        Text(kSubscriptionPlanName, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
                        Text(_priceLabel, style: const TextStyle(color: AppColors.textSecondary)),
                        const SizedBox(height: 8),
                        for (final b in kSubscriptionBullets)
                          Padding(
                            padding: const EdgeInsets.only(top: 4),
                            child: Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Text("•  ", style: TextStyle(color: AppColors.primary)),
                                Expanded(child: Text(b)),
                              ],
                            ),
                          ),
                      ],
                    ),
                  ),
                ],
                const SizedBox(height: 16),
                AppCard(
                  child: Column(
                    children: [
                      if (_error != null) ...[
                        Text(_error!, style: const TextStyle(color: AppColors.danger, fontWeight: FontWeight.w600)),
                        const SizedBox(height: 12),
                      ],
                      TextFormField(
                        controller: _nick,
                        decoration: const InputDecoration(labelText: "Логин"),
                        validator: (v) => (v == null || v.trim().isEmpty) ? "Укажите логин" : null,
                      ),
                      const SizedBox(height: 12),
                      TextFormField(
                        controller: _email,
                        keyboardType: TextInputType.emailAddress,
                        decoration: const InputDecoration(labelText: "Email"),
                        validator: (v) => (v == null || !v.contains("@")) ? "Укажите email" : null,
                      ),
                      const SizedBox(height: 12),
                      TextFormField(
                        controller: _password,
                        obscureText: true,
                        decoration: const InputDecoration(labelText: "Пароль"),
                        validator: (v) => (v == null || v.length < 6) ? "Минимум 6 символов" : null,
                      ),
                      const SizedBox(height: 16),
                      FilledButton(
                        onPressed: _pending ? null : _submit,
                        child: Text(_pending ? "Создание…" : "Создать аккаунт"),
                      ),
                    ],
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
