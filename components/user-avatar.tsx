import { cn } from '@/lib/utils'

type Props = {
  image?: string | null
  initials: string
  name?: string
  className?: string
}

export function UserAvatar({ image, initials, name, className }: Props) {
  if (image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- les avatars sont des data URL déjà redimensionnées
      <img src={image} alt={name ? `Photo de ${name}` : ''} className={cn('size-9 shrink-0 rounded-full object-cover', className)} />
    )
  }
  return (
    <span className={cn('grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground', className)} aria-hidden>
      {initials}
    </span>
  )
}
