// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, unmount } from "svelte";

const h = vi.hoisted(() => ({
  opts: undefined as undefined | { onChange: (m: number) => void; onMissing: () => void; stat: () => Promise<number> },
  poller: { start: vi.fn(), stop: vi.fn(), setEnabled: vi.fn() },
}));

vi.mock("./poller.js", () => ({
  createPoller: (o: typeof h.opts) => {
    h.opts = o;
    return h.poller;
  },
}));
vi.mock("../ipc/client.js", () => ({
  filePreview: vi.fn(),
  filePreviewStat: vi.fn(async () => 1),
  filePreviewImage: vi.fn(),
}));

import { filePreview, filePreviewStat } from "../ipc/client.js";
import PreviewPanel from "./PreviewPanel.svelte";

const PATH = "D:\\code\\a.md";
let host: HTMLElement;
let component: ReturnType<typeof mount> | undefined;

const file = (text: string, mtime_ms: number) => ({ path: PATH, text, size: text.length, mtime_ms });

function open(active = true) {
  component = mount(PreviewPanel, {
    target: host,
    props: { tabId: "t", preview: { history: [PATH], index: 0 }, active },
  });
}

const heading = () => host.querySelector("h1")?.textContent;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  h.poller.start.mockClear();
  h.poller.stop.mockClear();
  h.poller.setEnabled.mockClear();
  vi.mocked(filePreview).mockReset();
  document.hasFocus = () => true;
});

afterEach(() => {
  if (component) unmount(component);
  component = undefined;
  host.remove();
});

describe("PreviewPanel", () => {
  it("shows the file and starts watching it from its modified time", async () => {
    vi.mocked(filePreview).mockResolvedValue(file("# One", 111));
    open();
    await vi.waitFor(() => expect(heading()).toBe("One"));
    expect(host.querySelector(".name")?.textContent).toBe("a.md");
    expect(h.poller.start).toHaveBeenCalledWith(111);
  });

  it("watches the file that is shown now", async () => {
    vi.mocked(filePreview).mockResolvedValue(file("# One", 111));
    open();
    await vi.waitFor(() => expect(heading()).toBe("One"));
    await h.opts!.stat();
    expect(filePreviewStat).toHaveBeenCalledWith(PATH);
  });

  it("re-reads the file when the poller reports a change", async () => {
    vi.mocked(filePreview).mockResolvedValue(file("# One", 111));
    open();
    await vi.waitFor(() => expect(heading()).toBe("One"));
    vi.mocked(filePreview).mockResolvedValue(file("# Two", 222));
    h.opts!.onChange(222);
    await vi.waitFor(() => expect(heading()).toBe("Two"));
  });

  it("keeps the last render when the file goes missing, and recovers when it returns", async () => {
    vi.mocked(filePreview).mockResolvedValue(file("# One", 111));
    open();
    await vi.waitFor(() => expect(heading()).toBe("One"));
    h.opts!.onMissing();
    await vi.waitFor(() => expect(host.querySelector(".note")?.textContent).toBe("File no longer exists"));
    expect(heading()).toBe("One");
    vi.mocked(filePreview).mockResolvedValue(file("# Back", 333));
    h.opts!.onChange(333);
    await vi.waitFor(() => expect(heading()).toBe("Back"));
    expect(host.querySelector(".note")).toBeNull();
  });

  it("polls only while the tab is active and the window has focus", async () => {
    vi.mocked(filePreview).mockResolvedValue(file("# One", 111));
    open(true);
    await vi.waitFor(() => expect(h.poller.setEnabled).toHaveBeenLastCalledWith(true));
    window.dispatchEvent(new Event("blur"));
    await vi.waitFor(() => expect(h.poller.setEnabled).toHaveBeenLastCalledWith(false));
    window.dispatchEvent(new Event("focus"));
    await vi.waitFor(() => expect(h.poller.setEnabled).toHaveBeenLastCalledWith(true));
  });

  it("does not poll in a background tab", async () => {
    vi.mocked(filePreview).mockResolvedValue(file("# One", 111));
    open(false);
    await vi.waitFor(() => expect(h.poller.setEnabled).toHaveBeenLastCalledWith(false));
  });

  it("stops the poller and the window listeners when it goes away", async () => {
    vi.mocked(filePreview).mockResolvedValue(file("# One", 111));
    open();
    await vi.waitFor(() => expect(heading()).toBe("One"));
    unmount(component!);
    component = undefined;
    expect(h.poller.stop).toHaveBeenCalled();
    h.poller.setEnabled.mockClear();
    window.dispatchEvent(new Event("blur"));
    expect(h.poller.setEnabled).not.toHaveBeenCalled();
  });

  it("explains a file that cannot be read and does not watch it", async () => {
    vi.mocked(filePreview).mockRejectedValue({ code: "not_found" });
    open();
    await vi.waitFor(() => expect(host.querySelector('[role="alert"]')?.textContent).toBe("File not found"));
    expect(h.poller.start).not.toHaveBeenCalled();
  });
});
