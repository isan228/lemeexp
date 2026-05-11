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
  { id: "subjects", label: "Предметы" },
  { id: "chapters", label: "Главы" },
  { id: "videos", label: "Видео" },
  { id: "users", label: "Пользователи" },
  { id: "news", label: "Новости" },
  { id: "support", label: "Чат" }
];

export default function AdminPage() {
  const navigate = useNavigate();
  const { login, logout, token, profile, hydrated, apiRequest } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [tab, setTab] = useState("subjects");

  const [adminCatalog, setAdminCatalog] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [selectedSubtopic, setSelectedSubtopic] = useState(null);
  const [newCourseTitle, setNewCourseTitle] = useState("");
  const [newSubtopicTitle, setNewSubtopicTitle] = useState("");
  const [newVideoTitle, setNewVideoTitle] = useState("");
  const [newVideoDuration, setNewVideoDuration] = useState(0);
  const [catalogError, setCatalogError] = useState("");

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
    await apiRequest("/admin/courses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title })
    });
    setNewCourseTitle("");
    await loadAdminCatalog();
  }

  async function createSubtopic() {
    const title = newSubtopicTitle.trim();
    if (!title || !selectedCourse) return;
    await apiRequest("/admin/subtopics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ courseId: selectedCourse, title })
    });
    setNewSubtopicTitle("");
    await loadAdminCatalog();
  }

  async function createVideo() {
    const title = newVideoTitle.trim();
    if (!title || !selectedSubtopic) return;
    await apiRequest("/admin/videos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subtopicId: selectedSubtopic,
        title,
        duration: Number(newVideoDuration || 0),
        streamPath: ""
      })
    });
    setNewVideoTitle("");
    setNewVideoDuration(0);
    await loadAdminCatalog();
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

      {catalogError && tab !== "users" && tab !== "news" && <div className="admin-banner">{catalogError}</div>}
      {usersError && tab === "users" && <div className="admin-banner">{usersError}</div>}
      {newsError && tab === "news" && <div className="admin-banner">{newsError}</div>}
      {chatError && tab === "support" && <div className="admin-banner">{chatError}</div>}

      {tab === "subjects" && (
        <div className="admin-tab-panel">
          <section className="card admin-panel-card">
            <h2>Предметы</h2>
            <p className="muted small">Создание и порядок курсов (предметов).</p>
            <div className="admin-inline-form">
              <input value={newCourseTitle} onChange={(e) => setNewCourseTitle(e.target.value)} placeholder="Название предмета" />
              <button type="button" className="btn-primary" onClick={() => void createCourse()}>
                Добавить предмет
              </button>
            </div>
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
                    {course.title}
                  </button>
                  <div className="reorder">
                    <button type="button" aria-label="Выше" onClick={() => void reorderCourses(swapInList(adminCatalog.map((c) => c.id), course.id, -1))}>
                      ↑
                    </button>
                    <button type="button" aria-label="Ниже" onClick={() => void reorderCourses(swapInList(adminCatalog.map((c) => c.id), course.id, 1))}>
                      ↓
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}

      {tab === "chapters" && (
        <div className="admin-tab-panel">
          <section className="card admin-panel-card">
            <h2>Главы</h2>
            <p className="muted small">Выберите предмет, затем добавляйте или упорядочивайте главы.</p>
            <label className="admin-field-label">
              Предмет
              <select
                className="admin-select"
                value={selectedCourse ?? ""}
                onChange={(e) => {
                  const v = e.target.value ? Number(e.target.value) : null;
                  setSelectedCourse(v);
                  const c = adminCatalog.find((x) => x.id === v);
                  setSelectedSubtopic(c?.subtopics?.[0]?.id ?? null);
                }}
              >
                {adminCatalog.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </label>
            <div className="admin-inline-form">
              <input
                value={newSubtopicTitle}
                onChange={(e) => setNewSubtopicTitle(e.target.value)}
                placeholder="Название главы"
                disabled={!selectedCourse}
              />
              <button type="button" className="btn-primary" disabled={!selectedCourse} onClick={() => void createSubtopic()}>
                Добавить главу
              </button>
            </div>
            <ul className="admin-select-list">
              {(selectedCourseObj?.subtopics || []).map((st) => (
                <li key={st.id}>
                  <button type="button" className={selectedSubtopic === st.id ? "pick-row active" : "pick-row"} onClick={() => setSelectedSubtopic(st.id)}>
                    {st.title}
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
          </section>
        </div>
      )}

      {tab === "videos" && (
        <div className="admin-workspace">
          <section className="admin-column card">
            <h2>Предмет</h2>
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
                    {course.title}
                  </button>
                  <div className="reorder">
                    <button type="button" aria-label="Выше" onClick={() => void reorderCourses(swapInList(adminCatalog.map((c) => c.id), course.id, -1))}>
                      ↑
                    </button>
                    <button type="button" aria-label="Ниже" onClick={() => void reorderCourses(swapInList(adminCatalog.map((c) => c.id), course.id, 1))}>
                      ↓
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="admin-column card">
            <h2>Глава</h2>
            <ul className="admin-select-list">
              {(selectedCourseObj?.subtopics || []).map((st) => (
                <li key={st.id}>
                  <button type="button" className={selectedSubtopic === st.id ? "pick-row active" : "pick-row"} onClick={() => setSelectedSubtopic(st.id)}>
                    {st.title}
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
          </section>

          <section className="admin-column card admin-column-wide">
            <h2>Видео</h2>
            <p className="muted small">Внутри выбранной главы — загрузка mp4 для стриминга</p>
            <div className="admin-inline-form admin-inline-form-wrap">
              <input
                value={newVideoTitle}
                onChange={(e) => setNewVideoTitle(e.target.value)}
                placeholder="Название видео"
                disabled={!selectedSubtopic}
              />
              <input
                type="number"
                min={0}
                value={newVideoDuration}
                onChange={(e) => setNewVideoDuration(Number(e.target.value))}
                placeholder="Длительность, сек"
                disabled={!selectedSubtopic}
              />
              <button type="button" className="btn-primary" disabled={!selectedSubtopic} onClick={() => void createVideo()}>
                Добавить видео
              </button>
            </div>

            <ul className="admin-video-list">
              {(selectedSubtopicObj?.videos || []).map((v) => (
                <li key={v.id} className="admin-video-item card">
                  <div>
                    <div className="video-title-line">
                      <strong>#{v.id}</strong> {v.title}
                    </div>
                    <div className="muted small">Файл: {v.streamPath || "—"}</div>
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
                    <label className="upload-label">
                      Загрузить
                      <input
                        type="file"
                        accept="video/*"
                        className="sr-only"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) void uploadVideoFile(v.id, file);
                        }}
                      />
                    </label>
                  </div>
                </li>
              ))}
            </ul>
          </section>
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
