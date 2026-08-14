class UserProfile {
  const UserProfile({
    required this.id,
    required this.email,
    this.nickname,
    this.subscriptionType = "free",
    this.subscriptionExpiresAt,
    this.hasFullAccess,
    this.examDate,
  });

  final int id;
  final String email;
  final String? nickname;
  final String subscriptionType;
  final String? subscriptionExpiresAt;
  final bool? hasFullAccess;
  final String? examDate;

  String get displayName {
    final nick = nickname?.trim();
    if (nick != null && nick.isNotEmpty) return nick;
    final at = email.indexOf("@");
    if (at > 0) return email.substring(0, at);
    return email;
  }

  String get initial {
    final name = displayName.trim();
    if (name.isEmpty) return "?";
    return name.substring(0, 1).toUpperCase();
  }

  factory UserProfile.fromJson(Map<String, dynamic> json) {
    return UserProfile(
      id: (json["id"] as num?)?.toInt() ?? 0,
      email: (json["email"] as String?) ?? "",
      nickname: json["nickname"] as String?,
      subscriptionType: (json["subscriptionType"] as String?) ?? "free",
      subscriptionExpiresAt: json["subscriptionExpiresAt"] as String?,
      hasFullAccess: json["hasFullAccess"] as bool?,
      examDate: json["examDate"] as String?,
    );
  }

  Map<String, dynamic> toJson() => {
        "id": id,
        "email": email,
        "nickname": nickname,
        "subscriptionType": subscriptionType,
        "subscriptionExpiresAt": subscriptionExpiresAt,
        "hasFullAccess": hasFullAccess,
        "examDate": examDate,
      };
}

class LessonVideo {
  const LessonVideo({
    required this.id,
    required this.title,
    this.duration = 0,
    this.order = 0,
    this.isTrial = false,
    this.locked = false,
    this.streamPath,
  });

  final int id;
  final String title;
  final int duration;
  final int order;
  final bool isTrial;
  final bool locked;
  final String? streamPath;

  factory LessonVideo.fromJson(Map<String, dynamic> json) {
    return LessonVideo(
      id: (json["id"] as num?)?.toInt() ?? 0,
      title: (json["title"] as String?) ?? "",
      duration: (json["duration"] as num?)?.toInt() ?? 0,
      order: (json["order"] as num?)?.toInt() ?? 0,
      isTrial: json["isTrial"] == true,
      locked: json["locked"] == true,
      streamPath: json["streamPath"] as String?,
    );
  }
}

class LessonChapter {
  const LessonChapter({
    required this.id,
    required this.title,
    this.order = 0,
    this.videos = const [],
  });

  final int id;
  final String title;
  final int order;
  final List<LessonVideo> videos;

  factory LessonChapter.fromJson(Map<String, dynamic> json) {
    final videos = (json["videos"] as List? ?? [])
        .whereType<Map>()
        .map((e) => LessonVideo.fromJson(Map<String, dynamic>.from(e)))
        .toList();
    return LessonChapter(
      id: (json["id"] as num?)?.toInt() ?? 0,
      title: (json["title"] as String?) ?? "",
      order: (json["order"] as num?)?.toInt() ?? 0,
      videos: videos,
    );
  }
}

class LessonSubject {
  const LessonSubject({
    required this.id,
    required this.title,
    this.order = 0,
    this.subtopics = const [],
  });

  final int id;
  final String title;
  final int order;
  final List<LessonChapter> subtopics;

  int get videoCount =>
      subtopics.fold(0, (n, ch) => n + ch.videos.length);

  factory LessonSubject.fromJson(Map<String, dynamic> json) {
    final subs = (json["subtopics"] as List? ?? [])
        .whereType<Map>()
        .map((e) => LessonChapter.fromJson(Map<String, dynamic>.from(e)))
        .toList();
    return LessonSubject(
      id: (json["id"] as num?)?.toInt() ?? 0,
      title: (json["title"] as String?) ?? "",
      order: (json["order"] as num?)?.toInt() ?? 0,
      subtopics: subs,
    );
  }
}

class WatchDay {
  const WatchDay({required this.date, required this.label, required this.seconds});

  final String date;
  final String label;
  final int seconds;

  factory WatchDay.fromJson(Map<String, dynamic> json) {
    return WatchDay(
      date: (json["date"] as String?) ?? "",
      label: (json["label"] as String?) ?? "",
      seconds: (json["seconds"] as num?)?.toInt() ?? 0,
    );
  }
}

class LearningProgress {
  const LearningProgress({
    this.percentage = 0,
    this.completedCount = 0,
    this.totalVideos = 0,
    this.lastVideoId,
    this.watchedSeconds = const {},
    this.videoCompleted = const {},
    this.last7Days = const [],
    this.dailyRecordDate,
    this.dailyRecordSeconds = 0,
  });

