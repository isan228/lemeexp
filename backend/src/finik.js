import { readFileSync } from "node:fs";
import { Signer } from "@mancho.devs/authorizer";

const DEFAULT_PLAN_ID = "standard";

const PLAN_AMOUNTS = {
  standard: Number(process.env.FINIK_AMOUNT || process.env.FINIK_AMOUNT_STANDARD || 1)
};

const PLAN_TITLES = {
  standard: "Lemexplain"
};

export const PLAN_TO_SUBSCRIPTION = {
  standard: "premium"
};

export { DEFAULT_PLAN_ID };

const DEFAULT_FINIK_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAuF/PUmhMPPidcMxhZBPb
BSGJoSphmCI+h6ru8fG8guAlcPMVlhs+ThTjw2LHABvciwtpj51ebJ4EqhlySPyT
hqSfXI6Jp5dPGJNDguxfocohaz98wvT+WAF86DEglZ8dEsfoumojFUy5sTOBdHEu
g94B4BbrJvjmBa1YIx9Azse4HFlWhzZoYPgyQpArhokeHOHIN2QFzJqeriANO+wV
aUMta2AhRVZHbfyJ36XPhGO6A5FYQWgjzkI65cxZs5LaNFmRx6pjnhjIeVKKgF99
4OoYCzhuR9QmWkPl7tL4Kd68qa/xHLz0Psnuhm0CStWOYUu3J7ZpzRK8GoEXRcr8
tQIDAQAB
-----END PUBLIC KEY-----`;

function getApiBaseUrl() {
  return (
    process.env.FINIK_API_BASE ||
    (process.env.FINIK_ENV === "beta"
      ? "https://beta.api.acquiring.averspay.kg"
      : "https://api.acquiring.averspay.kg")
  );
}

function getPrivateKeyPem() {
  if (process.env.FINIK_PRIVATE_PEM) {
    return process.env.FINIK_PRIVATE_PEM.replace(/\\n/g, "\n");
  }
  const keyPath = process.env.FINIK_PRIVATE_KEY_PATH;
  if (keyPath) {
    return readFileSync(keyPath, "utf8");
  }
  return "";
}

function getPublicKeyPem() {
  if (process.env.FINIK_PUBLIC_KEY) {
    return process.env.FINIK_PUBLIC_KEY.replace(/\\n/g, "\n");
  }
  if (process.env.FINIK_ENV === "beta") {
    return `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAwlrlKz/8gLWd1ARWGA/8
