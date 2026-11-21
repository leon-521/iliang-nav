export function moveRelative<T>(items: readonly T[], source: T, target: T, after: boolean): T[] | null {
  if (source === target || !items.includes(source) || !items.includes(target)) return null;
  const next = items.filter((item) => item !== source);
  next.splice(next.indexOf(target) + Number(after), 0, source);
  return next;
}
