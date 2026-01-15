# 💰 Vercel 요금 정책 및 도메인 설정 가이드

## 📊 Vercel 요금제 비교 (2026년 기준)

### 1️⃣ Hobby (개인용) - **무료** ✅

**포함 내용:**
- ✅ **무제한 프로젝트**
- ✅ **무제한 배포**
- ✅ **100GB 대역폭/월**
- ✅ **1,000 빌드 시간(분)/월**
- ✅ **자동 HTTPS**
- ✅ **커스텀 도메인** (무제한)
- ✅ **Git 연동 자동 배포**
- ✅ **Preview 배포** (PR마다)
- ✅ **환경 변수**
- ✅ **Analytics (기본)**

**제한 사항:**
- ⚠️ **동시 빌드**: 1개
- ⚠️ **팀 멤버**: 본인만
- ⚠️ **Edge Functions**: 100,000 호출/일
- ⚠️ **Serverless Functions**: 100GB-시간/월
- ⚠️ **Image Optimization**: 1,000 소스 이미지/월

**적합한 사용자:**
- 개인 프로젝트
- 포트폴리오
- **소규모 학교/조직** ← EduHub 적합! ✅

---

### 2️⃣ Pro (전문가) - **$20/월**

**Hobby 대비 추가 내용:**
- ✅ **1TB 대역폭/월** (10배)
- ✅ **5,000 빌드 시간(분)/월** (5배)
- ✅ **동시 빌드**: 10개
- ✅ **팀 멤버**: 무제한
- ✅ **Analytics (고급)**
- ✅ **암호 보호 배포**
- ✅ **우선 지원**
- ✅ **Edge Functions**: 1,000,000 호출/일
- ✅ **Image Optimization**: 5,000 소스 이미지/월

**적합한 사용자:**
- 프리랜서
- 중소기업
- 팀 협업

---

### 3️⃣ Enterprise (기업용) - **맞춤형**

**Pro 대비 추가 내용:**
- ✅ **무제한 대역폭**
- ✅ **무제한 빌드**
- ✅ **SLA 99.99% 보장**
- ✅ **전담 지원팀**
- ✅ **고급 보안**
- ✅ **SAML SSO**
- ✅ **감사 로그**

---

## 💡 EduHub 프로젝트 분석

### 예상 트래픽 (소규모 학교 100명 기준):

| 항목 | 예상량 | Hobby 제한 | 충분 여부 |
|------|--------|-----------|----------|
| **월 방문자** | ~3,000명 | - | ✅ |
| **대역폭** | ~15GB/월 | 100GB | ✅ |
| **빌드** | ~50회/월 | 무제한 | ✅ |
| **빌드 시간** | ~100분/월 | 1,000분 | ✅ |

**결론: Hobby (무료) 플랜으로 충분합니다!** ✅

### 중규모 학교 (500명) 기준:

| 항목 | 예상량 | Hobby 제한 | 충분 여부 |
|------|--------|-----------|----------|
| **월 방문자** | ~15,000명 | - | ✅ |
| **대역폭** | ~70GB/월 | 100GB | ✅ |
| **빌드** | ~100회/월 | 무제한 | ✅ |

**여전히 Hobby (무료) 플랜으로 충분!** ✅

---

## 🌐 개인 도메인 적용 가이드

### 준비물:
1. **등록된 도메인** (예: `eduhub.school.kr`)
   - 도메인 등록 업체: 가비아, 후이즈, AWS Route53 등
2. **Vercel 프로젝트** (배포 완료 상태)

---

### 📝 도메인 연결 단계

#### 1단계: Vercel에서 도메인 추가

