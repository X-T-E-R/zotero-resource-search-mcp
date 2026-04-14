import type { PluggableProviderImpl, ProviderAPI, ProviderManifest } from "./_sdk/types";

import arxivManifest from "./packages/arxiv/manifest.json";
import { createProvider as createArxivProvider } from "./packages/arxiv/index";
import biorxivManifest from "./packages/biorxiv/manifest.json";
import { createProvider as createBiorxivProvider } from "./packages/biorxiv/index";
import cqvipManifest from "./packages/cqvip/manifest.json";
import { createProvider as createCqvipProvider } from "./packages/cqvip/index";
import crossrefManifest from "./packages/crossref/manifest.json";
import { createProvider as createCrossrefProvider } from "./packages/crossref/index";
import medrxivManifest from "./packages/medrxiv/manifest.json";
import { createProvider as createMedrxivProvider } from "./packages/medrxiv/index";
import pubmedManifest from "./packages/pubmed/manifest.json";
import { createProvider as createPubmedProvider } from "./packages/pubmed/index";
import scopusManifest from "./packages/scopus/manifest.json";
import { createProvider as createScopusProvider } from "./packages/scopus/index";
import semanticManifest from "./packages/semantic/manifest.json";
import { createProvider as createSemanticProvider } from "./packages/semantic/index";
import wosManifest from "./packages/wos/manifest.json";
import { createProvider as createWosProvider } from "./packages/wos/index";
import zjusummonManifest from "./packages/zjusummon/manifest.json";
import { createProvider as createZjusummonProvider } from "./packages/zjusummon/index";

export interface BuiltinProviderDefinition {
  manifest: ProviderManifest;
  createProvider: (api: ProviderAPI) => PluggableProviderImpl;
}

export const builtinProviderCatalog: BuiltinProviderDefinition[] = [
  { manifest: arxivManifest as ProviderManifest, createProvider: createArxivProvider },
  { manifest: biorxivManifest as ProviderManifest, createProvider: createBiorxivProvider },
  { manifest: cqvipManifest as ProviderManifest, createProvider: createCqvipProvider },
  { manifest: crossrefManifest as ProviderManifest, createProvider: createCrossrefProvider },
  { manifest: medrxivManifest as ProviderManifest, createProvider: createMedrxivProvider },
  { manifest: pubmedManifest as ProviderManifest, createProvider: createPubmedProvider },
  { manifest: scopusManifest as ProviderManifest, createProvider: createScopusProvider },
  { manifest: semanticManifest as ProviderManifest, createProvider: createSemanticProvider },
  { manifest: wosManifest as ProviderManifest, createProvider: createWosProvider },
  { manifest: zjusummonManifest as ProviderManifest, createProvider: createZjusummonProvider },
];
