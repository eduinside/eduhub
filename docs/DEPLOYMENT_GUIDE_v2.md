# EduHub 배포 가이드 (Deployment Guide)

본 문서는 EduHub 프로젝트의 배포 절차를 다룹니다. 주 배포 환경은 **Vercel**이며, Firebase 설정 및 기타 배포 방식도 부록으로 포함합니다.

---

## 🚀 1. Vercel 배포 (권장)

Vercel은 Next.js 애플리케이션에 최적화된 배포 플랫폼입니다.

### 1-1. 배포 전 준비
1. **GitHub 리포지토리 푸시**:
   ```bash
   git add .
   git commit -m "Ready for deploy"
   git push origin main
   ```
2. **Vercel 계정**: [vercel.com](https://vercel.com) 회원가입 및 GitHub 연동.

### 1-2. Vercel 프로젝트 생성
1. Vercel 대시보드에서 **[Add New...] > [Project]** 클릭.
2. GitHub 리포지토리(`eduhub`) 선택 후 **Import**.

### 1-3. 환경 변수 설정 (중요)
Vercel 프로젝트 설정 > **Settings > Environment Variables**에서 `.env.local`의 내용을 등록해야 합니다.

| Key | Value (예시) |
|-----|-------------|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | `AIzaSy...` |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `eduhub-xxx.firebaseapp.com` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `eduhub-xxx` |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | `eduhub-xxx.firebasestorage.app` |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | `...` |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | `...` |

> 💡 **Tip**: `.env.local` 파일 내용을 그대로 복사/붙여넣기 하세요.

### 1-4. 배포 시작
* **Deploy** 버튼 클릭.
* 빌드가 완료되면 제공된 URL(`https://eduhub-xxx.vercel.app`)로 접속하여 테스트.

---

## 🔧 2. 배포 후 설정

### 2-1. Firebase Authorized Domains 설정
Firebase Console > **Authentication > Settings > Authorized domains**에 Vercel 도메인을 추가해야 로그인이 작동합니다.
* `eduhub-xxx.vercel.app`
* `*.vercel.app` (Preview 배포용)

### 2-2. 커스텀 도메인 (선택)
Vercel Settings > **Domains**에서 학교 도메인 등을 연결할 수 있습니다.

---

## 📦 3. Firebase CLI 배포 (대안)

Vercel 대신 Firebase Hosting을 사용할 경우의 절차입니다.

### 3-1. 초기 설정
```bash
npm install -g firebase-tools
firebase login
firebase init hosting
```
* **Public directory**: `.next`
* **Single page app**: `No`

### 3-2. 빌드 및 배포
```bash
npm run build
firebase deploy --only hosting
```

---

## ❓ 문제 해결

### 빌드 실패 시
* Vercel Logs 확인.
* 로컬에서 `npm run build`가 성공하는지 확인.
* 환경 변수 오타 확인.

### 로그인 실패 시
* Firebase Console의 Authorized domains에 배포된 URL이 없는 경우 발생합니다.
