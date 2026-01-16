# 교원 업무 지원 시스템 (EduHub) 구축 계획서 (Firebase Optimized)

본 문서는 Antigravity의 강력한 코딩 어시스턴트 기능과 Google Firebase 서비스를 결합하여, 교원의 행정 및 교육 업무를 가장 효율적으로 지원하는 웹 애플리케이션의 구현 계획을 정의합니다.

## 1. 프로젝트 개요
- **목표**: 조직별 사용자 설정이 가능한 교원 관리 및 협업 도구 구축
- **핵심 가치**: Firebase의 실시간성, Google Ecosystem 통합, Antigravity를 활용한 고속 개발

## 2. 업데이트된 기술 스택 (Google Cloud Stack)
- **Framework**: **Next.js 14+ (App Router)** - SSR 및 SEO, 모바일 성능 최적화
- **Auth**: **Firebase Authentication** - Google 로그인 기본 연동 및 회원 식별
- **Database**: **Cloud Firestore (NoSQL)** 
    - 실시간 동기화 지원 (예약 시스템 및 공지사항 실시간 반영)
    - 복잡한 조직 권한 구조를 위한 계층형 문서 구조 활용
- **Storage**: **Firebase Storage** - 공지사항 및 설문용 첨부파일 관리
- **Backend Logic**: **Firebase Cloud Functions** - 서버리스 로직 처리
- **Styling**: **Vanilla CSS (Glassmorphism)** - Antigravity가 제안하는 프리미엄 디자인

## 3. 핵심 아키텍처 및 Antigravity 활용 전략

### 3.1 조직 및 권한 구조 (Firebase 커스텀 클레임 활용)
- **전체 관리자(Super Admin)**: `isSuperAdmin` 클레임을 부여받아 전체 조직(`organizations` 컬렉션) 및 조직 관리자 설정.
- **조직별 관리자(Org Admin)**: 해당 조직 문서 하위의 관리자 필드에 등록됨.
- **Antigravity 역할**: Firestore의 Security Rules(보안 규칙)를 자동 생성하고 복잡한 RBAC(Role-Based Access Control) 로직을 버그 없이 구현.

### 3.2 주요 기능 데이터 모델
- `organizations/{orgId}`: 조직명, 초대 코드(`inviteCode`), 설정값, 관리자 UID 리스트
- `users/{uid}`: 사용자 프로필, 소속 `orgId`, 역할(`role`), 가입일
- `notices/{noticeId}`: 공지사항 (전체/조직 ID 필드로 구분)
- `surveys/{surveyId}`: 설문 구조, 배포 대상, 작성자 정보
- `resources/{resourceId}`: 장소 정보, 관리자 목록, 운영 시간, 예약 확정 방식(`approvalType`)
- `reservations/{resId}`: 예약 날짜/시간, 상태, 신청자 UID

## 4. 상세 기능 구현 계획 (Google 자원 활용)

### 4.1 예약 및 자원 관리 시스템
- **날짜 선택 기능**: 사용자가 특정 날짜를 선택하여 예약 현황을 확인하고 신청할 수 있는 캘린더/일자 선택 UI 제공.
- **예약 확정 프로세스**:
    - **자동 확정**: 장소 설정이 'auto'인 경우 신청 즉시 `confirmed` 상태로 변경.
    - **승인 후 확정**: 장소 설정이 'manual'인 경우 관리자가 확인 후 승인해야 `confirmed`로 변경 (대기 상태는 `pending`).
- **실시간 현황**: Firestore Snapshot을 통해 다른 사용자의 예약 및 관리자의 승인 상태를 즉시 반영.

### 4.2 설문조사 및 주간 일정 뷰
- **시점 이동 기능**: 이번 주 뿐만 아니라 날짜 변경 기능을 통해 다음주 및 미래의 설문/일정 정보를 조회 가능.
- **결과 통계**: Firebase Functions를 활용하여 설문 종료 시 데이터 취합 및 시각화 제공.
- **접근 제어**: 작성자 및 관리자만 상세 통계에 접근할 수 있도록 보안 규칙 적용.

### 4.3 권한별 관리 도구 및 가입 Flow (Onboarding Strategy)
- **Role-Based Onboarding**: 
    - **Admin Token**: 슈퍼 관리자가 발행하는 조직 관리자 전역 가입 토큰.
    - **User Token**: 조직 관리자가 발행하는 소속 교원용 가입 토큰.
- **가입 제어 인프라**:
    - **초대 링크 속성**: 만료일 설정, 최대 가입 인원 제한, 링크 활성/비활성 토글.
    - **입장 정책**: 신청 시 즉시 승인(Auto) 또는 관리자 확인 후 승인(Manual) 정책을 조직별로 선택.
- **초대 시스템**: 특정 링크로 접속 시 해당 조직 및 역할(Role) 정보를 세션에 유지하여 가입 flow 진행.
- **보안 정책**: 특정 메일 도메인(예: @sen.go.kr) 소유자만 가입 가능하도록 도메인 화이트리스트 기능 제공.

## 5. UI/UX 디자인 전략 (Premium & Simple)
- **Antigravity Design Engine**: 
    - 세련된 다크 모드/라이트 모드 테마 지원.
    - 입력란 포커스 시 부드러운 글로우(Glow) 효과 및 마이크로 애니메이션.
    - 모바일 중심의 Bottom Sheet UI를 활용한 예약 및 설정 창.

## 6. 개발 프로세스 (Antigravity와 함께)
1.  **Step 1**: Antigravity가 Firebase CLI를 사용하여 프로젝트 초기 설정 및 `firebase.json` 구성.
2.  **Step 2**: Firestore 컬렉션 구조 및 인덱스 자동 생성 코드 작성.
3.  **Step 3**: Google OAuth 연동 모듈 및 전역 상태(User Context) 관리 구현.
4.  **Step 4**: 각 모듈(공지, 설문, 예약)의 UI 및 로직 Antigravity가 한 번에 코딩.
5.  **Step 5**: 배포 전 Antigravity가 단위 테스트 및 보안 취약점 점검 실시.

## 7. 준비 사항
- **Firebase Console**: 프로젝트 생성 및 웹 앱 등록.
- **Google Cloud SDK**: 로컬 개발 환경에 설치 (Antigravity가 명령어 지원).
- **Service Account Key**: Cloud Functions 및 Admin 연동을 위한 키 발급.
