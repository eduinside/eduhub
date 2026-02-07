# Firebase API 키 보안 문제 해결 가이드

## 문제 상황
Google Cloud Platform에서 공개적으로 노출된 API 키에 대한 보안 경고를 받았습니다.
- **노출된 키**: `AIzaSyD08pZhaqgz0UFjHXqlX2LJguS7PvVT15Q`
- **노출 위치**: `public/firebase-messaging-sw.js` 파일
- **발견 URL**: https://github.com/eduinside/eduhub/blob/ec8cd8ae81b900a89fe6e7f45aedca0fc2d0595d/public/firebase-messaging-sw.js

## 해결 단계

### 1. ✅ 코드 수정 완료
Service Worker 파일에서 하드코딩된 API 키를 환경 변수로 대체했습니다.

### 2. 🔑 새로운 API 키 생성 (필수)
노출된 API 키는 반드시 교체해야 합니다.

#### Google Cloud Console에서 API 키 교체:
1. [Google Cloud Console](https://console.cloud.google.com/) 접속
2. 프로젝트 선택: `eduhub (eduhub-4a75e)`
3. **APIs & Services > Credentials** 메뉴로 이동
4. 기존 API 키 찾기: `AIzaSyD08pZhaqgz0UFjHXqlX2LJguS7PvVT15Q`
5. 키 옆의 **편집** 버튼 클릭
6. **키 재생성** 버튼 클릭
7. 새로운 키를 안전하게 복사

### 3. 🔒 API 키 제한사항 추가 (필수)
새로운 API 키에 제한사항을 추가하여 보안을 강화하세요.

#### 권장 제한사항:
1. **애플리케이션 제한사항**:
   - HTTP 리퍼러 제한 추가
   - 허용할 도메인:
     - `https://eduhub-4a75e.web.app/*`
     - `https://eduhub-4a75e.firebaseapp.com/*`
     - `http://localhost:3000/*` (개발용)
     - 실제 배포 도메인 추가

2. **API 제한사항**:
   - Firebase 관련 API만 허용:
     - Firebase Cloud Messaging API
     - Firebase Authentication API
     - Cloud Firestore API
     - Firebase Storage API

### 4. 📝 환경 변수 설정
프로젝트 루트에 `.env.local` 파일을 생성하고 새로운 API 키를 설정하세요:

```bash
# .env.local 파일 생성
NEXT_PUBLIC_FIREBASE_API_KEY=새로운-API-키
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=eduhub-4a75e.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=eduhub-4a75e
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=eduhub-4a75e.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=522081723508
NEXT_PUBLIC_FIREBASE_APP_ID=1:522081723508:web:7468ec2b1f98f648bd1d21
```

### 5. 🚀 Vercel 환경 변수 설정
Vercel에 배포하는 경우, 환경 변수를 Vercel 대시보드에도 추가해야 합니다:

1. [Vercel Dashboard](https://vercel.com/dashboard) 접속
2. 프로젝트 선택
3. **Settings > Environment Variables** 메뉴로 이동
4. 위의 모든 환경 변수 추가
5. **Production**, **Preview**, **Development** 모두 체크

### 6. 🧹 Git 히스토리 정리 (선택사항)
노출된 키가 Git 히스토리에 남아있으므로, 민감한 정보를 완전히 제거하려면 히스토리를 정리해야 합니다.

⚠️ **주의**: 이 작업은 Git 히스토리를 다시 작성하므로 팀원들과 협의 후 진행하세요.

```bash
# BFG Repo-Cleaner 사용 (권장)
# 1. BFG 다운로드: https://rtyley.github.io/bfg-repo-cleaner/
# 2. 저장소 미러 클론
git clone --mirror https://github.com/eduinside/eduhub.git

# 3. 민감한 정보가 포함된 파일 제거
bfg --replace-text replacements.txt eduhub.git

# replacements.txt 내용:
# AIzaSyD08pZhaqgz0UFjHXqlX2LJguS7PvVT15Q==>REMOVED

# 4. 정리 및 푸시
cd eduhub.git
git reflog expire --expire=now --all && git gc --prune=now --aggressive
git push --force
```

또는 GitHub에서 직접 처리:
1. [GitHub Support](https://support.github.com/contact) 문의
2. 민감한 데이터 제거 요청

### 7. ✅ 테스트
변경사항을 테스트하세요:

```bash
# 로컬 테스트
npm run dev

# 빌드 테스트
npm run build
```

### 8. 📊 모니터링
Google Cloud Console에서 API 사용량을 정기적으로 모니터링하세요:
1. [Google Cloud Console](https://console.cloud.google.com/) 접속
2. **APIs & Services > Dashboard** 메뉴로 이동
3. 비정상적인 트래픽이나 사용량 확인

## 변경된 파일 목록
- ✅ `public/firebase-messaging-sw.js` - 환경 변수 플레이스홀더 사용
- ✅ `scripts/inject-firebase-config.js` - 빌드 시 환경 변수 주입 스크립트
- ✅ `package.json` - prebuild, predev 스크립트 추가
- ✅ `.env.example` - 환경 변수 템플릿
- ✅ `.gitignore` - 이미 `.env*` 파일 무시 설정됨

## 향후 보안 모범 사례
1. **절대 API 키를 코드에 하드코딩하지 마세요**
2. **환경 변수를 사용하세요** (`.env.local`, Vercel 환경 변수 등)
3. **API 키에 제한사항을 추가하세요** (도메인, API 제한)
4. **정기적으로 키를 교체하세요**
5. **Git 커밋 전에 민감한 정보가 없는지 확인하세요**
6. **`.gitignore`에 `.env*` 파일이 포함되어 있는지 확인하세요**

## 참고 자료
- [Firebase 보안 규칙](https://firebase.google.com/docs/rules)
- [API 키 제한사항](https://cloud.google.com/docs/authentication/api-keys#api_key_restrictions)
- [보안 침해된 GCP 사용자 인증 정보 처리](https://cloud.google.com/iam/docs/best-practices-for-managing-service-account-keys)
