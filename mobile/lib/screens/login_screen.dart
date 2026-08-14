import "package:flutter/material.dart";
import "package:go_router/go_router.dart";
import "package:provider/provider.dart";

import "../config/theme.dart";
import "../providers/auth_provider.dart";
import "../services/api_client.dart";
import "../widgets/common.dart";

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _formKey = GlobalKey<FormState>();
  bool _pending = false;
  String? _error;

  @override
  void dispose() {
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
      await context.read<AuthProvider>().login(_email.text, _password.text);
      if (!mounted) return;
      context.go("/learning/home");
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } catch (e) {
      setState(() => _error = "Ошибка входа: $e");
    } finally {
      if (mounted) setState(() => _pending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const BrandMark(compact: true),
        actions: [
          TextButton(onPressed: () => context.push("/register?intent=trial"), child: const Text("Попробовать")),
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
                const PageKicker("Кабинет"),
                const SizedBox(height: 8),
                Text(
                  "Войти",
                  style: Theme.of(context).textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 8),
                const Text(
                  "Введите email и пароль, чтобы открыть уроки.",
                  style: TextStyle(color: AppColors.textSecondary),
                ),
                const SizedBox(height: 20),
                AppCard(
                  child: Column(
                    children: [
                      if (_error != null) ...[
                        Text(_error!, style: const TextStyle(color: AppColors.danger, fontWeight: FontWeight.w600)),
                        const SizedBox(height: 12),
                      ],
                      TextFormField(
                        controller: _email,
                        keyboardType: TextInputType.emailAddress,
                        autofillHints: const [AutofillHints.email],
                        decoration: const InputDecoration(labelText: "Email"),
                        validator: (v) => (v == null || !v.contains("@")) ? "Укажите email" : null,
                      ),
                      const SizedBox(height: 12),
                      TextFormField(
                        controller: _password,
                        obscureText: true,
                        autofillHints: const [AutofillHints.password],
                        decoration: const InputDecoration(labelText: "Пароль"),
                        validator: (v) => (v == null || v.length < 6) ? "Минимум 6 символов" : null,
                      ),
                      const SizedBox(height: 16),
                      FilledButton(
                        onPressed: _pending ? null : _submit,
                        child: Text(_pending ? "Вход…" : "Войти"),
                      ),
                      const SizedBox(height: 12),
                      TextButton(
                        onPressed: () => context.push("/register?intent=trial"),
                        child: const Text("Нет аккаунта? Зарегистрироваться"),
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
