import NavShell from "@/components/NavShell";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <NavShell>{children}</NavShell>;
}
