import { httpServer } from "./modules/httpServer";
import { serverPreferences } from "./modules/serverPreferences";
import { getString, initLocale } from "./utils/locale";
import { registerPrefsScripts } from "./utils/prefs";
import { createZToolkit } from "./utils/ztoolkit";
import { config } from "../package.json";
import { initProviders } from "./providers/init";

async function onStartup() {
  await Promise.all([Zotero.initializationPromise, Zotero.unlockPromise, Zotero.uiReadyPromise]);

  try {
    const Cu = Components.utils as any;
    let L10nReg: any, FileSrc: any;
    try {
      const mod = Cu.importESModule("resource://gre/modules/L10nRegistry.sys.mjs");
      L10nReg = mod.L10nRegistry;
      FileSrc = mod.FileSource;
    } catch {
      try {
        const mod = Cu.import("resource://gre/modules/L10nRegistry.jsm");
        L10nReg = mod.L10nRegistry;
        FileSrc = mod.FileSource;
      } catch {
        /* unavailable */
      }
    }
    if (L10nReg && FileSrc) {
      const source = new FileSrc(
        "zotero-resource-search",
        ["en-US", "zh-CN"],
        rootURI + "locale/{locale}/",
      );
      L10nReg.getInstance().registerSources([source]);
    }
  } catch (e) {
    ztoolkit.log(`L10n source registration failed: ${e}`, "warn");
  }

  try {
    initLocale();
  } catch (e) {
    Zotero.debug(`[ResourceSearch] initLocale failed: ${e}`);
  }

  serverPreferences.init();

  try {
    await initProviders();
  } catch (e) {
    Zotero.debug(`[ResourceSearch] initProviders failed: ${e}`);
  }

  try {
    const port = serverPreferences.getPort();
    const enabled = serverPreferences.isServerEnabled();

    addon.data.httpServer = httpServer;

    if (enabled !== false) {
      if (!port || isNaN(port)) {
        throw new Error(`Invalid port value: ${port}`);
      }
      httpServer.start(port);
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    Zotero.debug(`[ResourceSearch] Failed to start HTTP server: ${err.message}`);
  }

  serverPreferences.addObserver(async (name) => {
    const prefix = config.prefsPrefix;
    if (name === `${prefix}.mcp.server.port` || name === `${prefix}.mcp.server.enabled`) {
      try {
        if (httpServer.isServerRunning()) {
          httpServer.stop();
        }
        if (serverPreferences.isServerEnabled()) {
          const port = serverPreferences.getPort();
          httpServer.start(port);
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        Zotero.debug(`[ResourceSearch] Error handling preference change: ${err.message}`);
      }
    }
  });

  let prefsLabel = "Zotero Resource Search MCP";
  try {
    prefsLabel = getString("prefs-title") || prefsLabel;
  } catch {
    // locale not ready yet
  }

  Zotero.PreferencePanes.register({
    pluginID: addon.data.config.addonID,
    src: rootURI + "content/preferences.xhtml",
    label: prefsLabel,
  });

  await Promise.all(Zotero.getMainWindows().map((win) => onMainWindowLoad(win)));

  addon.data.initialized = true;
}

async function onMainWindowLoad(win: _ZoteroTypes.MainWindow): Promise<void> {
  addon.data.ztoolkit = createZToolkit();

  win.MozXULElement.insertFTLIfNeeded(`${addon.data.config.addonRef}-addon.ftl`);
  win.MozXULElement.insertFTLIfNeeded(`${addon.data.config.addonRef}-preferences.ftl`);
}

async function onMainWindowUnload(_win: Window): Promise<void> {
  ztoolkit.unregisterAll();
}

function onShutdown(): void {
  try {
    if (httpServer.isServerRunning()) {
      httpServer.stop();
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    ztoolkit.log(`Error stopping HTTP server: ${err.message}`, "error");
  }

  serverPreferences.unregister();
  ztoolkit.unregisterAll();
  addon.data.alive = false;
  // @ts-expect-error - Plugin instance is not typed
  delete Zotero[addon.data.config.addonInstance];
}

async function onNotify(
  event: string,
  type: string,
  ids: Array<string | number>,
  extraData: { [key: string]: any },
) {
  ztoolkit.log("notify", event, type, ids, extraData);
}

async function onPrefsEvent(type: string, data: { [key: string]: any }) {
  switch (type) {
    case "load":
      registerPrefsScripts(data.window);
      break;
    default:
      return;
  }
}

export default {
  onStartup,
  onShutdown,
  onMainWindowLoad,
  onMainWindowUnload,
  onNotify,
  onPrefsEvent,
};
