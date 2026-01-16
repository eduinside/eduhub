# Vercel 배포 가이드

## 🚀 Vercel 배포 단계별 가이드

### 1️⃣ GitHub 리포지토리 푸시

```bash
# 현재 변경사항 커밋
git add .
git commit -m "Ready for Vercel deployment"

# GitHub에 푸시
git push origin main
```

> GitHub 리포지토리가 없다면 먼저 생성하세요:
> 1. [github.com](https://github.com/new)에서 새 리포지토리 생성
> 2. 리포지토리 이름: `eduhub` (또는 원하는 이름)
> 3. Private 선택 권장
> 4. 로컬에서 연결:
> ```bash
> git remote add origin https://github.com/username/eduhub.git
> git branch -M main
> git push -u origin main
> ```

---

### 2️⃣ Vercel 프로젝트 생성

1. **Vercel 사이트 접속**
   - [vercel.com](https://vercel.com) 방문
   - "Sign Up" 클릭

2. **GitHub 연결**
   - "Continue with GitHub" 선택
   - 권한 승인

3. **프로젝트 Import**
   - "Add New..." > "Project" 클릭
   - GitHub 리포지토리 목록에서 `eduhub` 선택
   - "Import" 클릭

---

### 3️⃣ 환경 변수 설정

**중요!** `.env.local` 파일의 내용을 Vercel에 복사해야 합니다.

Vercel 프로젝트 설정 화면에서:

#### Environment Variables 섹션:

다음 변수들을 **Name**과 **Value**로 입력:

```
Name: NEXT_PUBLIC_FIREBASE_API_KEY
Value: (여기에 실제 값 입력)

Name: NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
Value: (여기에 실제 값 입력)

Name: NEXT_PUBLIC_FIREBASE_PROJECT_ID
Value: eduhub-4a75e

Name: NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
Value: (여기에 실제 값 입력)

Name: NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
Value: (여기에 실제 값 입력)

Name: NEXT_PUBLIC_FIREBASE_APP_ID
Value: (여기에 실제 값 입력)
```

> 💡 팁: `.env.local` 파일을 열어서 값들을 복사하세요.

**모든 환경을 선택하세요:**
- ✅ Production
- ✅ Preview
- ✅ Development

---

### 4️⃣ 배포 시작

1. **Deploy 버튼 클릭**
2. 빌드 진행 (2-3분 소요)
3. 배포 완료!

**배포 완료 후:**
- ✅ URL 제공됨: `https://eduhub-xxx.vercel.app`
- ✅ 자동 HTTPS 적용
- ✅ 이후 `git push` 할 때마다 자동 재배포

---

## 🔍 배포 확인

### 배포 후 테스트:

1. **로그인 테스트**
   - Google 로그인 작동 확인
   
2. **Firebase 연결 확인**
   - 공지사항 로딩 확인
   - 설문조사 생성 테스트

3. **기능 테스트**
   - 예약 시스템
   - 그룹 기능
   - 파일 업로드

---

## 🔧 추가 설정 (선택사항)

### 커스텀 도메인 설정

Vercel 프로젝트 > Settings > Domains

1. 보유한 도메인 입력 (예: `eduhub.school.kr`)
2. DNS 설정 안내에 따라 레코드 추가
3. 자동으로 SSL 인증서 발급

---

## ⚡ 자동 배포 설정

**이미 자동으로 설정됨!**

- `main` 브랜치에 `git push` → 자동 배포
- Pull Request 생성 → 자동 미리보기 환경 생성

---

## 📊 배포 모니터링

### Vercel Dashboard에서 확인:

- **Analytics**: 방문자 수, 페이지 뷰
- **Logs**: 빌드 로그, 런타임 로그
- **Performance**: 페이지 로딩 속도

---

## 🐛 문제 해결

### 빌드 실패 시:

1. **Vercel 빌드 로그 확인**
   - Deployments 탭 > 실패한 배포 클릭
   - 로그에서 에러 메시지 확인

2. **로컬에서 테스트**
   ```bash
   npm run build
   ```

3. **환경 변수 확인**
   - 모든 `NEXT_PUBLIC_*` 변수가 설정되었는지 확인

### Firebase 연결 오류:

1. **Firebase Console 설정**
   - Authentication > Settings > Authorized domains
   - Vercel 도메인 추가:
     - `eduhub-xxx.vercel.app`
     - `*.vercel.app` (모든 미리보기 포함)

---

## 💰 비용

**무료 플랜 (Hobby):**
- ✅ 월 100GB 대역폭
- ✅ 무제한 프로젝트
- ✅ 자동 HTTPS
- ✅ 자동 배포
- ✅ Preview 환경

**예상 비용: $0/월** ✅

---

## 📝 체크리스트

### 배포 전:
- [x] `next.config.ts` 원래대로 복구
- [ ] GitHub에 코드 푸시
- [ ] Vercel 계정 생성
- [ ] `.env.local` 파일 내용 확인

### 배포 중:
- [ ] Vercel에서 프로젝트 import
- [ ] 환경 변수 모두 입력
- [ ] Deploy 버튼 클릭

### 배포 후:
- [ ] 사이트 접속 확인
- [ ] 로그인 테스트
- [ ] 기본 기능 테스트
- [ ] Firebase Authorized domains 추가

---

## 🎉 완료!

배포가 완료되면:
1. Vercel에서 제공하는 URL로 접속
2. 팀원들과 URL 공유
3. 이후 코드 수정 후 `git push`만 하면 자동 배포!

---

**작성일**: 2026-01-15  
**대상**: EduHub Vercel 배포  
**예상 소요 시간**: 10분
