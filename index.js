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
   createSubtitlePng（新仕様）
   - キャンバス幅 1080
   - テキストブロック幅 540
   - 下寄せ中央揃え
   - 最終行が短い場合は前行に吸収
-------------------------------------------------- */
async function createSubtitlePng(text) {
  const canvasWidth = 1080;        // ★ 画面幅と同じ
  const textBlockWidth = 540;      // ★ 折り返し基準
  const baseFontSize = 64;
  const lineHeightRate = 1.35;
  const maxLines = 7;

  // 仮キャンバスで幅を測る
  let canvas = createCanvas(canvasWidth, 2000);
  let ctx = canvas.getContext("2d");
  ctx.font = `700 ${baseFontSize}px NotoSansJP`;

  // ------------------------------
  // 1. 通常の折り返し（540px）
  // ------------------------------
  const lines = [];
  let current = "";

  for (const char of text) {
    const test = current + char;
    const width = ctx.measureText(test).width;

    if (width > textBlockWidth) {
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

  // ------------------------------
  // 2. 最終行が短すぎる場合は前行に吸収
  // ------------------------------
  if (lines.length >= 2) {
    const last = lines[lines.length - 1];
    if (last.length < 5) {
      lines[lines.length - 2] += last;
      lines.pop();
    }
  }

  // ------------------------------
  // 3. キャンバス高さを行数に合わせて決定
  // ------------------------------
  const lineHeight = baseFontSize * lineHeightRate;
  const textHeight = lines.length * lineHeight;
  const bottomMargin = 120; // 下部余白
  const canvasHeight = textHeight + bottomMargin;

  canvas = createCanvas(canvasWidth, canvasHeight);
  ctx = canvas.getContext("2d");
  ctx.font = `700 ${baseFontSize}px NotoSansJP`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  // ------------------------------
  // 4. 描画開始位置（下寄せ）
  // ------------------------------
  let y = canvasHeight - textHeight - bottomMargin + 20;

  // 縁取り（黒）
  ctx.lineWidth = baseFontSize * 0.12;
  ctx.strokeStyle = "black";

  // 本文（白）
  ctx.fillStyle = "white";

  // 描画
  for (const line of lines) {
    ctx.strokeText(line, canvasWidth / 2, y);
    ctx.fillText(line, canvasWidth / 2, y);
    y += lineHeight;
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

