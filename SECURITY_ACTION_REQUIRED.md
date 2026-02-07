# 🚨 긴급: Firebase API 키 보안 조치 필요

## 즉시 수행해야 할 작업

### 1단계: Google Cloud Console에서 API 키 교체 (필수)
노출된 API 키를 즉시 교체해야 합니다.

1. [Google Cloud Console](https://console.cloud.google.com/) 접속
2. 프로젝트 선택: **eduhub (eduhub-4a75e)**
3. 좌측 메뉴에서 **APIs & Services > Credentials** 클릭
4. API 키 목록에서 노출된 키 찾기: `AIzaSyD08pZhaqgz0UFjHXqlX2LJguS7PvVT15Q`
5. 키 옆의 **편집(연필 아이콘)** 클릭
6. **키 재생성(Regenerate Key)** 버튼 클릭
7. 새로운 API 키를 복사하여 안전한 곳에 저장

### 2단계: API 키 제한사항 추가 (필수)
새로 생성한 API 키에 보안 제한을 추가하세요.

#### 애플리케이션 제한사항:
- **HTTP 리퍼러** 선택
- 다음 도메인 추가:
  ```
  https://eduhub-4a75e.web.app/*
  https://eduhub-4a75e.firebaseapp.com/*
  http://localhost:3000/*
  https://your-custom-domain.com/*  (실제 도메인이 있다면)
  ```

#### API 제한사항:
다음 API만 허용하도록 제한:
- ✅ Firebase Cloud Messaging API
- ✅ Firebase Authentication API
- ✅ Cloud Firestore API
- ✅ Firebase Storage API

### 3단계: 로컬 환경 변수 설정
프로젝트 루트에 `.env.local` 파일을 생성하세요:

```bash
# .env.local
NEXT_PUBLIC_FIREBASE_API_KEY=여기에_새로운_API_키_입력
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=eduhub-4a75e.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=eduhub-4a75e
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=eduhub-4a75e.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=522081723508
NEXT_PUBLIC_FIREBASE_APP_ID=1:522081723508:web:7468ec2b1f98f648bd1d21
```

⚠️ **중요**: `.env.local` 파일은 절대 Git에 커밋하지 마세요! (이미 `.gitignore`에 포함되어 있습니다)

### 4단계: Vercel 환경 변수 설정 (배포용)
Vercel에 배포하는 경우:

1. [Vercel Dashboard](https://vercel.com/dashboard) 접속
2. **eduhub** 프로젝트 선택
3. **Settings > Environment Variables** 메뉴
4. 다음 환경 변수 추가 (Production, Preview, Development 모두 체크):
   - `NEXT_PUBLIC_FIREBASE_API_KEY` = 새로운 API 키
   - `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` = eduhub-4a75e.firebaseapp.com
   - `NEXT_PUBLIC_FIREBASE_PROJECT_ID` = eduhub-4a75e
   - `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` = eduhub-4a75e.firebasestorage.app
   - `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` = 522081723508
   - `NEXT_PUBLIC_FIREBASE_APP_ID` = 1:522081723508:web:7468ec2b1f98f648bd1d21

### 5단계: 변경사항 테스트
```bash
# 로컬 개발 서버 실행
npm run dev

# 브라우저에서 http://localhost:3000 접속
# Firebase 인증 및 기능이 정상 작동하는지 확인
```

### 6단계: 변경사항 커밋 및 푸시
```bash
# 변경사항 확인
git status

# 변경사항 스테이징
git add .

# 커밋
git commit -m "security: Remove hardcoded Firebase API key and use environment variables"

# 푸시
git push origin dev
```

### 7단계: 재배포
```bash
# Vercel에 자동 배포되거나, 수동으로 배포
npm run deploy
```

## 변경된 내용

### 수정된 파일:
1. **`public/firebase-messaging-sw.js`**
   - 하드코딩된 API 키 제거
   - 환경 변수 플레이스홀더로 대체

2. **`scripts/inject-firebase-config.js`** (신규)
   - 빌드 시 환경 변수를 Service Worker에 주입

3. **`package.json`**
   - `predev`, `prebuild` 스크립트 추가
   - 개발/빌드 전에 자동으로 Firebase 설정 주입

4. **`.env.example`** (신규)
   - 환경 변수 템플릿

5. **`docs/SECURITY_GUIDE.md`** (신규)
   - 상세한 보안 가이드

## 작동 방식

이제 Firebase API 키는 다음과 같이 관리됩니다:

1. **개발 환경**: `.env.local` 파일에서 환경 변수 로드
2. **빌드 시**: `scripts/inject-firebase-config.js`가 환경 변수를 Service Worker에 주입
3. **배포 환경**: Vercel 환경 변수 사용

## 추가 보안 조치 (선택사항)

### Git 히스토리에서 민감한 정보 제거
노출된 API 키가 Git 히스토리에 남아있으므로, 완전히 제거하려면:

```bash
# 방법 1: BFG Repo-Cleaner 사용 (권장)
# https://rtyley.github.io/bfg-repo-cleaner/

# 방법 2: GitHub Support에 문의
# https://support.github.com/contact
```

자세한 내용은 `docs/SECURITY_GUIDE.md`를 참조하세요.

## 모니터링

정기적으로 다음을 확인하세요:
1. [Google Cloud Console - API Dashboard](https://console.cloud.google.com/apis/dashboard)
2. 비정상적인 API 사용량 확인
3. 의심스러운 활동 알림 확인

## 문제 해결

### Service Worker가 업데이트되지 않는 경우:
```bash
# 브라우저 캐시 완전 삭제
# Chrome: DevTools > Application > Service Workers > Unregister
# 또는 시크릿 모드에서 테스트
```

### 환경 변수가 로드되지 않는 경우:
```bash
# 개발 서버 재시작
npm run dev
```

## 도움이 필요하신가요?

- 📖 [Firebase 보안 문서](https://firebase.google.com/docs/rules)
- 🔐 [API 키 보안 모범 사례](https://cloud.google.com/docs/authentication/api-keys)
- 📧 [Google Cloud Support](https://cloud.google.com/support)
