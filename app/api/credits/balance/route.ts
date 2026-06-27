import { NextResponse } from 'next/server';
import { createClient } from '@/src/lib/supabase/server';
import { getBalance, getTransactions } from '@/src/credits';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [balance, transactions] = await Promise.all([
    getBalance(user.id),
    getTransactions(user.id),
  ]);

  return NextResponse.json({ balance, transactions });
}
