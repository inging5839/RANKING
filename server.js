const express = require("express");
const path = require("path");
const fs = require("fs");
const app = express();
const port = 3000;
const livereload = require("livereload");
const LIVE_RELOAD_PORT = 35730;
const PROFILE_IMAGE_DIR = path.resolve(__dirname, "../kiosk_game/assets/profile_image");
const PROFILE_IMAGE_COUNT = (() => {
  try {
    return fs.readdirSync(PROFILE_IMAGE_DIR).filter((name) => {
      const lower = name.toLowerCase();
      return (
        lower.endsWith(".png") ||
        lower.endsWith(".jpg") ||
        lower.endsWith(".jpeg") ||
        lower.endsWith(".webp")
      );
    }).length;
  } catch (error) {
    console.warn("프로필 이미지 폴더를 읽지 못했습니다:", error.message);
    return 20;
  }
})();

app.use(require("connect-livereload")({ port: LIVE_RELOAD_PORT }));

// CORS: 게임이 file:// 또는 다른 오리진에서 열려도 점수 등록이 가능하도록 허용
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use(express.json());
app.use(express.static("public"));
app.use(
  "/kiosk_game",
  express.static(path.resolve(__dirname, "../kiosk_game")),
);

app.get("/profile_image/:filename", (req, res) => {
  const requested = decodeURIComponent(req.params.filename || "");
  if (!requested) return res.status(404).end();

  const target = path.resolve(PROFILE_IMAGE_DIR, requested);
  if (!target.startsWith(PROFILE_IMAGE_DIR)) return res.status(403).end();
  if (!fs.existsSync(target)) return res.status(404).end();

  res.sendFile(target);
});

const server = app.listen(port, () => {
  console.log("서버 실행");
});
server.on("error", (err) => {
  if (err && err.code === "EADDRINUSE") {
    console.error(`포트 ${port} 사용 중: 기존 서버를 종료 후 다시 실행하세요.`);
    process.exit(1);
  }
  throw err;
});

const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database("./ranking.db");

const liveReload = livereload.createServer({ port: LIVE_RELOAD_PORT });
liveReload.server.on("error", (err) => {
  if (err && err.code === "EADDRINUSE") {
    console.warn(
      `livereload 포트 ${LIVE_RELOAD_PORT} 사용 중 - 라이브리로드 없이 계속 실행합니다.`,
    );
    return;
  }
  throw err;
});
liveReload.watch("./public");

app.get("/api/ranking", (req, res) => {
  const selectQuery = "SELECT * FROM rankings ORDER BY score DESC";

  db.all(selectQuery, [], (err, rows) => {
    if (err) {
      console.error("에러 발생:", err);
    } else {
      res.json(rows);
    }
  });
});

app.post("/api/ranking", (req, res) => {
  const body = req.body || {};
  const rawNick = typeof body.nickname === "string" ? body.nickname.trim() : "";
  const score = Number.isFinite(Number(body.score))
    ? Math.max(0, Math.round(Number(body.score)))
    : 0;
  const gameIndex = Number.isFinite(Number(body.game_index))
    ? Number(body.game_index)
    : 2;
  const imageIndex = Number.isFinite(Number(body.image_index))
    ? Number(body.image_index)
    : Math.floor(Math.random() * Math.max(1, PROFILE_IMAGE_COUNT));

  if (!rawNick)
    return res.status(400).json({ error: "닉네임을 입력해주세요." });
  if (rawNick.length > 7)
    return res.status(400).json({ error: "닉네임은 7자 이하여야 합니다." });

  db.all(
    "SELECT nickname FROM rankings WHERE game_index = ?",
    [gameIndex],
    (err, rows) => {
      if (err) {
        console.error("닉네임 조회 실패:", err);
        return res.status(500).json({ error: "서버 오류" });
      }

      const existing = new Set(rows.map((r) => r.nickname));
      let finalNick = rawNick;
      if (existing.has(finalNick)) {
        let n = 2;
        while (existing.has(rawNick + "#" + n)) n++;
        finalNick = rawNick + "#" + n;
      }

      db.run(
        "INSERT INTO rankings (game_index, nickname, score, image_index) VALUES (?, ?, ?, ?)",
        [gameIndex, finalNick, score, imageIndex],
        function (insertErr) {
          if (insertErr) {
            console.error("점수 저장 실패:", insertErr);
            return res.status(500).json({ error: "저장 실패" });
          }
          res.json({
            id: this.lastID,
            nickname: finalNick,
            score: score,
            game_index: gameIndex,
            image_index: imageIndex,
            tagged: finalNick !== rawNick,
          });
        },
      );
    },
  );
});
