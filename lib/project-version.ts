export const PROJECT_REPOSITORY = "leon-521/iliang-nav";
export const PROJECT_GITHUB_URL = `https://github.com/${PROJECT_REPOSITORY}`;

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

/** VERSION.md declares exactly one stable version on its own line. */
export function parseRepositoryVersion(markdown: string): string | null {
  if (markdown.length > 65_536) return null;
  const declarations = [...markdown.matchAll(/^ver[ \t]*[:：][ \t]*(.+?)[ \t]*\r?$/gim)];
  if (declarations.length !== 1) return null;
  const value = declarations[0][1].trim();
  return stableVersion(value) ? value.replace(/^v/i, "") : null;
}
