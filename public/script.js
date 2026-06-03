const games = {
  1: "소떡소떡 만들기",
  2: "반반 챌린지",
  3: "틀린그림찾기",
  4: "같은그림찾기",
  5: "러닝 게임",
  6: "안성 배 만들기",
};

const gameBanners = {
  1: "/static/소떡소떡만들기_배너.png",
  2: "/static/반반챌린지_배너.png",
  3: "/static/틀린그림찾기_배너.png",
  4: "/static/카드뒤집기_배너.png",
  5: "/static/러닝게임_배너.png",
  6: "/static/안성배만들기_배너.png",
};

const PROFILE_IMAGES = [
  { file: "고삼호수.jpg", label: "고삼호수" },
  { file: "금광호수.png", label: "금광호수" },
  { file: "남사당놀이.jpg", label: "남사당놀이" },
  { file: "농촌체험마을.JPG", label: "농촌체험마을" },
  { file: "명륜동벽화.png", label: "명륜동벽화" },
  { file: "미리내성지.png", label: "미리내성지" },
  { file: "미산호수.png", label: "미산호수" },
  { file: "바우덕이축제.jpg", label: "바우덕이축제" },
  { file: "삼죽 국사봉.png", label: "삼죽 국사봉" },
  { file: "서운산.png", label: "서운산" },
  { file: "석남사.jpg", label: "석남사" },
  { file: "안성31운동기념관.png", label: "안성31운동기념관" },
  { file: "안성객사.png", label: "안성객사" },
  { file: "안성맞춤랜드.jpg", label: "안성맞춤랜드" },
  { file: "안성팜랜드.jpg", label: "안성팜랜드" },
  { file: "죽산 순교 성지.png", label: "죽산 순교 성지" },
  { file: "죽주산성.png", label: "죽주산성" },
  { file: "추억의거리.jpg", label: "추억의거리" },
  { file: "칠곡호수공원.png", label: "칠곡호수공원" },
  { file: "칠장사.JPG", label: "칠장사" },
];
const PROFILE_BY_LABEL = PROFILE_IMAGES.reduce((acc, item) => {
  acc[item.label] = item.file;
  return acc;
}, {});
const PROFILE_BY_FILE = PROFILE_IMAGES.reduce((acc, item) => {
  acc[item.file] = item.file;
  return acc;
}, {});

let globalRankingData = [];
const GAME_COUNT = 6;
const RANK_LIMIT = 7;
const MAX_NICKNAME_LENGTH = 7;
const rotationPeriods = ["daily", "weekly", "daily", "weekly", "monthly"];
const slideQueue = rotationPeriods.flatMap((period) =>
  Array.from({ length: GAME_COUNT }, (_, index) => ({
    period,
    gameIndex: index + 1,
  })),
);
let currentIndex = 0;
let currentPeriod = slideQueue[0].period;
let currentGameIndex = slideQueue[0].gameIndex;
const ROTATE_MS = 7000;
const POLL_MS = 3000; // 점수 등록 후 최대 3초 안에 보드에 반영
let rotateTimer = null;
let pollTimer = null;
let gaugeTimer = null;
let gaugeStartedAt = 0;

async function fetchRanking() {
  try {
    const response = await fetch("/api/ranking", { cache: "no-store" });
    if (!response.ok) throw new Error("HTTP " + response.status);
    globalRankingData = await response.json();
    return true;
  } catch (error) {
    console.error("데이터 수신 실패:", error);
    return false;
  }
}

async function loadRankingData() {
  const ok = await fetchRanking();
  if (!ok) return;
  console.log("도착한 데이터:", globalRankingData);
  startRotation();
  startPolling();
}

function refreshCurrentView() {
  const filteredData = filterDataByPeriod(globalRankingData, currentPeriod);
  renderLeaderboard(filteredData, currentGameIndex, false);
}

