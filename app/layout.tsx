import type { Metadata, Viewport } from 'next';
import './styles.css';

export const metadata: Metadata = {
  title: {
    default: 'Personal AI OS',
    template: '%s · Personal AI OS'
  },
  applicationName: 'Personal AI OS',
  description: 'نظام قيادة شخصي للمشاريع يعتمد على وكلاء AI',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Personal AI OS'
  },
  formatDetection: {
    telephone: false,
    email: false,
    address: false
  }
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#0b0d10',
  colorScheme: 'dark'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
