declare const _globalThis: {
  [key: string]: any;
  Zotero: _ZoteroTypes.Zotero;
  ztoolkit: ZToolkit;
  addon: typeof addon;
};

declare type ZToolkit = ReturnType<typeof import("../src/utils/ztoolkit").createZToolkit>;

declare const ztoolkit: ZToolkit;

declare const rootURI: string;

declare const addon: import("../src/addon").default;

declare const __env__: "production" | "development";

/** Gecko / Zotero globals used by provider loader */
declare const Services: any;
declare const Ci: any;
declare const ChromeUtils: any;
declare const Components: any;
declare const Cc: any;
