import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TURAS Survey",
  description: "TURAS-linked survey page"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
