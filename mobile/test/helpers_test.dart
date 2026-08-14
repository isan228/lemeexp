import "package:flutter_test/flutter_test.dart";

import "package:lemexplain_mobile/utils/helpers.dart";

void main() {
  test("formatWatchDuration", () {
    expect(formatWatchDuration(30), "30 сек");
    expect(formatWatchDuration(120), "2 мин");
    expect(formatWatchDuration(3600), "1 ч");
  });

  test("formatPlanPrice", () {
    expect(formatPlanPrice(0), "бесплатно");
    expect(formatPlanPrice(1500), "1500 сом");
  });
}
