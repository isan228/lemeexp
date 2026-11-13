export function getDeviceId() {
  if (typeof window === "undefined") return "unknown-device";
  let id = localStorage.getItem("deviceId");
  if (!id) {
    // randomUUID нет в Safari < 15.4 и вне https.
    id =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem("deviceId", id);
  }
  return id;
}
