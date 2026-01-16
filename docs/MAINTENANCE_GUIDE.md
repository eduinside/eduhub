# EduHub 유지보수 및 운영 가이드 (Maintenance Guide)

본 문서는 EduHub 서비스 운영 시 필요한 데이터 관리, 파일 스토리지 정책, 할당량 관리 및 초기화 절차를 다룹니다.

---

## 📂 1. 파일 스토리지 구조 및 정책

EduHub는 Firebase Storage를 사용하여 파일을 저장합니다.

### 1-1. 저장 경로 구조
| 구분 | Storage 경로 | 설명 |
|------|-------------|------|
| **공지사항** | `notices/{date}/{timestamp}_{filename}` | 날짜별 분류 |
| **그룹 공지** | `notices/{groupId}/{timestamp}_{filename}` | 그룹별 격리 |
| **설문 응답** | `surveys/responses/{surveyId}/{userId}/...` | 설문/유저별 격리 |
| **리소스** | `resources/{resourceId}_{timestamp}` | 관리자 업로드 자원 |
| **관리자 공지** | `admin-notices/{timestamp}_{filename}` | 전체 공지 |

### 1-2. 용량 제한 및 관리
* **Firebase Spark (무료) 플랜**: 총 5GB 저장, 일일 다운로드 1GB.
* **업로드 제한**: 클라이언트 측에서 파일 크기를 체크합니다 (예: 공지사항 10MB, 리소스 5MB).
* **이미지 최적화**: 업로드 시 브라우저단에서 이미지를 압축(`utils/fileUtils.ts`)하여 저장 용량을 절약합니다.

### 1-3. 백업
Firebase CLI를 통해 전체 데이터를 다운로드할 수 있습니다.
```bash
firebase storage:get --prefix / backup_storage/
```

---

## 📊 2. Firebase Quota (할당량) 관리

Firestore 무료 플랜(Spark)의 제한 사항을 고려한 운영 가이드입니다.

### 2-1. 무료 할당량 (일일)
* **읽기 (Reads)**: 50,000회
* **쓰기 (Writes)**: 20,000회
* **삭제 (Deletes)**: 20,000회

### 2-2. 최적화 및 대응 전략
1. **과다 읽기 방지**:
   * 페이지 새로고침 시 불필요한 재요청을 막기 위해 React Query 또는 로컬 캐싱 전략 사용.
   * `getDocs` 대신 `limit()` 쿼리를 사용하여 필요한 만큼만 로딩.
2. **할당량 초과 시**:
   * 서비스가 일시 중단될 수 있습니다.
   * **Blaze (종량제) 플랜**으로 업그레이드 권장 (무료 사용량 초과분에 대해서만 과금, 소규모 운영 시 월 $1 미만 예상).

---

## 🗑️ 3. 데이터 초기화 (Reset Guide)

개발/테스트 데이터를 모두 삭제하고 운영 환경으로 전환할 때 사용합니다.

### 3-1. Firestore 데이터 삭제 (CLI 권장)
```bash
# 주의: 모든 데이터가 삭제됩니다.
npx firebase firestore:delete --all-collections
```

### 3-2. Storage 파일 삭제
1. Firebase Console > Storage 접속.
2. 전체 폴더 선택 후 삭제.

### 3-3. 사용자 계정 삭제
1. Firebase Console > Authentication 접속.
2. 사용자 전체 선택 후 삭제.

### 3-4. 초기화 후 필수 작업
* **최고 관리자(Super Admin) 재생성**:
  * 회원가입 후 Firestore `users` 컬렉션에서 해당 유저 문서의 `role` 필드를 `superadmin`으로 수동 변경해야 합니다.

---

## 🛠️ 4. 문제 해결 (Troubleshooting)

* **파일 업로드 실패**: Storage 규칙(`firestore.rules`) 권한 확인 및 할당량 초과 여부 확인.
* **데이터 로딩 느림**: 인덱스 설정 확인 (콘솔 로그에 링크가 뜹니다).
