# 🛑 사이트 중단 가이드

## 현재 상태
✅ **1단계 완료**: Firebase Security Rules 배포됨 (Firestore & Storage 접근 차단)

## 다음 단계: Vercel/Firebase Hosting 중단

### 옵션 A: Vercel 배포 중단 (Vercel 사용 시)

#### 방법 1: Vercel Dashboard에서 프로젝트 일시 중지
1. [Vercel Dashboard](https://vercel.com/dashboard) 접속
2. **eduhub** 프로젝트 선택
3. **Settings** 탭 클릭
4. **General** 섹션에서 맨 아래로 스크롤
5. **Pause Deployments** 또는 **Delete Project** 선택
   - ⚠️ Delete는 설정이 삭제되므로 주의!
   - 권장: **Deployments** 탭에서 Production 배포만 삭제

#### 방법 2: 환경 변수 제거 (부분 중단)
1. Vercel Dashboard > **eduhub** 프로젝트
2. **Settings > Environment Variables**
3. 모든 `NEXT_PUBLIC_FIREBASE_*` 변수 삭제
4. **Deployments** 탭에서 **Redeploy** (환경 변수 없이 재배포)

---

### 옵션 B: Firebase Hosting 중단 (Firebase Hosting 사용 시)

```bash
# Firebase 로그인 확인
firebase login

# Hosting 비활성화
firebase hosting:disable

# 또는 완전 삭제 (주의!)
# firebase hosting:sites:delete eduhub-4a75e
```

---

## 🔒 현재 차단된 항목

✅ **Firestore**: 모든 읽기/쓰기 차단
✅ **Storage**: 모든 읽기/쓰기 차단
⏳ **Hosting**: 수동으로 중단 필요 (위 옵션 선택)

---

## 💰 요금 절감 체크리스트

### 즉시 처리 (요금 발생 방지)
- ✅ Firestore 접근 차단 (완료)
- ✅ Storage 접근 차단 (완료)
- ⏳ Vercel/Firebase Hosting 중단 (위 옵션 선택)

### 선택 사항 (장기 중단 시)
- [ ] **Firestore 데이터 백업 후 삭제**
  ```bash
  # 백업
  gcloud firestore export gs://eduhub-4a75e.appspot.com/backups/$(date +%Y%m%d)
  
  # 삭제 (주의!)
  # Firebase Console > Firestore Database > 데이터 수동 삭제
  ```

- [ ] **Storage 파일 백업 후 삭제**
  ```bash
  # Firebase Console > Storage > 파일 다운로드 후 삭제
  ```

- [ ] **Cloud Functions 삭제** (사용 중인 경우)
  ```bash
  firebase functions:delete --all
  ```

- [ ] **Firebase Authentication 사용자 삭제** (선택)
  - Firebase Console > Authentication > Users > 전체 삭제

---

## 📊 예상 요금 (중단 후)

| 서비스 | 중단 전 | 중단 후 |
|--------|---------|---------|
| Firestore | 읽기/쓰기 요금 | **$0** (접근 차단) |
| Storage | 저장/전송 요금 | **저장 요금만** (데이터 유지 시) |
| Hosting | 전송 요금 | **$0** (중단 시) |
| Authentication | 무료 (대부분) | **$0** |

⚠️ **주의**: Firestore/Storage에 데이터가 남아있으면 저장 요금이 소액 발생할 수 있습니다.
- Firestore: 1GB당 $0.18/월
- Storage: 1GB당 $0.026/월

---

## 🔄 원복 방법 (나중에 사이트 재개 시)

### 1단계: Firebase Security Rules 복원

#### 원본 규칙 파일 생성 (백업)
현재 차단 규칙을 백업하고 원본 규칙을 생성해야 합니다.

**firestore.rules.original** (예시):
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // 인증된 사용자만 접근 허용
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

**storage.rules.original** (예시):
```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read: if request.auth != null;
      allow write: if request.auth != null;
    }
  }
}
```

#### 복원 명령:
```bash
# 1. 원본 규칙 파일로 교체
cp firestore.rules.original firestore.rules
cp storage.rules.original storage.rules

# 2. Firebase에 배포
firebase deploy --only firestore:rules,storage:rules
```

---

### 2단계: Vercel/Firebase Hosting 복원

#### Vercel 사용 시:
```bash
# Git push로 자동 배포
git push origin main

# 또는 Vercel Dashboard에서 Redeploy
```

#### Firebase Hosting 사용 시:
```bash
npm run deploy
```

---

### 3단계: 환경 변수 복원 (제거했던 경우)

#### Vercel:
1. Vercel Dashboard > Settings > Environment Variables
2. 모든 Firebase 환경 변수 재추가
3. Redeploy

#### 로컬:
```bash
# .env.local 파일 생성 (SECURITY_ACTION_REQUIRED.md 참조)
```

---

## 📝 중단 전 백업 체크리스트

중단하기 전에 다음 항목을 백업하세요:

- [ ] **환경 변수 목록** (Vercel/로컬)
  - `NEXT_PUBLIC_FIREBASE_*` 모든 값
  - 안전한 곳에 저장 (비밀번호 관리자 등)

- [ ] **Firebase 설정**
  - Firebase Console > Project Settings > General
  - 스크린샷 또는 텍스트로 저장

- [ ] **원본 Security Rules** (현재 없음)
  - Firebase Console > Firestore Database > Rules
  - Firebase Console > Storage > Rules
  - 현재 규칙을 `firestore.rules.backup`, `storage.rules.backup`으로 저장

- [ ] **Firestore 데이터** (중요 데이터가 있는 경우)
  ```bash
  # Firebase Console > Firestore Database > Export
  # 또는
  gcloud firestore export gs://eduhub-4a75e.appspot.com/backups/$(date +%Y%m%d)
  ```

- [ ] **Storage 파일** (중요 파일이 있는 경우)
  - Firebase Console > Storage > 파일 다운로드

---

## ⚠️ 주의사항

1. **API 키 보안**: 중단 중에도 노출된 API 키는 교체 필요
2. **도메인 만료**: 장기 중단 시 도메인 갱신 확인
3. **데이터 보존**: Firestore/Storage 데이터는 중단해도 유지됨
4. **요금 모니터링**: Firebase Console에서 정기적으로 요금 확인

---

## 🆘 문제 해결

### "Permission denied" 오류 발생 시
```bash
# Firebase 재로그인
firebase login --reauth
```

### Vercel 배포가 자동으로 다시 시작되는 경우
- Vercel Dashboard > Settings > Git
- Auto-deploy 비활성화

### 원복 후 사이트가 작동하지 않는 경우
1. 환경 변수 확인
2. Firebase Security Rules 확인
3. 브라우저 캐시 삭제
4. Service Worker 제거 (DevTools > Application > Service Workers)

---

## 📞 지원

- Firebase 문서: https://firebase.google.com/docs
- Vercel 문서: https://vercel.com/docs
- Google Cloud Support: https://cloud.google.com/support
