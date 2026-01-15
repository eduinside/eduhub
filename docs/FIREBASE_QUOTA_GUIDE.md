# Firebase Quota 초과 문제 해결 가이드

## 📊 현재 상황
Firebase Firestore 무료 플랜(Spark)의 일일 할당량 초과

**무료 플랜 제한:**
- 읽기: 50,000회/일
- 쓰기: 20,000회/일
- 삭제: 20,000회/일
- 저장용량: 1GB

---

## 🚨 즉시 조치

### 1. 개발 서버 중지 (임시)
```bash
# 터미널에서 Ctrl + C
# 또는 프로세스 종료
```

### 2. Firebase Console 확인
1. [Firebase Console](https://console.firebase.google.com) 접속
2. 프로젝트 선택 (eduhub-4a75e)
3. **Firestore Database** > **Usage** 탭
4. 읽기/쓰기 횟수 확인

---

## 💰 요금제 업그레이드 (권장)

### Blaze(종량제) 플랜으로 변경

**장점:**
- ✅ 무료 할당량 **동일** (50K 읽기/일)
- ✅ 초과 시에만 과금
- ✅ 소규모는 여전히 **무료**
- ✅ 월 예산 한도 설정 가능

**예상 비용 (소규모 학교 100명):**
- 읽기: ~100,000회/일 (50K 무료 + 50K 과금)
- 비용: $0.06 × 50K/100K = **$0.03/일**
- **월 예상: $1-2**

**업그레이드 방법:**
1. Firebase Console > 왼쪽 하단 톱니바퀴 > **사용량 및 결제**
2. **플랜 수정** 클릭
3. **Blaze(종량제)** 선택
4. 결제 카드 등록
5. **예산 알림 설정** (예: $10/월 초과 시 알림)

---

## 🔧 코드 최적화 (할당량 절감)

### 문제 1: 실시간 리스너 과다 사용

**현재 문제점:**
```typescript
// ❌ 나쁜 예: 페이지 새로고침마다 모든 데이터 다시 읽기
useEffect(() => {
    const unsubscribe = onSnapshot(query(...), (snapshot) => {
        // 모든 문서를 매번 읽음
    });
}, []);
```

**해결책: 로컬 캐싱 추가**

`src/utils/firestoreCache.ts` 파일 생성:
```typescript
// 간단한 메모리 캐시
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5분

export function getCached<T>(key: string): T | null {
    const cached = cache.get(key);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.data as T;
    }
    return null;
}

export function setCache<T>(key: string, data: T): void {
    cache.set(key, { data, timestamp: Date.now() });
}
```

### 문제 2: 불필요한 리스너

**개선 필요한 파일:**
1. `src/app/page.tsx` - 메인 페이지
2. `src/app/admin/super/page.tsx` - 관리자 페이지
3. `src/app/admin/org/page.tsx` - 조직 관리자

**개선 방법:**
```typescript
// 정적 데이터는 getDocs 사용 (1회 읽기)
const fetchOnce = async () => {
    const snapshot = await getDocs(query(...));
    // ...
};

// 실시간이 필요한 데이터만 onSnapshot 사용
const unsubscribe = onSnapshot(query(...), (snapshot) => {
    // ...
});
```

### 문제 3: 과도한 쿼리

**최적화 방법:**
```typescript
// ✅ 필요한 필드만 가져오기 (Firestore는 문서 단위 과금)
// ✅ where 조건 추가로 불필요한 데이터 필터링
// ✅ limit() 사용

const q = query(
    collection(db, "notices"),
    where("orgId", "==", orgId),
    where("endDate", ">=", today),
    orderBy("endDate"),
    limit(20) // 최신 20개만
);
```

---

## 📉 할당량 모니터링

### Firebase Console 알림 설정

1. **Firestore** > **Usage** 탭
2. 사용량 그래프 확인
3. 급증 구간 파악

### 예산 알림 설정 (Blaze 전환 시)

1. **설정** > **사용량 및 결제**
2. **예산 알림** 설정
3. 한도: $5/월 또는 $10/월

---

## 🎯 즉시 적용 가능한 최적화

### 1. 개발 중 핫 리로드 줄이기

**.env.local**에 추가:
```env
# 개발 시 폴링 간격 늘림
NEXT_PUBLIC_DEV_POLL_INTERVAL=10000
```

### 2. 로컬 에뮬레이터 사용 (개발용)

```bash
# Firebase 에뮬레이터 설치
firebase init emulators

# Firestore 에뮬레이터 선택
# 포트: 8080 (기본값)

# 에뮬레이터 실행
firebase emulators:start
```

`src/lib/firebase.ts` 수정:
```typescript
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';

const db = getFirestore(app);

// 개발 환경에서 에뮬레이터 사용
if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined') {
    try {
        connectFirestoreEmulator(db, 'localhost', 8080);
        console.log('🔧 Using Firestore Emulator');
    } catch (e) {
        // 이미 연결됨
    }
}
```

---

## 📋 체크리스트

### 즉시 (오늘):
- [ ] 개발 서버 중지
- [ ] Firebase Console에서 사용량 확인
- [ ] Blaze 플랜 고려

### 단기 (이번 주):
- [ ] 불필요한 onSnapshot 제거
- [ ] 쿼리에 limit() 추가
- [ ] 로컬 에뮬레이터 설정

### 중기 (다음 주):
- [ ] 캐싱 시스템 구현
- [ ] 사용량 모니터링 대시보드
- [ ] 최적화된 쿼리 패턴 적용

---

## 💡 권장 사항

**즉시: Blaze 플랜 전환**
- 무료 할당량 동일
- 예산 한도 $10/월 설정
- 소규모는 $0-2/월 예상

**장기: 코드 최적화**
- 로컬 에뮬레이터 개발 환경
- 캐싱 시스템 도입
- 쿼리 최적화

---

**작성일**: 2026-01-15  
**대상**: EduHub Firebase Quota 관리
