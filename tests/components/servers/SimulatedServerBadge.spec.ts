import { describe, expect, it } from "vitest";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import SimulatedServerBadge from "~/components/servers/SimulatedServerBadge.vue";

describe("SimulatedServerBadge", () => {
  it("marks a server that reports running the simulator", async () => {
    const wrapper = await mountSuspended(SimulatedServerBadge, {
      props: { runtime: "simulator" },
    });

    expect(wrapper.text()).toBe("Simulated");
  });

  it.each(["swiftlys2", "counterstrikesharp", null, undefined])(
    "says nothing about a server running %s",
    async (runtime) => {
      const wrapper = await mountSuspended(SimulatedServerBadge, {
        props: { runtime },
      });

      expect(wrapper.text()).toBe("");
    },
  );
});
