# ⚠️ 현재 상태 상세 분석

## 📱 알림 시스템 영향도

### ❌ 영향 받는 부분 (작동 안 함)

#### 1. FCM 토큰 저장 실패
**문제**: 사용자가 알림 권한을 허용해도 **토큰이 Firestore에 저장되지 않음**
- 코드 위치: `src/hooks/useFcmToken.ts` 라인 38-40
- 차단된 작업:
  ```javascript
  await updateDoc(userRef, {
      fcmTokens: arrayUnion(currentToken)  // ❌ Firestore 쓰기 차단됨
  });
  ```

#### 2. 사용자 프로필 조회 실패
**문제**: 관리자 권한 확인을 위한 **사용자 데이터 조회 불가**
- 코드 위치: `src/hooks/useFcmToken.ts` 라인 61-77
- 차단된 작업:
  ```javascript
  const snap = await getDoc(userRef);  // ❌ Firestore 읽기 차단됨
  ```

#### 3. 알림 전송 실패 (관리자 기능)
**문제**: 관리자가 알림을 보내려 해도 **수신자 토큰 조회 불가**
- 코드 위치: `src/app/api/fcm/send/route.ts` 라인 53
- 차단된 작업:
  ```javascript
  const tokens = userData?.fcmTokens || [];  // ❌ Firestore 읽기 차단됨
  ```

---

### ✅ 영향 받지 않는 부분 (정상 작동)

#### 1. FCM 토큰 생성
- Firebase Cloud Messaging 서비스는 정상 작동
- 브라우저에서 토큰 발급은 가능
- 단, Firestore에 저장만 안 됨

#### 2. Topic 구독
- `/api/fcm/subscribe` API는 정상 작동 가능
- FCM Topic 구독은 Firestore와 무관
- 단, 사용자 권한 확인이 필요한 경우 문제 발생

#### 3. 푸시 알림 수신 (이미 등록된 사용자)
- **Security Rules 배포 전에 이미 토큰이 저장된 사용자**는 알림 수신 가능
- Service Worker는 정상 작동
- 단, 새로운 사용자나 새 기기는 등록 불가

---

## 🎯 결론: 알림 시스템 상태

### 현재 상황
| 기능 | 상태 | 설명 |
|------|------|------|
| **기존 사용자 알림 수신** | ⚠️ 부분 작동 | 이미 토큰이 저장된 사용자만 가능 |
| **새 사용자 알림 등록** | ❌ 불가 | Firestore 쓰기 차단으로 토큰 저장 안 됨 |
| **관리자 알림 전송** | ❌ 불가 | 수신자 토큰 조회 불가 |
| **Topic 기반 알림** | ⚠️ 부분 작동 | 이미 구독된 사용자만 가능 |

### 요약
**현재 상태에서는 알림 시스템이 사실상 작동하지 않습니다.**

- ❌ 새로운 사용자는 알림을 받을 수 없음
- ❌ 관리자가 알림을 보낼 수 없음 (수신자 목록 조회 불가)
- ⚠️ 이미 등록된 사용자 중 일부만 알림 수신 가능 (Topic 구독된 경우)

---

## 🔧 해결 방안

### 옵션 1: 알림 기능만 허용 (부분 복원)
Firestore Security Rules를 수정하여 **FCM 토큰 관련 작업만 허용**

**firestore.rules** 수정:
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // FCM 토큰 저장만 허용
    match /users/{userId} {
      allow update: if request.auth != null 
                    && request.auth.uid == userId
                    && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['fcmTokens']);
      allow read: if false;  // 읽기는 여전히 차단
    }
    
    // 나머지는 모두 차단
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

**장점**: 
- 알림 등록 가능
- 다른 데이터는 여전히 보호됨

**단점**: 
- 관리자 알림 전송은 여전히 불가 (사용자 데이터 읽기 차단)

---

### 옵션 2: 완전 복원
Security Rules를 원본으로 복원

**장점**: 
- 모든 기능 정상 작동

**단점**: 
- 노출된 API 키로 인한 보안 위험

---

### 옵션 3: 현재 상태 유지
알림 기능 포기하고 현재 상태 유지

**장점**: 
- 최대 보안
- 요금 절감

**단점**: 
- 알림 시스템 완전 중단

---

## 💡 권장 사항

### 단기 (지금 당장)
**옵션 3 (현재 상태 유지)** 권장
- 노출된 API 키 문제가 해결될 때까지 대기
- 알림보다 보안이 우선

### 중기 (API 키 교체 후)
1. Google Cloud Console에서 **새 API 키 생성 및 제한사항 추가**
2. 환경 변수 업데이트
3. **Security Rules 완전 복원**
4. 모든 기능 정상화

---

## 📊 사용자 영향도

현재 중단된 상태에서 사용자가 겪는 문제:

1. ❌ **로그인 후 데이터 조회 불가**
   - 공지사항, 설문조사, 예약 등 모든 데이터 접근 불가

2. ❌ **알림 등록 불가**
   - 알림 권한을 허용해도 토큰 저장 실패
   - 에러 메시지는 표시되지 않지만 작동 안 함

3. ❌ **관리자 기능 전체 중단**
   - 공지 작성, 설문 생성, 알림 전송 모두 불가

4. ✅ **사이트 접속은 가능**
   - 페이지 로드는 정상
   - 단, 데이터가 없어 빈 화면

---

## 다음 단계

어떻게 하시겠습니까?

1. **현재 상태 유지** (알림 포기, 최대 보안)
2. **부분 복원** (알림 등록만 허용, 옵션 1)
3. **완전 복원** (API 키 교체 후, 옵션 2)
