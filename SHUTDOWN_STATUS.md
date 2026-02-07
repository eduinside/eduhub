# ✅ 사이트 중단 1단계 완료

## 완료된 작업

### ✅ Firebase Security Rules 배포 완료
- **Firestore**: 모든 읽기/쓰기 차단됨
- **Storage**: 모든 읽기/쓰기 차단됨
- **배포 시간**: 2026-02-07 12:07 (KST)

이제 Firestore와 Storage에 대한 모든 접근이 차단되어 **추가 요금이 발생하지 않습니다**.

---

## 🚨 다음 단계: Hosting 중단 (선택)

사이트를 완전히 중단하려면 아래 옵션 중 하나를 선택하세요.

### 옵션 1: Vercel 배포 중단 (Vercel 사용 시)

#### A. Production 배포만 삭제 (권장)
1. [Vercel Dashboard](https://vercel.com/dashboard) 접속
2. **eduhub** 프로젝트 선택
3. **Deployments** 탭
4. Production 배포 찾기
5. **...** 메뉴 > **Delete**

**장점**: 설정 유지, 쉬운 원복
**원복**: Git push 또는 Redeploy 버튼

#### B. 환경 변수만 제거 (부분 중단)
1. Vercel Dashboard > **eduhub** > **Settings**
2. **Environment Variables** 탭
3. 모든 `NEXT_PUBLIC_FIREBASE_*` 변수 삭제
4. **Deployments** > **Redeploy**

**장점**: 사이트는 보이지만 Firebase 기능 작동 안함
**원복**: 환경 변수 복원 후 Redeploy

---

### 옵션 2: Firebase Hosting 중단 (Firebase Hosting 사용 시)

```bash
# 터미널에서 실행
firebase hosting:disable
```

**원복**:
```bash
npm run deploy
```

---

## 💰 현재 요금 상태

| 서비스 | 상태 | 요금 |
|--------|------|------|
| **Firestore** | 🔒 차단됨 | ✅ $0 |
| **Storage** | 🔒 차단됨 | ✅ $0 (데이터 저장 요금 소액 가능) |
| **Hosting** | ⚠️ 활성 | ⚠️ 트래픽 요금 발생 가능 |
| **Authentication** | ✅ 활성 | ✅ $0 (무료) |

⚠️ **Storage 저장 요금**: 파일이 남아있으면 1GB당 $0.026/월 소액 발생
⚠️ **Hosting 요금**: 위 옵션으로 중단하면 $0

---

## 📋 백업 체크리스트

중단하기 전에 다음을 백업하세요:

### 1. 환경 변수 백업
현재 Vercel 또는 로컬 `.env.local`의 환경 변수를 안전한 곳에 저장하세요:

```
NEXT_PUBLIC_FIREBASE_API_KEY=새로운_API_키
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=eduhub-4a75e.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=eduhub-4a75e
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=eduhub-4a75e.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=522081723508
NEXT_PUBLIC_FIREBASE_APP_ID=1:522081723508:web:7468ec2b1f98f648bd1d21
```

### 2. 원본 Security Rules 백업

**중요**: 현재 차단 규칙이 배포되었으므로, Firebase Console에서 원본 규칙을 백업해야 합니다!

1. [Firebase Console](https://console.firebase.google.com/) 접속
2. **eduhub-4a75e** 프로젝트 선택

#### Firestore Rules 백업:
3. **Firestore Database** > **Rules** 탭
4. **History** 버튼 클릭
5. 이전 버전 선택 (차단 규칙 배포 전)
6. 내용 복사하여 `firestore.rules.backup` 파일로 저장

#### Storage Rules 백업:
7. **Storage** > **Rules** 탭
8. **History** 버튼 클릭
9. 이전 버전 선택
10. 내용 복사하여 `storage.rules.backup` 파일로 저장

⚠️ **이 작업을 하지 않으면 원복 시 원본 규칙을 잃게 됩니다!**

### 3. Firestore 데이터 백업 (선택)

중요한 데이터가 있다면:

```bash
# Firebase Console > Firestore Database > 데이터 탭
# 수동으로 Export 또는

# gcloud CLI 사용
gcloud firestore export gs://eduhub-4a75e.appspot.com/backups/20260207
```

### 4. Storage 파일 백업 (선택)

중요한 파일이 있다면:
- Firebase Console > Storage > 파일 다운로드

---

## 🔄 원복 방법

나중에 사이트를 다시 시작하려면:

### 빠른 원복 (3단계):
1. **Security Rules 복원**: `RESTORE_SITE.md` 참조
2. **환경 변수 설정**: 백업한 값 사용
3. **재배포**: `git push` 또는 `npm run deploy`

자세한 내용: `SITE_SHUTDOWN_GUIDE.md` 참조

---

## 📁 관련 문서

- **SITE_SHUTDOWN_GUIDE.md** - 상세한 중단/원복 가이드
- **RESTORE_SITE.md** - 빠른 원복 가이드
- **SECURITY_ACTION_REQUIRED.md** - API 키 보안 조치
- **SECURITY_GUIDE.md** - 보안 모범 사례

---

## ⚠️ 중요 알림

1. **API 키 교체**: 중단 중에도 노출된 API 키는 반드시 교체하세요
2. **원본 규칙 백업**: Firebase Console에서 원본 Security Rules를 반드시 백업하세요
3. **환경 변수 저장**: 백업하지 않으면 원복 시 다시 설정해야 합니다

---

## 현재 Git 상태

```
✅ 커밋 완료: "security: Add Firebase security rules to block all access during shutdown"
⏳ 푸시 대기: dev 브랜치에 커밋됨
```

다음 명령으로 푸시:
```bash
git push origin dev
```

---

## 질문이 있으신가요?

- Firebase 문서: https://firebase.google.com/docs
- Vercel 문서: https://vercel.com/docs
