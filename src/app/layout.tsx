import "./globals.css";
import type { Metadata } from "next";
import Script from "next/script";
import BottomNav from "@/components/bottom-nav";
import { JsonLd } from "@/components/json-ld";
import { getSession } from "@/server/auth";
import { hasActiveSubscription } from "@/server/entitlements";
import SiteFooter from "@/components/site-footer";
import { getSeoGlobal, getTheme } from "@/server/site-config";
import { renderTitleTemplate } from "@/lib/seo";
import { SITE_ORIGIN } from "@/server/seo";
import { themeCssVariables } from "@/lib/theme";

export const dynamic = "force-dynamic";

const googleFonts: Record<string, string> = {
  Inter: "Inter:wght@400;500;600;700;800",
  Poppins: "Poppins:wght@400;500;600;700;800",
  Roboto: "Roboto:wght@400;500;700;900",
  "Noto Sans": "Noto+Sans:wght@400;500;600;700;800",
  Montserrat: "Montserrat:wght@400;500;600;700;800",
  Mukta: "Mukta:wght@400;500;600;700;800",
  Hind: "Hind:wght@400;500;600;700",
  "Baloo 2": "Baloo+2:wght@400;500;600;700;800",
};

export async function generateMetadata(): Promise<Metadata> {
  const [seo, theme] = await Promise.all([getSeoGlobal(), getTheme()]);
  const title = seo.homeTitle || renderTitleTemplate(seo.titleTemplates.home, {
    sitename: seo.siteName,
    sep: seo.separator,
    tagline: theme.tagline,
  });
  const other: Record<string, string> = {};
  if (seo.verification.bing) other["msvalidate.01"] = seo.verification.bing;
  if (seo.verification.pinterest) other["p:domain_verify"] = seo.verification.pinterest;
  if (seo.verification.baidu) other["baidu-site-verification"] = seo.verification.baidu;
  return {
    metadataBase: new URL(SITE_ORIGIN),
    title: { default: title, template: `%s ${seo.separator} ${seo.siteName}` },
    description: seo.homeDescription || seo.defaultDescription,
    icons: { icon: theme.faviconUrl || "/favicon.ico" },
    verification: {
      ...(seo.verification.google ? { google: seo.verification.google } : {}),
      ...(seo.verification.yandex ? { yandex: seo.verification.yandex } : {}),
      ...(Object.keys(other).length ? { other } : {}),
    },
    robots: { index: true, follow: true },
    openGraph: {
      title,
      description: seo.homeDescription || seo.defaultDescription,
      siteName: seo.siteName,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: seo.homeDescription || seo.defaultDescription,
      ...(seo.twitterHandle ? { site: seo.twitterHandle } : {}),
    },
  };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [session, theme, seo] = await Promise.all([getSession(), getTheme(), getSeoGlobal()]);
  const subscription = session ? await hasActiveSubscription(session.userId) : null;
  const fontUrl = googleFonts[theme.fontFamily];
  const fontUrlWithDisplay = fontUrl
    ? `https://fonts.googleapis.com/css2?family=${fontUrl}&display=swap`
    : null;
  const organization = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: theme.siteName,
    url: SITE_ORIGIN,
    ...(seo.organization.logo ? { logo: seo.organization.logo } : {}),
    ...(seo.organization.email ? { email: seo.organization.email } : {}),
    ...(seo.organization.phone ? { telephone: seo.organization.phone } : {}),
    ...(seo.organization.sameAs.length ? { sameAs: seo.organization.sameAs } : {}),
  };
  const website = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: theme.siteName,
    url: SITE_ORIGIN,
    potentialAction: {
      "@type": "SearchAction",
      target: `${SITE_ORIGIN}/search?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
  const analytics = seo.analytics;
  return (
    <html lang="en">
      <head>
        <style
          dangerouslySetInnerHTML={{
            __html: `${themeCssVariables(theme)}\n${theme.customCss}`,
          }}
        />
        {fontUrlWithDisplay && (
          <>
            <link rel="preconnect" href="https://fonts.googleapis.com" />
            <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
            <link rel="stylesheet" href={fontUrlWithDisplay} />
          </>
        )}
      </head>
      <body style={{ fontFamily: "var(--font-body)" }}>
        {theme.announcement.enabled && theme.announcement.text && (
          <a
            href={theme.announcement.href || undefined}
            className="block px-4 py-2 text-center text-sm font-semibold"
            style={{ backgroundColor: theme.announcement.bg, color: theme.announcement.fg }}
          >
            {theme.announcement.text}
          </a>
        )}
        <JsonLd data={organization} />
        <JsonLd data={website} />
        <main className="mx-auto min-h-screen max-w-6xl">
          {children}
          <SiteFooter />
        </main>
        <BottomNav
          isAdmin={session?.role === "ADMIN"}
          isVip={Boolean(subscription)}
          siteName={theme.siteName}
        />
        {analytics.ga4Id && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${analytics.ga4Id}`}
              strategy="afterInteractive"
            />
            <Script id="ga4-init" strategy="afterInteractive">
              {`window.dataLayer = window.dataLayer || []; function gtag(){dataLayer.push(arguments);} gtag('js', new Date()); gtag('config', '${analytics.ga4Id}');`}
            </Script>
          </>
        )}
        {analytics.gtmId && (
          <Script id="gtm-init" strategy="afterInteractive">
            {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${analytics.gtmId}');`}
          </Script>
        )}
      </body>
    </html>
  );
}
