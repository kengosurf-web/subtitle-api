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
      http://127.0.0.1:3000/image/<id>
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

      // URL を返す
      results.push({
        id: item.seconds,
        url: `http://127.0.0.1:3000/image/${id}`
      });
    }

    res.json(results);

  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "複数字幕PNG生成失敗" });
  }
});

/* --------------------------------------------------
   ⑤ PNG生成関数（複数字幕用）
-------------------------------------------------- */
async function createSubtitlePng(text) {
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

  return optimized;
}

/* --------------------------------------------------
   ⑥ サーバー起動
-------------------------------------------------- */
app.listen(3000, "0.0.0.0", () => {
  console.log("ローカル字幕PNG API 起動: http://127.0.0.1:3000");
});