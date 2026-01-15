# EduHub Workspace - Firebase 배포 가이드

## 배포 전 체크리스트

### 1. 환경 설정
- [x] Firebase 프로젝트 생성 완료
- [x] `.env.local` 파일에 Firebase 설정 완료
- [ ] 프로덕션 빌드 테스트 완료
- [ ] Firebase Security Rules 설정
- [ ] Firebase Storage CORS 설정

### 2. 필수 Firebase 설정

#### Firestore Security Rules
Firebase Console > Firestore Database > Rules 탭에서 다음 규칙 적용:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // 인증된 사용자만 접근
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
    
    // 조직 문서
    match /organizations/{orgId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && 
        (get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'superadmin' ||
         get(/databases/$(database)/documents/users/$(request.auth.uid)).data.profiles[orgId].role == 'admin');
    }
    
    // 사용자 프로필
    match /users/{userId} {
      allow read: if request.auth != null;
      allow write: if request.auth.uid == userId || 
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'superadmin';
    }
  }
}
```

#### Storage Security Rules
Firebase Console > Storage > Rules 탭에서 다음 규칙 적용:

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    // 인증된 사용자만 읽기 가능
    match /{allPaths=**} {
      allow read: if request.auth != null;
    }
    
    // 공지사항 첨부파일
    match /notices/{orgId}/{fileName} {
      allow write: if request.auth != null && 
        request.resource.size < 10 * 1024 * 1024;
    }
    
    // 설문 응답 파일
    match /surveys/responses/{allPaths=**} {
      allow write: if request.auth != null && 
        request.resource.size < 10 * 1024 * 1024;
    }
    
    // 자원 이미지
    match /resources/{allPaths=**} {
      allow write: if request.auth != null && 
        request.resource.size < 5 * 1024 * 1024;
    }
  }
}
```

### 3. Vercel 배포 (권장)

#### 3.1 GitHub에 푸시
```bash
git add .
git commit -m "Ready for deployment"
git push origin main
```

#### 3.2 Vercel 설정
1. [Vercel](https://vercel.com)에 로그인
2. "Add New Project" 클릭
3. GitHub 리포지토리 선택
4. 환경 변수 설정:
   - `NEXT_PUBLIC_FIREBASE_API_KEY`
   - `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
   - `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
   - `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
   - `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
   - `NEXT_PUBLIC_FIREBASE_APP_ID`
5. "Deploy" 클릭

### 4. Firebase Hosting 배포 (대안)

#### 4.1 Firebase CLI 설치
```bash
npm install -g firebase-tools
firebase login
```

#### 4.2 프로젝트 초기화
```bash
firebase init hosting
```
- "Use an existing project" 선택
- Public directory: `.next` (또는 `out` for static export)
- Configure as SPA: Yes
- Automatic builds and deploys with GitHub: Optional

#### 4.3 배포
```bash
npm run build
firebase deploy --only hosting
```

### 5. 배포 후 확인사항

- [ ] 로그인 기능 정상 작동
- [ ] 파일 업로드 정상 작동
- [ ] 조직 선택 및 전환 정상 작동
- [ ] 설문 조사 생성 및 응답 정상 작동
- [ ] 예약 시스템 정상 작동
- [ ] 그룹 채팅 정상 작동

### 6. 성능 최적화 (선택사항)

#### 6.1 이미지 최적화
- PWA 아이콘이 적절한 크기로 생성되어 있는지 확인
- 필요시 이미지 압축 도구 사용

#### 6.2 캐싱 전략
- Service Worker가 올바르게 동작하는지 확인
- 정적 자원 캐싱 정책 검토

### 7. 문제 해결

#### 빌드 오류 발생 시
1. `npm run build` 로컬에서 재실행
2. TypeScript 에러 확인 및 수정
3. `.next` 폴더 삭제 후 재빌드

#### 환경 변수 오류
- Vercel Dashboard에서 환경 변수가 올바르게 설정되었는지 확인
- 변수명 앞에 `NEXT_PUBLIC_` 접두사 확인

#### Firebase 연결 오류
- Firebase Console에서 도메인 인증 설정 확인
- Authentication > Settings > Authorized domains에 배포 도메인 추가

## 현재 상태

### 완료된 작업
- ✅ 프로젝트 구조 최적화
- ✅ 유틸리티 모듈화 (dateUtils, fileUtils)
- ✅ 파일 업로드 시스템 구축
- ✅ UI/UX 표준화
- ✅ 문서 업데이트 (PROJECT_FEATURES.md)

### 진행 중
- ⏳ 프로덕션 빌드 검증
- ⏳ Firebase 보안 규칙 최적화

### 다음 단계
1. 로컬 빌드 오류 수정
2. Firebase Security Rules 적용
3. Vercel 또는 Firebase Hosting에 배포
4. 배포 후 기능 테스트

---

**작성일**: 2026-01-15  
**버전**: 1.2.0
