# TURAS Survey

TURAS 로그인과 분리해 운영하는 외부 설문 페이지입니다. 공용 설문과 기업·과제·계약별 맞춤형 설문을 모두 지원합니다.

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
- 기업·과제·계약별 개별 토큰 링크
- 조사대상 엑셀 열을 연결하는 맞춤정보 표시 블록
- 블록별 표시항목·항목명·순서·섹션·문항 앞뒤 위치 설정
- 실제 등록된 조사대상 1건을 이용한 설문 제작 화면 미리보기
- KEITI 보유 기업정보(1-1) 및 기술실시계약 정보(1-3) 확인·정정
- 조사대상 엑셀 일괄 등록 및 개별 링크 엑셀 생성
- 제출 완료 화면
- 종료 안내 화면
- Vercel API Route를 통한 우리 서버 저장 API 중계
- 환경변수 기반 마감일/저장 API 설정
- 공용 무기명 설문에서는 기업명, 사업자번호, 과제번호, 담당자명 등 식별정보 미수집

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
TOKEN_HASH_SECRET=
```

`TOKEN_HASH_SECRET`은 맞춤형 설문 링크 검증과 수정 코드 보호에 사용됩니다. 운영환경에서는 32자 이상의 무작위 값으로 반드시 설정해야 합니다. 예: `openssl rand -hex 32`

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

이 화면에서 작성한 설문은 Firebase에 저장되며, 저장된 설문을 다시 불러와 수정할 수 있습니다.

가능한 작업:

- 설문 기본정보 수정
- 섹션 추가/삭제
- 문항 추가/삭제
- 문항 유형 변경
- 선택지 수정
- 맞춤정보 표시 블록 추가·삭제
- 업로드 열별 표시 여부·순서·화면 명칭 설정
- 맞춤정보 블록의 섹션 및 문항 앞뒤 배치
- 등록한 조사대상 자료로 미리보기
- 미리보기

주의:

- 운영 단계에서는 `/admin/builder` 접근을 제한하거나 별도 관리자 인증을 붙이는 것이 좋습니다.

## 맞춤형 설문 운영

1. `/admin/builder`에서 설문을 불러옵니다.
2. `기업·과제별 맞춤형 설문`을 켭니다.
3. `맞춤정보 표시 블록`에서 기업정보·기술실시계약 정보의 표시항목, 명칭, 순서와 설문 내 위치를 설정합니다.
4. 저장한 뒤 `업로드 자료로 미리보기`에서 실제 표시 결과를 확인합니다. 아직 조사대상을 등록하지 않았다면 작성예시 자료가 표시됩니다.
5. `/admin/targets`에서 업로드 양식을 내려받습니다.
6. 기업ID·과제ID·계약ID와 설문에 표시할 보유정보를 입력한 엑셀을 업로드합니다.
7. 자동 생성된 `기업과제별_설문링크.xlsx`의 개별 링크를 기업에 발송합니다.

기존 설문 설정은 자동으로 새 블록 구조로 읽힙니다. 기본값은 기업정보 블록이 첫 번째 섹션의 첫 문항 앞, 기술실시계약 정보 블록이 첫 일반 문항 뒤입니다.

엑셀 업로드 시 현재 블록에서 선택한 표시항목의 열이 없으면 등록이 중단되고 누락된 열을 안내합니다. 열은 있지만 일부 행의 값이 비어 있으면 링크는 생성하되 결과 엑셀의 `처리결과`에 표시합니다.

기업ID와 과제ID는 필수입니다. 동일 기업·과제에 계약이 여러 건이면 계약ID도 구분해야 합니다. 같은 조사대상을 다시 업로드하면 새 토큰이 발급되어 이전 링크는 무효화되며, 이미 저장된 응답은 삭제되지 않습니다.

응답 저장 시 화면에 표시한 정보는 `target_snapshot`, 기업의 정정 내용은 `answers`에 분리 저장됩니다.

```txt
survey_targets/{target_id}                  조사대상 및 토큰 해시
surveys/{survey_id}/responses/{response_id} 응답, 조사대상ID, 표시정보 스냅샷
```
