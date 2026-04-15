import express from "express";
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
   PNG を返す
-------------------------------------------------- */
app.get("/image/:id", (req, res) => {
  const buffer = cache.get(req.params.id);
  if (!buffer) return res.status(404).send("Not found");
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

      results.push({
        id: item.seconds,
        url: `${req.protocol}://${req.get("host")}/image/${id}`
      });
    }

    res.json(results);

  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "複数字幕PNG生成失敗" });
  }
});

/* --------------------------------------------------
   createSubtitlePng（最終仕様）
   - 折り返し基準：6文字（幅540px）
   - 自然改行：句読点・助詞の後で切る
   - 4文字以下の行は前行に吸収（最大13文字まで）
   - テキストブロック中央配置（上下左右）
   - 行はブロック内で下寄せ
-------------------------------------------------- */
async function createSubtitlePng(text) {
  const canvasWidth = 1080;
  const textBlockWidth = 540;
  const baseFontSize = 56;
  const lineHeightRate = 1.35;
  const maxLines = 7;

  // 仮キャンバス
  let canvas = createCanvas(canvasWidth, 2000);
  let ctx = canvas.getContext("2d");
  ctx.font = `700 ${baseFontSize}px NotoSansJP`;

  /* --------------------------------------------------
     1. 自然な場所で切る折り返し（6文字基準）
  -------------------------------------------------- */
  const lines = [];
  let current = "";

  const particles = ["が", "を", "に", "で", "は", "も", "へ", "から", "まで", "より"];
  const punctuation = ["。", "、"];

  for (const char of text) {
    const test = current + char;
    const width = ctx.measureText(test).width;

    if (width > textBlockWidth) {
      // デフォルトは6文字基準の位置
      let cutIndex = current.length;

      // ① 句読点の後で切る
      for (let i = current.length - 1; i >= 0; i--) {
        if (punctuation.includes(current[i])) {
          cutIndex = i + 1;
          break;
        }
      }

      // ② 助詞の後で切る
      for (let i = current.length - 1; i >= 0; i--) {
        if (particles.includes(current[i])) {
          cutIndex = i + 1;
          break;
        }
      }

      // 行を確定
      lines.push(current.slice(0, cutIndex));
      current = current.slice(cutIndex) + char;

      if (lines.length >= maxLines) break;

    } else {
      current = test;
    }
  }

  if (current && lines.length < maxLines) {
    lines.push(current);
  }

  /* --------------------------------------------------
     2. 4文字以下の行は前行に吸収（吸収後13文字以内）
        安定するまで繰り返す
  -------------------------------------------------- */
  let changed = true;

  while (changed) {
    changed = false;

    for (let i = 1; i < lines.length; i++) {
      const curr = lines[i];
      const prev = lines[i - 1];

      if (curr.length <= 4) {
        if ((prev.length + curr.length) <= 13) {
          lines[i - 1] = prev + curr;
          lines.splice(i, 1);
          changed = true;
          break;
        }
      }
    }
  }

  /* --------------------------------------------------
     3. テキストブロックの高さ
  -------------------------------------------------- */
  const lineHeight = baseFontSize * lineHeightRate;
  const textHeight = lines.length * lineHeight;
  const canvasHeight = textHeight + 400;

  canvas = createCanvas(canvasWidth, canvasHeight);
  ctx = canvas.getContext("2d");
  ctx.font = `700 ${baseFontSize}px NotoSansJP`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  /* --------------------------------------------------
     4. テキストブロック中央配置
  -------------------------------------------------- */
  const blockTop = (canvasHeight - textHeight) / 2;

  /* --------------------------------------------------
     5. ブロック内の下寄せ
  -------------------------------------------------- */
  let y = blockTop + (textHeight - lines.length * lineHeight);

  ctx.lineWidth = baseFontSize * 0.12;
  ctx.strokeStyle = "black";
  ctx.fillStyle = "white";

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
