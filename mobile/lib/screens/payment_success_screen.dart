import "package:flutter/material.dart";
import "package:go_router/go_router.dart";
import "package:provider/provider.dart";

import "../providers/auth_provider.dart";
import "../widgets/common.dart";

class PaymentSuccessScreen extends StatelessWidget {
  const PaymentSuccessScreen({super.key, this.paymentId});

  final String? paymentId;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.check_circle_rounded, size: 72, color: Color(0xFF16A34A)),
              const SizedBox(height: 16),
              Text(
                "Оплата прошла успешно",
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 8),
              const Text(
                "Подписка активирована. Можно переходить к урокам.",
                textAlign: TextAlign.center,
                style: TextStyle(color: Color(0xFF5B7A9D)),
              ),
              if (paymentId != null && paymentId!.isNotEmpty) ...[
                const SizedBox(height: 8),
                Text("ID: $paymentId", style: const TextStyle(color: Color(0xFF6699CF), fontSize: 12)),
              ],
              const SizedBox(height: 28),
              FilledButton(
                onPressed: () {
                  context.read<AuthProvider>().loadCatalog();
                  context.go("/learning/lessons");
                },
                child: const Text("К урокам"),
              ),
              const SizedBox(height: 10),
              OutlinedButton(
                onPressed: () => context.go("/learning/home"),
                child: const Text("На главную"),
              ),
              const SizedBox(height: 24),
              const BrandMark(),
            ],
          ),
        ),
      ),
    );
  }
}
