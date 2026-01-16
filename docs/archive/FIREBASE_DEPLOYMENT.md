# Firebase Hosting + Next.js 배포 가이드

## 🔥 Firebase Hosting (SSR) 배포 - 한국 리전

이 가이드는 EduHub 프로젝트를 Firebase Hosting에 Next.js SSR 모드로 배포하는 방법을 안내합니다.

---

## 📋 사전 준비

### 1. Firebase CLI 설치
```bash
npm install -g firebase-tools
```

### 2. Firebase 로그인
```bash
firebase login
```

### 3. Firebase 프로젝트 확인
현재 `.env.local`에 설정된 Firebase 프로젝트 ID를 확인하세요.

---

## 🚀 초기 설정 (최초 1회)

### 1. Firebase 초기화
```bash
firebase init hosting
```

다음 질문에 답변:
- **Select a project**: 기존 프로젝트 선택 (`.env.local`의 `NEXT_PUBLIC_FIREBASE_PROJECT_ID`)
- **What do you want to use as your public directory?**: `.next` (Enter)
- **Configure as a single-page app?**: `No`
- **Set up automatic builds with GitHub?**: (선택사항) `No` 권장
- **Overwrite existing files?**: `No` (이미 생성된 firebase.json 유지)

### 2. 프로젝트 ID 설정
`.firebaserc` 파일이 자동 생성됩니다. 다음과 같이 수정:
```json
{
  "projects": {
    "default": "your-project-id"
  }
}
```
> `your-project-id`를 실제 Firebase 프로젝트 ID로 변경하세요.

---

## 🛠️ 프로젝트 빌드 및 배포

### 방법 1: 수동 배포 (권장)

#### 1단계: 프로젝트 빌드
```bash
npm run build
```

#### 2단계: Firebase 배포
```bash
firebase deploy --only hosting
```

### 방법 2: 통합 명령어
```bash
# package.json에 스크립트 추가 후
npm run deploy
```

---

## 📦 배포 스크립트 추가

`package.json`의 `scripts`에 다음 추가:
```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "deploy": "npm run build && firebase deploy --only hosting",
    "deploy:preview": "npm run build && firebase hosting:channel:deploy preview"
  }
}
```

---

## 🌏 리전 설정 (한국 서버)

`firebase.json`에 이미 다음 설정이 포함되어 있습니다:
```json
{
  "hosting": {
    "frameworksBackend": {
      "region": "asia-northeast3"  // 서울 리전
    }
  }
}
```

### 사용 가능한 리전:
- `asia-northeast3` - 서울 (권장) ⭐
- `asia-northeast1` - 도쿄
- `us-central1` - 미국 중부

---

## 🔒 환경 변수 설정

Firebase Hosting은 `.env.local` 파일을 자동으로 읽지 않습니다.

### 해결 방법:
현재 프로젝트는 **클라이언트 사이드**에서 Firebase를 직접 사용하므로:
- ✅ `NEXT_PUBLIC_*` 환경 변수는 빌드 시 자동으로 포함됨
- ✅ 추가 설정 불필요
- ✅ `.env.local` 파일만 올바르게 설정되어 있으면 됨

---

## 📊 배포 확인

### 1. 배포 후 URL 확인
```bash
firebase hosting:sites:list
```

기본 URL 형식:
```
https://your-project-id.web.app
https://your-project-id.firebaseapp.com
```

### 2. 커스텀 도메인 연결 (선택사항)
Firebase Console > Hosting > Custom domains에서 도메인 추가

---

## 🧪 미리보기 배포 (Preview Channel)

프로덕션 배포 전 테스트:
```bash
# 미리보기 채널 생성
firebase hosting:channel:deploy preview

# 7일 후 자동 삭제됨
# 영구 채널: --expires 옵션 사용
firebase hosting:channel:deploy staging --expires 30d
```

---

## 🔧 문제 해결

### 1. 빌드 오류
```bash
# 캐시 삭제 후 재빌드
rm -rf .next
npm run build
```

### 2. 환경 변수 오류
- `.env.local` 파일이 프로젝트 루트에 있는지 확인
- 변수명이 `NEXT_PUBLIC_`로 시작하는지 확인

### 3. Firebase CLI 업데이트
```bash
npm update -g firebase-tools
```

### 4. 권한 오류
```bash
# 다시 로그인
firebase logout
firebase login
```

---

## 💰 비용 예상

Firebase Hosting + Cloud Functions (Next.js SSR):

### 무료 할당량:
- **Hosting**: 10GB 저장, 360MB/일 전송
- **Cloud Functions**: 2백만 호출/월, 400,000 GB-초/월

### 예상 트래픽 (소규모 학교, 100명 사용자):
- 일 평균 방문: ~300회
- 월 트래픽: ~5GB
- **예상 비용: 무료** ✅

### 중간 규모 (500명):
- 월 트래픽: ~20GB
- 함수 호출: ~50만회
- **예상 비용: $5-10/월**

---

## 📝 체크리스트

배포 전 확인사항:
- [ ] Firebase 프로젝트 생성 완료
- [ ] `.env.local` 파일 설정 완료
- [ ] Firebase CLI 설치 및 로그인 완료
- [ ] `firebase.json` 파일 생성 완료
- [ ] `.firebaserc` 파일에 프로젝트 ID 설정
- [ ] 로컬 빌드 테스트 완료 (`npm run build`)
- [ ] Firebase Security Rules 설정 완료
- [ ] Firestore 인덱스 생성 완료 (필요시)

---

## 🚀 빠른 배포 명령어

```bash
# 1. 최초 설정 (1회만)
firebase login
firebase init hosting

# 2. 빌드 및 배포
npm run build
firebase deploy --only hosting

# 3. 배포 완료!
# URL: https://your-project-id.web.app
```

---

## 📌 추가 리소스

- [Firebase Hosting 문서](https://firebase.google.com/docs/hosting)
- [Next.js on Firebase](https://firebase.google.com/docs/hosting/frameworks/nextjs)
- [Firebase 가격 계산기](https://firebase.google.com/pricing)

---

**작성일**: 2026-01-15  
**대상 프로젝트**: EduHub v1.2.0  
**배포 방식**: Firebase Hosting + Cloud Functions (Next.js SSR)
