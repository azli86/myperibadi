import "./globals.css";
export const metadata = { title: "Mastermind", description: "MyPeribadi administration" };
export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ms"><body>{children}</body></html>;
}
