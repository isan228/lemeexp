import "../models/models.dart";

const _paidTypes = {"premium", "mentor", "basic"};

bool hasFullAccess(UserProfile? profile) {
  if (profile == null) return false;
  if (profile.hasFullAccess == true) return true;
  if (profile.hasFullAccess == false) return false;
  if (profile.subscriptionType == "admin") return true;
  if (!_paidTypes.contains(profile.subscriptionType)) return false;
  if (profile.subscriptionExpiresAt == null || profile.subscriptionExpiresAt!.isEmpty) {
    return true;
  }
  final expires = DateTime.tryParse(profile.subscriptionExpiresAt!);
  if (expires == null) return true;
  return expires.isAfter(DateTime.now());
}

String? formatSubscriptionExpiry(String? iso) {
  if (iso == null || iso.isEmpty) return null;
  final date = DateTime.tryParse(iso);
  if (date == null) return null;
  const months = [
    "января",
    "февраля",
    "марта",
    "апреля",
    "мая",
    "июня",
    "июля",
    "августа",
    "сентября",
    "октября",
    "ноября",
    "декабря",
  ];
  return "${date.day} ${months[date.month - 1]} ${date.year}";
}

String formatWatchDuration(int totalSeconds) {
  final sec = totalSeconds < 0 ? 0 : totalSeconds;
  if (sec < 60) return "$sec сек";
  final mins = (sec / 60).round();
  if (mins < 60) return "$mins мин";
  final hours = sec ~/ 3600;
  final remMins = ((sec % 3600) / 60).round();
  if (remMins == 0) return "$hours ч";
  return "$hours ч $remMins мин";
}

String watchHoursLabel(int totalSeconds) {
  final sec = totalSeconds < 0 ? 0 : totalSeconds;
  final hours = sec / 3600;
  if (hours < 1) return "${(sec / 60).round()} мин";
  return "${hours.toStringAsFixed(1).replaceAll(".", ",")} ч";
}

String formatPlanPrice(num amount) {
  if (!amount.isFinite) return "—";
  if (amount <= 0) return "бесплатно";
  if (amount == amount.roundToDouble()) return "${amount.toInt()} сом";
  return "${amount.toStringAsFixed(2)} сом";
}

String formatMessageTime(String iso) {
  final date = DateTime.tryParse(iso)?.toLocal();
  if (date == null) return "";
  const months = [
    "янв.",
    "фев.",
    "мар.",
    "апр.",
    "мая",
    "июн.",
    "июл.",
    "авг.",
    "сен.",
    "окт.",
    "ноя.",
    "дек.",
  ];
  final hh = date.hour.toString().padLeft(2, "0");
  final mm = date.minute.toString().padLeft(2, "0");
  return "${date.day} ${months[date.month - 1]}, $hh:$mm";
}

int getVideoWatchedSeconds(Map<int, int> watched, int videoId) {
  return watched[videoId] ?? 0;
}

bool isLessonVideoCompleted({
  required int watchedSeconds,
  required int durationSeconds,
  required Map<int, bool> videoCompleted,
  required int videoId,
}) {
  if (videoCompleted[videoId] == true) return true;
  final w = watchedSeconds < 0 ? 0 : watchedSeconds;
  final d = durationSeconds < 0 ? 0 : durationSeconds;
  if (d > 0) return w >= (d - 3).clamp(1, d);
  return w >= 600;
}

int getVideoWatchProgressPercent({
  required int watchedSeconds,
  required int durationSeconds,
  required Map<int, bool> videoCompleted,
  required int videoId,
}) {
  if (isLessonVideoCompleted(
    watchedSeconds: watchedSeconds,
    durationSeconds: durationSeconds,
    videoCompleted: videoCompleted,
    videoId: videoId,
  )) {
    return 100;
  }
  final w = watchedSeconds < 0 ? 0 : watchedSeconds;
  if (w <= 0) return 0;
  final d = durationSeconds < 0 ? 0 : durationSeconds;
  if (d > 0) return ((w / d) * 100).round().clamp(0, 100);
  return ((w / 600) * 100).round().clamp(0, 100);
}

int getChapterWatchProgressPercent(
  List<LessonVideo> videos,
  Map<int, int> watched,
  Map<int, bool> completed,
) {
  if (videos.isEmpty) return 0;
  var sum = 0;
  for (final v in videos) {
    sum += getVideoWatchProgressPercent(
      watchedSeconds: getVideoWatchedSeconds(watched, v.id),
      durationSeconds: v.duration,
      videoCompleted: completed,
      videoId: v.id,
    );
  }
  return (sum / videos.length).round();
}

int getSubjectWatchProgressPercent(
  LessonSubject subject,
  Map<int, int> watched,
  Map<int, bool> completed,
) {
  final videos = subject.subtopics.expand((ch) => ch.videos).toList();
  return getChapterWatchProgressPercent(videos, watched, completed);
}

VideoLocation? findVideoById(List<LessonSubject> chapters, int? videoId) {
  final vid = videoId ?? 0;
  if (vid <= 0) return null;
  for (final subject in chapters) {
    for (final chapter in subject.subtopics) {
      for (final video in chapter.videos) {
        if (video.id == vid) {
          return VideoLocation(subject: subject, chapter: chapter, video: video);
        }
      }
    }
  }
  return null;
}

bool isPlayableStream(String? path) {
  final p = path?.trim() ?? "";
  if (p.isEmpty) return false;
  return p.startsWith("hls:") || p.startsWith("hls/");
}

bool isProcessingStream(String? path) {
  final p = path?.trim() ?? "";
  return p.startsWith("upload:");
}

List<WatchDay> normalizeLast7Days(LearningProgress progress) {
  if (progress.last7Days.length == 7) return progress.last7Days;
  const labels = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
  final now = DateTime.now();
  final today = DateTime(now.year, now.month, now.day);
  final days = <WatchDay>[];
  for (var i = 6; i >= 0; i--) {
    final d = today.subtract(Duration(days: i));
    final date =
        "${d.year.toString().padLeft(4, "0")}-${d.month.toString().padLeft(2, "0")}-${d.day.toString().padLeft(2, "0")}";
    final isToday = i == 0;
    days.add(
      WatchDay(
        date: date,
        label: isToday ? "Сег" : labels[d.weekday % 7],
        seconds: 0,
      ),
    );
  }
  return days;
}
