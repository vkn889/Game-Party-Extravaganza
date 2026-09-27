import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PlayApp } from '@/components/phone/PlayApp';
import { isRoomCode, normalizeCode } from '@/lib/room-code';

export const metadata: Metadata = { title: 'Play · Game Party Extravaganza' };

export default async function PlayPage({ params }: { params: Promise<{ code: string }> }) {
  const { code: raw } = await params;
  const code = normalizeCode(raw);
  if (!isRoomCode(code)) redirect('/join');
  return <PlayApp code={code} />;
}
