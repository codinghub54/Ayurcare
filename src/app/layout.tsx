import type { Metadata, Viewport } from 'next';
import { Inter, Fraunces } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/context/AuthContext';

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  display: 'swap',
});

const fraunces = Fraunces({
  variable: '--font-fraunces',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'AyurCare — Ayurvedic care, online',
    template: '%s · AyurCare',
  },
  description:
    'Consult Ayurvedic physicians online, discover your Prakriti (dosha type), keep your health records in one place and get AI-assisted guidance rooted in Ayurveda.',
  keywords: [
    'ayurveda',
    'ayurcare',
    'ayurvedic doctor online',
    'telehealth',
    'dosha',
    'prakriti',
    'vata',
    'pitta',
    'kapha',
  ],
  icons: { icon: '/favicon.ico' },
};

export const viewport: Viewport = {
  themeColor: '#1E5A43',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${fraunces.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-bg text-ink">
        <AuthProvider>
          <div className="flex-1 flex flex-col">{children}</div>
        </AuthProvider>
      </body>
    </html>
  );
}
