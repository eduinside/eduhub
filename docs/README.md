# 📚 EduHub 문서 가이드

EduHub 프로젝트의 모든 문서와 가이드를 모아놓은 디렉토리입니다.

---

## 📖 문서 목록

### 🚀 배포 가이드

#### ⭐ **VERCEL_DEPLOY.md** (권장)
> Vercel을 사용한 빠른 배포 가이드 (5분 완성)

**포함 내용:**
- Vercel 계정 생성
- GitHub 연동
- 환경 변수 설정
- 배포 실행

---

#### 💰 **VERCEL_PRICING_DOMAIN.md**
> Vercel 요금 정책 및 개인 도메인 연결 가이드

**포함 내용:**
- Hobby/Pro/Enterprise 플랜 비교
- EduHub 프로젝트 비용 분석
- 커스텀 도메인 설정 방법
- DNS 설정 가이드

---

#### 🔥 **FIREBASE_DEPLOYMENT.md**
> Firebase Hosting 배포 가이드 (고급)

**포함 내용:**
- Firebase CLI 설정
- Next.js SSR 설정
- 서울 리전 배포
- ⚠️ 복잡함 (Vercel 권장)

---

#### ⚖️ **WHY_VERCEL.md**
> Firebase vs Vercel 비교 및 Vercel 선택 이유

**포함 내용:**
- 정적 빌드 불가 이유
- 각 플랫폼 장단점
- 비용 비교
- 최종 권장사항

---

### 🔧 시스템 관리

#### 📊 **PROJECT_FEATURES.md**
> EduHub 전체 기능 명세서 및 구조 설명

**포함 내용:**
- 모든 모듈 상세 설명
- 기술 스택
- UI/UX 디자인 시스템
- 개발 방법론
- 향후 계획

---

#### ⚡ **OPTIMIZATION_REPORT.md**
> 프로젝트 최적화 분석 보고서

**포함 내용:**
- 코드 분석 결과
- 불필요한 코드 검토
- 번들 크기 분석
- Firebase 배포 비용 최적화

---

#### 🗂️ **FILE_STORAGE_GUIDE.md**
> 파일 업로드 및 저장 구조 가이드

**포함 내용:**
- Firebase Storage 경로 구조
- 파일 종류별 저장 위치
- 용량 및 비용 관리
- 백업 방법

---

#### 📈 **FIREBASE_QUOTA_GUIDE.md**
> Firebase 할당량 초과 문제 해결 가이드

**포함 내용:**
- Quota exceeded 원인 분석
- 즉시 조치사항
- Blaze 플랜 업그레이드
- 코드 최적화 방법
- 로컬 에뮬레이터 사용

---

### 📝 개발 문서

#### 🎯 **implementation_plan.md**
> 초기 구현 계획 및 로드맵

**포함 내용:**
- 프로젝트 구조
- 개발 우선순위
- 기능별 구현 계획

---

#### 🌐 **DEPLOYMENT.md**
> 일반 배포 가이드 (개요)

**포함 내용:**
- Vercel 배포 개요
- Firebase Hosting 개요
- 배포 전 체크리스트

---

## 🗂️ 문서 구조

```
docs/
├── 배포 관련/
│   ├── VERCEL_DEPLOY.md ⭐ 가장 중요
│   ├── VERCEL_PRICING_DOMAIN.md
│   ├── FIREBASE_DEPLOYMENT.md
│   ├── WHY_VERCEL.md
│   └── DEPLOYMENT.md
│
├── 시스템 관리/
│   ├── PROJECT_FEATURES.md
│   ├── OPTIMIZATION_REPORT.md
│   ├── FILE_STORAGE_GUIDE.md
│   └── FIREBASE_QUOTA_GUIDE.md
│
└── 개발 문서/
    └── implementation_plan.md
```

---

## 🚀 빠른 시작 가이드

### 1. 처음 배포하시나요?
👉 **VERCEL_DEPLOY.md** 읽기 (5분)

### 2. 도메인 연결하고 싶으신가요?
👉 **VERCEL_PRICING_DOMAIN.md** 읽기

### 3. Firebase 할당량 초과?
👉 **FIREBASE_QUOTA_GUIDE.md** 읽기

### 4. 파일이 어디 저장되는지 궁금하신가요?
👉 **FILE_STORAGE_GUIDE.md** 읽기

### 5. 전체 기능이 궁금하신가요?
👉 **PROJECT_FEATURES.md** 읽기

---

## 📞 문서 관련 문의

문서에 대한 질문이나 개선 사항이 있으시면:
1. GitHub Issues에 등록
2. 개발팀에 문의

---

## 🔄 문서 업데이트 이력

- **2026-01-15**: 초기 문서 작성 및 정리
  - Vercel 배포 가이드 추가
  - Firebase 관련 문서 추가
  - 프로젝트 기능 명세서 업데이트

---

**문서 관리**: EduHub Development Team  
**최종 업데이트**: 2026-01-15
