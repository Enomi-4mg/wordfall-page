// テキストをコンテナ幅に収めるためのフォント自動縮小ユーティリティ。
// テキスト幅はフォントサイズにほぼ線形なので、必要幅と使える幅の比から
// 収まるフォントサイズを 1 発で算出する。

// 単一要素をコンテナ幅に収める（最小サイズまで縮小、省略はしない）。
export function fitTextToWidth(el, minSize = 12) {
  if (!el) return;
  el.style.whiteSpace = "nowrap";
  el.style.fontSize = ""; // CSS 既定サイズにリセットしてから計測
  const base = parseFloat(getComputedStyle(el).fontSize);
  if (!base || el.scrollWidth <= el.clientWidth) return;
  const fitted = Math.max(minSize, Math.floor(base * (el.clientWidth / el.scrollWidth) * 0.98));
  el.style.fontSize = `${fitted}px`;
}

// 複数要素をまとめて処理する。read/write を分離してレイアウトスラッシングを避ける。
export function fitTextList(els, minSize = 12) {
  els.forEach((el) => {
    el.style.whiteSpace = "nowrap";
    el.style.fontSize = "";
  });
  const plan = els.map((el) => {
    const base = parseFloat(getComputedStyle(el).fontSize);
    return base && el.scrollWidth > el.clientWidth
      ? Math.max(minSize, Math.floor(base * (el.clientWidth / el.scrollWidth) * 0.98))
      : null;
  });
  els.forEach((el, i) => {
    if (plan[i] != null) el.style.fontSize = `${plan[i]}px`;
  });
}
