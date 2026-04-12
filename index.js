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
   複数字幕 PNG 生成（軽量版）
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
   createSubtitlePng（軽量版・最終サイズで生成）
-------------------------------------------------- */
async function createSubtitlePng(text) {
  const canvasWidth = 540;          // ★ 最終サイズ（1080 の 0.5）
  const baseFontSize = 64;          // ★ 最終フォントサイズ（128 の 0.5）
  const lineHeightRate = 1.35;      // ★ 行間も最適化
  const maxLines = 7;
  const maxWidth = 500;             // ★ 折り返し幅も最終サイズに合わせる

  // 仮キャンバスで幅を測る
  let canvas = createCanvas(canvasWidth, 600);
  let ctx = canvas.getContext("2d");
  ctx.font = `700 ${baseFontSize}px NotoSansJP`;

  const lines = [];
  let current = "";

  for (const char of text) {
    const test = current + char;
    const width = ctx.measureText(test).width;

    if (width > maxWidth) {
      lines.push(current);
      current = char;
      if (lines.length >= maxLines) break;
    } else {
      current = test;
    }
  }

  if (current && lines.length < maxLines) {
    lines.push(current);
  }

  /* --------------------------------------------------
     描画キャンバス（最終サイズ）
  -------------------------------------------------- */
  canvas = createCanvas(canvasWidth, 600);
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
