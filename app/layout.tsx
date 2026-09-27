import type { Metadata, Viewport } from 'next';
import { Fredoka, Inter } from 'next/font/google';
import './globals.css';

const fredoka = Fredoka({ variable: '--font-fredoka', subsets: ['latin'], weight: ['500', '600', '700'] });
const inter = Inter({ variable: '--font-inter', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Game Party Extravaganza',
  description: '15 party games for 2 to 8 players. One screen hosts, everyone plays on their phone. No app, no accounts.',
  applicationName: 'Game Party Extravaganza',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#462749',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${fredoka.variable} ${inter.variable}`}>
      <body className="min-h-dvh bg-plum text-peach antialiased">
        {children}
      </body>
    </html>
  );
}
