# FCM 알림 설정 가이드

EduHub의 푸시 알림 기능을 활성화하기 위한 설정 가이드입니다.

---

## 🔑 1. Firebase 설정

### 1-1. VAPID Key (Web Push 인증서) 발급
1. [Firebase Console](https://console.firebase.google.com) 접속.
2. 왼쪽 메뉴 상단의 **톱니바퀴 아이콘(설정)** > **프로젝트 설정 (Project Settings)** 클릭.
3. 상단 탭에서 **클라우드 메시징 (Cloud Messaging)** 선택.
4. 화면을 **맨 아래까지** 스크롤합니다.
5. **웹 푸시 인증서 (Web Push certificates)** 섹션 확인.
   * "Web configuration"이라고 표시될 수도 있습니다.
   * 만약 보이지 않는다면 "General" 탭에서 Web App이 올바르게 등록되었는지 확인하세요.
6. `Generate key pair` 버튼을 클릭하여 키를 생성하고 복사합니다.

### 1-2. Service Account Key 발급
1. 프로젝트 설정(Project Settings) > **Service accounts** 탭.
2. **Firebase Admin SDK** 선택 > `Generate new private key` 클릭.
3. 다운로드된 JSON 파일의 내용을 복사. (줄바꿈 없이 한 줄로 만들거나 JSON 그대로 사용)

---

## 🌍 2. 환경 변수 설정 (`.env.local`)

로컬 개발 환경 및 Vercel 배포 시 다음 환경 변수를 설정해야 합니다.

```env
# Existing variables...
NEXT_PUBLIC_FIREBASE_API_KEY=...

# Cloud Messaging
NEXT_PUBLIC_FCM_VAPID_KEY=여기에_VAPID_KEY_입력

# Admin SDK (서버 사이드 발송용)
# 주의: JSON 내용은 따옴표(') 등으로 감싸서 하나의 문자열로 취급되게 해야 할 수 있습니다.
# Vercel 등에서는 줄바꿈을 포함한 값을 그대로 넣어도 됩니다.
FIREBASE_SERVICE_ACCOUNT_KEY={"type":"service_account",...}
```

> **주의**: `FIREBASE_SERVICE_ACCOUNT_KEY`는 보안상 절대 클라이언트에 노출되어서는 안 됩니다 (`NEXT_PUBLIC_` 접두사 금지).

---

## 🛠️ 3. 기능 테스트

### 3-1. 알림 권한 허용
1. 앱에 접속 (로그인 상태).
2. 브라우저가 "알림 권한"을 요청하면 **허용** 선택.
3. Firestore `users` 컬렉션의 내 문서에 `fcmTokens` 필드가 생겼는지 확인.

### 3-2. 테스트 발송
1. `/admin/super/send-notification` 페이지 접속 (최고 관리자만 가능).
2. 제목, 내용을 입력하고 **전송하기** 클릭.
3. 알림이 오는지 확인.
   * 앱이 포그라운드에 있을 때: 콘솔 로그 확인 (또는 커스텀 토스트).
   * 앱이 백그라운드에 있을 때: 시스템 알림 표시.

---

## ⏰ 4. 자동 알림 (Daily Cron)

* **설정 파일**: `vercel.json`
* **일정**: 매일 아침 08:00 (KST)
* **로직**: `/api/cron/daily-morning` 엔드포인트 호출 > `all_users` 토픽 구독자에게 발송.

> **로컬 테스트**: `http://localhost:3000/api/cron/daily-morning`으로 GET 요청을 보내 테스트할 수 있습니다.
