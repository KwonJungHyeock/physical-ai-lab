import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Michroma } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

// Pretendard (OFL, fonts/Pretendard-LICENSE.txt): the UI font, chosen for legibility of
// Korean on screen. The subset holds the 2,350 common Hangul syllables and Latin; it ships
// with the app, so the installed PC app and the robot's copy work without internet.
const pretendard = localFont({
  variable: "--font-ui",
  display: "swap",
  src: [
    { path: "./fonts/Pretendard-Regular.subset.woff2", weight: "400" },
    { path: "./fonts/Pretendard-Medium.subset.woff2", weight: "500" },
    { path: "./fonts/Pretendard-SemiBold.subset.woff2", weight: "600" },
    { path: "./fonts/Pretendard-Bold.subset.woff2", weight: "700" },
  ],
});

// Code only: the Python / ROS 2 editor and its output.
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

// The product wordmark only (PHYSICAL AI in the top bar and the intro): wide, technical capitals.
const michroma = Michroma({
  variable: "--font-mark",
  weight: "400",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Physical AI 로봇 학습 시뮬레이터",
  description: "myCobot 280 RDK X5 로봇팔 블록·파이썬 실습과 시뮬레이션",
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
};

// Tablets (a Galaxy Tab or an iPad, as a teaching pendant): the page at the device's width, and
// the white of the top bar in the browser's own bar. Pinch zoom stays allowed (the 3D view and the
// map take two-finger gestures themselves).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={`${pretendard.variable} ${jetbrainsMono.variable} ${michroma.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
