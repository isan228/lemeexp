/// Базовый URL API. Для эмулятора Android: `http://10.0.2.2:4000`
/// Для устройства в той же сети: `http://IP-ПК:4000`
/// Прод: `https://api.lemexplain.com`
const String kApiBaseUrl = String.fromEnvironment(
  "API_BASE_URL",
  defaultValue: "https://api.lemexplain.com",
);

const String kSiteName = "Let me explain";
const String kSupportEmail = "support@lemexplain.com";
const String kGetAccessLabel = "Получить доступ";

const String kSubscriptionPlanId = "standard";
const String kSubscriptionPlanName = "Подписка Lemexplain";
const int kSubscriptionPeriodDays = 30;
const List<String> kSubscriptionBullets = [
  "Все предметы, главы и видеоуроки на 1 месяц",
  "Личный кабинет и прогресс",
  "Чат с поддержкой",
];
