import './globals.css';

export const metadata = {
  title: 'Field Notes | Blog Manager',
  description: 'A small local-first blog manager built with Next.js.'
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
