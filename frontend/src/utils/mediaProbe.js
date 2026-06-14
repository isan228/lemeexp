function mapServerMediaError(status, message) {
  const msg = String(message || "").trim();
  if (status === 401) {
    if (msg === "Invalid device") {
      return "Ошибка устройства. Выйдите из аккаунта и войдите снова.";
    }
    if (msg === "Invalid access token") {
      return "Сессия видео истекла. Обновите страницу.";
    }
    return msg ? `Доступ к видео запрещён: ${msg}` : "Доступ к видео запрещён (401).";
  }
  if (status === 404) {
    if (msg === "File not found") {
      return "Файл не найден на сервере. Загрузите видео в админке ещё раз.";
    }
    if (msg === "No uploaded media for this video") {
      return "К уроку не привязан файл. Загрузите mp4 в админке.";
    }
    return msg || "Видео не найдено на сервере (404).";
  }
  if (status === 503) {
    return "Сервер видео временно недоступен. Попробуйте позже.";
  }
  return msg ? `Ошибка сервера (${status}): ${msg}` : `Ошибка сервера (${status}).`;
}

/** Проверяет URL до <video src> — иначе 401/404 JSON выглядят как «неподдерживаемый формат». */
export async function probeMediaStream(src) {
  try {
    let res = await fetch(src, { method: "HEAD" });
    if (res.status === 405 || res.status === 501) {
      res = await fetch(src, { headers: { Range: "bytes=0-0" } });
    }
    if (!res.ok) {
      let message = "";
      try {
        const ct = (res.headers.get("content-type") || "").toLowerCase();
        if (ct.includes("application/json")) {
          const data = await res.json();
          message = data.message || "";
        }
      } catch {
        /* ignore */
      }
      return { ok: false, message: mapServerMediaError(res.status, message) };
    }
    const contentType = (res.headers.get("content-type") || "").toLowerCase();
    if (contentType.includes("application/json")) {
      return { ok: false, message: "Сервер вернул ошибку вместо видеофайла." };
    }
    return { ok: true };
  } catch {
    return { ok: null, message: "" };
  }
}

export function mapVideoElementError(code) {
  if (code === 2) return "Сеть прервала загрузку видео. Проверьте интернет и обновите страницу.";
  if (code === 3) return "Ошибка декодирования видео.";
  if (code === 4) {
    return "Браузер не смог открыть поток. Часто это файл не на сервере или неверный кодек — нужен MP4 (H.264 + AAC).";
  }
  return "Не удалось воспроизвести видео.";
}
