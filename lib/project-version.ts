/** Compare numeric release versions. Other tag formats cannot prove update status. */
function stableVersion(value: string) {
  return /^v?(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})(?:\+[\w.-]+)?$/i.exec(value.trim())?.slice(1, 4).map(Number);
}

export function compareReleaseVersions(current: string, remote: string) {
  const local = stableVersion(current);
  const release = stableVersion(remote);
  if (!local || !release) return "unknown";
  for (let index = 0; index < release.length; index++) {
    if (local[index] < release[index]) return "update";
    if (local[index] > release[index]) return "ahead";
  }
  return "latest";
}
