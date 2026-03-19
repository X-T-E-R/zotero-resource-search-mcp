export interface HttpResponse<T> {
  data: T;
  status: number;
  statusText: string;
  headers: Record<string, string>;
}

export interface HttpRequestOptions {
  params?: Record<string, any>;
  headers?: Record<string, string>;
  timeout?: number;
}

export class HttpClient {
  private baseURL: string;
  private defaultHeaders: Record<string, string>;
  private timeout: number;

  constructor(options?: {
    baseURL?: string;
    timeout?: number;
    headers?: Record<string, string>;
  }) {
    this.baseURL = (options?.baseURL ?? "").replace(/\/+$/, "");
    this.timeout = options?.timeout ?? 30_000;
    this.defaultHeaders = {
      Accept: "application/json, text/plain, */*",
      ...options?.headers,
    };
  }

  async get<T = any>(
    url: string,
    options?: HttpRequestOptions,
  ): Promise<HttpResponse<T>> {
    const fullURL = this.buildURL(url, options?.params);
    return this.request<T>(fullURL, {
      method: "GET",
      headers: { ...this.defaultHeaders, ...options?.headers },
      timeout: options?.timeout,
    });
  }

  async post<T = any>(
    url: string,
    body?: any,
    options?: { headers?: Record<string, string> },
  ): Promise<HttpResponse<T>> {
    const fullURL = this.buildURL(url);
    const headers: Record<string, string> = {
      ...this.defaultHeaders,
      ...options?.headers,
    };

    let requestBody: string | undefined;
    if (body !== undefined) {
      if (typeof body === "string") {
        requestBody = body;
      } else {
        headers["Content-Type"] = headers["Content-Type"] ?? "application/json";
        requestBody = JSON.stringify(body);
      }
    }

    return this.request<T>(fullURL, {
      method: "POST",
      headers,
      body: requestBody,
    });
  }

  private buildURL(path: string, params?: Record<string, any>): string {
    let url: string;
    if (/^https?:\/\//i.test(path)) {
      url = path;
    } else {
      url = this.baseURL
        ? `${this.baseURL}/${path.replace(/^\/+/, "")}`
        : path;
    }

    if (params) {
      const qs = this.buildQueryString(params);
      if (qs) {
        url += (url.includes("?") ? "&" : "?") + qs;
      }
    }
    return url;
  }

  private buildQueryString(params: Record<string, any>): string {
    const parts: string[] = [];
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null) continue;
      if (Array.isArray(value)) {
        for (const v of value) {
          parts.push(
            `${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`,
          );
        }
      } else {
        parts.push(
          `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`,
        );
      }
    }
    return parts.join("&");
  }

  private async request<T>(
    url: string,
    init: { method: string; headers: Record<string, string>; body?: string; timeout?: number },
  ): Promise<HttpResponse<T>> {
    const timeoutMs = init.timeout ?? this.timeout;
    const fetchOptions: Record<string, any> = {
      method: init.method,
      headers: init.headers,
      body: init.body,
    };

    let timer: any;
    const AC = typeof AbortController !== "undefined"
      ? AbortController
      : (typeof globalThis !== "undefined" ? (globalThis as any).AbortController : undefined);

    if (AC) {
      const controller = new AC();
      fetchOptions.signal = controller.signal;
      timer = setTimeout(() => controller.abort(), timeoutMs);
    }

    try {
      const fetchFn = typeof fetch !== "undefined"
        ? fetch
        : (typeof globalThis !== "undefined" ? (globalThis as any).fetch : undefined);

      if (!fetchFn) {
        return this.requestViaXHR<T>(url, init, timeoutMs);
      }

      const response = await fetchFn(url, fetchOptions);

      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value: string, key: string) => {
        responseHeaders[key] = value;
      });

      const contentType = response.headers.get("content-type") ?? "";
      let data: any;
      if (contentType.includes("application/json")) {
        data = await response.json();
      } else {
        data = await response.text();
      }

      if (!response.ok) {
        throw new HttpError(
          `HTTP ${response.status}: ${response.statusText}`,
          response.status,
          data,
        );
      }

      return {
        data: data as T,
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private requestViaXHR<T>(
    url: string,
    init: { method: string; headers: Record<string, string>; body?: string },
    timeoutMs: number,
  ): Promise<HttpResponse<T>> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open(init.method, url, true);
      xhr.timeout = timeoutMs;

      for (const [key, value] of Object.entries(init.headers)) {
        try { xhr.setRequestHeader(key, value); } catch { /* skip invalid */ }
      }

      xhr.onload = () => {
        const contentType = xhr.getResponseHeader("content-type") ?? "";
        const text = xhr.responseText ?? "";
        let data: any;
        try {
          data = contentType.includes("application/json")
            ? JSON.parse(text)
            : text;
        } catch {
          data = text;
        }

        if (xhr.status >= 400) {
          reject(new HttpError(`HTTP ${xhr.status}: ${xhr.statusText}`, xhr.status, data));
          return;
        }

        resolve({
          data: data as T,
          status: xhr.status,
          statusText: xhr.statusText,
          headers: {},
        });
      };

      xhr.onerror = () => reject(new HttpError("Network error", 0));
      xhr.ontimeout = () => reject(new HttpError("Request timeout", 0));

      xhr.send(init.body ?? null);
    });
  }
}

export class HttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly responseData?: any,
  ) {
    super(message);
    this.name = "HttpError";
  }
}
