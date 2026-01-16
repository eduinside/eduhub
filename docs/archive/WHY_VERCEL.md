# ⚠️ 중요: Firebase 정적 호스팅 불가

## 현재 상황

EduHub 프로젝트는 **정적 빌드(Static Export)와 호환되지 않습니다.**

### 사용 중인 호환 불가 기능:
1. ❌ 동적 라우팅: `/notice/[date]`, `/surveys/[id]`, `/groups/[groupId]`
2. ❌ `useSearchParams()` - URL 파라미터 동적 처리
3. ❌ 실시간 데이터베이스 연동
4. ❌ SSR 필수 기능들

---

## ✅ 권장 배포 방법: Vercel

### 왜 Vercel인가?

1. **Next.js 공식 플랫폼** - 완벽한 호환성
2. **무료 플랜 충분** - 소규모 프로젝트에 적합
3. **5분 배포** - GitHub 연결만으로 즉시 배포
4. **자동 HTTPS** - 추가 설정 불필요
5. **Firebase 완벽 호환** - 클라이언트 SDK 그대로 작동

### Vercel 배포 단계 (5분)

#### 1. GitHub에 푸시
```bash
git add .
git commit -m "Ready for Vercel deployment"
git push origin main
```

#### 2. Vercel 연결
1. [vercel.com](https://vercel.com) 접속
2. "Sign Up" > GitHub로 로그인
3. "Add New Project" 클릭
4. GitHub 리포지토리 선택 (eduhub)
5. "Import" 클릭

#### 3. 환경 변수 설정
Vercel 프로젝트 설정에서 다음 환경 변수 추가:
```
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=eduhub-4a75e
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
```

#### 4. Deploy 클릭
- 자동 빌드 시작
- 2-3분 후 배포 완료
- URL 제공: `https://eduhub-xxx.vercel.app`

---

## 🔄 대안: Firebase Hosting은?

### Firebase Hosting의 한계:

1. **정적 호스팅만 제공** - 동적 기능 불가
2. **Next.js SSR 복잡** - Cloud Functions 연동 필요
3. **추가 비용** - Functions 사용 시 과금
4. **설정 복잡** - 초기 설정에 시간 소요

### Firebase Hosting + Cloud Run (고급)
- ⚠️ 복잡한 설정 필요
- 💰 비용 증가
- 🔧 유지보수 어려움

---

## 💰 비용 비교

### Vercel (권장):
- **무료 플랜**:
  - 100GB 대역폭/월
  - 무제한 프로젝트
  - 자동 HTTPS
  - 자동 배포
- **예상 비용**: $0/월 ✅

### Firebase Hosting + Functions:
- **무료 할당량**:
  - 10GB 저장/월
  - 360MB 전송/일
  - 2M Functions 호출/월
- **예상 비용**: $5-15/월 (Functions 사용 시) ⚠️

---

## 🎯 최종 권장 사항

### ✅ Vercel 배포 (1순위)
**장점:**
- ⭐ 완벽한 Next.js 지원
- ⭐ 무료
- ⭐ 5분 배포
- ⭐ 자동 업데이트
- ⭐ Firebase 호환

**단점:**
- 없음

### ⚠️ Firebase Hosting (비추천)
**이유:**
- 정적 빌드 불가
- SSR 설정 복잡
- 추가 비용
- 기능 제한

---

## 📝 다음 단계

### 즉시 실행:

1. **설정 복구 완료** ✅
   - `next.config.ts` 원래대로 복구됨

2. **Vercel 배포 시작**:
   ```bash
   # GitHub 푸시
   git add .
   git commit -m "Ready for deployment"
   git push origin main
   ```

3. **Vercel 프로젝트 생성**:
   - [vercel.com](https://vercel.com) 방문
   - GitHub 연결
   - 환경 변수 설정
   - Deploy!

---

**결론**: Firebase 정적 호스팅은 현재 프로젝트와 맞지 않습니다.  
**Vercel 배포를 강력히 권장합니다!** 🚀

---

**작성일**: 2026-01-15  
**문서**: Firebase vs Vercel 배포 가이드
