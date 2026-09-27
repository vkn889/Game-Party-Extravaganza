import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { JoinForm } from '@/components/phone/JoinForm';

export const metadata: Metadata = { title: 'Join · Game Party Extravaganza' };

export default function JoinPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-8 px-5 py-10">
      <Link href="/" className="font-display text-center text-3xl font-bold">
        Game Party <span className="text-pink">Extravaganza</span>
      </Link>
      <Suspense>
        <JoinForm />
      </Suspense>
    </main>
  );
}
