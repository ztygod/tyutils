import fs from "fs";
import path from "path";
import express from "express";

const app = express();
const PORT = 3000;

// 中间件
app.use(express.json());
app.use(express.raw({ type: "application/octet-stream", limit: "50mb" }));

const UPLOAD_DIR = path.resolve("uploads");
const MERGE_DIR = path.resolve("merged");

// 确保目录存在
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(MERGE_DIR, { recursive: true });

// 查询已上传分片
app.get("/status", (req, res) => {
  const { fileId } = req.query;
  if (!fileId) return res.status(400).json({ error: "fileId required" });

  const dir = path.join(UPLOAD_DIR, fileId);
  if (!fs.existsSync(dir)) return res.json({ uploaded: [] });

  const files = fs.readdirSync(dir);
  const uploaded = files.map((f) => parseInt(f.split(".")[0], 10));
  res.json({ uploaded });
});

// 上传分片
app.post("/upload", (req, res) => {
  const fileId = req.query.fileId;
  const index = req.query.index;

  if (!fileId || !index) {
    return res.status(400).json({ error: "fileId & index required" });
  }

  const dir = path.join(UPLOAD_DIR, fileId);
  fs.mkdirSync(dir, { recursive: true });

  const filePath = path.join(dir, `${index}.part`);
  fs.writeFileSync(filePath, req.body);

  res.json({ success: true });
});

// 合并分片
app.post("/merge", async (req, res) => {
  const { fileId, chunkLength, metadata } = req.body;
  if (!fileId || chunkLength == null) {
    return res.status(400).json({ error: "fileId & chunkLength required" });
  }

  const dir = path.join(UPLOAD_DIR, fileId);
  if (!fs.existsSync(dir)) {
    return res.status(400).json({ error: "No uploaded chunks found" });
  }

  const outputFile = path.join(MERGE_DIR, `${fileId}.bin`);
  const writeStream = fs.createWriteStream(outputFile);

  console.log(`Merging ${chunkLength} chunks for ${fileId}...`);

  for (let i = 0; i < chunkLength; i++) {
    const chunkPath = path.join(dir, `${i}.part`);
    if (!fs.existsSync(chunkPath)) {
      return res.status(400).json({ error: `Missing chunk ${i}` });
    }
    const chunkData = fs.readFileSync(chunkPath);
    writeStream.write(chunkData);
  }
  writeStream.end();

  // 清理分片
  writeStream.on("finish", () => {
    fs.rmSync(dir, { recursive: true, force: true });
    console.log("Merge complete & chunks cleaned");

    res.json({
      success: true,
      fileId,
      metadata,
      savedPath: `/merged/${fileId}.bin`,
    });
  });
});

// 静态服务
app.use("/merged", express.static(MERGE_DIR));

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
