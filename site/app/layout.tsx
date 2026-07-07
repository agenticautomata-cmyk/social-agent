import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'KC Kellie',
  description: 'Kansas City creator — food, thrift, events, and local finds.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
