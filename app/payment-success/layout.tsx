import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/src/lib/firebase/server';

export default async function PaymentSuccessLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/payment-success');
  return <>{children}</>;
}
