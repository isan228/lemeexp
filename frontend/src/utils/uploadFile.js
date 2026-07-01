import { apiBase } from "../config.js";
import { getDeviceId } from "./deviceId.js";

/**
 * POST multipart через XHR — без таймаута браузера, с прогрессом загрузки.
 */
export function uploadMultipart(path, { token, formData, onProgress }) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${apiBase}${path}`);
    xhr.timeout = 0;

    if (token) {
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    }
    const deviceId = getDeviceId();
    if (deviceId) {
      xhr.setRequestHeader("x-device-id", deviceId);
    }

    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(event.loaded, event.total);
      }
    });

    xhr.addEventListener("load", () => {
      let data = null;
      const text = xhr.responseText || "";
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = { message: text };
        }
      }
      resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, data });
    });

    xhr.addEventListener("error", () => {
      reject(new Error("Соединение оборвалось во время загрузки"));
    });

    xhr.addEventListener("abort", () => {
      reject(new Error("Загрузка отменена"));
    });

    xhr.send(formData);
  });
}

export function formatUploadProgress(loaded, total) {
  const pct = total > 0 ? Math.round((loaded / total) * 100) : 0;
  const loadedGb = (loaded / (1024 * 1024 * 1024)).toFixed(2);
  const totalGb = (total / (1024 * 1024 * 1024)).toFixed(2);
  return `${pct}% (${loadedGb} / ${totalGb} ГБ)`;
}
