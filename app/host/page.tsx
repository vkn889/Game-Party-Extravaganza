import type { Metadata } from 'next';
import { HostApp } from '@/components/host/HostApp';

export const metadata: Metadata = { title: 'Host · Game Party Extravaganza' };

export default function HostPage() {
  return <HostApp />;
}
