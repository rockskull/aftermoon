import type { Metadata, Viewport } from "next";
import { Big_Shoulders, IBM_Plex_Mono, Jost, Noto_Sans_KR } from "next/font/google";
import { ServiceWorkerRegister } from "@/components/sw-register";
import "./globals.css";

// Korean glyphs are served in unicode-range slices; only the Latin slice is preloaded.
const notoKr = Noto_Sans_KR({ subsets: ["latin"], variable: "--font-noto-kr", display: "swap" });
const bigShoulders = Big_Shoulders({
  subsets: ["latin"],
  variable: "--font-big-shoulders",
  display: "swap",
  adjustFontFallback: false, // no metric overrides exist for this family
});
const jost = Jost({ subsets: ["latin"], variable: "--font-jost", display: "swap" });
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000");

const description = "퇴근 후 클라이밍, 음악, 휴식, 대화가 공존하는 비영리 사설 볼더링 클럽. 클럽 일정과 이벤트를 확인하고, 해보고 싶은 활동을 제안하세요.";

// iOS shows these while the installed app starts: [image w, h, device w, h, pixel ratio]
const SPLASH: Array<[number, number, number, number, number]> = [
  [1320, 2868, 440, 956, 3],
  [1290, 2796, 430, 932, 3],
  [1206, 2622, 402, 874, 3],
  [1179, 2556, 393, 852, 3],
  [1284, 2778, 428, 926, 3],
  [1170, 2532, 390, 844, 3],
  [1125, 2436, 375, 812, 3],
  [828, 1792, 414, 896, 2],
  [750, 1334, 375, 667, 2],
];

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "AFTER CL TO MOON", template: "%s · AFTER CL TO MOON" },
  description,
  applicationName: "AFTER CL TO MOON",
  openGraph: {
    type: "website",
    locale: "ko_KR",
    siteName: "AFTER CL TO MOON",
    title: "AFTER CL TO MOON — Private Bouldering Club",
    description,
  },
  appleWebApp: {
    capable: true,
    title: "AFTER MOON",
    statusBarStyle: "black-translucent",
    startupImage: SPLASH.map(([w, h, dw, dh, r]) => ({
      url: `/splash/splash-${w}x${h}.jpg`,
      media: `(device-width: ${dw}px) and (device-height: ${dh}px) and (-webkit-device-pixel-ratio: ${r}) and (orientation: portrait)`,
    })),
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#0c1620",
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={`${notoKr.variable} ${bigShoulders.variable} ${jost.variable} ${plexMono.variable} antialiased`}
    >
      <body className="flex min-h-dvh flex-col bg-midnight font-sans pt-[env(safe-area-inset-top)]">
        {process.env.DEMO_MODE === "true" && (
          <p className="bg-butter px-4 py-1.5 text-center text-[12px] font-semibold text-midnight">
            데모 모드 · 실제 시트가 아닌 예시 데이터예요. 변경 내용은 저장되지 않을 수 있어요.
          </p>
        )}
        <div className="flex flex-1 flex-col bg-plywood">{children}</div>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
