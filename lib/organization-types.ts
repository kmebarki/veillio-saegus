export type OrganizationStatus = 'active' | 'suspended'
export type OrganizationSetupStatus = 'active' | 'to_configure'

export type OrganizationListItem = {
  id: string
  name: string
  internalReference: string | null
  type: string
  primaryDomain: string | null
  country: string
  defaultLanguage: string
  timezone: string
  contactEmail: string | null
  phone: string | null
  responsibleUserId: string | null
  responsibleName: string | null
  administrationScope: string
  setupStatus: OrganizationSetupStatus
  offer: string | null
  status: OrganizationStatus
  miniSiteEnabled: boolean
  usersCount: number
  teamsCount: number
  watchesCount: number
  createdAt: string
}

export type OrganizationUserOption = {
  id: string
  name: string
  email: string
}

export type OrganizationsOverview = {
  organizations: OrganizationListItem[]
  userOptions: OrganizationUserOption[]
  canManage: boolean
}

export type CreateOrganizationInput = {
  name: string
  internalReference: string
  type: string
  primaryDomain: string
  country: string
  defaultLanguage: string
  timezone: string
  contactEmail: string
  phone: string
  responsibleUserId: string | null
  administrationScope: string
  initialStatus: 'active' | 'to_configure' | 'suspended'
  offer: string
  miniSiteEnabled: boolean
  inviteAdmin: boolean
  adminName: string
  adminEmail: string
}
