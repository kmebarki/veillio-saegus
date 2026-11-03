import type { RoleKey } from '@/lib/roles'

export type PermissionDefinition = {
  key: string
  label: string
  description: string
  sensitive?: boolean
}

export type PermissionModule = {
  id: string
  label: string
  permissions: PermissionDefinition[]
}

export const PERMISSION_MODULES: PermissionModule[] = [
  {
    id: 'organizations',
    label: 'Organisations',
    permissions: [
      { key: 'organizations.view', label: 'Consulter les organisations', description: 'Accéder au catalogue global des organisations.' },
      { key: 'organizations.manage', label: 'Gérer les organisations', description: 'Créer et configurer des organisations et leur premier administrateur.', sensitive: true },
    ],
  },
  {
    id: 'watches',
    label: 'Veilles',
    permissions: [
      { key: 'watches.view', label: 'Consulter les veilles', description: 'Accéder au catalogue et aux contenus des veilles.' },
      { key: 'watches.contribute', label: 'Contribuer', description: 'Proposer et qualifier des contenus dans une veille.' },
      { key: 'watches.manage', label: 'Gérer les veilles', description: 'Créer, configurer et archiver des veilles.' },
      { key: 'watches.publish', label: 'Publier', description: 'Éditer et diffuser les publications.' },
    ],
  },
  {
    id: 'sources',
    label: 'Sources',
    permissions: [{ key: 'sources.manage', label: 'Gérer les sources', description: 'Ajouter, modifier et désactiver des sources de collecte.' }],
  },
  {
    id: 'connectors',
    label: 'Connecteurs',
    permissions: [
      { key: 'connectors.view', label: 'Consulter les connecteurs', description: 'Voir les connecteurs, leur configuration technique et leur santé (sans les secrets).' },
      { key: 'connectors.manage', label: 'Gérer les connecteurs', description: 'Créer, configurer, tester, activer et supprimer des connecteurs (sans identifiants).', sensitive: true },
    ],
  },
  {
    id: 'connections',
    label: 'Connexions',
    permissions: [
      { key: 'connections.view', label: 'Utiliser les connexions', description: 'Voir les connexions de l’organisation et gérer ses propres connexions personnelles (clés API, jetons).' },
      { key: 'connections.manage', label: 'Gérer les connexions', description: 'Créer, tester et supprimer les connexions partagées de l’organisation et leurs identifiants.', sensitive: true },
    ],
  },
  {
    id: 'collections',
    label: 'Collectes',
    permissions: [
      { key: 'collections.view', label: 'Superviser les collectes', description: 'Consulter les occurrences, tentatives, métriques et incidents de collecte.' },
      { key: 'collections.retry', label: 'Relancer les collectes', description: 'Planifier une nouvelle exécution liée à une collecte en échec ou reportée.', sensitive: true },
      { key: 'collections.configure', label: 'Configurer les collectes', description: 'Modifier les politiques de concurrence, reprise, quota et rétention.', sensitive: true },
    ],
  },
  {
    id: 'users',
    label: 'Utilisateurs et admissions',
    permissions: [
      { key: 'users.view', label: 'Consulter les utilisateurs', description: 'Voir la liste et les fiches des utilisateurs.' },
      { key: 'users.manage', label: 'Gérer les utilisateurs', description: 'Modifier les rôles, suspendre et réactiver des comptes.' },
      { key: 'users.invite', label: 'Inviter des utilisateurs', description: 'Envoyer et annuler des invitations.' },
      { key: 'admissions.review', label: 'Traiter les admissions', description: 'Approuver ou refuser les demandes d’admission.' },
    ],
  },
  {
    id: 'teams',
    label: 'Équipes',
    permissions: [
      { key: 'teams.view', label: 'Consulter les équipes', description: 'Voir les équipes et leurs membres.' },
      { key: 'teams.manage', label: 'Gérer les équipes', description: 'Créer, modifier, archiver des équipes et gérer leurs membres.' },
    ],
  },
  {
    id: 'authentication',
    label: 'Référentiel Authentification',
    permissions: [
      { key: 'auth.method.view', label: 'Consulter les méthodes', description: 'Consulter le référentiel, ses versions et ses preuves runtime.' },
      { key: 'auth.method.propose', label: 'Proposer une méthode', description: 'Créer une nouvelle méthode en brouillon.' },
      { key: 'auth.method.review', label: 'Réviser les méthodes', description: 'Accepter ou renvoyer une proposition dont on n’est pas l’auteur.', sensitive: true },
      { key: 'auth.method.publish', label: 'Publier les méthodes', description: 'Rendre disponible une version entièrement attestée.', sensitive: true },
      { key: 'auth.method.deactivate', label: 'Désactiver les méthodes', description: 'Désactiver ou rendre obsolète une version publiée.', sensitive: true },
    ],
  },
  {
    id: 'access',
    label: 'Accès et sécurité',
    permissions: [
      { key: 'groups.view', label: 'Consulter les groupes', description: 'Voir les groupes, leurs permissions et leurs membres.' },
      { key: 'groups.manage', label: 'Gérer les groupes', description: 'Créer des groupes, définir leurs permissions et leurs membres.', sensitive: true },
      { key: 'audit.view', label: 'Consulter le journal d’audit', description: 'Lire l’historique des actions sensibles.', sensitive: true },
    ],
  },
]

export const ALL_PERMISSIONS: PermissionDefinition[] = PERMISSION_MODULES.flatMap((module) => module.permissions)
export const PERMISSION_KEYS = ALL_PERMISSIONS.map((permission) => permission.key)

const permissionIndex = new Map(ALL_PERMISSIONS.map((permission) => [permission.key, permission]))

export function isPermissionKey(value: string) {
  return permissionIndex.has(value)
}

export function getPermission(key: string) {
  return permissionIndex.get(key)
}

export function isSensitivePermission(key: string) {
  return permissionIndex.get(key)?.sensitive === true
}

export function normalizePermissions(values: readonly string[]) {
  const wanted = new Set(values)
  return PERMISSION_KEYS.filter((key) => wanted.has(key))
}

export const ROLE_PERMISSIONS: Record<RoleKey, string[]> = {
  super_admin: PERMISSION_KEYS,
  admin: PERMISSION_KEYS,
  pilot: ['watches.view', 'watches.contribute', 'watches.manage', 'watches.publish', 'sources.manage', 'collections.view', 'collections.retry', 'users.view', 'admissions.review', 'teams.view', 'connectors.view', 'connections.view'],
  contributor: ['watches.view', 'watches.contribute'],
  reader: ['watches.view'],
}

export function getRolePermissions(role: string): string[] {
  return role in ROLE_PERMISSIONS ? ROLE_PERMISSIONS[role as RoleKey] : []
}
