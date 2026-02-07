# 🔄 사이트 원복 빠른 가이드

## 원복 3단계

### 1️⃣ Firebase Security Rules 복원
```bash
# 원본 규칙 파일로 교체 (백업해둔 파일 사용)
cp firestore.rules.backup firestore.rules
cp storage.rules.backup storage.rules

# Firebase에 배포
firebase deploy --only firestore:rules,storage:rules
```

### 2️⃣ 환경 변수 설정
**.env.local** 파일 생성:
```bash
NEXT_PUBLIC_FIREBASE_API_KEY=새로운_API_키
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=eduhub-4a75e.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=eduhub-4a75e
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=eduhub-4a75e.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=522081723508
NEXT_PUBLIC_FIREBASE_APP_ID=1:522081723508:web:7468ec2b1f98f648bd1d21
```

**Vercel 환경 변수**:
- Vercel Dashboard > Settings > Environment Variables
- 위의 모든 변수 추가

### 3️⃣ 사이트 재배포
```bash
# 로컬 테스트
npm run dev

# Git 커밋 및 푸시 (Vercel 자동 배포)
git add .
git commit -m "chore: Restore site from shutdown"
git push origin main

# 또는 Firebase Hosting
npm run deploy
```

---

## ✅ 완료 확인

- [ ] Firebase Console에서 Security Rules 확인
- [ ] 사이트 접속 테스트
- [ ] 로그인 기능 테스트
- [ ] Firestore 읽기/쓰기 테스트
- [ ] Storage 업로드/다운로드 테스트

---

자세한 내용은 `SITE_SHUTDOWN_GUIDE.md` 참조
