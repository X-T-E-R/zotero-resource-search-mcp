type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

class Logger {
  private prefix = "[ZoteroResourceSearch]";

  private getConfiguredLevel(): LogLevel {
    try {
      const level = Zotero.Prefs.get(
        "extensions.zotero.zotero-resource-search.general.logLevel",
        true,
      ) as string;
      if (level && level in LOG_LEVELS) return level as LogLevel;
    } catch {
      /* default */
    }
    return "info";
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.getConfiguredLevel()];
  }

  debug(...args: any[]) {
    if (this.shouldLog("debug")) {
      Zotero.debug(`${this.prefix} [DEBUG] ${args.map(String).join(" ")}`);
    }
  }

  info(...args: any[]) {
    if (this.shouldLog("info")) {
      Zotero.debug(`${this.prefix} [INFO] ${args.map(String).join(" ")}`);
    }
  }

  warn(...args: any[]) {
    if (this.shouldLog("warn")) {
      Zotero.debug(`${this.prefix} [WARN] ${args.map(String).join(" ")}`);
    }
  }

  error(...args: any[]) {
    if (this.shouldLog("error")) {
      Zotero.debug(`${this.prefix} [ERROR] ${args.map(String).join(" ")}`);
    }
  }

  time(label: string): () => number {
    const start = Date.now();
    return () => {
      const elapsed = Date.now() - start;
      this.info(`${label} completed in ${elapsed}ms`);
      return elapsed;
    };
  }
}

export const logger = new Logger();
