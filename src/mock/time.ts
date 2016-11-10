export function mockTime(offset: number) {
  let base = new Date(1478492726987);
  base.setSeconds(base.getSeconds() + offset);
  return base;
}
