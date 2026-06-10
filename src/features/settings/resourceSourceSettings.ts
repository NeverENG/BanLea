import type { ResourceSourceId } from "@/core/sources";

export type ResourceSourceAvailability = "ready" | "planned";
export type ResourceSourceCredentialMode = "none" | "optional" | "required";

export interface ResourceSourceDefinition {
  id: ResourceSourceId;
  label: string;
  defaultEnabled: boolean;
  availability: ResourceSourceAvailability;
  credentialMode: ResourceSourceCredentialMode;
  detail: string;
}

export interface ResourceSourceRuntimeStatus extends ResourceSourceDefinition {
  enabled: boolean;
  usable: boolean;
}

export interface ResourceSourceSettingsStore {
  load(): Promise<Record<string, boolean>> | Record<string, boolean>;
  save(settings: Record<string, boolean>): Promise<void> | void;
}

export interface ResourceSourceSettingsService {
  loadStatus(): Promise<ResourceSourceRuntimeStatus[]>;
  setEnabled(
    sourceId: ResourceSourceId,
    enabled: boolean,
  ): Promise<ResourceSourceRuntimeStatus[]>;
}

const STORAGE_KEY = "banlea.resourceSources.v1";

export const RESOURCE_SOURCE_DEFINITIONS: ResourceSourceDefinition[] = [
  {
    id: "github",
    label: "GitHub",
    defaultEnabled: true,
    availability: "ready",
    credentialMode: "optional",
    detail: "官方 REST API，匿名可用，token 后续接 keychain。",
  },
  {
    id: "web",
    label: "通用网页",
    defaultEnabled: false,
    availability: "planned",
    credentialMode: "none",
    detail: "预留 Claude web_search / web_fetch 接入。",
  },
  {
    id: "docs",
    label: "文档站",
    defaultEnabled: false,
    availability: "planned",
    credentialMode: "none",
    detail: "预留官方文档站索引。",
  },
  {
    id: "arxiv",
    label: "arXiv",
    defaultEnabled: false,
    availability: "planned",
    credentialMode: "none",
    detail: "预留学术资料源。",
  },
  {
    id: "video",
    label: "视频",
    defaultEnabled: false,
    availability: "planned",
    credentialMode: "none",
    detail: "预留 Bilibili / YouTube 官方 API。",
  },
  {
    id: "zhihu",
    label: "知乎",
    defaultEnabled: false,
    availability: "planned",
    credentialMode: "required",
    detail: "仅预留官方 OAuth，不做爬虫兜底。",
  },
];

function localStorageAvailable(): boolean {
  return typeof globalThis.localStorage !== "undefined";
}

function parseStoredSettings(value: string | null): Record<string, boolean> {
  if (!value) {
    return {};
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }
    return Object.fromEntries(
      Object.entries(parsed).filter(([, enabled]) => typeof enabled === "boolean"),
    ) as Record<string, boolean>;
  } catch {
    return {};
  }
}

const localStorageStore: ResourceSourceSettingsStore = {
  load() {
    if (!localStorageAvailable()) {
      return {};
    }
    return parseStoredSettings(globalThis.localStorage.getItem(STORAGE_KEY));
  },
  save(settings) {
    if (!localStorageAvailable()) {
      return;
    }
    globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  },
};

function knownSource(sourceId: ResourceSourceId): boolean {
  return RESOURCE_SOURCE_DEFINITIONS.some((source) => source.id === sourceId);
}

function toRuntimeStatus(
  definition: ResourceSourceDefinition,
  settings: Record<string, boolean>,
): ResourceSourceRuntimeStatus {
  const enabled = settings[definition.id] ?? definition.defaultEnabled;
  return {
    ...definition,
    enabled,
    usable: enabled && definition.availability === "ready",
  };
}

export function createResourceSourceSettingsService(
  store: ResourceSourceSettingsStore = localStorageStore,
): ResourceSourceSettingsService {
  async function loadSettings(): Promise<Record<string, boolean>> {
    return store.load();
  }

  async function loadStatus(): Promise<ResourceSourceRuntimeStatus[]> {
    const settings = await loadSettings();
    return RESOURCE_SOURCE_DEFINITIONS.map((definition) =>
      toRuntimeStatus(definition, settings),
    );
  }

  return {
    loadStatus,

    async setEnabled(sourceId, enabled) {
      if (!knownSource(sourceId)) {
        throw new Error(`unknown resource source: ${sourceId}`);
      }
      const settings = await loadSettings();
      await store.save({
        ...settings,
        [sourceId]: enabled,
      });
      return loadStatus();
    },
  };
}

export function enabledResourceSourceIds(
  statuses: ResourceSourceRuntimeStatus[],
): ResourceSourceId[] {
  return statuses.filter((status) => status.usable).map((status) => status.id);
}
