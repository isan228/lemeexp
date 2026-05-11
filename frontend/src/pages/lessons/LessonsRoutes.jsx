import { Routes, Route, Navigate } from "react-router-dom";
import SubjectsIndex from "./SubjectsIndex.jsx";
import ChaptersList from "./ChaptersList.jsx";
import VideosLesson from "./VideosLesson.jsx";
import VideoLessonPage from "./VideoLessonPage.jsx";

export default function LessonsRoutes() {
  return (
    <Routes>
      <Route index element={<SubjectsIndex />} />
      <Route path=":subjectId" element={<ChaptersList />} />
      <Route path=":subjectId/chapters/:chapterId" element={<VideosLesson />} />
      <Route path=":subjectId/chapters/:chapterId/videos/:videoId" element={<VideoLessonPage />} />
      <Route path="*" element={<Navigate to="/learning/lessons" replace />} />
    </Routes>
  );
}