function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    const ok = await fetchRanking();
    if (ok) refreshCurrentView();
  }, POLL_MS);
}

// 2. 날짜 필터링 (캘린더 기준: 오늘, 이번 주 월~일, 이번 달 1~말일)
function filterDataByPeriod(data, period) {
  // 실시간 등록 점수가 일간/주간/월간 탭에 정상적으로 잡히도록 현재 시각 사용
  // (이전 테스트용 고정값: new Date('2026-04-03 23:59:59'))
  const now = new Date();

  // [기준점 1] 오늘의 연, 월, 일
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0(1월) ~ 11(12월)
  const currentDate = now.getDate();

  // [기준점 2] 이번 주 월요일과 일요일 시간 구하기
  const dayOfWeek = now.getDay(); // 0(일요일) ~ 6(토요일)
  // 자바스크립트는 일요일을 시작으로 보므로, '월요일 시작'으로 보정해 줍니다.
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

  // 이번 주 월요일 자정 (00:00:00)
  const startOfWeek = new Date(now);
  startOfWeek.setDate(currentDate - daysToMonday);
  startOfWeek.setHours(0, 0, 0, 0);

  // 이번 주 일요일 밤 (23:59:59)
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  endOfWeek.setHours(23, 59, 59, 999);

  return data.filter((row) => {
    if (!row.created_at) return true;
    // SQLite CURRENT_TIMESTAMP는 UTC이므로 'Z'를 붙여 UTC로 파싱한 뒤
    // Date 객체에서 로컬 시간 메서드(getDate 등)로 비교 → 일간 필터 정상 동작
    const rowDate = new Date(row.created_at.replace(" ", "T") + "Z");

    if (period === "daily") {
      // [일간] 연, 월, 일이 모두 '오늘'과 똑같은 데이터만 합격
      return (
        rowDate.getFullYear() === currentYear &&
        rowDate.getMonth() === currentMonth &&
        rowDate.getDate() === currentDate
      );
    }

    if (period === "weekly") {
      // [주간] 월요일 00시부터 일요일 24시 사이에 있는 데이터만 합격
      return rowDate >= startOfWeek && rowDate <= endOfWeek;
    }

    if (period === "monthly") {
      // [월간] 1일~말일 계산할 필요 없이, '연도'와 '월'만 같으면 무조건 이번 달!
      return (
        rowDate.getFullYear() === currentYear &&
        rowDate.getMonth() === currentMonth
      );
    }

    return true;
  });
}

function rotateView() {
  const slide = slideQueue[currentIndex];
  currentPeriod = slide.period;
  currentGameIndex = slide.gameIndex;

  const filteredData = filterDataByPeriod(globalRankingData, currentPeriod);
  renderLeaderboard(filteredData, currentGameIndex, true);

  updateActiveTab(currentPeriod);

  currentIndex = (currentIndex + 1) % slideQueue.length;
}

function updateActiveTab(period) {
  document
    .querySelectorAll(".tab")
    .forEach((tab) => tab.classList.remove("active"));
  const activeTab = document.getElementById(`tab-${period}`);
  if (activeTab) activeTab.classList.add("active");
}

function resetGauge() {
  const gaugeFill = document.getElementById("period-gauge-fill");
  if (gaugeFill) gaugeFill.style.width = "0%";
}

function startGaugeTick() {
  if (gaugeTimer) clearInterval(gaugeTimer);
  gaugeStartedAt = Date.now();
  const gaugeFill = document.getElementById("period-gauge-fill");
  if (!gaugeFill) return;

  gaugeTimer = setInterval(() => {
    const elapsed = Date.now() - gaugeStartedAt;
    const pct = Math.max(0, Math.min(100, (elapsed / ROTATE_MS) * 100));
    gaugeFill.style.width = `${pct}%`;
  }, 50);
}

