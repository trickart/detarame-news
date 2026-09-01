/** JST での今日の日付 (YYYY-MM-DD) */
export function todayJST(): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
    dateStyle: "short",
  }).format(new Date());
}

/**
 * YYYY-MM-DD → 「Y年M月D日(曜)」
 *
 * 引数は JST の暦日なので、瞬間ではなく暦日として扱う。
 * getDay() は実行環境のローカルタイムゾーンでの曜日を返すため、
 * UTC で動く CI 上では 1 日前の曜日になってしまう。
 */
export function formatDateJa(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const weekday = ["日", "月", "火", "水", "木", "金", "土"][
    new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  ];
  return `${y}年${m}月${d}日(${weekday})`;
}
