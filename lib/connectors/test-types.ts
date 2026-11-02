export type CheckStatus = 'ok' | 'warning' | 'error' | 'skipped'
export type TestCheck = { id: string; label: string; status: CheckStatus; detail: string }
export type TestSample = { title: string; link: string; date: string; summary: string }

export type TestResult = {
  status: 'success' | 'warning' | 'error'
  message: string
  httpStatus: number | null
  durationMs: number
  itemsFound: number | null
  checks: TestCheck[]
  sample: TestSample[]
  finalUrl?: string
  contentType?: string
  bytes?: number
}

/** Construit un résultat de test étape par étape, avec masquage du secret dans tous les textes. */
export class TestReport {
  readonly checks: TestCheck[] = []
  private readonly startedAt = Date.now()

  constructor(
    private readonly labels: Record<string, string>,
    private readonly secret: string | null,
  ) {}

  redact(text: string) {
    return this.secret && this.secret.length >= 3 ? text.split(this.secret).join('••••••') : text
  }

  push(id: string, status: CheckStatus, detail: string) {
    this.checks.push({ id, label: this.labels[id] ?? id, status, detail: this.redact(detail) })
  }

  skip(ids: string[]) {
    for (const id of ids) if (!this.checks.some((check) => check.id === id)) this.push(id, 'skipped', 'Non évalué : une étape précédente a échoué.')
  }

  elapsed() {
    return Date.now() - this.startedAt
  }

  failure(message: string, partial: Partial<TestResult> = {}): TestResult {
    return { status: 'error', message: this.redact(message), httpStatus: null, durationMs: this.elapsed(), itemsFound: null, checks: this.checks, sample: [], ...partial }
  }

  finish(items: TestSample[], total: number, partial: Partial<TestResult> = {}): TestResult {
    const hasError = this.checks.some((check) => check.status === 'error')
    const hasWarning = this.checks.some((check) => check.status === 'warning')
    return {
      status: hasError ? 'error' : hasWarning ? 'warning' : 'success',
      message: hasError ? 'Des étapes du test ont échoué.' : `${total} élément${total > 1 ? 's' : ''} détecté${total > 1 ? 's' : ''}${hasWarning ? ', avec des points d’attention.' : ' : connecteur prêt.'}`,
      httpStatus: null,
      durationMs: this.elapsed(),
      itemsFound: total,
      checks: this.checks,
      sample: items.slice(0, 5).map((item) => ({ title: this.redact(item.title), link: this.redact(item.link), date: item.date, summary: this.redact(item.summary) })),
      ...partial,
    }
  }
}
