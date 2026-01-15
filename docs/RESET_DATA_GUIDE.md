# 🗑️ 데이터 초기화 및 운영 전환 가이드

개발 테스트 데이터를 모두 삭제하고, 실제 운영(Production)을 준비하기 위한 초기화 절차입니다.

## 1. Firestore 데이터베이스 초기화
모든 게시글, 예약(Schedule), 그룹 데이터 등을 삭제합니다.

**터미널 명령어 사용 (권장):**
```bash
# 1. 프로젝트 선택
npx firebase use eduhub-4a75e

# 2. 모든 데이터 삭제
npx firebase firestore:delete --all-collections
```
> ⚠️ **주의**: 이 명령은 데이터베이스의 **모든 내용**을 영구적으로 삭제합니다.

## 2. Storage 초기화
업로드된 이미지, 첨부파일 등을 삭제합니다.

1. [Firebase Console](https://console.firebase.google.com/project/eduhub-4a75e/storage) 접속
2. **Storage** 메뉴 선택
3. 루트 경로(`/`)의 모든 폴더/파일 선택
4. `삭제` 버튼 클릭

## 3. 사용자 계정 (Authentication) 초기화
가입된 테스트 계정을 삭제합니다.

1. [Firebase Console](https://console.firebase.google.com/project/eduhub-4a75e/authentication/users) 접속
2. **Authentication** > **Users** 탭 선택
3. 사용자 목록 상단 체크박스 선택 (전체 선택)
4. `계정 삭제` 클릭

## 4. 운영 배포 전 최종 점검
- [ ] `next.config.ts`의 PWA 설정 확인 (현재 Webpack 모드)
- [ ] Firestore 보안 규칙 (`firestore.rules`) 검토
- [ ] 관리자 계정(Super Admin)을 새로 생성할 준비

---
**Tip**: 초기화 후에는 반드시 **최고 관리자 계정**부터 새로 가입하여 역할을 설정해야 합니다 (`users` 컬렉션에서 `role: superadmin` 수동 지정 필요).