function startRotation() {
  if (rotateTimer) clearInterval(rotateTimer);
  rotateView();
  resetGauge();
  startGaugeTick();

  rotateTimer = setInterval(() => {
    rotateView();
    resetGauge();
    startGaugeTick();
  }, ROTATE_MS);
}

function renderAllLeaderboardsLegacy(rawData) {
  const grid = document.getElementById("leaderboard-grid");
  grid.innerHTML = "";

  const groupedData = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };

  rawData.forEach((row) => {
    if (groupedData[row.game_index]) groupedData[row.game_index].push(row);
  });

  for (let gameIndex = 1; gameIndex <= 6; gameIndex++) {
    const players = groupedData[gameIndex].sort((a, b) => b.score - a.score);

    // 1위부터 5위까지 모두 변수로 빼둡니다. (사람이 없으면 빈 객체 {} 가 들어갑니다)
    const top1 = players[0] || {};
    const top2 = players[1] || {};
    const top3 = players[2] || {};
    const top4 = players[3] || {};
    const top5 = players[4] || {};

    const sectionHTML = `
            <div class="game-section">
                <div class="game-title">${games[gameIndex]}</div>
                
                <div class="podium">
                    <div class="podium-item rank-2">
                        <div class="profile" style="background-image: url('${getProfileImageUrl(top2)}');">
                            <div class="rank-badge">2</div>
                        </div>
                        <div class="user-info">
                            <div class="user-id">${top2.nickname || "-"}</div>
                            <div class="user-score">${top2.score ? top2.score.toLocaleString() : "-"}</div>
                        </div>
                    </div>
                    
                    <div class="podium-item rank-1">
                        <div class="crown">👑</div>
                        <div class="profile" style="background-image: url('${getProfileImageUrl(top1)}');">
                            <div class="rank-badge">1</div>
                        </div>
                        <div class="user-info">
                            <div class="user-id">${top1.nickname || "-"}</div>
                            <div class="user-score">${top1.score ? top1.score.toLocaleString() : "-"}</div>
                        </div>
                    </div>
                    
                    <div class="podium-item rank-3">
                        <div class="profile" style="background-image: url('${getProfileImageUrl(top3)}');">
                            <div class="rank-badge">3</div>
                        </div>
                        <div class="user-info">
                            <div class="user-id">${top3.nickname || "-"}</div>
                            <div class="user-score">${top3.score ? top3.score.toLocaleString() : "-"}</div>
                        </div>
                    </div>
                </div>

                <div class="rank-list">
                    <div class="list-item">
                        <div class="list-rank">4</div>
                        <div class="list-id">${top4.nickname || "-"}</div>
                        <div class="list-score">${top4.score ? top4.score.toLocaleString() : "-"}</div>
                    </div>
                    <div class="list-item">
                        <div class="list-rank">5</div>
                        <div class="list-id">${top5.nickname || "-"}</div>
                        <div class="list-score">${top5.score ? top5.score.toLocaleString() : "-"}</div>
                    </div>
                </div>
            </div>
        `;
    grid.innerHTML += sectionHTML;
  }
}

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char],
  );
}

function formatName(player) {
  if (!player || !player.nickname) return "-";
  return escapeHtml(String(player.nickname).slice(0, MAX_NICKNAME_LENGTH));
}

function formatScore(player) {
  const score = Number(player && player.score);
  return Number.isFinite(score) ? score.toLocaleString() : "-";
}

function hasPlayer(player) {
  return Boolean(player && player.nickname);
}

function getProfileImageUrl(player) {
  const raw = player && player.image_index;
  if (typeof raw === "string" && raw.trim()) {
    const asText = raw.trim();
    const byLabel = PROFILE_BY_LABEL[asText];
    if (byLabel) return "/profile_image/" + encodeURIComponent(byLabel);
    const byFile = PROFILE_BY_FILE[asText];
    if (byFile) return "/profile_image/" + encodeURIComponent(byFile);
  }

  const num = Number(raw);
  if (Number.isFinite(num)) {
    let idx = -1;
    if (num >= 0 && num < PROFILE_IMAGES.length)
      idx = num; // current (0-based)
    else if (num >= 1 && num <= PROFILE_IMAGES.length) idx = num - 1; // legacy (1-based)
    if (idx >= 0)
      return "/profile_image/" + encodeURIComponent(PROFILE_IMAGES[idx].file);
  }

  return "/profile_image/" + encodeURIComponent(PROFILE_IMAGES[0].file);
}

