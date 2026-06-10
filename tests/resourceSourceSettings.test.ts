import { describe, expect, it } from "vitest";
import {
  createResourceSourceSettingsService,
  enabledResourceSourceIds,
  type ResourceSourceSettingsStore,
} from "@/features/settings/resourceSourceSettings";

function memoryStore(initial: Record<string, boolean> = {}): {
  store: ResourceSourceSettingsStore;
  value: Record<string, boolean>;
} {
  const state = { value: { ...initial } };
  return {
    get value() {
      return state.value;
    },
    store: {
      load: () => state.value,
      save: (settings) => {
        state.value = { ...settings };
      },
    },
  };
}

describe("resource source settings", () => {
  it("loads default source statuses", async () => {
    const { store } = memoryStore();
    const service = createResourceSourceSettingsService(store);

    const statuses = await service.loadStatus();

    expect(statuses.find((status) => status.id === "github")).toMatchObject({
      enabled: true,
      usable: true,
      availability: "ready",
      credentialMode: "optional",
    });
    expect(enabledResourceSourceIds(statuses)).toEqual(["github"]);
  });

  it("persists enabled source overrides", async () => {
    const fixture = memoryStore();
    const service = createResourceSourceSettingsService(fixture.store);

    const statuses = await service.setEnabled("github", false);

    expect(fixture.value.github).toBe(false);
    expect(statuses.find((status) => status.id === "github")).toMatchObject({
      enabled: false,
      usable: false,
    });
    expect(enabledResourceSourceIds(statuses)).toEqual([]);
  });

  it("does not mark planned sources as usable even when enabled", async () => {
    const { store } = memoryStore({ arxiv: true });
    const service = createResourceSourceSettingsService(store);

    const statuses = await service.loadStatus();

    expect(statuses.find((status) => status.id === "arxiv")).toMatchObject({
      enabled: true,
      usable: false,
      availability: "planned",
    });
    expect(enabledResourceSourceIds(statuses)).toEqual(["github"]);
  });
});
