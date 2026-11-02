import Image from 'next/image'
import { cn } from '@/lib/utils'

type SaegusLogoProps = {
  variant?: 'dark' | 'light' | 'mark'
  className?: string
  priority?: boolean
}

export function SaegusLogo({ variant = 'dark', className, priority = false }: SaegusLogoProps) {
  if (variant === 'mark') {
    return <Image src="/saegus-mark.svg" alt="Saegus" width={92} height={92} priority={priority} className={cn('h-8 w-auto', className)} />
  }
  return (
    <Image
      src={variant === 'light' ? '/saegus-logo-light.svg' : '/saegus-logo.svg'}
      alt="Saegus"
      width={390}
      height={92}
      priority={priority}
      className={cn('h-8 w-auto', className)}
    />
  )
}