function renderCrown(rank) {
  if (rank === 1) return '<div class="crown crown-gold">&#x1F451;</div>';
  if (rank === 2) return '<div class="crown crown-silver">&#x1F451;</div>';
  if (rank === 3) return '<div class="crown crown-bronze">&#x1F451;</div>';
  return "";
}

function renderGameBanner(gameIndex) {
  const src = gameBanners[gameIndex];
  if (!src) return "";
  const title = escapeHtml(games[gameIndex] || `Game ${gameIndex}`);
  return `<img src="${escapeHtml(src)}" alt="${title} 배너" loading="eager" decoding="async">`;
}

function renderLeaderboard(
  rawData,
  gameIndex = currentGameIndex,
  animate = false,
) {
  const grid = document.getElementById("leaderboard-grid");
  const players = rawData
    .filter((row) => Number(row.game_index) === gameIndex)
    .sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0))
    .slice(0, RANK_LIMIT);

  const top1 = players[0] || {};
  const top2 = players[1] || {};
  const top3 = players[2] || {};
  const listRows = Array.from({ length: RANK_LIMIT - 3 }, (_, index) => {
    const rank = index + 4;
    const player = players[rank - 1] || {};

    return `
                    <div class="list-item">
                        <div class="list-rank">${rank}</div>
                        <div class="list-profile-slot">
                            ${hasPlayer(player) ? `<div class="list-profile" style="background-image: url('${getProfileImageUrl(player)}');" aria-hidden="true"></div>` : ""}
                        </div>
                        <div class="list-id">${formatName(player)}</div>
                        <div class="list-score">${formatScore(player)}</div>
                    </div>
        `;
  }).join("");
  const slideClass = animate ? " slide-in-right" : "";

  grid.innerHTML = `
            <div class="game-section${slideClass}">
                <div class="ranking-game-banner">
                    ${renderGameBanner(gameIndex)}
                </div>
                
                <div class="podium">
                    <div class="podium-item rank-2">
                        ${renderCrown(2)}
                        <div class="profile" ${hasPlayer(top2) ? `style="background-image: url('${getProfileImageUrl(top2)}');"` : ""}>
                            <div class="rank-badge">2</div>
                        </div>
                        <div class="user-info">
                            <div class="user-id">${formatName(top2)}</div>
                            <div class="user-score">${formatScore(top2)}</div>
                        </div>
                    </div>
                    
                    <div class="podium-item rank-1">
                        ${renderCrown(1)}
                        <div class="profile" ${hasPlayer(top1) ? `style="background-image: url('${getProfileImageUrl(top1)}');"` : ""}>
                            <div class="rank-badge">1</div>
                        </div>
                        <div class="user-info">
                            <div class="user-id">${formatName(top1)}</div>
                            <div class="user-score">${formatScore(top1)}</div>
                        </div>
                    </div>
                    
                    <div class="podium-item rank-3">
                        ${renderCrown(3)}
                        <div class="profile" ${hasPlayer(top3) ? `style="background-image: url('${getProfileImageUrl(top3)}');"` : ""}>
                            <div class="rank-badge">3</div>
                        </div>
                        <div class="user-info">
                            <div class="user-id">${formatName(top3)}</div>
                            <div class="user-score">${formatScore(top3)}</div>
                        </div>
                    </div>
                </div>

                <div class="rank-list">
                    ${listRows}
                </div>
            </div>
    `;
}

loadRankingData();
