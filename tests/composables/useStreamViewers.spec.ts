import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, type EffectScope } from "vue";
import {
  countOwnViewing,
  useStreamViewers,
} from "~/composables/useStreamViewers";

describe("useStreamViewers", () => {
  let scope: EffectScope;

  beforeEach(() => {
    scope = effectScope();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: false })),
    );
  });

  afterEach(() => {
    scope.stop();
    vi.unstubAllGlobals();
  });

  it("counts a viewer before the server has caught up with them", () => {
    const count = scope.run(() => useStreamViewers().getCount("own-1"))!;
    expect(count.value).toBeNull();

    const first = countOwnViewing("own-1");
    const second = countOwnViewing("own-1");
    expect(count.value).toBe(1);

    first();
    expect(count.value).toBe(1);

    second();
    expect(count.value).toBeNull();
  });

  it("goes by the server's count once it is at least the viewer", () => {
    const viewers = scope.run(() => useStreamViewers())!;
    const count = viewers.getCount("own-2");
    const stop = countOwnViewing("own-2");

    viewers.viewers.value = { "own-2": 0 };
    expect(count.value).toBe(1);

    viewers.viewers.value = { "own-2": 4 };
    expect(count.value).toBe(4);

    stop();
  });
});
