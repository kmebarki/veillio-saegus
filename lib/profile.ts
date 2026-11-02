import { z } from 'zod'

export const CIVILITIES = ['Madame', 'Monsieur', 'Autre'] as const

export type ProfileValues = {
  civility: string
  firstName: string
  lastName: string
  city: string
  country: string
  profession: string
  company: string
  addressLine1: string
  addressLine2: string
  postalCode: string
  phone: string
}

export const emptyProfile: ProfileValues = {
  civility: '',
  firstName: '',
  lastName: '',
  city: '',
  country: '',
  profession: '',
  company: '',
  addressLine1: '',
  addressLine2: '',
  postalCode: '',
  phone: '',
}

const optionalText = (max: number) =>
  z.string().trim().max(max).optional().transform((value) => (value ? value : null))

export const profileSchema = z.object({
  civility: z.enum(CIVILITIES),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  city: z.string().trim().min(1).max(120),
  country: z.string().trim().min(1).max(120),
  profession: optionalText(120),
  company: optionalText(160),
  addressLine1: optionalText(200),
  addressLine2: optionalText(200),
  postalCode: optionalText(20),
  phone: z
    .string()
    .trim()
    .max(25)
    .regex(/^[+\d\s().-]{6,25}$/)
    .optional()
    .or(z.literal(''))
    .transform((value) => (value ? value : null)),
})

export type UserProfile = ProfileValues & {
  id: string
  email: string
  role: string
  team: string
  status: string
  lastSeen: string
  createdAt: string
  canEdit: boolean
}
