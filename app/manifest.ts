import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Personal AI OS',
    short_name: 'AI OS',
    description: 'نظام قيادة شخصي لإدارة الأهداف والمشاريع عبر وكلاء AI.',
    start_url: '/',
    display: 'standalone',
    background_color: '#090b0e',
    theme_color: '#0b0d10',
    lang: 'ar',
    dir: 'rtl',
    categories: ['productivity', 'business', 'utilities']
  };
}
