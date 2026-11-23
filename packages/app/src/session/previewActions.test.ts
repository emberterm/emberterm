import { describe, it, expect, vi, beforeEach } from "vitest";
import { get } from "svelte/store";

vi.mock("../ipc/client.js", () => ({ previewResolve: vi.fn(), filePreview: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));

import { open } from "@tauri-apps/plugin-dialog";
import { filePreview, previewResolve } from "../ipc/client.js";
import { tabs, toasts, addTab, setPaneCwd, openPreview } from "../stores/app.js";
import { terminalConfig } from "../stores/terminalConfigStore.js";
import { previewFromTerminal, previewFromDialog, togglePreview, handlePaneCommand } from "./previewActions.js";

const tab = () => get(tabs)[0];

beforeEach(() => {
  tabs.set([]);
  toasts.set([]);
  vi.mocked(previewResolve).mockReset();
  vi.mocked(filePreview).mockReset();
  vi.mocked(open).mockReset();
  addTab("s1", "bash", "bash", "git-bash");
  setPaneCwd("s1", "/d/api");
});

describe("previewFromTerminal", () => {
  it("resolves the path for the pane's shell and folder, then opens it", async () => {
    vi.mocked(previewResolve).mockResolvedValue("D:/api/README.md");
    vi.mocked(filePreview).mockResolvedValue({ path: "D:/api/README.md", text: "", size: 0, mtime_ms: 1 });
    await previewFromTerminal("s1", "README.md");
    expect(previewResolve).toHaveBeenCalledWith({ profileId: "git-bash", cwd: "/d/api", raw: "README.md" });
    expect(tab().preview?.history).toEqual(["D:/api/README.md"]);
    expect(get(toasts)).toEqual([]);
  });

  it("tells the user when the path cannot be resolved, and opens nothing", async () => {
    vi.mocked(previewResolve).mockRejectedValue({ code: "unresolvable", reason: "network paths are not previewed" });
    await previewFromTerminal("s1", "//srv/a.md");
    expect(get(toasts).map((t) => t.message)).toEqual(["network paths are not previewed"]);
    expect(tab().preview).toBeUndefined();
    expect(filePreview).not.toHaveBeenCalled();
  });

  it("tells the user when the file is missing, and opens nothing", async () => {
    vi.mocked(previewResolve).mockResolvedValue("D:/api/gone.md");
    vi.mocked(filePreview).mockRejectedValue({ code: "not_found" });
    await previewFromTerminal("s1", "gone.md");
    expect(get(toasts).map((t) => t.message)).toEqual(["File not found"]);
    expect(tab().preview).toBeUndefined();
  });

  it("does nothing for a session that is not in any tab", async () => {
    await previewFromTerminal("nope", "a.md");
    expect(previewResolve).not.toHaveBeenCalled();
  });
});

describe("previewFromDialog", () => {
  it("opens the chosen file in the active tab", async () => {
    vi.mocked(open).mockResolvedValue("D:\\docs\\a.md");
    vi.mocked(filePreview).mockResolvedValue({ path: "D:\\docs\\a.md", text: "", size: 0, mtime_ms: 1 });
    await previewFromDialog();
    expect(tab().preview?.history).toEqual(["D:\\docs\\a.md"]);
  });

  it("does nothing when the dialog is cancelled", async () => {
    vi.mocked(open).mockResolvedValue(null);
    await previewFromDialog();
    expect(tab().preview).toBeUndefined();
    expect(filePreview).not.toHaveBeenCalled();
  });
});

describe("togglePreview", () => {
  it("closes an open preview", async () => {
    openPreview(tab().id, "D:/a.md");
    await togglePreview();
    expect(tab().preview).toBeUndefined();
    expect(open).not.toHaveBeenCalled();
  });

  it("asks for a file when none is open", async () => {
    vi.mocked(open).mockResolvedValue(null);
    await togglePreview();
    expect(open).toHaveBeenCalledTimes(1);
  });
});

describe("handlePaneCommand", () => {
  const setting = (on: boolean) => terminalConfig.update((c) => ({ ...c, previewOnCat: on }));

  it("only records the command while the setting is off", () => {
    setting(false);
    handlePaneCommand("s1", "cat README.md");
    expect(previewResolve).not.toHaveBeenCalled();
    expect(tab().history).toEqual(["cat README.md"]);
  });

  it("opens the file of a cat command when the setting is on, and still records it", async () => {
    setting(true);
    vi.mocked(previewResolve).mockResolvedValue("D:/api/README.md");
    vi.mocked(filePreview).mockResolvedValue({ path: "D:/api/README.md", text: "", size: 0, mtime_ms: 1 });
    handlePaneCommand("s1", "cat README.md");
    await vi.waitFor(() => expect(tab().preview?.history).toEqual(["D:/api/README.md"]));
    expect(previewResolve).toHaveBeenCalledWith({ profileId: "git-bash", cwd: "/d/api", raw: "README.md" });
    expect(tab().history).toEqual(["cat README.md"]);
  });

  it("ignores commands that only look like cat, even with the setting on", () => {
    setting(true);
    handlePaneCommand("s1", "cat a.md | head");
    expect(previewResolve).not.toHaveBeenCalled();
    setting(false);
  });
});
