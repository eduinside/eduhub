// 브랜드 설정 파일
// 이 파일에서 앱 이름을 변경하면 전체 시스템에 일괄 적용됩니다.

export const APP_CONFIG = {
    // 앱 이름 (전체 시스템에서 사용)
    APP_NAME: "EduHub",
    APP_FULL_NAME: "EduHub Workspace",

    // 메타데이터
    APP_DESCRIPTION: "실시간 공지, 예약, 설문을 한 번에 관리하는 교원 맞춤형 워크스페이스",

    // 카피라이트
    COPYRIGHT_YEAR: "2026",
    COPYRIGHT_TEXT: "All rights reserved.",

    // 테마 색상
    THEME_COLOR: "#2563eb"
} as const;

// 헬퍼 함수
export const getFullCopyright = () =>
    `© ${APP_CONFIG.COPYRIGHT_YEAR} ${APP_CONFIG.APP_FULL_NAME}. ${APP_CONFIG.COPYRIGHT_TEXT}`;
