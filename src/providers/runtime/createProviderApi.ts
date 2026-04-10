import { HttpClient } from "../../infra/HttpClient";
import { XmlParser } from "../../infra/XmlParser";
import { configProvider } from "../../infra/ConfigProvider";
import { logger } from "../../infra/Logger";
import { RateLimiter } from "../../infra/RateLimiter";
import type { ProviderAPI } from "../_sdk/types";
import type { ProviderManifest } from "../_sdk/types";
import { assertUrlAllowed } from "./urlPermissions";

function buildHttpClient(manifest: ProviderManifest): HttpClient {
  return new HttpClient({ timeout: 30_000 });
}

export function createProviderApi(manifest: ProviderManifest, providerId: string): ProviderAPI {
  const patterns = manifest.permissions.urls;
  const httpInner = buildHttpClient(manifest);
  const allowedGlobal = new Set(manifest.allowedGlobalPrefs ?? []);
  const ratePerMin = manifest.rateLimitPerMinute ?? 60;
  const rateLimiter = new RateLimiter(ratePerMin);

  const prefix = `platform.${providerId}.`;

  const http: ProviderAPI["http"] = {
    async get(url, options) {
      assertUrlAllowed(url, patterns);
      return httpInner.get(url, options as any);
    },
    async post(url, body, options) {
      assertUrlAllowed(url, patterns);
      return httpInner.post(url, body as any, options as any);
    },
  };

  const xml: ProviderAPI["xml"] = {
    parse: (s) => XmlParser.parse(s),
    getText: (doc, tag) => XmlParser.getText(doc as Document, tag),
    getTextAll: (doc, tag) => XmlParser.getTextAll(doc as Document, tag),
    getElements: (parent, tag) => XmlParser.getElements(parent as Document, tag),
    getAttribute: (el, name) => XmlParser.getAttribute(el, name),
  };

  const dom: ProviderAPI["dom"] = {
    parseHTML: (html: string) => new DOMParser().parseFromString(html, "text/html"),
  };

  const config: ProviderAPI["config"] = {
    getString: (key, def) => configProvider.getString(prefix + key, def ?? ""),
    getNumber: (key, def) => configProvider.getNumber(prefix + key, def ?? 0),
    getBool: (key, def) => configProvider.getBool(prefix + key, def ?? false),
  };

  const getGlobalPref = (key: string, def?: string): string => {
    if (!allowedGlobal.has(key)) {
      throw new Error(`Global pref not allowed for this provider: ${key}`);
    }
    return configProvider.getString(key, def ?? "");
  };

  const getGlobalPrefNumber = (key: string, def?: number): number => {
    if (!allowedGlobal.has(key)) {
      throw new Error(`Global pref not allowed for this provider: ${key}`);
    }
    return configProvider.getNumber(key, def ?? 0);
  };

  const getGlobalPrefBool = (key: string, def?: boolean): boolean => {
    if (!allowedGlobal.has(key)) {
      throw new Error(`Global pref not allowed for this provider: ${key}`);
    }
    return configProvider.getBool(key, def ?? false);
  };

  const logPrefix = `[provider:${providerId}]`;

  const log: ProviderAPI["log"] = {
    debug: (m, ...a) => logger.debug(logPrefix, m, ...a),
    info: (m, ...a) => logger.info(logPrefix, m, ...a),
    warn: (m, ...a) => logger.warn(logPrefix, m, ...a),
    error: (m, ...a) => logger.error(logPrefix, m, ...a),
  };

  const rateLimit: ProviderAPI["rateLimit"] = {
    acquire: () => rateLimiter.acquire(),
  };

  return {
    http,
    xml,
    dom,
    config,
    getGlobalPref,
    getGlobalPrefNumber,
    getGlobalPrefBool,
    log,
    rateLimit,
  };
}
