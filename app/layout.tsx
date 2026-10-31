import './globals.css';
export const metadata = { title: 'DEPUP.WORK', description: 'Design and video in one canvas' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="id"><body>{children}</body></html>;
}
