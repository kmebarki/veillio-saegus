import { CircleCheck, CirclePause, Settings2 } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import type { OrganizationListItem } from '@/lib/organization-types'
import { cn } from '@/lib/utils'

export function OrganizationStatusBadge({ organization }: { organization: Pick<OrganizationListItem, 'status' | 'setupStatus'> }) {
  const suspended = organization.status === 'suspended'
  const needsSetup = organization.setupStatus === 'to_configure'
  const Icon = suspended ? CirclePause : needsSetup ? Settings2 : CircleCheck
  const label = suspended ? 'Suspendue' : needsSetup ? 'À configurer' : 'Active'

  return (
    <Badge
      variant="outline"
      className={cn(
        'gap-1.5 rounded-full px-2.5 py-1 font-medium',
        suspended && 'border-border bg-muted text-muted-foreground',
        needsSetup && 'border-chart-4/35 bg-chart-4/10 text-foreground',
        !suspended && !needsSetup && 'border-chart-3/35 bg-chart-3/10 text-foreground',
      )}
    >
      <Icon className="size-3.5" />
      {label}
    </Badge>
  )
}
