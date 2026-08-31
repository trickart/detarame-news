/** JST での今日の日付 (YYYY-MM-DD) */
export function todayJST(): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
    dateStyle: "short",
  }).format(new Date());
}

/** YYYY-MM-DD → 「Y年M月D日(曜)」 */
export function formatDateJa(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const weekday = ["日", "月", "火", "水", "木", "金", "土"][
    new Date(`${date}T00:00:00+09:00`).getDay()
  ];
  return `${y}年${m}月${d}日(${weekday})`;
}
