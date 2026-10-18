// A drag shorter than this is a tap or a scroll, not a swipe.
const SWIPE_PX = 50;

export function swipeTo(at: number, count: number, dx: number) {
  if (Math.abs(dx) < SWIPE_PX) return at;
  return Math.max(0, Math.min(count - 1, at + (dx < 0 ? 1 : -1)));
}

// A phone reads at its own pace, but when the table moves on, everyone moves with it.
export function followTable(at: number, prevTable: number, table: number) {
  return table !== prevTable ? table : at;
}
