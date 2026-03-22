import express from "express";
import sharp from "sharp";
import { createCanvas, registerFont } from "canvas";

const app = express();
app.use(express.json());

// 日本語フォントを登録
registerFont("./fonts/NotoSansJP-Regular.ttf", { family: "NotoSansJP" });

/* --------------------------------------------------
   ① メモリキャッシュ（PNGバッファを保存）
-------------------------------------------------- */
const cache = new Map();

/* --------------------------------------------------
   ② PNG を返す URL エンドポイント
      /image/<id>
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
   ③ 単体テスト用（既存の /test）
-------------------------------------------------- */
app.post("/test", async (req, res) => {
  try {
    const text = req.body.text || "テスト";

    const width = 1080;
    const height = 250;

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    ctx.clearRect(0, 0, width, height);

    ctx.font = "64px NotoSansJP";
    ctx.fillStyle = "white";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    ctx.fillText(text, width / 2, height / 2);

    const buffer = canvas.toBuffer("image/png");
    const optimized = await sharp(buffer).png().toBuffer();

    res.json({
      base64: optimized.toString("base64")
    });

  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "PNG生成失敗" });
  }
});

/* --------------------------------------------------
   ④ 複数字幕を PNG 化して URL を返す /multi
-------------------------------------------------- */
app.post("/multi", async (req, res) => {
  try {
    const items = req.body; // n8n からの字幕配列
    const results = [];

    for (const item of items) {
      const pngBuffer = await createSubtitlePng(item.subtitle);

      // キャッシュIDを作成
      const id = `${Date.now()}-${Math.random()}`;
      cache.set(id, pngBuffer);

      // Render でもローカルでも動く URL
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
   ⑤ PNG生成関数（折り返し枠を中央に揃えた完全版）
-------------------------------------------------- */
async function createSubtitlePng(text) {
  const canvasWidth = 1080;   // スマホ縦動画の幅
  const maxWidth = 900;       // 折り返し幅
  const offsetX = (canvasWidth - maxWidth) / 2; // ← 折り返し枠を中央に配置
  let fontSize = 64;
  const lineHeightRate = 1.3;

  // 仮キャンバス
  let canvas = createCanvas(canvasWidth, 400);
  let ctx = canvas.getContext("2d");

  ctx.font = `${fontSize}px NotoSansJP`;

  // --- 折り返し関数（中央枠対応） ---
  const wrapText = (ctx, text, maxWidth) => {
    const chars = text.split("");
    let line = "";
    let lines = [];

    for (let c of chars) {
      const test = line + c;
      if (ctx.measureText(test).width > maxWidth) {
        lines.push(line);
        line = c;
      } else {
        line = test;
      }
    }
    lines.push(line);
    return lines;
  };

  // 1回目の折り返し
  let lines = wrapText(ctx, text, maxWidth);

  // 最大行幅
  let maxLineWidth = Math.max(...lines.map(l => ctx.measureText(l).width));

  // --- 自動リサイズ ---
  const scale = maxWidth / maxLineWidth;
  const finalFontSize = fontSize * scale;

  // 再描画キャンバス
  canvas = createCanvas(canvasWidth, 400);
  ctx = canvas.getContext("2d");
  ctx.font = `${finalFontSize}px NotoSansJP`;
  ctx.fillStyle = "white";
  ctx.textAlign = "left";     // ← 左揃え（中央枠の左端に合わせる）
  ctx.textBaseline = "top";

  // 2回目の折り返し
  lines = wrapText(ctx, text, maxWidth);

  // 描画開始位置
  let y = 0;

  for (let line of lines) {
    ctx.fillText(line, offsetX, y);  // ← 折り返し枠の左端に描画
    y += finalFontSize * lineHeightRate;
  }

  // PNG バッファ
  const buffer = canvas.toBuffer("image/png");

  // Sharp で余白を自動トリム
  const trimmed = await sharp(buffer).trim().toBuffer();

  return trimmed;
}

/* --------------------------------------------------
   ⑥ サーバー起動（Render 対応）
-------------------------------------------------- */
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});