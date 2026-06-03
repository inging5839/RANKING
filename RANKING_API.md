# 랭킹 등록 API 가이드

각 게임에서 게임 종료 후 점수를 공통 랭킹보드 서버(`asGame`)에 등록하기 위한 명세입니다.
"반반 자르기" 게임이 사용하는 방식과 동일하게 맞춰 주세요.

---

## 1. 서버 정보

- **베이스 URL**
  - 게임이 같은 서버에서 서빙되는 경우: `/api/ranking` (동일 오리진)
  - 게임이 `file://` 또는 다른 오리진에서 열리는 경우: `http://<서버IP>:3000/api/ranking`
  - 로컬 개발: `http://localhost:3000/api/ranking`
- **CORS**: `Access-Control-Allow-Origin: *` 로 모든 오리진 허용 (file:// 포함)
- **DB**: SQLite (`asGame/ranking.db`) — 직접 접근 금지, 반드시 API를 통해서만 쓰기

---

## 2. 점수 등록: `POST /api/ranking`

### 요청 헤더

```
Content-Type: application/json
```

### 요청 바디 (JSON)

| 필드          | 타입     | 필수 | 설명                                                                   |
|---------------|----------|------|------------------------------------------------------------------------|
| `nickname`    | string   | O    | 사용자 닉네임. 앞뒤 공백 자동 trim, **최대 20자**                      |
| `score`       | number   | O    | 점수. 음수는 0으로 보정, 소수는 반올림                                |
| `game_index`  | number   | O    | 게임 식별자 (아래 표 참고). **자기 게임 번호를 정확히 사용**          |
| `image_index` | number   | △    | 프로필 이미지 인덱스 (`0~14`). 생략 시 서버에서 0~14 중 무작위 부여   |

### 게임 인덱스 매핑

| `game_index` | 게임명           |
|--------------|------------------|
| 1            | 소떡소떡 만들기  |
| 2            | 반반 자르기      |
| 3            | 틀린그림찾기     |
| 4            | 카드 뒤집기      |
| 5            | 러닝 게임        |
| 6            | 수박 만들기      |

> 자기 게임이 위 표에 없으면 운영자에게 신규 인덱스를 받아주세요.

### 성공 응답 (200)

```json
{
  "id": 145,
  "nickname": "김건#2",
  "score": 88,
  "game_index": 2,
  "image_index": 13,
  "tagged": true
}
```

- `nickname`: **실제 DB에 저장된 최종 닉네임**. 중복으로 인해 태그가 붙으면 클라이언트가 보낸 값과 다를 수 있으므로 화면에는 이 값을 사용하세요.
- `tagged`: 중복 태그가 자동 부여되었으면 `true`, 그대로 저장됐으면 `false`.

### 실패 응답

| HTTP | 상황                           | 응답 예시                                  |
|------|--------------------------------|--------------------------------------------|
| 400  | 닉네임 비었음                  | `{ "error": "닉네임을 입력해주세요." }`   |
| 400  | 닉네임 20자 초과               | `{ "error": "닉네임은 20자 이하여야 합니다." }` |
| 500  | DB 저장 실패                   | `{ "error": "저장 실패" }`                |

---

## 3. 닉네임 중복 처리 규칙

서버가 자동으로 처리하므로 클라이언트에서 따로 검사할 필요 없습니다.

- 같은 `game_index` 내에서만 중복을 검사합니다. (게임이 다르면 같은 닉네임 OK)
- 같은 닉네임이 이미 존재하면 `이름#2`, `이름#3`, ... 사용 가능한 첫 번호로 저장합니다.
- 예: `김건` 이미 존재 → 다음 등록은 `김건#2`. `김건#2`도 존재 → 그 다음은 `김건#3`.
- 응답의 `nickname` 값을 화면에 보여주고, `tagged: true`이면 "중복 닉네임이라 ~~으로 등록되었습니다" 같은 안내를 띄워주세요.

---

## 4. 클라이언트 구현 예시 (Vanilla JS)

게임 종료 화면에서 그대로 복사해 쓸 수 있는 패턴입니다.

```js
// 게임이 같은 서버에서 서빙되면 동일 오리진, 아니면 localhost:3000
const RANKING_API = (location.protocol === 'http:' || location.protocol === 'https:')
  ? '/api/ranking'
  : 'http://localhost:3000/api/ranking';

const GAME_INDEX = 3; // ← 자기 게임 번호로 변경

async function submitScore(nickname, score) {
  const trimmed = (nickname || '').trim();
  if (!trimmed)            return { ok: false, message: '닉네임을 입력해주세요.' };
  if (trimmed.length > 20) return { ok: false, message: '닉네임은 20자 이하여야 합니다.' };

  try {
    const res = await fetch(RANKING_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nickname: trimmed,
        score: score,
        game_index: GAME_INDEX,
        image_index: Math.floor(Math.random() * 15) // 0~14 중 무작위
      })
    });
    const body = await res.json();
    if (!res.ok) return { ok: false, message: body.error || '등록 실패' };

    // body.nickname 은 태그가 붙었을 수 있는 "최종 저장 닉네임"
    return {
      ok: true,
      saved: body.nickname,
      tagged: body.tagged,
      message: body.tagged
        ? `중복으로 "${body.nickname}"(으)로 등록되었습니다.`
        : `"${body.nickname}" 등록 완료!`
    };
  } catch (e) {
    console.error(e);
    return { ok: false, message: '서버에 연결할 수 없습니다.' };
  }
}
```

### UX 권장 사항

- 게임 종료 화면에 **"점수 등록"** 버튼을 두고, 클릭 시 닉네임 입력 모달/팝업을 띄우는 흐름을 권장합니다.
- 등록 성공 후 **버튼을 비활성화**해 같은 점수가 중복 저장되지 않도록 막아주세요.
- 입력 도중 Enter로 등록, ESC로 닫기 처리 시 키오스크 사용성이 좋아집니다.

---

## 5. CORS / 호출 환경

서버는 모든 오리진에서 호출 가능하도록 설정되어 있습니다.

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type
```

따라서 다음 모두 정상 동작합니다.
- 게임을 `asGame` 서버에서 함께 서빙 (`/api/ranking` 동일 오리진)
- 게임을 `file://`로 직접 실행
- 게임을 별도 정적 호스팅에 올리고 서버만 따로 실행

---

## 6. 빠른 테스트 (curl)

```bash
# 점수 등록
curl -X POST http://localhost:3000/api/ranking \
  -H "Content-Type: application/json" \
  -d '{"nickname":"홍길동","score":1234,"game_index":3}'

# 같은 닉네임 다시 등록 → "홍길동#2" 로 자동 태그됨
curl -X POST http://localhost:3000/api/ranking \
  -H "Content-Type: application/json" \
  -d '{"nickname":"홍길동","score":2000,"game_index":3}'

# 전체 랭킹 조회
curl http://localhost:3000/api/ranking
```

---

## 7. 주의 사항 (꼭 지켜주세요)

1. **`game_index`를 자기 게임 번호로 정확히 보낼 것.** 잘못 보내면 다른 게임 보드에 점수가 섞입니다.
2. **응답의 `nickname` 값을 사용자에게 보여주세요.** 클라이언트가 보낸 닉네임과 다를 수 있습니다 (중복 태그).
3. **`created_at`은 클라이언트가 보내지 마세요.** 서버에서 `CURRENT_TIMESTAMP`(UTC)로 자동 기록합니다.
4. **DB에 직접 쓰지 마세요.** 중복 태그 로직과 검증이 모두 서버에서 처리됩니다.
5. **점수 검증은 서버에서 최소한만** 합니다 (음수→0, 반올림). 클라이언트가 비정상 점수를 보낼 가능성이 있으면 게임 측에서 1차 검증 후 보내는 것을 권장합니다.
6. **닉네임 비속어 필터는 현재 없습니다.** 필요하면 클라이언트에서 사전 검사 후 전송하세요.
7. **랭킹보드는 3초 간격으로 GET 폴링** 하므로, 등록 후 최대 3초 안에 보드에 반영됩니다.

---

## 8. 참고 — DB 스키마 (읽기 전용)

```sql
CREATE TABLE rankings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_index  INTEGER NOT NULL,
  nickname    TEXT    NOT NULL,
  score       INTEGER NOT NULL DEFAULT 0,
  image_index INTEGER NOT NULL,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP   -- UTC
);
```

`created_at`은 UTC로 저장됩니다. 클라이언트에서 표시할 때는 UTC로 파싱한 뒤 로컬 시간으로 변환해야 합니다 (예: `new Date(row.created_at.replace(' ', 'T') + 'Z')`).

---

## 9. 문의

- 서버 운영자: (운영자 연락처 추가)
- 신규 게임 인덱스 발급 / 장애 / 변경 사항은 운영자에게 먼저 확인 후 반영해 주세요.
