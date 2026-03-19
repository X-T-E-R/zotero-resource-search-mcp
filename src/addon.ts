import { config } from "../package.json";
import { HttpServer, httpServer } from "./modules/httpServer";
import { serverPreferences } from "./modules/serverPreferences";
import hooks from "./hooks";
import { createZToolkit } from "./utils/ztoolkit";

class Addon {
  public data: {
    alive: boolean;
    config: typeof config;
    env: "development" | "production";
    initialized?: boolean;
    httpServer?: HttpServer | null;
    ztoolkit: ZToolkit;
    locale?: {
      current: any;
    };
    prefs?: {
      window: Window;
    };
  };
  public hooks: typeof hooks;
  public api: object;

  constructor() {
    this.data = {
      alive: true,
      config,
      env: __env__,
      initialized: false,
      ztoolkit: createZToolkit(),
    };
    this.hooks = hooks;
    this.api = {
      startServer: () => {
        addon.data.httpServer?.start(serverPreferences.getPort());
      },
      stopServer: () => {
        addon.data.httpServer?.stop();
      },
    };
  }
}

export default Addon;