  final double percentage;
  final int completedCount;
  final int totalVideos;
  final int? lastVideoId;
  final Map<int, int> watchedSeconds;
  final Map<int, bool> videoCompleted;
  final List<WatchDay> last7Days;
  final String? dailyRecordDate;
  final int dailyRecordSeconds;

  factory LearningProgress.fromJson(Map<String, dynamic> json) {
    final watchedRaw = json["watchedSeconds"];
    final watched = <int, int>{};
    if (watchedRaw is Map) {
      for (final e in watchedRaw.entries) {
        final id = int.tryParse(e.key.toString());
        if (id != null) watched[id] = (e.value as num?)?.toInt() ?? 0;
      }
    }

    final completedRaw = json["videoCompleted"];
    final completed = <int, bool>{};
    if (completedRaw is Map) {
      for (final e in completedRaw.entries) {
        final id = int.tryParse(e.key.toString());
        if (id != null) completed[id] = e.value == true;
      }
    }

    final stats = json["watchStats"];
    final days = <WatchDay>[];
    if (stats is Map && stats["last7Days"] is List) {
      for (final item in stats["last7Days"] as List) {
        if (item is Map) {
          days.add(WatchDay.fromJson(Map<String, dynamic>.from(item)));
        }
      }
    }

    String? recordDate;
    var recordSeconds = 0;
    if (stats is Map && stats["dailyRecord"] is Map) {
      final rec = Map<String, dynamic>.from(stats["dailyRecord"] as Map);
      recordDate = rec["date"] as String?;
      recordSeconds = (rec["seconds"] as num?)?.toInt() ?? 0;
    }

    return LearningProgress(
      percentage: (json["percentage"] as num?)?.toDouble() ?? 0,
      completedCount: (json["completedCount"] as num?)?.toInt() ?? 0,
      totalVideos: (json["totalVideos"] as num?)?.toInt() ?? 0,
      lastVideoId: (json["lastVideoId"] as num?)?.toInt(),
      watchedSeconds: watched,
      videoCompleted: completed,
      last7Days: days,
      dailyRecordDate: recordDate,
      dailyRecordSeconds: recordSeconds,
    );
  }

  static const empty = LearningProgress();
}

class FavoriteItem {
  const FavoriteItem({required this.videoId, this.createdAt});

  final int videoId;
  final String? createdAt;

  factory FavoriteItem.fromJson(Map<String, dynamic> json) {
    return FavoriteItem(
      videoId: (json["videoId"] as num?)?.toInt() ?? 0,
      createdAt: json["createdAt"] as String?,
    );
  }
}

class SupportMessage {
  const SupportMessage({
    required this.id,
    required this.senderRole,
    required this.text,
    required this.createdAt,
    this.videoId,
    this.videoTitle,
  });

  final int id;
  final String senderRole;
  final String text;
  final String createdAt;
  final int? videoId;
  final String? videoTitle;

  bool get isMine => senderRole != "admin";

  factory SupportMessage.fromJson(Map<String, dynamic> json) {
    return SupportMessage(
      id: (json["id"] as num?)?.toInt() ?? 0,
      senderRole: (json["senderRole"] as String?) ?? "student",
      text: (json["text"] as String?) ?? "",
      createdAt: (json["createdAt"] as String?) ?? "",
      videoId: (json["videoId"] as num?)?.toInt(),
      videoTitle: json["videoTitle"] as String?,
    );
  }
}

class LeaderboardEntry {
  const LeaderboardEntry({
    required this.userId,
    required this.nickname,
    required this.seconds,
    required this.rank,
    this.isCurrentUser = false,
  });

  final int userId;
  final String nickname;
  final int seconds;
  final int rank;
  final bool isCurrentUser;

  factory LeaderboardEntry.fromJson(Map<String, dynamic> json) {
    return LeaderboardEntry(
      userId: (json["userId"] as num?)?.toInt() ?? 0,
      nickname: (json["nickname"] as String?) ?? "",
      seconds: (json["seconds"] as num?)?.toInt() ?? 0,
      rank: (json["rank"] as num?)?.toInt() ?? 0,
      isCurrentUser: json["isCurrentUser"] == true,
    );
  }
}

class LeaderboardData {
  const LeaderboardData({
    this.entries = const [],
    this.currentRank,
    this.currentSeconds = 0,
  });

  final List<LeaderboardEntry> entries;
  final int? currentRank;
  final int currentSeconds;
}

class BillingPlan {
  const BillingPlan({required this.amount, this.periodLabel = "1 месяц"});

  final double amount;
  final String periodLabel;
}

class PromoResult {
  const PromoResult({
    required this.code,
    required this.finalAmount,
    this.discountLabel,
  });

  final String code;
  final double finalAmount;
  final String? discountLabel;
}

class VideoLocation {
  const VideoLocation({
    required this.subject,
    required this.chapter,
    required this.video,
  });

  final LessonSubject subject;
  final LessonChapter chapter;
  final LessonVideo video;
}
