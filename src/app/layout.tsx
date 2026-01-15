import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { ToastProvider } from "@/context/ToastContext";
import Navbar from "@/components/Navbar";
import OrgStatusGuard from "@/components/OrgStatusGuard";

export const metadata: Metadata = {
  title: "EduHub - 교원 업무 지원 시스템",
  description: "실시간 공지, 예약, 설문을 한 번에 관리하는 교원 맞춤형 워크스페이스",
  manifest: "/manifest.json",
  icons: {
    icon: "/icon-192x192.png",
    apple: "/icon-512x512.png",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: "#2563eb",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>
        <ToastProvider>
          <AuthProvider>
            <Navbar />
            <div className="app-container">
              <OrgStatusGuard>
                {children}
              </OrgStatusGuard>
            </div>
          </AuthProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
