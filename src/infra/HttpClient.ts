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
  withCredentials?: boolean;
}

export class HttpClient {
  private baseURL: string;
  private defaultHeaders: Record<string, string>;
  private timeout: number;
  private cookieSandboxes = new Map<string, Zotero.CookieSandbox>();

  constructor(options?: { baseURL?: string; timeout?: number; headers?: Record<string, string> }) {
    this.baseURL = (options?.baseURL ?? "").replace(/\/+$/, "");
    this.timeout = options?.timeout ?? 30_000;
    this.defaultHeaders = {
      Accept: "application/json, text/plain, */*",
      ...options?.headers,
    };
  }

  async get<T = any>(url: string, options?: HttpRequestOptions): Promise<HttpResponse<T>> {
    const fullURL = this.buildURL(url, options?.params);
    return this.request<T>(fullURL, {
      method: "GET",
      headers: { ...this.defaultHeaders, ...options?.headers },
      timeout: options?.timeout,
      withCredentials: options?.withCredentials,
    });
  }

  async post<T = any>(
    url: string,
    body?: any,
    options?: { headers?: Record<string, string>; timeout?: number; withCredentials?: boolean },
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
      timeout: options?.timeout,
      withCredentials: options?.withCredentials,
    });
  }

  private buildURL(path: string, params?: Record<string, any>): string {
    let url: string;
    if (/^https?:\/\//i.test(path)) {
      url = path;
    } else {
      url = this.baseURL ? `${this.baseURL}/${path.replace(/^\/+/, "")}` : path;
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
          parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
        }
      } else {
        parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
      }
    }
    return parts.join("&");
  }

  private parseXHRHeaders(rawHeaders: string): Record<string, string> {
    const headers: Record<string, string> = {};
    for (const line of rawHeaders.split(/\r?\n/)) {
      const idx = line.indexOf(":");
      if (idx <= 0) continue;
      const key = line.slice(0, idx).trim().toLowerCase();
      const value = line.slice(idx + 1).trim();
      if (!key) continue;
      headers[key] = headers[key] ? `${headers[key]}, ${value}` : value;
    }
    return headers;
  }

  private collectXHRResponseHeaders(xhr: XMLHttpRequest): {
    headers: Record<string, string>;
    setCookies: string[];
  } {
    const headers = this.parseXHRHeaders(xhr.getAllResponseHeaders() ?? "");
    const setCookies: string[] = [];

    try {
      const channel = (xhr as any).channel;
      if (channel && typeof channel.visitResponseHeaders === "function") {
        channel.visitResponseHeaders({
          visitHeader: (name: string, value: string) => {
            const key = name.toLowerCase();
            headers[key] = headers[key] ? `${headers[key]}, ${value}` : value;
            if (key === "set-cookie") {
              setCookies.push(value);
            }
          },
        });
      }
    } catch {
      const fallback = xhr.getResponseHeader("Set-Cookie");
      if (fallback) {
        setCookies.push(fallback);
      }
    }

    return { headers, setCookies };
  }

  private persistResponseCookies(url: string, setCookies: string[]): void {
    if (setCookies.length === 0) return;

    let target: URL;
    try {
      target = new URL(url);
    } catch {
      return;
    }

    for (const rawCookie of setCookies) {
      const segments = rawCookie
        .split(";")
        .map((segment) => segment.trim())
        .filter(Boolean);
      const first = segments.shift();
      if (!first) continue;
      const nameIndex = first.indexOf("=");
      if (nameIndex <= 0) continue;

      const name = first.slice(0, nameIndex).trim();
      const value = first.slice(nameIndex + 1).trim();
      if (!name) continue;

      let host = target.hostname;
      let path = "/";
      let isSecure = false;
      let isHttpOnly = false;
      let isSession = true;
      let expiry = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;

      for (const segment of segments) {
        const separator = segment.indexOf("=");
        const attrKey = (separator >= 0 ? segment.slice(0, separator) : segment)
          .trim()
          .toLowerCase();
        const attrValue = separator >= 0 ? segment.slice(separator + 1).trim() : "";

        switch (attrKey) {
          case "path":
            path = attrValue || "/";
            break;
          case "domain":
            host = attrValue.replace(/^\./, "") || host;
            break;
          case "secure":
            isSecure = true;
            break;
          case "httponly":
            isHttpOnly = true;
            break;
          case "max-age": {
            const seconds = Number(attrValue);
            if (Number.isFinite(seconds)) {
              isSession = false;
              expiry = Math.floor(Date.now() / 1000) + seconds;
            }
            break;
          }
          case "expires": {
            const ts = Date.parse(attrValue);
            if (Number.isFinite(ts)) {
              isSession = false;
              expiry = Math.floor(ts / 1000);
            }
            break;
          }
        }
      }

      try {
        Services.cookies.add(
          host,
          path,
          name,
          value,
          isSecure,
          isHttpOnly,
          isSession,
          expiry,
          {},
          Ci.nsICookie.SAMESITE_LAX,
          target.protocol === "https:" ? Ci.nsICookie.SCHEME_HTTPS : Ci.nsICookie.SCHEME_HTTP,
        );
      } catch {
        /* ignore cookie persistence failures */
      }
    }
  }

  private extractFetchSetCookies(headers: Headers): string[] {
    try {
      const getter = (headers as any).getSetCookie;
      if (typeof getter === "function") {
        const values = getter.call(headers);
        if (Array.isArray(values)) {
          return values.filter((value) => typeof value === "string" && value.trim());
        }
      }
    } catch {
      /* ignore */
    }

    const merged = headers.get("set-cookie");
    return merged ? [merged] : [];
  }

  private getCookieSandbox(url: string): Zotero.CookieSandbox | undefined {
    try {
      const target = new URL(url);
      const key = target.origin;
      const existing = this.cookieSandboxes.get(key);
      if (existing) {
        return existing;
      }
      const CookieSandboxCtor = (Zotero as any).CookieSandbox as
        | (new (browser: unknown, uri: string | URL, cookieData: string, userAgent: string) => Zotero.CookieSandbox)
        | undefined;
      if (!CookieSandboxCtor) {
        return undefined;
      }
      const sandbox = new CookieSandboxCtor(
        null,
        target.origin,
        "",
        typeof navigator !== "undefined" ? navigator.userAgent : "",
      );
      this.cookieSandboxes.set(key, sandbox);
      return sandbox;
    } catch {
      return undefined;
    }
  }

  private async requestViaZoteroHttp<T>(
    url: string,
    init: {
      method: string;
      headers: Record<string, string>;
      body?: string;
      withCredentials?: boolean;
    },
    timeoutMs: number,
  ): Promise<HttpResponse<T>> {
    const xhr = await Zotero.HTTP.request(init.method, url, {
      body: init.body,
      headers: init.headers,
      cookieSandbox: init.withCredentials ? this.getCookieSandbox(url) : undefined,
      responseType: "text",
      timeout: timeoutMs,
    });

    const responseHeaders = this.parseXHRHeaders(xhr.getAllResponseHeaders() ?? "");
    const contentType =
      xhr.getResponseHeader("content-type") ?? responseHeaders["content-type"] ?? "";
    const text = xhr.responseText ?? "";
    let data: any;
    try {
      data = contentType.includes("application/json") ? JSON.parse(text) : text;
    } catch {
      data = text;
    }

    return {
      data: data as T,
      status: xhr.status,
      statusText: xhr.statusText,
      headers: responseHeaders,
    };
  }

  private getCookieHeader(url: string): string {
    try {
      const target = new URL(url);
      const cookies = Services.cookies.getCookiesFromHost(target.hostname, {}, true);
      const pairs = cookies
        .filter((cookie: nsICookie) => {
          if (!cookie?.name) return false;
          if (cookie.isSecure && target.protocol !== "https:") return false;
          const cookiePath = cookie.path || "/";
          return target.pathname.startsWith(cookiePath);
        })
        .map((cookie: nsICookie) => `${cookie.name}=${cookie.value}`);
      return pairs.join("; ");
    } catch {
      return "";
    }
  }

  private async request<T>(
    url: string,
    init: {
      method: string;
      headers: Record<string, string>;
      body?: string;
      timeout?: number;
      withCredentials?: boolean;
    },
  ): Promise<HttpResponse<T>> {
    const timeoutMs = init.timeout ?? this.timeout;
    const fetchOptions: Record<string, any> = {
      method: init.method,
      headers: init.headers,
      body: init.body,
      credentials: init.withCredentials ? "include" : "same-origin",
    };

    let timer: any;
    const AC =
      typeof AbortController !== "undefined"
        ? AbortController
        : typeof globalThis !== "undefined"
          ? (globalThis as any).AbortController
          : undefined;

    if (AC) {
      const controller = new AC();
      fetchOptions.signal = controller.signal;
      timer = setTimeout(() => controller.abort(), timeoutMs);
    }

    try {
      if (init.withCredentials && typeof (Zotero as any)?.HTTP?.request === "function") {
        return this.requestViaZoteroHttp<T>(url, init, timeoutMs);
      }

      const fetchFn =
        typeof fetch !== "undefined"
          ? fetch
          : typeof globalThis !== "undefined"
            ? (globalThis as any).fetch
            : undefined;

      if (!fetchFn) {
        return this.requestViaXHR<T>(url, init, timeoutMs);
      }

      try {
        const response = await fetchFn(url, fetchOptions);

        const responseHeaders: Record<string, string> = {};
        response.headers.forEach((value: string, key: string) => {
          responseHeaders[key] = value;
        });
        if (init.withCredentials) {
          this.persistResponseCookies(url, this.extractFetchSetCookies(response.headers));
        }

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
      } catch (error) {
        if (!init.withCredentials) {
          throw error;
        }
      }

      return this.requestViaXHR<T>(url, init, timeoutMs);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private requestViaXHR<T>(
    url: string,
    init: {
      method: string;
      headers: Record<string, string>;
      body?: string;
      withCredentials?: boolean;
    },
    timeoutMs: number,
  ): Promise<HttpResponse<T>> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open(init.method, url, true);
      xhr.timeout = timeoutMs;
      xhr.withCredentials = Boolean(init.withCredentials);

      const cookieHeader =
        init.withCredentials && !("Cookie" in init.headers) && !("cookie" in init.headers)
          ? this.getCookieHeader(url)
          : "";
      if (cookieHeader) {
        init.headers = {
          ...init.headers,
          Cookie: cookieHeader,
        };
      }

      for (const [key, value] of Object.entries(init.headers)) {
        try {
          xhr.setRequestHeader(key, value);
        } catch {
          /* skip invalid */
        }
      }

      xhr.onload = () => {
        const { headers: responseHeaders, setCookies } = this.collectXHRResponseHeaders(xhr);
        this.persistResponseCookies(url, setCookies);
        const contentType =
          xhr.getResponseHeader("content-type") ?? responseHeaders["content-type"] ?? "";
        const text = xhr.responseText ?? "";
        let data: any;
        try {
          data = contentType.includes("application/json") ? JSON.parse(text) : text;
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
          headers: responseHeaders,
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
