import { afterEach, describe, expect, it, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import DemoUpload from "~/components/DemoUpload.vue";

const DEMO_MAGIC = [0x50, 0x42, 0x44, 0x45, 0x4d, 0x53, 0x32, 0x00];

const demoFile = () =>
  new File([new Uint8Array([...DEMO_MAGIC, 1, 2, 3])], "match.dem");

function dragEvent(type: string, file?: File) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", {
    value: { types: ["Files"], files: file ? [file] : [] },
  });
  return event as DragEvent;
}

function stubInitiate() {
  const fetchMock = vi.fn(async () => new Response("stop", { status: 500 }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

let mounted: Array<{ unmount: () => void }> = [];

async function mountUpload() {
  const wrapper = await mountSuspended(DemoUpload, {
    attachTo: document.body,
  });
  mounted.push(wrapper);
  return wrapper;
}

const initiated = (fetchMock: ReturnType<typeof vi.fn>) =>
  fetchMock.mock.calls.some(([url]) =>
    String(url).endsWith("/steam-match-history/upload/initiate"),
  );

afterEach(() => {
  for (const wrapper of mounted) {
    wrapper.unmount();
  }
  mounted = [];
  vi.unstubAllGlobals();
});

describe("DemoUpload drop target", () => {
  it("uploads a demo dropped outside the drop zone", async () => {
    const fetchMock = stubInitiate();
    await mountUpload();

    const drop = dragEvent("drop", demoFile());
    document.body.dispatchEvent(drop);
    await flushPromises();

    expect(drop.defaultPrevented).toBe(true);
    expect(initiated(fetchMock)).toBe(true);
  });

  it("lets a file be dropped anywhere on the page", async () => {
    stubInitiate();
    await mountUpload();

    const over = dragEvent("dragover");
    document.body.dispatchEvent(over);

    expect(over.defaultPrevented).toBe(true);
  });

  it("stays highlighted while the drag crosses the zone's own text", async () => {
    stubInitiate();
    const wrapper = await mountUpload();
    const zone = wrapper.get('[role="button"]').element;
    const label = zone.querySelector("p")!;

    zone.dispatchEvent(dragEvent("dragenter"));
    label.dispatchEvent(dragEvent("dragenter"));
    zone.dispatchEvent(dragEvent("dragleave"));
    await flushPromises();

    expect(zone.className).toContain("border-primary");
  });

  it("stops taking drops once it is closed", async () => {
    const fetchMock = stubInitiate();
    const wrapper = await mountSuspended(DemoUpload, {
      attachTo: document.body,
    });
    wrapper.unmount();

    const drop = dragEvent("drop", demoFile());
    document.body.dispatchEvent(drop);
    await flushPromises();

    expect(drop.defaultPrevented).toBe(false);
    expect(initiated(fetchMock)).toBe(false);
  });
});
