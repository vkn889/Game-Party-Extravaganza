import { MotionProvider } from '@/components/shared/MotionProvider';

/** Framer Motion powers the host's reveals and score counters; phones don't load it. */
export default function HostLayout({ children }: { children: React.ReactNode }) {
  return <MotionProvider>{children}</MotionProvider>;
}
