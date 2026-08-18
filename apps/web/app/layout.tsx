import '@agentgraph/ui/globals.css';
import { getLocale } from 'next-intl/server';
import { ThemeProvider } from '../src/components/theme-provider';

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
