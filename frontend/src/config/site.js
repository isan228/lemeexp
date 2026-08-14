export const site = {
  name: "Let me explain",
  supportEmail: "support@lemexplain.com",
  url: "https://lemexplain.com",
  /** Прямая ссылка на Android APK (файл в frontend/public/downloads/). */
  androidApkUrl: "/downloads/lemexplain.apk",
  androidApkLabel: "Скачать приложение"
};

/** Единая подпись CTA для оформления доступа. */
export const GET_ACCESS_LABEL = "Получить доступ";

/** Внутренние маршруты SPA — единая точка правды для ссылок. */
export const routes = {
  home: "/",
  homePublic: "/?public=1",
  login: "/login",
  register: "/register",
  registerTrial: "/register?intent=trial",
  subscribe: "/payment",
  payment(plan) {
    return plan ? `/payment?plan=${encodeURIComponent(plan)}` : "/payment";
  },
  paymentSuccess(paymentId) {
    return paymentId
      ? `/payment/success?paymentId=${encodeURIComponent(paymentId)}`
      : "/payment/success";
  },
  learningHome: "/learning/home",
  learningLessons: "/learning/lessons",
  learningFavorites: "/learning/favorites",
  learningProfile: "/learning/profile",
  learningLeaderboard: "/learning/leaderboard",
  learningSupport: "/learning/support",
  learningSupportLesson(videoId, videoTitle) {
    const params = new URLSearchParams({ videoId: String(videoId) });
    if (videoTitle?.trim()) params.set("videoTitle", videoTitle.trim());
    return `/learning/support?${params.toString()}`;
  },
  lessonSubject(subjectId) {
    return `/learning/lessons/${subjectId}`;
  },
  lessonChapter(subjectId, chapterId) {
    return `/learning/lessons/${subjectId}/chapters/${chapterId}`;
  },
  lessonVideo(subjectId, chapterId, videoId, { resume = false } = {}) {
    const base = `/learning/lessons/${subjectId}/chapters/${chapterId}/videos/${videoId}`;
    return resume ? `${base}?resume=1` : base;
  },
  admin: "/admin"
};

export function mailtoSupport(subject) {
  const q = subject ? `?subject=${encodeURIComponent(subject)}` : "";
  return `mailto:${site.supportEmail}${q}`;
}
