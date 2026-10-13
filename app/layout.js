import "./globals.css";

export const metadata = {
  title: "사우디 현황 모아보기",
  description: "자푸라·담맘 중심 사우디 소식 모아보기",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "사우디 현황", statusBarStyle: "default" },
  icons: { icon: "/icon-192.png", apple: "/apple-touch-icon.png" },
  robots: { index: false, follow: false },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f5f7" },
    { media: "(prefers-color-scheme: dark)", color: "#0e151b" },
  ],
};

// 저장해 둔 화면 모드를 화면이 그려지기 전에 적용 (깜빡임 방지)
const themeBoot = `try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;
// 카톡·인스타 같은 앱 안의 브라우저에서는 앱 설치가 안 되므로 바깥 브라우저로 넘긴다
// (카톡: 외부 브라우저 열기 / 그 밖의 앱 안 브라우저 + 안드로이드: 크롬으로 열기)
// 설치 버튼용 이벤트(beforeinstallprompt)는 화면이 그려지기 전에 올 수 있어 미리 받아 둔다
const inAppBoot = `(function(){try{
var ua=navigator.userAgent||"",url=location.href;
var android=/Android/i.test(ua),ios=/iPhone|iPad|iPod/i.test(ua);
var kakao=/KAKAOTALK/i.test(ua);
var inapp=kakao||/NAVER\\(inapp|Instagram|FBAN|FBAV|FB_IAB|Line\\/|DaumApps|everytimeApp|Whale\\/.*inapp|; wv\\)/i.test(ua);
if(inapp&&!sessionStorage.getItem("outTried")){
  sessionStorage.setItem("outTried","1");
  if(kakao){location.href="kakaotalk://web/openExternal?url="+encodeURIComponent(url);}
  else if(android){location.href="intent://"+url.replace(/^https?:\\/\\//,"")+"#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url="+encodeURIComponent(url)+";end";}
}
window.__inApp=inapp;window.__ios=ios;window.__kakao=kakao;window.__android=android;
window.addEventListener("beforeinstallprompt",function(e){e.preventDefault();window.__bip=e;window.dispatchEvent(new Event("bip-ready"));});
}catch(e){}})();`;
const swBoot = `if("serviceWorker" in navigator){window.addEventListener("load",function(){navigator.serviceWorker.register("/sw.js").catch(function(){})})}`;

export default function RootLayout({ children }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@500;600;700&family=Noto+Sans+KR:wght@400;500;700&family=IBM+Plex+Mono:wght@500&display=swap"
        />
        <script dangerouslySetInnerHTML={{ __html: inAppBoot }} />
        <script dangerouslySetInnerHTML={{ __html: themeBoot }} />
      </head>
      <body>
        {children}
        <script dangerouslySetInnerHTML={{ __html: swBoot }} />
      </body>
    </html>
  );
}
