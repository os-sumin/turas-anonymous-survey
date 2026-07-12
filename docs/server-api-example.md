# 우리 서버 저장 API 예시

## Endpoint

```http
POST /api/survey/submit
Authorization: Bearer <SURVEY_API_KEY>
Content-Type: application/json
```

## Request Body

```json
{
  "survey_id": "nipa_ai_ict_2027",
  "response_id": "3da28c39-3fe7-4f9e-b5f6-37fdad810b3f",
  "submitted_at": "2027-05-01T01:23:45.000Z",
  "answers": {
    "q1": "상용화 초기 단계",
    "q2": ["판로·수요처 확보", "자금 및 투자 부족"],
    "q3": 4
  },
  "meta": {
    "source": "vercel-survey",
    "version": "1.0.0"
  }
}
```

## DB 테이블 예시

```sql
CREATE TABLE survey_responses (
  id BIGSERIAL PRIMARY KEY,
  survey_id VARCHAR(100) NOT NULL,
  response_id UUID NOT NULL UNIQUE,
  submitted_at TIMESTAMPTZ NOT NULL,
  answers_json JSONB NOT NULL,
  token_hash VARCHAR(128),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

완전 무기명으로 운영하는 경우 `token_hash`는 사용하지 않습니다.
