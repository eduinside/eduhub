# EduHub Workspace

교원 업무 지원 시스템 - 실시간 공지, 예약, 설문을 한 번에 관리하는 맞춤형 워크스페이스

## 🚀 빠른 시작

### 개발 서버 실행
```bash
npm install
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000) 접속

---

## 📚 문서

모든 가이드와 문서는 [`docs/`](./docs) 폴더에 정리되어 있습니다.

### 주요 문서:
- **[배포 가이드](./docs/VERCEL_DEPLOY.md)** ⭐ - Vercel 배포 방법 (5분)
- **[도메인 설정](./docs/VERCEL_PRICING_DOMAIN.md)** - 커스텀 도메인 연결
- **[기능 명세](./docs/PROJECT_FEATURES.md)** - 전체 기능 설명
- **[파일 저장](./docs/FILE_STORAGE_GUIDE.md)** - 업로드 파일 관리
- **[할당량 관리](./docs/FIREBASE_QUOTA_GUIDE.md)** - Firebase Quota 해결

📖 **[전체 문서 목록 보기](./docs/README.md)**

---

## 🔧 기술 스택

- **Framework**: Next.js 15+ (App Router)
- **Language**: TypeScript
- **Database**: Firebase Firestore
- **Storage**: Firebase Storage
- **Auth**: Firebase Authentication
- **Hosting**: Vercel (권장)

---

## 📦 주요 기능

- 📢 **공지사항** - 날짜별 타임라인
- 📊 **설문 조사** - 실시간 통계 및 파일 제출
- 📅 **자원 예약** - 주간 캘린더
- ⭐ **즐겨찾기** - 링크 관리
- 👥 **그룹** - 소규모 협업 공간

---

## 🚀 배포

### Vercel 배포 (권장)
1. GitHub에 코드 푸시
2. [Vercel](https://vercel.com)에서 프로젝트 import
3. 환경 변수 설정 (`.env.local` 내용)
4. Deploy!

자세한 내용: **[docs/VERCEL_DEPLOY.md](./docs/VERCEL_DEPLOY.md)**

---

## 📞 문의

문제가 발생하거나 질문이 있으시면:
- 📖 [문서 읽기](./docs/README.md)
- 🐛 GitHub Issues 등록

---

**EduHub Development Team**  
Last Updated: 2026-01-15
