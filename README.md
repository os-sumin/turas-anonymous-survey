# TURAS Anonymous Survey

TURAS 로그인과 분리해 운영하는 **외부 무기명 설문 페이지**입니다.

## 구조

```txt
기업 접속
→ Vercel 설문 페이지
→ /api/submit
→ 우리 서버 /api/survey/submit
→ 우리 서버 DB 저장
```

## 포함 기능

- 무기명 설문 응답 화면
- 제출 완료 화면
- 종료 안내 화면
- Vercel API Route를 통한 우리 서버 저장 API 중계
- 환경변수 기반 마감일/저장 API 설정
- 기업명, 사업자번호, 과제번호, 담당자명 등 식별정보 미수집

## 배포 순서

1. GitHub 새 저장소 생성
2. 이 프로젝트 전체 파일 업로드
3. Vercel에서 GitHub 저장소 Import
4. 환경변수 등록
5. Deploy

## Vercel 환경변수

```env
NEXT_PUBLIC_DEFAULT_SURVEY_ID=nipa_ai_ict_2027
SURVEY_API_URL=https://your-server.example.com/api/survey/submit
SURVEY_API_KEY=server-secret-key
SURVEY_END_AT=2027-12-31T23:59:59+09:00
ALLOW_RESPONSE_TOKEN_HASH=false
```

## 로컬 실행

```bash
npm install
npm run dev
```

접속:

```txt
http://localhost:3000/survey/nipa_ai_ict_2027
```

## 문항 수정

`lib/survey.config.ts`에서 설문명, 안내문, 문항을 수정하면 됩니다.

## 우리 서버 API 규격

Vercel `/api/submit`은 아래 형식으로 우리 서버에 전달합니다.

```json
{
  "survey_id": "nipa_ai_ict_2027",
  "response_id": "uuid",
  "submitted_at": "2027-05-01T12:00:00.000Z",
  "answers": {
    "q1": "응답값",
    "q2": ["선택1", "선택2"],
    "q3": "장문 응답"
  },
  "meta": {
    "source": "vercel-survey",
    "version": "1.0.0"
  }
}
```

Authorization 헤더:

```http
Authorization: Bearer <SURVEY_API_KEY>
```
