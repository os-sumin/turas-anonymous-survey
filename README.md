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


## 9. 설문 생성 화면

임시 관리자용 설문 생성 화면이 포함되어 있습니다.

```txt
/admin/builder
```

이 화면은 백엔드 DB에 저장하지 않는 **프론트 전용 설문 생성기**입니다.

가능한 작업:

- 설문 기본정보 수정
- 섹션 추가/삭제
- 문항 추가/삭제
- 문항 유형 변경
- 선택지 수정
- 미리보기
- JSON 복사
- JSON 다운로드

주의:

- 이 화면에서 만든 설문은 서버에 영구 저장되지 않습니다.
- 생성한 JSON을 `lib/survey.config.ts`에 반영하거나, 향후 별도 서버 DB 저장 기능을 붙여야 실제 응답 페이지에 적용됩니다.
- 운영 단계에서는 `/admin/builder` 접근을 제한하거나 별도 관리자 인증을 붙이는 것이 좋습니다.
