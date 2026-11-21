import { backupPath, createBackup, deleteBackup } from "@/lib/backup/service";
import { readConfig, readState, writeState } from "./storage";
import { uploadSnapshot } from "./network";
import { createRunner, webDavRuntime } from "./runner";

export const runWebDavBackup = createRunner({
  readConfig,
  readState,
  writeState,
  create: createBackup,
  upload: (cfg, name) => uploadSnapshot(cfg, name, backupPath(name)),
  remove: deleteBackup,
  now: Date.now,
}, webDavRuntime);

export function startWebDavScheduler() {
  if (process.env.WEBDAV_SCHEDULER_ENABLED === "0" || webDavRuntime.timer) return;
  // One polling timer per Node app instance. No operation is due until an admin opts in.
  webDavRuntime.timer = setInterval(() => { void runWebDavBackup(); }, 60_000);
  webDavRuntime.timer.unref();
}
