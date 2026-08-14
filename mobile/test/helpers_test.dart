import "package:flutter_test/flutter_test.dart";
import "package:lemexplain_mobile/models/models.dart";
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

  test("asInt accepts string ids from API", () {
    expect(asInt("1"), 1);
    expect(asInt(42), 42);
    expect(asInt("336"), 336);
  });

  test("UserProfile.fromJson with string id", () {
    final profile = UserProfile.fromJson({
      "id": "1",
      "email": "student@example.com",
      "nickname": "Student",
      "subscriptionType": "premium",
      "subscriptionExpiresAt": null,
      "hasFullAccess": true,
    });
    expect(profile.id, 1);
    expect(profile.email, "student@example.com");
    expect(profile.hasFullAccess, true);
  });

  test("LessonSubject.fromJson with string nested ids", () {
    final subject = LessonSubject.fromJson({
      "id": "1",
      "title": "Biochem",
      "order": "1",
      "subtopics": [
        {
          "id": "11",
          "title": "Molecular",
          "order": 1,
          "videos": [
            {
              "id": "336",
              "title": "Intro",
              "duration": "2537",
              "streamPath": "hls:336",
              "order": 1,
              "isTrial": false,
              "locked": false,
            }
          ],
        }
      ],
    });
    expect(subject.id, 1);
    expect(subject.subtopics.first.id, 11);
    expect(subject.subtopics.first.videos.first.id, 336);
    expect(subject.subtopics.first.videos.first.duration, 2537);
  });

  test("stream path helpers match website", () {
    expect(isPlayableStream("hls:336"), isTrue);
    expect(isPlayableStream("hls/336"), isTrue);
    expect(isPlayableStream(""), isFalse);
    expect(isPlayableStream("upload:123"), isFalse);
    expect(isProcessingStream("upload:123"), isTrue);
    expect(isProcessingStream("hls:336"), isFalse);
  });
}
