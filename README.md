# tubenote-ai

## 프로젝트 소개
YouTube 공개 영상 URL을 입력하면 Google Gemini API가 영상 내용을 분석해 자막형 텍스트, 핵심 요약, 핵심 포인트를 생성하고 Supabase에 저장한 뒤 다시 조회할 수 있는 웹 서비스입니다.

## 해결하려는 문제
긴 YouTube 영상을 직접 끝까지 시청하거나 자막을 수동으로 정리해야 하는 반복 작업을 줄입니다.

## 실제 사용자 사용 흐름
1. 사용자가 공개 YouTube URL을 입력합니다.
2. 서버가 URL 형식을 검증합니다.
3. Vercel Function이 Gemini API에 YouTube URL을 전달합니다.
4. Gemini가 영상 내용을 분석해 자막형 텍스트와 요약을 생성합니다.
5. 결과를 화면에 표시합니다.
6. 사용자가 저장을 누르면 Supabase에 기록합니다.
7. 기록 화면에서 이전 결과를 다시 조회합니다.

## 주요 기능
- YouTube URL 입력 및 검증
- Gemini 기반 영상 내용 분석
- 자막형 텍스트 생성
- 핵심 요약 생성
- 핵심 포인트 생성
- Supabase 결과 저장
- 이전 분석 기록 조회

## Google API
### Google Gemini API
- 역할: 공개 YouTube 영상 내용을 직접 분석
- 실제 사용: 영상에서 말한 내용을 자막형 텍스트로 구조화하고 요약 및 핵심 포인트를 생성
- 서버에서만 API Key 사용

초기 모델:
- `gemini-3.8-flash`

Vercel Environment Variables:
- `GEMINI_API_KEY` = Secret
- `GEMINI_MODEL` = `gemini-3.8-flash`

## 데이터베이스
Supabase PostgreSQL을 사용합니다.

저장 예정 데이터:
- id
- youtube_url
- video_id
- title
- transcript
- summary
- key_points
- created_at

조회 기능:
- 최근 분석 기록 목록
- 선택한 기록 상세 보기

## 화면 구조
### 메인 화면
- 프로젝트 이름
- YouTube URL 입력창
- 분석 버튼
- 로딩 상태
- 결과 영역
  - 영상 정보
  - 요약
  - 핵심 포인트
  - 자막형 텍스트
- 저장 버튼

### 기록 화면
- 저장된 분석 목록
- 날짜 / 영상 제목
- 상세 결과 보기

## Vercel API 구조
- `/api/analyze.js`: YouTube URL 검증 + Gemini 분석
- `/api/save.js`: 분석 결과 Supabase 저장
- `/api/history.js`: 저장된 결과 조회

## 기본 파일 구조
```
tubenote-ai/
├─ index.html
├─ style.css
├─ app.js
├─ README.md
├─ supabase.sql
├─ vercel.json
└─ api/
   ├─ analyze.js
   ├─ save.js
   └─ history.js
```

## MVP 범위
1차 MVP에서는 다음만 완성합니다.
- 공개 YouTube URL 입력
- Gemini API 영상 분석
- 자막형 텍스트 출력
- 요약 출력
- 핵심 포인트 출력

이후 Supabase 저장/조회와 UI 개선을 추가합니다.

## 나중에 추가할 기능
- 실제 동영상 파일 업로드
- 요약 길이 선택
- 언어 선택
- 타임스탬프 정리
- 검색
- 복사 / 다운로드
- 퀴즈 생성

## 사용 기술
- HTML
- CSS
- JavaScript
- Vercel Functions
- Google Gemini API
- Supabase
- GitHub
- Vercel

## 실행 주소
https://tubenote-ai.vercel.app

## 보안
- `GEMINI_API_KEY`는 Vercel Environment Variables의 Secret으로 관리합니다.
- Supabase 서버 Secret은 브라우저 코드에 포함하지 않습니다.
- 실제 API Key는 GitHub 및 README에 기록하지 않습니다.

## 최종 제출
- GitHub 저장소
- Vercel 배포 사이트
- YouTube 시연 영상
