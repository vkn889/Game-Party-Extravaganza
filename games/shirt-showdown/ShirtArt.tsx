/* eslint-disable @next/next/no-img-element */
/** A T-shirt with a drawing on the chest and the slogan printed underneath. */
export function ShirtArt({ drawingUrl, slogan, size = 'lg', color = 'var(--peach)' }: { drawingUrl: string; slogan: string; size?: 'sm' | 'lg'; color?: string }) {
  const width = size === 'lg' ? 'w-[26rem]' : 'w-40';
  return (
    <figure className={`relative ${width} shrink-0`}>
      <svg viewBox="0 0 400 420" className="w-full drop-shadow-[0_8px_0_var(--plum-deep)]" aria-hidden>
        <path
          d="M130 20 L80 30 L10 90 L55 160 L95 135 L95 405 L305 405 L305 135 L345 160 L390 90 L320 30 L270 20 Q200 70 130 20 Z"
          style={{ fill: color, stroke: 'var(--plum-deep)' }}
          strokeWidth="8"
          strokeLinejoin="round"
        />
      </svg>
      <div className="absolute inset-x-[27%] top-[22%] flex flex-col items-center gap-[4%]">
        <img src={drawingUrl} alt="Shirt design" className="aspect-square w-full rounded-lg object-cover ring-2 ring-plum-deep" />
        <figcaption className={`font-display text-center font-bold leading-tight text-plum ${size === 'lg' ? 'text-2xl' : 'text-[10px]'}`}>
          {slogan}
        </figcaption>
      </div>
    </figure>
  );
}