1. **Vercel Dashboard** 접속
   - [vercel.com/dashboard](https://vercel.com/dashboard)

2. **프로젝트 선택**
   - EduHub 프로젝트 클릭

3. **Settings 탭**
   - Settings > Domains 클릭

4. **도메인 입력**
   - 입력: `eduhub.school.kr` (또는 보유 도메인)
   - "Add" 클릭

5. **인증 방법 선택**
   - Vercel이 DNS 레코드 정보 제공

---

#### 2단계: DNS 설정

**옵션 A: A 레코드 (권장)**

도메인 등록 업체 DNS 관리 페이지에서:

| Type | Name | Value | TTL |
|------|------|-------|-----|
| A | @ | `76.76.21.21` | 300 |
| CNAME | www | `cname.vercel-dns.com.` | 300 |

**옵션 B: CNAME 레코드**

| Type | Name | Value | TTL |
|------|------|-------|-----|
| CNAME | eduhub | `cname.vercel-dns.com.` | 300 |

---

#### 3단계: 인증 대기

- DNS 전파 시간: **10분~48시간**
- 보통 **10-30분** 내 완료
- Vercel이 자동으로 인증 확인

---

#### 4단계: HTTPS 자동 설정

- ✅ Vercel이 **무료 SSL 인증서** 자동 발급 (Let's Encrypt)
- ✅ **자동 갱신** (만료 전 자동 연장)
- ✅ **HTTP → HTTPS 자동 리다이렉트**

---

### 🔧 도메인 등록 업체별 설정

#### 1. **가비아 (Gabia)**

1. [가비아 My가비아](https://my.gabia.com) 접속
2. 서비스 관리 > 도메인 > DNS 정보
3. 레코드 추가:
   ```
   타입: A
   호스트: @
   값/위치: 76.76.21.21
   TTL: 300
   ```
4. 저장

#### 2. **후이즈 (Whois)**

1. [후이즈 관리](https://whois.co.kr) 접속
2. 도메인 관리 > DNS 관리
3. 레코드 수정:
   ```
   A 레코드
   호스트: @
   IP: 76.76.21.21
   ```

#### 3. **AWS Route53**

1. Route53 콘솔 접속
2. Hosted Zone 선택
3. Create Record:
   ```json
   {
     "Type": "A",
     "Name": "eduhub.school.kr",
     "Value": "76.76.21.21",
     "TTL": 300
   }
   ```

#### 4. **Cloudflare**

1. Cloudflare 대시보드
2. DNS > Add Record:
   ```
   Type: A
   Name: @
   IPv4 address: 76.76.21.21
   Proxy status: DNS only (🔴 비활성)
   ```

---

### 🎯 도메인 종류별 설정

#### A. 메인 도메인 (Apex)
```
도메인: school.kr
설정: A 레코드
값: 76.76.21.21
결과: https://school.kr
```

#### B. 서브도메인
```
도메인: eduhub.school.kr
설정: CNAME
값: cname.vercel-dns.com
결과: https://eduhub.school.kr
```

#### C. www 포함
```
메인: school.kr (A 레코드)
www: www.school.kr (CNAME → school.kr)
결과: 둘 다 작동
```

---

## 💰 도메인 비용

### 도메인 등록 비용 (연간):

| 도메인 | 가격 (연) | 특징 |
|--------|----------|------|
| `.kr` | ~₩15,000 | 한국 기관 |
| `.com` | ~₩15,000 | 글로벌 표준 |
| `.school.kr` | ~₩30,000 | 학교 전용 |
| `.ac.kr` | **무료** | 교육기관 전용 (승인 필요) |

### Vercel 도메인 비용:

- ✅ **커스텀 도메인 연결: 무료**
- ✅ **SSL 인증서: 무료**
- ✅ **도메인 개수: 무제한**

**Vercel에서 도메인 구매 (선택사항):**
- `.com`: ~$15/년
- `.kr`: 구매 불가 (현지 등록 업체 이용)

---

## 📊 총 비용 정리

### 소규모 학교 (100명):

| 항목 | 비용 | 주기 |
|------|------|------|
| **Vercel Hobby** | $0 | 무료 ✅ |
| **Firebase Spark** | $0 | 무료 ✅ |
| **도메인 (.school.kr)** | ₩30,000 | 연 |
| **합계** | **₩30,000/년** | **월 ₩2,500** |

### 중규모 학교 (500명):

| 항목 | 비용 | 주기 |
|------|------|------|
| **Vercel Hobby** | $0 | 무료 ✅ |
| **Firebase Blaze** | $2-5 | 월 |
| **도메인** | ₩30,000 | 연 |
| **합계** | **₩35,000/년** | **월 ₩5,000** |

**매우 저렴합니다!** 🎉

---

## 🔄 도메인 변경/이전

### 도메인 추가 (여러 도메인 사용):

```
메인: eduhub.school.kr
보조: edu.school.kr
추가: admin.eduhub.school.kr
```

**모두 하나의 Vercel 프로젝트에 연결 가능!**

### 도메인 이전:

1. 새 도메인을 Vercel에 추가
2. DNS 설정
3. 인증 완료
4. 기존 도메인 삭제 (선택)

---

## ⚡ Pro 팁

### 1. 무료 도메인 활용

#### Vercel 기본 도메인 (무료):
```
자동 제공: eduhub-xxx.vercel.app
추가 설정: eduhub.vercel.app (가능)
```

#### freenom (무료 도메인):
- `.tk`, `.ml`, `.ga` 등
- ⚠️ 신뢰도 낮음 (비추천)

### 2. DNS 전파 확인

```bash
# Windows
nslookup eduhub.school.kr

# Mac/Linux
dig eduhub.school.kr
```

### 3. 여러 환경 도메인

```
프로덕션: eduhub.school.kr
스테이징: dev.eduhub.school.kr
테스트: test.eduhub.school.kr
```

---

## 📞 지원 및 문의

### Vercel 지원:

- **문서**: [vercel.com/docs](https://vercel.com/docs)
- **커뮤니티**: [GitHub Discussions](https://github.com/vercel/vercel/discussions)
- **이메일**: support@vercel.com (Pro 이상)

### DNS 문제:

- **DNS 체커**: [whatsmydns.net](https://www.whatsmydns.net)
- **SSL 체커**: [ssllabs.com](https://www.ssllabs.com/ssltest/)

---

## 📝 체크리스트

### 도메인 연결 전:
- [ ] Vercel 프로젝트 배포 완료
- [ ] 도메인 보유 (또는 구매)
- [ ] DNS 관리 권한 확인

### 도메인 연결 중:
- [ ] Vercel에 도메인 추가
- [ ] DNS 레코드 설정
- [ ] DNS 전파 대기 (10-30분)

### 도메인 연결 후:
- [ ] HTTPS 작동 확인
- [ ] 모든 페이지 접속 테스트
- [ ] Firebase Authorized Domains에 추가

---

## 🎉 결론

### Vercel + 개인 도메인:

**무료 플랜으로 가능한 것:**
- ✅ 무제한 커스텀 도메인
- ✅ 무료 SSL/HTTPS
- ✅ 자동 갱신
- ✅ 글로벌 CDN
- ✅ 100GB 대역폭

**총 비용:**
- Vercel: **무료**
- 도메인: **₩30,000/년**

**EduHub에 완벽한 조합입니다!** 🚀

---

**작성일**: 2026-01-15  
**문서**: Vercel 요금 및 도메인 가이드  
**대상**: EduHub 프로젝트
