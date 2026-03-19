import { config } from "../../package.json";

const PREFS_PREFIX = config.prefsPrefix;
const MCP_SERVER_PORT = `${PREFS_PREFIX}.mcp.server.port`;
const MCP_SERVER_ENABLED = `${PREFS_PREFIX}.mcp.server.enabled`;

const DEFAULT_PORT = 23121;

type PreferenceObserver = (name: string) => void;

class ServerPreferences {
  private observers: PreferenceObserver[] = [];
  private enabledObserverID: symbol | null = null;
  private portObserverID: symbol | null = null;
  private initialized = false;

  init(): void {
    if (this.initialized) return;
    this.initialized = true;
    try {
      this.initializeDefaults();
      this.register();
    } catch (e) {
      Zotero.debug(`[ServerPreferences] init failed: ${e}`);
    }
  }

  private initializeDefaults(): void {
    const currentPort = Zotero.Prefs.get(MCP_SERVER_PORT, true);
    const currentEnabled = Zotero.Prefs.get(MCP_SERVER_ENABLED, true);

    if (currentPort === undefined || currentPort === null) {
      Zotero.Prefs.set(MCP_SERVER_PORT, DEFAULT_PORT, true);
    }

    if (currentEnabled === undefined || currentEnabled === null) {
      Zotero.Prefs.set(MCP_SERVER_ENABLED, true, true);
    }
  }

  public getPort(): number {
    try {
      const port = Zotero.Prefs.get(MCP_SERVER_PORT, true);
      if (port === undefined || port === null || isNaN(Number(port))) {
        return DEFAULT_PORT;
      }
      return Number(port);
    } catch {
      return DEFAULT_PORT;
    }
  }

  public isServerEnabled(): boolean {
    try {
      const enabled = Zotero.Prefs.get(MCP_SERVER_ENABLED, true);
      if (enabled === undefined || enabled === null) {
        return true;
      }
      return Boolean(enabled);
    } catch {
      return true;
    }
  }

  public addObserver(observer: PreferenceObserver): void {
    this.observers.push(observer);
  }

  public removeObserver(observer: PreferenceObserver): void {
    const index = this.observers.indexOf(observer);
    if (index > -1) {
      this.observers.splice(index, 1);
    }
  }

  private register(): void {
    const notify = (name: string) => {
      this.observers.forEach((observer) => observer(name));
    };
    try {
      this.enabledObserverID = Zotero.Prefs.registerObserver(MCP_SERVER_ENABLED, notify);
      this.portObserverID = Zotero.Prefs.registerObserver(MCP_SERVER_PORT, notify);
    } catch (error) {
      if (typeof ztoolkit !== "undefined") {
        ztoolkit.log(`[ServerPreferences] Error registering observer: ${error}`, "error");
      }
    }
  }

  public unregister(): void {
    if (this.enabledObserverID) {
      Zotero.Prefs.unregisterObserver(this.enabledObserverID);
      this.enabledObserverID = null;
    }
    if (this.portObserverID) {
      Zotero.Prefs.unregisterObserver(this.portObserverID);
      this.portObserverID = null;
    }
    this.observers = [];
  }
}

export const serverPreferences = new ServerPreferences();
