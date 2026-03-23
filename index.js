import express from "express";
import { createCanvas, registerFont } from "canvas";

const app = express();
app.use(express.json());

// 日本語フォント（Regular のみ）
registerFont("./fonts/NotoSansJP-Regular.ttf", { family: "NotoSansJP" });

/* --------------------------------------------------
   メモリキャッシュ
-------------------------------------------------- */
const cache = new Map();

/* --------------------------------------------------
   PNG を返すエンドポイント
-------------------------------------------------- */
app.get("/image/:id", (req, res) => {
  const id = req.params.id;
  const buffer = cache.get(id);

  if (!buffer) {
    return res.status(404).send("Not found");
  }

  res.set("Content-Type", "image/png");
  res.send(buffer);
});

/* --------------------------------------------------
   複数字幕 PNG 生成
-------------------------------------------------- */
app.post("/multi", async (req, res) => {
  try {
    const items = req.body;
    const results = [];

    for (const item of items) {
      const pngBuffer = await createSubtitlePng(item.subtitle);

      const id = `${Date.now()}-${Math.random()}`;
      cache.set(id, pngBuffer);

      const url = `${req.protocol}://${req.get("host")}/image/${id}`;

      results.push({
        id: item.seconds,
        url
      });
    }

    res.json(results);

  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "複数字幕PNG生成失敗" });
  }
});

/* --------------------------------------------------
   createSubtitlePng（最大7行・幅500対応版）
-------------------------------------------------- */
async function createSubtitlePng(text) {
  const canvasWidth = 1080;
  const baseFontSize = 128;        // フォントサイズ倍
  const lineHeightRate = 1.5;      // 行間広め
  const maxLines = 7;              // ★ 最大7行に変更

  // 仮キャンバスで幅を測る
  let canvas = createCanvas(canvasWidth, 800);
  let ctx = canvas.getContext("2d");
  ctx.font = `700 ${baseFontSize}px NotoSansJP`;

  // 全体幅
  const totalWidth = ctx.measureText(text).width;

  // 行数（最大7行）
  let lineCount = Math.ceil(totalWidth / 500);  // ★ 450 → 500 に変更
  lineCount = Math.min(lineCount, maxLines);

  // 均等割り文字数
  const charsPerLine = Math.ceil(text.length / lineCount);

  // 自然な区切り
  const findNaturalBreak = (str, targetIndex) => {
    const candidates = [
      "。", "、", "，", "！", "？", "」", "）",
      "は", "が", "を", "に", "で", "へ", "と", "も", "から", "まで",
      " "
    ];

    const start = Math.max(0, targetIndex - 5);
    const end = Math.min(str.length, targetIndex + 5);

    let bestIndex = targetIndex;

    for (let i = start; i < end; i++) {
      if (candidates.includes(str[i])) {
        bestIndex = i + 1;
      }
    }
    return bestIndex;
  };

  // 行分割
  let lines = [];
  let remaining = text;

  for (let i = 0; i < lineCount - 1; i++) {
    const target = charsPerLine;
    const breakIndex = findNaturalBreak(remaining, target);
    lines.push(remaining.slice(0, breakIndex));
    remaining = remaining.slice(breakIndex);
  }
  lines.push(remaining);

  // 再描画キャンバス
  canvas = createCanvas(canvasWidth, 800);
  ctx = canvas.getContext("2d");
  ctx.font = `700 ${baseFontSize}px NotoSansJP`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  // 縁取り（黒）
  ctx.lineWidth = baseFontSize * 0.12;
  ctx.strokeStyle = "black";

  // 本文（白）
  ctx.fillStyle = "white";

  // 描画
  let y = 0;
  for (const line of lines) {
    ctx.strokeText(line, canvasWidth / 2, y);
    ctx.fillText(line, canvasWidth / 2, y);
    y += baseFontSize * lineHeightRate;
  }

  return canvas.toBuffer("image/png");
}

/* --------------------------------------------------
   サーバー起動
-------------------------------------------------- */
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});