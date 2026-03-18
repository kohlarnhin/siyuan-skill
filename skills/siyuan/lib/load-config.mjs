import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const TOKEN_PLACEHOLDER = "__FILL_ME__";

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function readJsonFile(filePath, { required }) {
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);

    if (!isPlainObject(parsed)) {
      throw new Error("配置文件根节点必须是 JSON 对象");
    }

    return parsed;
  } catch (error) {
    if (!required && error && typeof error === "object" && error.code === "ENOENT") {
      return {};
    }

    const label = filePath.split("/").slice(-2).join("/");
    throw new Error(`无法读取配置文件 ${label}`);
  }
}

function pickFirstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null) {
      return value;
    }
  }

  return undefined;
}

function normalizeBaseUrl(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().replace(/\/+$/, "");
}

function normalizeToken(value) {
  if (typeof value !== "string") {
    return "";
  }

  const token = value.trim();
  if (!token || token === TOKEN_PLACEHOLDER) {
    return "";
  }

  return token;
}

function normalizePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) {
      return true;
    }

    if (["0", "false", "no", "off"].includes(normalized)) {
      return false;
    }
  }

  return fallback;
}

function assertSafeBaseUrl(baseUrl, allowRemote) {
  let parsedUrl;

  try {
    parsedUrl = new URL(baseUrl);
  } catch {
    throw new Error("思源地址不是合法 URL。请检查 baseUrl 配置。");
  }

  const protocol = parsedUrl.protocol.toLowerCase();
  if (protocol !== "http:" && protocol !== "https:") {
    throw new Error("思源地址只支持 http:// 或 https:// 协议。");
  }

  const hostname = parsedUrl.hostname.toLowerCase();
  const isLocalHost = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]" || hostname === "0.0.0.0";

  if (!allowRemote && !isLocalHost) {
    throw new Error(
      "出于安全考虑，当前只允许连接本地思源地址。若你确认要使用远程地址，请在本地配置或环境变量中显式开启 allowRemote / SIYUAN_ALLOW_REMOTE。",
    );
  }

  if (allowRemote && !isLocalHost && protocol !== "https:") {
    throw new Error("远程思源地址必须使用 https://，以避免 Token 在网络中明文传输。");
  }
}

export async function loadConfig({ skillDir }) {
  const defaultsPath = join(skillDir, "config", "siyuan.defaults.json");
  const localConfigPath = join(skillDir, "config", "siyuan.config.local.json");
  const exampleConfigPath = join(skillDir, "config", "siyuan.config.example.json");

  const defaults = await readJsonFile(defaultsPath, { required: true });
  const localConfig = await readJsonFile(localConfigPath, { required: false });

  const baseUrl = normalizeBaseUrl(
    pickFirstDefined(process.env.SIYUAN_BASE_URL, process.env.SIYUAN_API_URL, localConfig.baseUrl, defaults.baseUrl),
  );
  const token = normalizeToken(pickFirstDefined(process.env.SIYUAN_TOKEN, localConfig.token));
  const timeoutMs = normalizePositiveInteger(
    pickFirstDefined(process.env.SIYUAN_TIMEOUT_MS, localConfig.timeoutMs, defaults.timeoutMs),
    10000,
  );
  const defaultLimit = normalizePositiveInteger(
    pickFirstDefined(process.env.SIYUAN_DEFAULT_LIMIT, localConfig.defaultLimit, defaults.defaultLimit),
    20,
  );
  const maxLimit = normalizePositiveInteger(
    pickFirstDefined(process.env.SIYUAN_MAX_LIMIT, localConfig.maxLimit, defaults.maxLimit),
    100,
  );
  const allowRemote = normalizeBoolean(pickFirstDefined(process.env.SIYUAN_ALLOW_REMOTE, localConfig.allowRemote), false);

  if (!baseUrl) {
    throw new Error(
      "缺少思源地址。请设置环境变量 SIYUAN_BASE_URL / SIYUAN_API_URL，或填写 config/siyuan.config.local.json。",
    );
  }

  if (!token) {
    throw new Error(
      "缺少思源 Token。请设置环境变量 SIYUAN_TOKEN，或填写 config/siyuan.config.local.json。",
    );
  }

  assertSafeBaseUrl(baseUrl, allowRemote);

  return {
    baseUrl,
    token,
    timeoutMs,
    defaultLimit,
    maxLimit,
    allowRemote,
    paths: {
      defaultsPath,
      localConfigPath,
      exampleConfigPath,
    },
  };
}
