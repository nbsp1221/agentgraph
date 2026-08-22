import '@leverframe/ui/globals.css';
import type { Metadata } from 'next';
import { getLocale } from 'next-intl/server';
import { ThemeProvider } from '../src/components/theme-provider';

export const metadata: Metadata = {
  metadataBase: new URL('https://leverframe.retn0.dev'),
  title: {
    default: 'Leverframe',
    template: '%s · Leverframe',
  },
  description: 'A local-first control plane for running AI work loops to verified completion',
  applicationName: 'Leverframe',
  alternates: { canonical: '/' },
  manifest: '/site.webmanifest',
  icons: {
    icon: [
      { url: '/brand/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico', sizes: '16x16 32x32 48x48' },
    ],
    apple: [{ url: '/brand/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  openGraph: {
    type: 'website',
    url: '/',
    siteName: 'Leverframe',
    title: 'Leverframe — Frame the work. Let the system carry the loop.',
    description: 'A local-first control plane for running AI work loops to verified completion',
    images: [
      {
        url: '/brand/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Leverframe — Frame the work. Let the system carry the loop.',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Leverframe — Frame the work. Let the system carry the loop.',
    description: 'A local-first control plane for running AI work loops to verified completion',
    images: ['/brand/og-image.png'],
  },
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  return (
    <html lang={locale} suppressHydrationWarning>
      <body className="antialiased">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
