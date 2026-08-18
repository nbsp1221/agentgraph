import '@agentgraph/ui/globals.css';
import type { Metadata } from 'next';
import { getLocale } from 'next-intl/server';
import { ThemeProvider } from '../src/components/theme-provider';

export const metadata: Metadata = {
  title: 'AgentGraph',
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
