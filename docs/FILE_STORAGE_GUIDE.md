# 📁 EduHub 파일 저장 구조

## 📍 저장 위치

모든 업로드 파일은 **Firebase Storage**에 저장됩니다.

### Firebase Console에서 확인:
1. [Firebase Console](https://console.firebase.google.com) 접속
2. 프로젝트 선택 (`eduhub-4a75e`)
3. **Storage** 메뉴 클릭
4. 파일 브라우저에서 확인 가능

---

## 📂 파일 저장 경로

### 1. **공지사항 첨부파일**
```
Storage 경로: notices/{date}/{timestamp}_{파일명}

예시:
- notices/20260115/1736899200000_문서.pdf
- notices/20260114/1736812800000_이미지.jpg
```

**코드 위치**: `src/app/notice/[date]/page.tsx`
```typescript
const storageRef = ref(storage, `notices/${date}/${Date.now()}_${file.name}`);
await uploadBytes(storageRef, file);
```

---

### 2. **그룹 공지사항 첨부파일**
```
Storage 경로: notices/{groupId}/{timestamp}_{파일명}

예시:
- notices/group123/1736899200000_자료.pdf
- notices/group456/1736812800000_공지.jpg
```

**코드 위치**: `src/app/groups/[groupId]/page.tsx`
```typescript
const storageRef = ref(storage, `notices/${groupId}/${Date.now()}_${file.name}`);
await uploadBytes(storageRef, file);
```

---

### 3. **설문 응답 파일**
```
Storage 경로: surveys/responses/{surveyId}/{userId}/{timestamp}_{파일명}

예시:
- surveys/responses/survey123/user456/1736899200000_과제.pdf
- surveys/responses/survey789/user012/1736812800000_답안.jpg
```

**코드 위치**: `src/app/surveys/[id]/page.tsx`
```typescript
const storageRef = ref(
    storage, 
    `surveys/responses/${survey.id}/${user.uid}/${Date.now()}_${file.name}`
);
await uploadBytes(storageRef, file);
```

---

### 4. **자원 이미지**
```
Storage 경로: resources/{resourceId}_{timestamp}

예시:
- resources/resource123_1736899200000
- resources/resource456_1736812800000
```

**코드 위치**: `src/app/admin/resources/page.tsx`
```typescript
const storageRef = ref(storage, `resources/${Date.now()}_${resourceId}`);
await uploadBytes(storageRef, file);
```

---

### 5. **최고관리자 공지사항**
```
Storage 경로: admin-notices/{timestamp}_{파일명}

예시:
- admin-notices/1736899200000_공지.pdf
- admin-notices/1736812800000_안내.jpg
```

**코드 위치**: `src/app/admin/super/notices/page.tsx`
```typescript
const storageRef = ref(storage, `admin-notices/${Date.now()}_${file.name}`);
await uploadBytes(storageRef, file);
```

---

## 🔐 보안 및 접근 제어

### Firebase Storage Rules

현재 설정 (추정):
```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    // 인증된 사용자만 읽기 가능
    match /{allPaths=**} {
      allow read: if request.auth != null;
    }
    
    // 파일 업로드 (크기 제한)
    match /notices/{allPaths=**} {
      allow write: if request.auth != null && 
                     request.resource.size < 10 * 1024 * 1024; // 10MB
    }
    
    match /surveys/responses/{allPaths=**} {
      allow write: if request.auth != null && 
                     request.resource.size < 10 * 1024 * 1024;
    }
    
    match /resources/{allPaths=**} {
      allow write: if request.auth != null && 
                     request.resource.size < 5 * 1024 * 1024; // 5MB
    }
  }
}
```

---

## 💾 용량 및 비용

### Firebase Storage 무료 할당량 (Spark):
- **저장 용량**: 5GB
- **다운로드**: 1GB/일
- **업로드**: 무제한

### Blaze(종량제) 초과 시 요금:
- **저장**: $0.026/GB/월
- **다운로드**: $0.12/GB

### 예상 사용량 (100명 학교):
- 월 파일 업로드: ~500개
- 평균 파일 크기: 2MB
- **월 저장 용량**: ~1GB
- **월 예상 비용**: $0.026 (무료 범위 내)

---

## 🗂️ 파일 관리

### Firebase Console에서 파일 관리:

1. **파일 확인**
   - Storage > Files 탭
   - 폴더별로 탐색

2. **파일 다운로드**
   - 파일 클릭 > Download

3. **파일 삭제**
   - 파일 선택 > Delete
   - ⚠️ 주의: 삭제 후 복구 불가

4. **용량 확인**
   - Storage > Usage 탭
   - 일별/월별 사용량 확인

---

## 🔄 파일 백업

### 권장 백업 방법:

#### 방법 1: Firebase CLI (자동화)
```bash
# Firebase Storage 전체 다운로드
firebase storage:get --prefix / backup/

# 특정 폴더만 백업
firebase storage:get --prefix notices/ backup/notices/
```

#### 방법 2: Google Cloud Console
1. [Google Cloud Storage](https://console.cloud.google.com/storage) 접속
2. 버킷 선택 (`eduhub-4a75e.firebasestorage.app`)
3. 파일 선택 > Download

#### 방법 3: gsutil (대량 백업)
```bash
# gsutil 설치
gcloud auth login

# 전체 백업
gsutil -m cp -r gs://eduhub-4a75e.firebasestorage.app backup/
```

---

## 📊 파일 통계 (현재 프로젝트)

### 파일 업로드 위치별 용량 제한:

| 위치 | 경로 | 용량 제한 | 압축 |
|------|------|----------|------|
| 공지사항 | `/notice/[date]` | 조직별 설정 (3/5/10MB) | ✅ |
| 그룹 공지 | `/groups/[groupId]` | 조직별 설정 | ✅ |
| 설문 응답 | `/surveys/[id]` | 조직별 설정 | ✅ |
| 자원 이미지 | `/admin/resources` | 5MB | ❌ |
| 관리자 공지 | `/admin/super/notices` | 10MB | ❌ |

---

## 🛡️ 보안 권장사항

### 1. Storage Rules 강화
```javascript
// 사용자별 업로드 제한
match /surveys/responses/{surveyId}/{userId}/{fileName} {
  allow write: if request.auth != null && 
               request.auth.uid == userId &&
               request.resource.size < 10 * 1024 * 1024;
}
```

### 2. 파일 타입 제한
```javascript
// 이미지 파일만 허용
match /resources/{imageId} {
  allow write: if request.auth != null &&
               request.resource.contentType.matches('image/.*');
}
```

### 3. CORS 설정
Firebase Console > Storage > Rules 탭에서:
```json
[
  {
    "origin": ["https://eduhub-xxx.vercel.app"],
    "method": ["GET"],
    "maxAgeSeconds": 3600
  }
]
```

---

## 정리

### ✅ 파일 저장 위치
- **물리적 위치**: Google Cloud Storage (Firebase Storage)
- **접근 방법**: Firebase Console, Firebase CLI, Google Cloud Console
- **URL 형식**: `https://firebasestorage.googleapis.com/v0/b/eduhub-4a75e.firebasestorage.app/o/...`

### 📌 주요 경로
1. `notices/{date}/` - 공지사항
2. `notices/{groupId}/` - 그룹 공지
3. `surveys/responses/{surveyId}/{userId}/` - 설문 응답
4. `resources/` - 자원 이미지
5. `admin-notices/` - 관리자 공지

### 🔗 관련 링크
- [Firebase Console - Storage](https://console.firebase.google.com/project/eduhub-4a75e/storage)
- [Google Cloud Storage](https://console.cloud.google.com/storage)

---

**작성일**: 2026-01-15  
**프로젝트**: EduHub 파일 저장 구조
