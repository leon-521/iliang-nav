import { randomBytes } from "node:crypto";
import { isDue, errorText, type ScheduleState, type WebDavConfig } from "./config";

type Dependencies = {
  readConfig: () => WebDavConfig | null;
  readState: (revision: string) => ScheduleState | null;
  writeState: (state: ScheduleState) => void;
  create: (label: string) => Promise<string>;
  upload: (config: WebDavConfig, name: string) => Promise<void>;
  remove: (name: string) => void;
  now: () => number;
};

type ProcessState = { running: boolean; timer?: ReturnType<typeof setInterval> };
const runtime = globalThis as typeof globalThis & { iliangNavWebDav?: ProcessState };
export const webDavRuntime = runtime.iliangNavWebDav ??= { running: false };

export function createRunner(deps: Dependencies, lock: ProcessState) {
  return async function run(manual = false): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
    if (lock.running) return { ok: false, error: "已有 WebDAV 备份正在运行。" };
    lock.running = true;
    let state: ScheduleState | undefined;
    let name: string | undefined;
    try {
      const cfg = deps.readConfig();
      if (!cfg) return { ok: false, error: "请先保存 WebDAV 配置。" };
      const previous = deps.readState(cfg.revision);
      const now = deps.now();
      if (!manual && !isDue(cfg, previous, now)) return { ok: false, error: "调度已关闭或尚未到期。" };
      const started: ScheduleState = {
        revision: cfg.revision,
        lastRun: now,
        lastSuccess: previous?.lastSuccess ?? null,
        lastFile: previous?.lastFile ?? null,
        result: "running",
        error: null,
      };
      // Don't start a network transfer unless we can persist its attempt first.
      deps.writeState(started);
      state = started;
      name = await deps.create(`wd${randomBytes(4).toString("hex")}`);
      await deps.upload(cfg, name);
      deps.writeState({ ...state, lastSuccess: deps.now(), lastFile: name, result: "success" });
      return { ok: true, name };
    } catch (e) {
      const error = errorText(e);
      if (state) {
        try { deps.writeState({ ...state, result: "failed", error }); }
        catch { console.warn("[webdav] Unable to persist backup result."); }
      }
      return { ok: false, error };
    } finally {
      if (name) {
        try { deps.remove(name); }
        catch { console.warn("[webdav] Unable to clean a local staging snapshot."); }
      }
      lock.running = false;
    }
  };
}
