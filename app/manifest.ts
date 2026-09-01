import type { MetadataRoute } from 'next';

/**
 * Web app manifest, served at /manifest.webmanifest.
 *
 * `display: standalone` is what makes an installed copy open without browser
 * chrome. `start_url` is the dashboard rather than a marketing page, because
 * the only reason to install this is to reach your own figures quickly.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Wallet — personal money tracker',
    short_name: 'Wallet',
    description:
      'Track income, spending, money lent and borrowed, and how each month carries into the next.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    // Matches the light theme's --background, so the splash screen does not
    // flash a colour the app never uses.
    background_color: '#fbfcfd',
    theme_color: '#426bce',
    categories: ['finance', 'productivity'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // Separate files, not the same ones reused: a maskable icon is cropped
      // to the platform's shape, so its glyph is drawn smaller to survive it.
      { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Transactions', url: '/transactions' },
      { name: 'Debts', url: '/debts' },
    ],
  };
}
