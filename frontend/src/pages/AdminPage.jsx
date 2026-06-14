import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

function swapInList(ids, id, dir) {
  const idx = ids.indexOf(id);
  const next = idx + dir;
  if (idx < 0 || next < 0 || next >= ids.length) return ids;
  const copy = [...ids];
  const tmp = copy[idx];
  copy[idx] = copy[next];
  copy[next] = tmp;
  return copy;
}

const ADMIN_TABS = [
  { id: "content", label: "Курсы и уроки" },
  { id: "users", label: "Пользователи" },
  { id: "news", label: "Новости" },
  { id: "support", label: "Чат" }
];

function formatLessonDuration(seconds) {
  const total = Number(seconds || 0);
  if (total <= 0) return "—";
  const min = Math.floor(total / 60);
  const sec = total % 60;
  return sec ? `${min} мин ${sec} сек` : `${min} мин`;
}

export default function AdminPage() {
  const navigate = useNavigate();
  const { login, logout, token, profile, hydrated, apiRequest } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [tab, setTab] = useState("content");

  const [adminCatalog, setAdminCatalog] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [selectedSubtopic, setSelectedSubtopic] = useState(null);
  const [newCourseTitle, setNewCourseTitle] = useState("");
  const [newSubtopicTitle, setNewSubtopicTitle] = useState("");
  const [newVideoTitle, setNewVideoTitle] = useState("");
  const [newVideoDurationMin, setNewVideoDurationMin] = useState("");
  const [catalogError, setCatalogError] = useState("");
  const [catalogNotice, setCatalogNotice] = useState("");

  const [users, setUsers] = useState([]);
  const [usersError, setUsersError] = useState("");
  const [usersLoading, setUsersLoading] = useState(false);
  const [chatUserId, setChatUserId] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState("");
  const [chatText, setChatText] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [chatUnreadTotal, setChatUnreadTotal] = useState(0);
  const [chatUnreadByUser, setChatUnreadByUser] = useState({});
  const chatListRef = useRef(null);

  const [newsList, setNewsList] = useState([]);
  const [newsError, setNewsError] = useState("");
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsSaving, setNewsSaving] = useState(false);
  const [editingNewsId, setEditingNewsId] = useState(null);
  const [nTitle, setNTitle] = useState("");
  const [nSlug, setNSlug] = useState("");
  const [nBody, setNBody] = useState("");
  const [nPublished, setNPublished] = useState(false);

  const isAdmin = profile?.subscriptionType === "admin";

  const selectedCourseObj = useMemo(
    () => adminCatalog.find((c) => c.id === selectedCourse),
    [adminCatalog, selectedCourse]
  );

  const selectedSubtopicObj = useMemo(() => {
    for (const c of adminCatalog) {
      const st = c.subtopics?.find((s) => s.id === selectedSubtopic);
      if (st) return st;
    }
    return null;
  }, [adminCatalog, selectedSubtopic]);

  const contentPath = useMemo(() => {
    const parts = [];
    if (selectedCourseObj) parts.push(selectedCourseObj.title);
    if (selectedSubtopicObj) parts.push(selectedSubtopicObj.title);
    return parts;
  }, [selectedCourseObj, selectedSubtopicObj]);

  function showCatalogNotice(text) {
    setCatalogNotice(text);
    setTimeout(() => setCatalogNotice(""), 4000);
  }

  const supportUsersOrdered = useMemo(() => {
    return users
      .filter((u) => u.subscriptionType !== "admin")
      .slice()
      .sort((a, b) => {
        const aUnread = Number(chatUnreadByUser[Number(a.id)] || 0);
        const bUnread = Number(chatUnreadByUser[Number(b.id)] || 0);
        if (aUnread !== bUnread) return bUnread - aUnread;
        return Number(a.id) - Number(b.id);
      });
  }, [users, chatUnreadByUser]);

  const loadAdminCatalog = useCallback(async () => {
    setCatalogError("");
    const res = await apiRequest("/admin/catalog");
    if (res.status === 503) {
      setCatalogError("Админка доступна только при подключённой PostgreSQL (DATABASE_URL).");
      setAdminCatalog([]);
      return;
    }
    if (!res.ok) {
      setCatalogError("Не удалось загрузить каталог.");
      return;
    }
    const data = await res.json();
    setAdminCatalog(data);
    setSelectedCourse((prev) => prev ?? data[0]?.id ?? null);
    setSelectedSubtopic((prev) => {
      if (prev && data.some((c) => c.subtopics?.some((s) => s.id === prev))) return prev;
      return data[0]?.subtopics?.[0]?.id ?? null;
    });
  }, [apiRequest]);

  const loadUsers = useCallback(async () => {
    setUsersError("");
    setUsersLoading(true);
    try {
      const res = await apiRequest("/admin/users");
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setUsersError(err.message || "Не удалось загрузить пользователей");
        setUsers([]);
        return;
      }
      setUsers(await res.json());
    } finally {
      setUsersLoading(false);
    }
  }, [apiRequest]);

  const loadNews = useCallback(async () => {
    setNewsError("");
    setNewsLoading(true);
    try {
      const res = await apiRequest("/admin/news");
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setNewsError(err.message || "Не удалось загрузить новости");
        setNewsList([]);
        return;
      }
      setNewsList(await res.json());
    } finally {
      setNewsLoading(false);
    }
  }, [apiRequest]);

  useEffect(() => {
    if (!hydrated || !token || !isAdmin) return;
    const id = requestAnimationFrame(() => {
      void loadAdminCatalog();
    });
    return () => cancelAnimationFrame(id);
  }, [hydrated, token, isAdmin, loadAdminCatalog]);

  useEffect(() => {
    if (!hydrated || !token || !isAdmin || tab !== "users") return;
    void loadUsers();
  }, [hydrated, token, isAdmin, tab, loadUsers]);

  useEffect(() => {
    if (!hydrated || !token || !isAdmin || tab !== "support") return;
    void loadUsers();
  }, [hydrated, token, isAdmin, tab, loadUsers]);

  useEffect(() => {
    if (!hydrated || !token || !isAdmin || tab !== "news") return;
    void loadNews();
  }, [hydrated, token, isAdmin, tab, loadNews]);

  async function onAdminLogin(e) {
    e.preventDefault();
    setError("");
    setPending(true);
    try {
      const p = await login(email, password);
      if (p?.subscriptionType !== "admin") {
        await logout();
        throw new Error("Нужны права администратора");
      }
    } catch (err) {
      setError(err.message || "Ошибка входа");
    } finally {
      setPending(false);
    }
  }

  async function onLogout() {
    await logout();
    navigate("/admin", { replace: true });
  }

  async function reorderCourses(ids) {
    await apiRequest("/admin/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ courses: ids })
    });
    await loadAdminCatalog();
  }

  async function reorderSubtopics(courseId, ids) {
    await apiRequest("/admin/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subtopics: [{ courseId, ids }] })
    });
    await loadAdminCatalog();
  }

  async function reorderVideos(subtopicId, ids) {
    await apiRequest("/admin/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videos: [{ subtopicId, ids }] })
    });
    await loadAdminCatalog();
  }

  async function createCourse() {
    const title = newCourseTitle.trim();
    if (!title) return;
    setCatalogError("");
    await apiRequest("/admin/courses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title })
    });
    setNewCourseTitle("");
    await loadAdminCatalog();
    showCatalogNotice(`Предмет «${title}» добавлен`);
  }

  async function createSubtopic() {
    const title = newSubtopicTitle.trim();
    if (!title || !selectedCourse) return;
    setCatalogError("");
    await apiRequest("/admin/subtopics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ courseId: selectedCourse, title })
    });
    setNewSubtopicTitle("");
    await loadAdminCatalog();
    showCatalogNotice(`Глава «${title}» добавлена`);
  }

  async function createVideo() {
    const title = newVideoTitle.trim();
    if (!title || !selectedSubtopic) return;
    const minutes = Number(newVideoDurationMin);
    const durationSec = Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes * 60) : 0;
    setCatalogError("");
    await apiRequest("/admin/videos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subtopicId: selectedSubtopic,
        title,
        duration: durationSec,
        streamPath: ""
      })
    });
    setNewVideoTitle("");
    setNewVideoDurationMin("");
    await loadAdminCatalog();
    showCatalogNotice(`Урок «${title}» добавлен — загрузите видеофайл`);
  }

  async function uploadVideoFile(videoId, file) {
    const form = new FormData();
    form.append("file", file);
    const res = await apiRequest(`/admin/videos/${videoId}/upload`, { method: "POST", body: form });
    if (!res.ok) {
      setCatalogError("Загрузка файла не удалась");
      return;
    }
    await loadAdminCatalog();
    showCatalogNotice("Видеофайл загружен");
  }

  function resetNewsForm() {
    setEditingNewsId(null);
    setNTitle("");
    setNSlug("");
    setNBody("");
    setNPublished(false);
  }

  function startEditNews(item) {
    setEditingNewsId(item.id);
    setNTitle(item.title || "");
    setNSlug(item.slug || "");
    setNBody(item.body || "");
    setNPublished(Boolean(item.published));
  }

  async function submitNews(e) {
    e.preventDefault();
    const title = nTitle.trim();
    if (!title) return;
    setNewsSaving(true);
    setNewsError("");
    try {
      const payload = {
        title,
        slug: nSlug.trim() || null,
        body: nBody,
        published: nPublished
      };
      if (editingNewsId) {
        const res = await apiRequest(`/admin/news/${editingNewsId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message || "Не удалось сохранить");
        }
      } else {
        const res = await apiRequest("/admin/news", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message || "Не удалось создать");
        }
      }
      resetNewsForm();
      await loadNews();
    } catch (err) {
      setNewsError(err.message || "Ошибка");
    } finally {
      setNewsSaving(false);
    }
  }

  async function deleteNews(id) {
    if (!window.confirm("Удалить эту новость?")) return;
    setNewsError("");
    const res = await apiRequest(`/admin/news/${id}`, { method: "DELETE" });
    if (!res.ok && res.status !== 204) {
      const err = await res.json().catch(() => ({}));
      setNewsError(err.message || "Не удалось удалить");
      return;
    }
    if (editingNewsId === id) resetNewsForm();
    await loadNews();
  }

  const loadChatMessages = useCallback(
    async (userId) => {
      if (!userId) return;
      setChatError("");
      setChatLoading(true);
      try {
        const res = await apiRequest(`/support/messages?userId=${userId}`);
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          setChatError(err.message || "Не удалось загрузить чат");
          setChatMessages([]);
          return;
        }
        const data = await res.json();
        setChatMessages(data.messages || []);
        await apiRequest("/support/mark-read", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId })
        });
      } finally {
        setChatLoading(false);
      }
    },
    [apiRequest]
  );

  const loadChatUnread = useCallback(async () => {
    const res = await apiRequest("/support/unread");
    if (!res.ok) return;
    const data = await res.json().catch(() => ({ total: 0, byUser: [] }));
    setChatUnreadTotal(Number(data.total || 0));
    const map = {};
    for (const row of data.byUser || []) {
      map[row.userId] = Number(row.count || 0);
    }
    setChatUnreadByUser(map);
  }, [apiRequest]);

  useEffect(() => {
    if (tab !== "support" || !users.length) return;
    const nonAdmin = users.filter((u) => u.subscriptionType !== "admin");
    const hasSelected = nonAdmin.some((u) => Number(u.id) === Number(chatUserId));
    if (!hasSelected) setChatUserId(nonAdmin[0] ? Number(nonAdmin[0].id) : null);
  }, [tab, users, chatUserId]);

  useEffect(() => {
    if (!chatUserId || tab !== "support") return;
    void loadChatMessages(chatUserId);
    const timer = setInterval(() => {
      void loadChatMessages(chatUserId);
      void loadChatUnread();
    }, 5000);
    return () => clearInterval(timer);
  }, [chatUserId, tab, loadChatMessages, loadChatUnread]);

  useEffect(() => {
    if (!hydrated || !token || !isAdmin) return;
    void loadChatUnread();
    const timer = setInterval(() => void loadChatUnread(), 5000);
    return () => clearInterval(timer);
  }, [hydrated, token, isAdmin, loadChatUnread]);

  useEffect(() => {
    const el = chatListRef.current;
    if (!el || tab !== "support") return;
    el.scrollTop = el.scrollHeight;
  }, [chatMessages, tab]);

  async function sendChatMessage(e) {
    e.preventDefault();
    const clean = chatText.trim();
    if (!clean || !chatUserId) return;
    setChatSending(true);
    setChatError("");
    try {
      const res = await apiRequest("/support/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: chatUserId, text: clean })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Не удалось отправить сообщение");
      }
      setChatText("");
      await loadChatMessages(chatUserId);
    } catch (err) {
      setChatError(err.message || "Ошибка отправки");
    } finally {
      setChatSending(false);
    }
  }

  if (!hydrated) {
    return (
      <div className="page-loading">
        <p>Загрузка…</p>
      </div>
    );
  }

  if (!token || !isAdmin) {
    return (
      <div className="admin-login-page">
        <header className="admin-login-header">
          <Link to="/" className="logo-link">
            ← На главную
          </Link>
          <h1>Админ-панель</h1>
        </header>
        <main className="admin-login-card card">
          <p className="subtitle">Отдельный вход для управления курсами и видео.</p>
          {error && <p className="form-error">{error}</p>}
          <form className="auth-form" onSubmit={onAdminLogin}>
            <label>
              Email администратора
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" />
            </label>
            <label>
              Пароль
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} autoComplete="current-password" />
            </label>
            <button type="submit" className="btn-primary" disabled={pending}>
              {pending ? "Вход…" : "Войти"}
            </button>
          </form>
        </main>
      </div>
    );
  }

  return (
    <div className="admin-app">
      <header className="admin-topbar">
        <div>
          <h1>Админ-панель</h1>
          <p className="muted small">{profile?.email}</p>
        </div>
        <div className="admin-topbar-actions">
          <Link to="/" className="btn-ghost">
            На сайт
          </Link>
          <button type="button" className="btn-ghost" onClick={() => void onLogout()}>
            Выйти
          </button>
        </div>
      </header>

      <nav className="admin-tabs" aria-label="Разделы админки">
        {ADMIN_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={tab === t.id ? "admin-tab active" : "admin-tab"}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {t.id === "support" && chatUnreadTotal > 0 ? <span className="nav-badge nav-badge-inline">{chatUnreadTotal}</span> : null}
          </button>
        ))}
      </nav>

      {catalogError && tab === "content" && <div className="admin-banner">{catalogError}</div>}
      {catalogNotice && tab === "content" && <div className="admin-notice">{catalogNotice}</div>}
      {usersError && tab === "users" && <div className="admin-banner">{usersError}</div>}
      {newsError && tab === "news" && <div className="admin-banner">{newsError}</div>}
      {chatError && tab === "support" && <div className="admin-banner">{chatError}</div>}

      {tab === "content" && (
        <div className="admin-content-page">
          <section className="admin-guide card">
            <h2>Как добавить урок</h2>
            <ol className="admin-guide-steps">
              <li className={selectedCourse ? "done" : "active"}>
                <strong>Шаг 1.</strong> Создайте или выберите <em>предмет</em> (например, «Биохимия»).
              </li>
              <li className={selectedCourse && !selectedSubtopic ? "active" : selectedSubtopic ? "done" : ""}>
                <strong>Шаг 2.</strong> В этом предмете добавьте <em>главу</em> (раздел курса).
              </li>
              <li className={selectedSubtopic ? "active" : ""}>
                <strong>Шаг 3.</strong> В главе создайте <em>урок</em> и загрузите видеофайл (mp4).
              </li>
            </ol>
            {contentPath.length > 0 && (
              <p className="admin-breadcrumb" aria-label="Текущий путь">
                {contentPath.map((part, i) => (
                  <span key={part}>
                    {i > 0 ? " → " : ""}
                    {part}
                  </span>
                ))}
              </p>
            )}
          </section>

          <div className="admin-workspace admin-content-grid">
            <section className="admin-column card">
              <div className="admin-column-head">
                <span className="admin-step-badge">1</span>
                <div>
                  <h2>Предметы</h2>
                  <p className="muted small">Верхний уровень каталога — дисциплина или курс.</p>
                </div>
              </div>
              <form
                className="admin-add-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void createCourse();
                }}
              >
                <label>
                  Название предмета
                  <input
                    value={newCourseTitle}
                    onChange={(e) => setNewCourseTitle(e.target.value)}
                    placeholder="Например: Биохимия"
                  />
                </label>
                <button type="submit" className="btn-primary" disabled={!newCourseTitle.trim()}>
                  + Добавить предмет
                </button>
              </form>
              {adminCatalog.length === 0 ? (
                <p className="admin-empty">Предметов пока нет. Добавьте первый выше.</p>
              ) : (
                <ul className="admin-select-list">
                  {adminCatalog.map((course) => (
                    <li key={course.id}>
                      <button
                        type="button"
                        className={selectedCourse === course.id ? "pick-row active" : "pick-row"}
                        onClick={() => {
                          setSelectedCourse(course.id);
                          setSelectedSubtopic(course.subtopics?.[0]?.id ?? null);
                        }}
                      >
                        <span className="pick-row-title">{course.title}</span>
                        <span className="muted small">
                          {course.subtopics?.length || 0}{" "}
                          {(course.subtopics?.length || 0) === 1 ? "глава" : "глав"}
                        </span>
                      </button>
                      <div className="reorder">
                        <button
                          type="button"
                          aria-label="Выше"
                          onClick={() => void reorderCourses(swapInList(adminCatalog.map((c) => c.id), course.id, -1))}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          aria-label="Ниже"
                          onClick={() => void reorderCourses(swapInList(adminCatalog.map((c) => c.id), course.id, 1))}
                        >
                          ↓
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className={`admin-column card${!selectedCourse ? " admin-column-disabled" : ""}`}>
              <div className="admin-column-head">
                <span className="admin-step-badge">2</span>
                <div>
                  <h2>Главы</h2>
                  <p className="muted small">
                    {selectedCourseObj
                      ? `Разделы предмета «${selectedCourseObj.title}»`
                      : "Сначала выберите предмет слева"}
                  </p>
                </div>
              </div>
              <form
                className="admin-add-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void createSubtopic();
                }}
              >
                <label>
                  Название главы
                  <input
                    value={newSubtopicTitle}
                    onChange={(e) => setNewSubtopicTitle(e.target.value)}
                    placeholder="Например: Белки и ферменты"
                    disabled={!selectedCourse}
                  />
                </label>
                <button type="submit" className="btn-primary" disabled={!selectedCourse || !newSubtopicTitle.trim()}>
                  + Добавить главу
                </button>
              </form>
              {!selectedCourse ? (
                <p className="admin-empty">Выберите предмет, чтобы управлять главами.</p>
              ) : (selectedCourseObj?.subtopics || []).length === 0 ? (
                <p className="admin-empty">В этом предмете ещё нет глав. Добавьте первую.</p>
              ) : (
                <ul className="admin-select-list">
                  {(selectedCourseObj?.subtopics || []).map((st) => (
                    <li key={st.id}>
                      <button
                        type="button"
                        className={selectedSubtopic === st.id ? "pick-row active" : "pick-row"}
                        onClick={() => setSelectedSubtopic(st.id)}
                      >
                        <span className="pick-row-title">{st.title}</span>
                        <span className="muted small">
                          {st.videos?.length || 0}{" "}
                          {(st.videos?.length || 0) === 1 ? "урок" : "уроков"}
                        </span>
                      </button>
                      <div className="reorder">
                        <button
                          type="button"
                          aria-label="Выше"
                          onClick={() => {
                            const ids = selectedCourseObj?.subtopics?.map((s) => s.id) || [];
                            void reorderSubtopics(selectedCourse, swapInList(ids, st.id, -1));
                          }}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          aria-label="Ниже"
                          onClick={() => {
                            const ids = selectedCourseObj?.subtopics?.map((s) => s.id) || [];
                            void reorderSubtopics(selectedCourse, swapInList(ids, st.id, 1));
                          }}
                        >
                          ↓
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className={`admin-column card admin-column-wide${!selectedSubtopic ? " admin-column-disabled" : ""}`}>
              <div className="admin-column-head">
                <span className="admin-step-badge">3</span>
                <div>
                  <h2>Уроки</h2>
                  <p className="muted small">
                    {selectedSubtopicObj
                      ? `Видеоуроки в главе «${selectedSubtopicObj.title}»`
                      : "Сначала выберите главу"}
                  </p>
                </div>
              </div>
              <form
                className="admin-add-form admin-add-form-lesson"
                onSubmit={(e) => {
                  e.preventDefault();
                  void createVideo();
                }}
              >
                <label>
                  Название урока
                  <input
                    value={newVideoTitle}
                    onChange={(e) => setNewVideoTitle(e.target.value)}
                    placeholder="Например: Введение в белки"
                    disabled={!selectedSubtopic}
                  />
                </label>
                <label>
                  Длительность (мин)
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={newVideoDurationMin}
                    onChange={(e) => setNewVideoDurationMin(e.target.value)}
                    placeholder="15"
                    disabled={!selectedSubtopic}
                  />
                </label>
                <button type="submit" className="btn-primary" disabled={!selectedSubtopic || !newVideoTitle.trim()}>
                  + Добавить урок
                </button>
              </form>
              {!selectedSubtopic ? (
                <p className="admin-empty">Выберите главу, чтобы добавлять уроки.</p>
              ) : (selectedSubtopicObj?.videos || []).length === 0 ? (
                <p className="admin-empty">В этой главе пока нет уроков. Создайте урок и загрузите mp4.</p>
              ) : (
                <ul className="admin-video-list">
                  {(selectedSubtopicObj?.videos || []).map((v) => (
                    <li key={v.id} className="admin-video-item card">
                      <div>
                        <div className="video-title-line">
                          <strong>{v.title}</strong>
                        </div>
                        <div className="muted small">
                          {formatLessonDuration(v.duration)}
                          {v.streamPath ? " · видео загружено" : " · нужно загрузить файл"}
                        </div>
                      </div>
                      <div className="admin-video-actions">
                        <div className="reorder">
                          <button
                            type="button"
                            aria-label="Выше"
                            onClick={() => {
                              const ids = selectedSubtopicObj?.videos?.map((x) => x.id) || [];
                              void reorderVideos(selectedSubtopic, swapInList(ids, v.id, -1));
                            }}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            aria-label="Ниже"
                            onClick={() => {
                              const ids = selectedSubtopicObj?.videos?.map((x) => x.id) || [];
                              void reorderVideos(selectedSubtopic, swapInList(ids, v.id, 1));
                            }}
                          >
                            ↓
                          </button>
                        </div>
                        <label className={`upload-label${v.streamPath ? " upload-label-done" : ""}`}>
                          {v.streamPath ? "Заменить видео" : "Загрузить mp4"}
                          <input
                            type="file"
                            accept="video/*"
                            className="sr-only"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) void uploadVideoFile(v.id, file);
                              e.target.value = "";
                            }}
                          />
                        </label>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}

      {tab === "users" && (
        <div className="admin-tab-panel">
          <section className="card admin-panel-card admin-panel-wide">
            <h2>Пользователи</h2>
            <p className="muted small">Список учётных записей (без паролей).</p>
            {usersLoading ? (
              <p className="muted">Загрузка…</p>
            ) : (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Email</th>
                      <th>Ник</th>
                      <th>Тариф</th>
                      <th>Экзамен</th>
                      <th>Создан</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id}>
                        <td>{u.id}</td>
                        <td>{u.email}</td>
                        <td>{u.nickname}</td>
                        <td>{u.subscriptionType}</td>
                        <td>{u.examDate || "—"}</td>
                        <td>{u.createdAt ? new Date(u.createdAt).toLocaleString("ru-RU") : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {tab === "news" && (
        <div className="admin-tab-panel">
          <section className="card admin-panel-card admin-panel-wide">
            <h2>Новости</h2>
            <p className="muted small">Создание, редактирование и удаление. Публичный список: GET /news (только с флагом «Опубликовано»).</p>

            <form className="admin-news-form auth-form" onSubmit={submitNews}>
              <h3 className="admin-news-form-title">{editingNewsId ? `Редактирование #${editingNewsId}` : "Новая новость"}</h3>
              <label>
                Заголовок
                <input value={nTitle} onChange={(e) => setNTitle(e.target.value)} required maxLength={500} />
              </label>
              <label>
                Slug (URL, необязательно)
                <input value={nSlug} onChange={(e) => setNSlug(e.target.value)} maxLength={200} placeholder="например: start-semester" />
              </label>
              <label>
                Текст
                <textarea value={nBody} onChange={(e) => setNBody(e.target.value)} rows={6} className="admin-textarea" />
              </label>
              <label className="admin-checkbox-row">
                <input type="checkbox" checked={nPublished} onChange={(e) => setNPublished(e.target.checked)} />
                Опубликовано
              </label>
              <div className="admin-news-actions">
                <button type="submit" className="btn-primary" disabled={newsSaving}>
                  {newsSaving ? "Сохранение…" : editingNewsId ? "Сохранить" : "Создать"}
                </button>
                {editingNewsId ? (
                  <button type="button" className="btn-secondary" onClick={resetNewsForm}>
                    Отмена
                  </button>
                ) : null}
              </div>
            </form>

            {newsLoading ? (
              <p className="muted">Загрузка…</p>
            ) : (
              <ul className="admin-news-list">
                {newsList.map((n) => (
                  <li key={n.id} className="card admin-news-row">
                    <div className="admin-news-row-main">
                      <strong>{n.title}</strong>
                      <div className="muted small">
                        #{n.id} · slug: {n.slug || "—"} · {n.published ? "опубликовано" : "черновик"} ·{" "}
                        {n.updatedAt ? new Date(n.updatedAt).toLocaleString("ru-RU") : ""}
                      </div>
                    </div>
                    <div className="admin-news-row-actions">
                      <button type="button" className="btn-secondary" onClick={() => startEditNews(n)}>
                        Изменить
                      </button>
                      <button type="button" className="btn-ghost" onClick={() => void deleteNews(n.id)}>
                        Удалить
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {tab === "support" && (
        <div className="admin-tab-panel">
          <section className="card admin-panel-card admin-panel-wide">
            <h2>Чат с пользователями</h2>
            <p className="muted small">Выберите пользователя и отвечайте в диалоге.</p>
            <div className="admin-support-layout">
              <div className="admin-support-main">
                <div className="support-chat-list admin-chat-list" ref={chatListRef}>
                  {chatLoading ? (
                    <p className="muted">Загрузка переписки…</p>
                  ) : chatMessages.length === 0 ? (
                    <p className="muted">Сообщений пока нет.</p>
                  ) : (
                    chatMessages.map((m) => (
                      <div key={m.id} className={m.senderRole === "admin" ? "support-msg support-msg-mine" : "support-msg support-msg-admin"}>
                        <div className="support-msg-meta">
                          <strong>{m.senderRole === "admin" ? "Админ" : "Пользователь"}</strong>
                          <span>{new Date(m.createdAt).toLocaleString("ru-RU")}</span>
                        </div>
                        {m.videoTitle || m.videoId ? <div className="muted small">Урок: {m.videoTitle || `#${m.videoId}`}</div> : null}
                        <p>{m.text}</p>
                      </div>
                    ))
                  )}
                </div>

                <form className="support-chat-form" onSubmit={sendChatMessage}>
                  <textarea
                    value={chatText}
                    onChange={(e) => setChatText(e.target.value)}
                    rows={3}
                    maxLength={2000}
                    placeholder="Ответ пользователю"
                    className="admin-textarea"
                  />
                  <button type="submit" className="btn-primary" disabled={!chatUserId || chatSending || !chatText.trim()}>
                    {chatSending ? "Отправка…" : "Отправить"}
                  </button>
                </form>
              </div>

              <aside className="admin-support-users card">
                <h3>Пользователи</h3>
                <div className="admin-support-users-list">
                {supportUsersOrdered.map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        className={Number(chatUserId) === Number(u.id) ? "pick-row active" : "pick-row"}
                        onClick={() => setChatUserId(Number(u.id))}
                      >
                        <span className="admin-support-user-title">#{u.id} · {u.nickname || u.email}</span>
                        <span className="muted small">{u.email}</span>
                        {chatUnreadByUser[Number(u.id)] ? <span className="nav-badge">+{chatUnreadByUser[Number(u.id)]}</span> : null}
                      </button>
                    ))}
                </div>
              </aside>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
