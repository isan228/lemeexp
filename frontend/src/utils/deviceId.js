export function getDeviceId() {
  if (typeof window === "undefined") return "unknown-device";
  let id = localStorage.getItem("deviceId");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("deviceId", id);
  }
  return id;
}
