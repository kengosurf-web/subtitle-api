import express from "express";
import sharp from "sharp";
import { createCanvas, registerFont } from "canvas";

const app = express();
app.use(express.json());

// 日本語フォント
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
   強制分割方式 createSubtitlePng（本体）
-------------------------------------------------- */
async function createSubtitlePng(text) {
  const canvasWidth = 1080;
  const maxWidth = 900;
  const offsetX = (canvasWidth - maxWidth) / 2; // 90px
  const baseFontSize = 64;
  const lineHeightRate = 1.3;

  // 仮キャンバスで幅を測る
  let canvas = createCanvas(canvasWidth, 400);
  let ctx = canvas.getContext("2d");
  ctx.font = `${baseFontSize}px NotoSansJP`;

  // 全体幅
  const totalWidth = ctx.measureText(text).width;

  // 🎯 行数 = ceil(totalWidth / 450)
  const lineCount = Math.max(1, Math.ceil(totalWidth / 450));

  // 🎯 均等割りの文字数
  const charsPerLine = Math.ceil(text.length / lineCount);

  // 🎯 自然な区切りを探す
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

  // 🎯 行ごとに分割
  let lines = [];
  let remaining = text;

  for (let i = 0; i < lineCount - 1; i++) {
    const target = charsPerLine;
    const breakIndex = findNaturalBreak(remaining, target);
    lines.push(remaining.slice(0, breakIndex));
    remaining = remaining.slice(breakIndex);
  }
  lines.push(remaining);

  // 🎯 再描画キャンバス
  canvas = createCanvas(canvasWidth, 400);
  ctx = canvas.getContext("2d");
  ctx.font = `${baseFontSize}px NotoSansJP`;
  ctx.fillStyle = "white";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";

  // 🎯 描画
  let y = 0;
  for (const line of lines) {
    ctx.fillText(line, offsetX, y);
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