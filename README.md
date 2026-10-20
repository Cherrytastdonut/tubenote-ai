# tubenote-ai

공개 YouTube 영상 URL을 Google Gemini API로 분석해 핵심 요약, 시간별 핵심 포인트, 개념 마인드맵, 용어 설명을 만드는 학습 노트 서비스입니다.

## 실행 주소
https://tubenote-ai.vercel.app

## 사용 흐름
1. 공개 YouTube URL을 입력하고 **분석하기**를 누릅니다.
2. 핵심 요약과 시간별 포인트를 읽습니다. 시간 링크는 해당 영상 시점을 새 탭으로 엽니다.
3. 밑줄 친 낯선 명사에 마우스를 올리거나 키보드로 초점을 맞추거나 터치하면 설명을 확인합니다.
4. AI 마인드맵의 중심 주제, 주요 갈래, 세부 개념을 살펴봅니다. 모든 노드에 설명이 있습니다.
5. 저장 영역 위의 위키피디아 추천 문서로 관련 개념을 더 알아봅니다.
6. 결과를 Supabase에 저장하고 최근 기록에서 다시 엽니다.

## 주요 기능
- YouTube URL 형식 검증 및 Gemini 영상 분석
- 핵심 요약, 시간순 핵심 포인트
- MM:SS / HH:MM:SS를 초로 변환하는 YouTube 시간 링크 (0초 및 저장 기록 지원)
- 중심 주제 → 주요 갈래 → 세부 개념으로 구성되는 SVG 연결선 마인드맵
- 마인드맵 노드 옆, 본문 용어 위에 표시되는 설명 팝업
- 마우스, Tab/Enter, 터치 지원 및 Escape로 설명 닫기
- 한국어 위키피디아 검색 및 동일 개념의 영문 검색 대체
- 분석 결과 저장·조회, 동일 영상 중복 저장 방지, 저장 기록 삭제

## 낯선 명사 판단
Gemini는 일반 한국어 독자를 기준으로 고유명사·전문 개념 후보의 난도(0~100), 맥락 설명 필요 여부, 쉬운 설명을 생성합니다. 서버는 다음 조건을 모두 만족하는 후보만 남깁니다.

- 난도 60 이상 100 이하
- 맥락 설명이 필요하다고 판단된 후보
- 요약 또는 핵심 포인트에 정확한 표기로 등장하는 이름
- 두 글자 이상의 이름 및 비어 있지 않은 설명
- 중복 제거, 최대 16개

브라우저는 긴 이름부터 매칭하고 영문 이름이 다른 영문 단어 안에서 잘못 매칭되지 않도록 확인합니다. 텍스트와 설명은 HTML로 실행하지 않고 DOM 텍스트로 표시합니다. 이 판단은 AI 기반이므로 독자에 따라 난도와 설명의 적절성이 다를 수 있습니다.

## 위키피디아 추천
Gemini는 관련 개념의 한국어/영어 검색어와 추천 이유만 제안합니다. URL을 만들지 않습니다.

/api/wiki는 Wikipedia Action API의 generator=search와 prop=info|pageprops로 실제 문서 제목과 URL을 확인합니다. 동음이의어 문서를 제외하고 한국어 결과가 없으면 영문 검색어를 사용합니다. 한 번에 최대 4개 개념, 동시 조회 2개, 요청별 6초 제한 및 1시간 메모리 캐시를 사용합니다.

위키 검색은 영상 분석 완료 후 별도로 실행됩니다. 실패해도 요약과 마인드맵은 유지되며 다시 찾기를 제공합니다. 저장 시 검색이 진행 중이었다면 기록을 열 때 다시 검색합니다.

공식 API 문서:
- https://www.mediawiki.org/wiki/API:Search
- https://www.mediawiki.org/wiki/API:Info
- https://www.mediawiki.org/wiki/Wikimedia_APIs/Access_policy

## API와 파일 구조
- api/analyze.js: URL 검증, Gemini 영상 분석, 구조화 결과 정규화
- api/wiki.js: 실제 위키피디아 문서 검색
- api/save.js: 중복 검사 및 분석 결과 저장
- api/history.js: 저장 기록 조회 및 이전 형식 호환
- api/delete.js: 저장 기록 삭제
- lib/analysis.js: 결과 정규화, 용어 필터, URL 검증, 저장/조회 변환
- learning.js: 마인드맵, 설명 팝업, 용어 강조, 추천 문서 UI
- app.js: 분석·저장·기록 화면 연결
- index.html, style.css: 반응형 화면
- supabase.sql: 최초 테이블 생성 스크립트
- vercel.json: 기존 Vercel 설정

## 기존 데이터 호환
기존 video_analyses 테이블과 JSONB 컬럼을 그대로 사용하므로 **이번 업데이트에는 SQL 재실행이나 새 환경 변수가 필요하지 않습니다.**

- 기존 transcript JSONB 컬럼의 배열: 이전 버전 자막 기록으로 인식합니다. 자막 UI는 표시하지 않고 기존 요약·핵심 포인트로 간단한 마인드맵을 구성합니다.
- 새 transcript JSONB 컬럼의 객체: { version: 2, mind_map, mind_map_source, glossary, wiki_topics, wiki_links, wiki_status }를 저장합니다.
- /api/history는 저장 형식과 관계없이 프런트엔드에서 사용할 정규화된 필드를 반환합니다.
- 이전 기록의 상세 마인드맵·용어 설명·추천 검색어를 새로 만들려면 영상을 다시 분석합니다.
- 동일 영상 중복 저장 방지 정책은 유지됩니다.

## 사용 기술과 환경 변수
HTML / CSS / JavaScript + Vercel Functions + Google Gemini API + Supabase + GitHub + Vercel.

기존 Vercel 서버 환경 변수:
- GEMINI_API_KEY: Gemini 비밀키
- GEMINI_MODEL: 사용할 Gemini 모델 (기존 설정 유지)
- SUPABASE_URL
- SUPABASE_SECRET_KEY 또는 SUPABASE_SERVICE_ROLE_KEY

키는 서버에서만 사용하며 GitHub 또는 브라우저 코드에 기록하지 않습니다. 로컬 npm, 별도 프레임워크, 빌드 과정 없이 기존 Vercel 배포 구조로 실행합니다.

## 확인 항목
- 핵심 포인트의 00:00, MM:SS, HH:MM:SS가 올바른 영상 URL로 열리는지
- 여러 영상/기록 사이를 전환해도 시간 링크가 해당 영상에 연결되는지
- 마인드맵의 모든 노드와 밑줄 용어를 마우스·키보드·터치로 열 수 있는지
- 설명 텍스트에 HTML처럼 보이는 문자가 있어도 글자로 표시되는지
- 위키 검색 지연/실패가 분석 결과 표시를 막지 않는지
- 기록 전환 후 이전 영상의 위키 검색 결과가 새 결과를 덮어쓰지 않는지
- 새 결과의 저장/조회와 이전 자막 배열 기록의 조회가 모두 동작하는지
