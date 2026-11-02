import { ShieldAlert } from 'lucide-react'

import { requestPreview } from '@/lib/connection-secret'
import type { AuthType } from '@/lib/connector-catalog'

function displayUrl(raw: string) {
  try {
    const url = new URL(raw)
    return `${url.origin}${url.pathname === '/' ? '' : url.pathname}`
  } catch {
    return raw
  }
}

type RequestPreviewProps = { authType: AuthType; keyName: string; username: string; connectorUrl: string; insecure: boolean }

export function RequestPreview({ authType, keyName, username, connectorUrl, insecure }: RequestPreviewProps) {
  const preview = requestPreview(authType, keyName, username)
  if (!preview) return null

  return (
    <section aria-label="Aperçu de la requête" className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Aperçu de la requête</h3>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{preview.where}</span>
      </div>
      <div className="overflow-x-auto rounded-xl border bg-muted/50 p-3 font-mono text-xs leading-6">
        <p className="whitespace-nowrap text-muted-foreground">GET {displayUrl(connectorUrl) || 'https://…'}{authType === 'api_key_query' && <PreviewLine segments={preview.segments} />}</p>
        {authType !== 'api_key_query' && <p className="whitespace-nowrap"><PreviewLine segments={preview.segments} /></p>}
      </div>
      {insecure && (
        <p className="flex items-start gap-1.5 rounded-lg bg-destructive/10 px-2.5 py-2 text-xs leading-5 text-destructive">
          <ShieldAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Ce connecteur utilise http:// : le secret circulerait en clair sur le réseau. Passez l’URL du connecteur en https://.
        </p>
      )}
    </section>
  )
}

function PreviewLine({ segments }: { segments: { text: string; secret?: boolean }[] }) {
  return (
    <>
      {segments.map((segment, index) =>
        segment.secret ? <mark key={index} className="rounded bg-primary/15 px-1 font-semibold text-primary">{segment.text}</mark> : <span key={index}>{segment.text}</span>,
      )}
    </>
  )
}