o3a3Qy8G+hPifyqiPosiTY6nCHovANMIJXk6DH4qAqqZeLu8pLGxudkPbv8dSyG7
F9PZEAryMPzjoB/9P/F6g0W46K/FHDtwTM3YIVvstbEbL19m8yddv/xCT9JPPJTb
LsSTVZq5zCqvKzpupwlGS3Q3oPyLAYe+ZUn4Bx2J1WQrBu3b08fNaR3E8pAkCK27
JqFnP0eFfa817VCtyVKcFHb5ij/D0eUP519Qr/pgn+gsoG63W4pPHN/pKwQUUiAy
uLSHqL5S2yu1dffyMcMVi9E/Q2HCTcez5OvOllgOtkNYHSv9pnrMRuws3u87+hNT
ZwIDAQAB
-----END PUBLIC KEY-----`;
  }
  return DEFAULT_FINIK_PUBLIC_KEY;
}

export function isFinikConfigured() {
  return Boolean(
    process.env.FINIK_API_KEY &&
      process.env.FINIK_ACCOUNT_ID &&
      getPrivateKeyPem()
  );
}

export function getPlanAmount(plan) {
  const key = plan || DEFAULT_PLAN_ID;
  return PLAN_AMOUNTS[key] ?? null;
}

export function getDefaultPlanId() {
  return DEFAULT_PLAN_ID;
}

export function getPlanTitle(plan) {
  return PLAN_TITLES[plan] ?? "Lemexplain subscription";
}

export function getFrontendBaseUrl() {
  const origins = (process.env.ALLOWED_ORIGINS || "http://localhost:5173")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return process.env.PUBLIC_FRONTEND_URL || origins[0] || "http://localhost:5173";
}

export function getWebhookUrl() {
  if (process.env.FINIK_WEBHOOK_URL) {
    return process.env.FINIK_WEBHOOK_URL;
  }
  const apiPublic = process.env.PUBLIC_API_URL;
  if (apiPublic) {
    return `${apiPublic.replace(/\/$/, "")}/billing/webhook/finik`;
  }
  return "";
}

function collectApiHeaders(headers) {
  const result = {};
  for (const [key, value] of Object.entries(headers)) {
    const lower = key.toLowerCase();
    if (lower === "host" || lower.startsWith("x-api-")) {
      result[lower === "host" ? "Host" : key] = Array.isArray(value) ? value[0] : value;
    }
  }
  return result;
}

export async function createFinikPayment({ paymentId, amount, plan, redirectUrl }) {
  const apiKey = process.env.FINIK_API_KEY;
  const accountId = process.env.FINIK_ACCOUNT_ID;
  const privateKey = getPrivateKeyPem();
  const webhookUrl = getWebhookUrl();

  if (!apiKey || !accountId || !privateKey) {
    throw new Error("Finik is not configured");
  }
  if (!webhookUrl) {
    throw new Error("FINIK_WEBHOOK_URL or PUBLIC_API_URL is required");
  }

  const baseUrl = getApiBaseUrl();
  const host = new URL(baseUrl).host;
  const timestamp = Date.now().toString();
  const path = "/v1/payment";

  const body = {
    Amount: amount,
    CardType: "FINIK_QR",
    PaymentId: paymentId,
    RedirectUrl: redirectUrl,
    Data: {
      accountId,
      name_en: getPlanTitle(plan),
      description: `Subscription ${plan}`,
      webhookUrl,
      additionalData: [
        {
          fieldId: "paymentId",
          name: "Payment ID",
          isHidden: true,
          value: paymentId
        }
      ]
    }
  };

  const requestData = {
    httpMethod: "POST",
    path,
    headers: {
      Host: host,
      "x-api-key": apiKey,
      "x-api-timestamp": timestamp
    },
    body
  };

  const signature = await new Signer(requestData).sign(privateKey);
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "x-api-timestamp": timestamp,
      signature
    },
    body: JSON.stringify(body),
    redirect: "manual"
  });

  if (response.status === 302 || response.status === 301) {
    const paymentUrl = response.headers.get("location");
    if (!paymentUrl) {
      throw new Error("Finik returned redirect without Location header");
    }
    return { paymentUrl, finikStatus: response.status };
  }

  if (response.status === 201) {
    const data = await response.json();
    const paymentUrl = data.paymentUrl || data.PaymentUrl;
    if (!paymentUrl) {
      throw new Error("Finik returned 201 without paymentUrl");
    }
    return { paymentUrl, finikStatus: response.status, finikResponse: data };
  }

  const errorText = await response.text();
  throw new Error(`Finik payment failed (${response.status}): ${errorText}`);
}

export async function verifyFinikWebhook(req, body) {
  const signature = req.headers.signature || req.headers.Signature;
  const timestamp = req.headers["x-api-timestamp"];

  if (!signature || !timestamp) {
    return { ok: false, reason: "Missing signature headers" };
  }

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) {
    return { ok: false, reason: "Invalid timestamp" };
  }

  const maxSkewMs = Number(process.env.FINIK_WEBHOOK_MAX_SKEW_MS || 5 * 60 * 1000);
  if (Math.abs(Date.now() - ts) > maxSkewMs) {
    return { ok: false, reason: "Timestamp out of allowed range" };
  }

  const host = req.headers.host;
  if (!host) {
    return { ok: false, reason: "Missing Host header" };
  }

  const requestData = {
    httpMethod: req.method,
    path: req.path,
    headers: collectApiHeaders({ ...req.headers, Host: host }),
    queryStringParameters: Object.keys(req.query || {}).length ? req.query : undefined,
    body
  };

  const isValid = await new Signer(requestData).verify(getPublicKeyPem(), String(signature));
  if (!isValid) {
    return { ok: false, reason: "Invalid signature" };
  }

  return { ok: true };
}

export function extractPaymentIdFromWebhook(body) {
  return body?.fields?.paymentId || body?.fields?.payment_id || null;
}
