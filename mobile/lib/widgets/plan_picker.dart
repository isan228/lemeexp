import "package:flutter/material.dart";

import "../config/theme.dart";
import "../models/models.dart";
import "../utils/helpers.dart";

/// Тариф из `?plan=` — или первый, если параметр старый (`standard`) или тариф скрыт.
BillingPlan? pickInitialPlan(List<BillingPlan> plans, String? planParam) {
  for (final plan in plans) {
    if (plan.id.toString() == planParam) return plan;
  }
  return plans.isEmpty ? null : plans.first;
}

class PlanPicker extends StatelessWidget {
  const PlanPicker({
    super.key,
    required this.plans,
    required this.selectedId,
    required this.onSelect,
    this.enabled = true,
  });

  final List<BillingPlan> plans;
  final int? selectedId;
  final ValueChanged<BillingPlan> onSelect;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        for (final plan in plans)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: _PlanTile(
              plan: plan,
              selected: plan.id == selectedId,
              onTap: enabled ? () => onSelect(plan) : null,
            ),
          ),
      ],
    );
  }
}

class _PlanTile extends StatelessWidget {
  const _PlanTile({required this.plan, required this.selected, this.onTap});

  final BillingPlan plan;
  final bool selected;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected ? AppColors.primaryWeak : AppColors.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(color: selected ? AppColors.primary : AppColors.border, width: selected ? 2 : 1),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              Icon(
                selected ? Icons.radio_button_checked : Icons.radio_button_unchecked,
                color: selected ? AppColors.primary : AppColors.textSecondary,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      plan.title,
                      style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      "доступ на ${plan.periodLabel}",
                      style: const TextStyle(color: AppColors.textSecondary, fontSize: 12),
                    ),
                  ],
                ),
              ),
              Text(
                formatPlanPrice(plan.amount),
                style: const TextStyle(
                  color: AppColors.primary,
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
