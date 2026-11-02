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
