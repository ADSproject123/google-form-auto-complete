import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/src/lib/firebase/server';
import { getBalance, getTransactions } from '@/src/credits';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [balance, transactions] = await Promise.all([
    getBalance(user.uid),
    getTransactions(user.uid),
  ]);

  return NextResponse.json({ balance, transactions });
}
