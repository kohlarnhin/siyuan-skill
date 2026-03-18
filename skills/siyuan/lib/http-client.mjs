export class SiyuanHttpClient {
  constructor(config) {
    this.baseUrl = config.baseUrl;
    this.token = config.token;
    this.timeoutMs = config.timeoutMs;
  }

  async request(endpoint, params) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Token ${this.token}`,
        },
        body: params === undefined ? undefined : JSON.stringify(params),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
      }

      let result;
      try {
        result = await response.json();
      } catch {
        throw new Error("SiYuan API 返回了无法解析的 JSON 响应");
      }

      if (!result || typeof result !== "object" || Array.isArray(result)) {
        throw new Error("SiYuan API 返回了无效响应");
      }

      if (result.code !== 0) {
        const message = typeof result.msg === "string" && result.msg.trim() ? result.msg.trim() : "Unknown error";
        throw new Error(`SiYuan API error: ${message}`);
      }

      return result.data;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`HTTP request timed out after ${this.timeoutMs}ms`);
      }

      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
