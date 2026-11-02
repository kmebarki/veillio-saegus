import 'server-only'

import nodemailer from 'nodemailer'

const smtpPort = Number(process.env.SMTP_PORT ?? 587)

if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASSWORD || !process.env.SMTP_FROM) {
  throw new Error('SMTP configuration is incomplete')
}

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: smtpPort,
  secure: smtpPort === 465,
  requireTLS: smtpPort !== 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
  tls: { minVersion: 'TLSv1.2' },
})

function getApplicationUrl() {
  if (process.env.BETTER_AUTH_URL) return process.env.BETTER_AUTH_URL
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  if (process.env.V0_RUNTIME_URL) return process.env.V0_RUNTIME_URL
  return 'http://localhost:3000'
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character] ?? character)
}

export async function sendVerificationEmail({ email, name, url }: { email: string; name: string; url: string }) {
  const safeName = escapeHtml(name)
  const safeUrl = escapeHtml(url)

  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: email,
    subject: 'Confirmez votre adresse e-mail Veillio',
    text: `Bonjour ${name},\n\nConfirmez votre adresse e-mail pour poursuivre votre demande d’accès à Veillio : ${url}\n\nSi vous n’êtes pas à l’origine de cette demande, ignorez ce message.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#18221d"><p style="font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#18794e">Veillio</p><h1 style="font-size:26px;line-height:1.25">Confirmez votre adresse e-mail</h1><p style="font-size:16px;line-height:1.6">Bonjour ${safeName},</p><p style="font-size:16px;line-height:1.6">Confirmez votre adresse pour poursuivre votre demande d’accès à l’organisation.</p><p style="margin:28px 0"><a href="${safeUrl}" style="display:inline-block;background:#18794e;color:#fff;text-decoration:none;padding:13px 20px;border-radius:10px;font-weight:700">Confirmer mon adresse</a></p><p style="font-size:13px;line-height:1.6;color:#66736c">Si vous n’êtes pas à l’origine de cette demande, vous pouvez ignorer cet e-mail.</p></div>`,
  })
}

export async function sendAdmissionDecisionEmail({ email, name, approved, comment }: { email: string; name: string; approved: boolean; comment?: string | null }) {
  const safeName = escapeHtml(name)
  const safeComment = comment ? escapeHtml(comment) : ''
  const signInUrl = new URL('/sign-in', getApplicationUrl()).toString()
  const subject = approved ? 'Votre accès à Veillio est activé' : 'Votre demande d’accès à Veillio'
  const headline = approved ? 'Votre demande a été acceptée' : 'Votre demande n’a pas été retenue'
  const body = approved ? 'Vous pouvez désormais vous connecter et accéder à votre espace.' : 'Un responsable a examiné votre demande d’accès et ne peut pas la valider pour le moment.'

  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: email,
    subject,
    text: `Bonjour ${name},\n\n${headline}. ${body}${comment ? `\n\nCommentaire : ${comment}` : ''}\n\n${approved ? `Se connecter : ${signInUrl}` : ''}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#18221d"><p style="font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#18794e">Veillio</p><h1 style="font-size:26px;line-height:1.25">${headline}</h1><p style="font-size:16px;line-height:1.6">Bonjour ${safeName},</p><p style="font-size:16px;line-height:1.6">${body}</p>${safeComment ? `<p style="font-size:15px;line-height:1.6;padding:12px 16px;background:#f2f5f3;border-radius:10px">${safeComment}</p>` : ''}${approved ? `<p style="margin:28px 0"><a href="${escapeHtml(signInUrl)}" style="display:inline-block;background:#18794e;color:#fff;text-decoration:none;padding:13px 20px;border-radius:10px;font-weight:700">Se connecter</a></p>` : ''}</div>`,
  })
}

export async function sendInvitationEmail({ email, name, token, role }: { email: string; name: string; token: string; role: string }) {
  const invitationUrl = new URL('/sign-up', getApplicationUrl())
  invitationUrl.searchParams.set('invite', token)
  const safeName = escapeHtml(name)
  const safeRole = escapeHtml(role)
  const safeInvitationUrl = escapeHtml(invitationUrl.toString())

  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: email,
    subject: 'Invitation à rejoindre Veillio',
    text: `Bonjour ${name},\n\nVous êtes invité à rejoindre Veillio avec le rôle ${role}. Cette invitation expire dans 7 jours.\n\nCréer votre compte : ${invitationUrl.toString()}\n\nSi vous n’attendiez pas cette invitation, ignorez ce message.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#18221d"><p style="font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#18794e">Veillio</p><h1 style="font-size:26px;line-height:1.25">Vous êtes invité à rejoindre Veillio</h1><p style="font-size:16px;line-height:1.6">Bonjour ${safeName},</p><p style="font-size:16px;line-height:1.6">Un administrateur vous invite à rejoindre son organisation avec le rôle <strong>${safeRole}</strong>.</p><p style="margin:28px 0"><a href="${safeInvitationUrl}" style="display:inline-block;background:#18794e;color:#fff;text-decoration:none;padding:13px 20px;border-radius:10px;font-weight:700">Créer mon compte</a></p><p style="font-size:13px;line-height:1.6;color:#66736c">Ce lien expire dans 7 jours. Si vous n’attendiez pas cette invitation, vous pouvez ignorer cet e-mail.</p></div>`,
  })
}
