function fp(pence: number): string {
  const v = pence / 100
  return v % 1 === 0 ? String(v) : v.toFixed(2)
}

function esc(text: string | null | undefined): string {
  if (!text) return ''
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

const BASE = `
  font-family: 'Figtree', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: #f8f9fc;
  margin: 0;
  padding: 0;
`

const ACCENT = '#7c3aed'

function layout(content: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <title>HallManager</title>
</head>
<body style="${BASE}">
  <div style="max-width:600px;margin:32px auto;padding:0 16px;">

    <!-- Header -->
    <div style="text-align:center;margin-bottom:24px;">
      <div style="display:inline-flex;align-items:center;gap:10px;">
        <div style="width:36px;height:36px;background:${ACCENT};border-radius:10px;display:inline-flex;align-items:center;justify-content:center;">
          <span style="color:white;font-weight:700;font-size:18px;line-height:1;">H</span>
        </div>
        <span style="font-size:20px;font-weight:700;color:#111827;letter-spacing:-0.3px;">HallManager</span>
      </div>
    </div>

    <!-- Card -->
    <div style="background:#ffffff;border-radius:16px;border:1px solid #e5e7eb;box-shadow:0 1px 3px rgba(0,0,0,0.06);overflow:hidden;">
      ${content}
    </div>

    <!-- Footer -->
    <div style="text-align:center;margin-top:24px;color:#9ca3af;font-size:12px;line-height:1.6;">
      <p style="margin:0 0 8px;"><a href="https://wa.me/447466214530" style="color:#25d366;font-weight:600;text-decoration:none;">💬 WhatsApp us: 07466 214530</a></p>
      <p style="margin:0;">HallManager · <a href="https://hallmanager.co.uk" style="color:#9ca3af;">hallmanager.co.uk</a></p>
      <p style="margin:4px 0 0;">This email was sent automatically — please do not reply.</p>
    </div>

  </div>
</body>
</html>`
}

function pill(text: string, color: string, bg: string) {
  return `<span style="display:inline-block;padding:3px 10px;border-radius:99px;font-size:12px;font-weight:600;color:${color};background:${bg};">${text}</span>`
}

function bookingTable(b: BookingData) {
  const rows = [
    ['Event', esc(b.event)],
    ['Date', esc(b.date)],
    ['Time', `${esc(b.start_time)} – ${esc(b.end_time)}`],
    ['Duration', `${Number(b.hours)} hours`],
    ['Venue', esc(b.site_name)],
    ['Deposit', `£${fp(b.deposit)}`],
    ['Total', `£${fp(b.total)}`],
  ]
  return `
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:16px;">
      ${rows.map(([label, value], i) => `
        <tr style="background:${i % 2 === 0 ? '#f9fafb' : '#ffffff'};">
          <td style="padding:10px 14px;color:#6b7280;font-weight:500;width:40%;">${label}</td>
          <td style="padding:10px 14px;color:#111827;font-weight:600;">${value}</td>
        </tr>
      `).join('')}
    </table>
  `
}

export interface BookingData {
  name: string
  email: string
  event: string
  date: string
  start_time: string
  end_time: string
  hours: number
  site_name: string
  deposit: number
  total: number
  notes?: string | null
  payment_url?: string | null
}

export interface ExtraSlotData {
  name: string
  email: string
  site_name: string
  date: string
  start_time: string
  end_time: string
  hours: number
  reason: string
  total: number
}

// ── Booking submitted (admin notification) ────────────────────────────────────

export function bookingSubmittedAdmin(b: BookingData): { subject: string; html: string } {
  return {
    subject: `New booking request — ${b.event} at ${b.site_name}`,
    html: layout(`
      <div style="padding:32px 32px 0;border-bottom:3px solid ${ACCENT};">
        <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:${ACCENT};letter-spacing:0.5px;text-transform:uppercase;">New Booking Request</p>
        <h1 style="margin:0 0 4px;font-size:22px;font-weight:700;color:#111827;">Action required</h1>
        <p style="margin:0 0 24px;color:#6b7280;font-size:14px;">A new booking request has been submitted and is awaiting your review.</p>
      </div>
      <div style="padding:24px 32px;">
        ${pill('Pending Review', '#92400e', '#fffbeb')}
        ${bookingTable(b)}
        ${b.notes ? `<div style="margin-top:16px;padding:12px 14px;background:#f9fafb;border-radius:8px;border-left:3px solid #e5e7eb;"><p style="margin:0;font-size:13px;color:#6b7280;font-weight:500;">Notes from booker</p><p style="margin:4px 0 0;font-size:14px;color:#374151;">${esc(b.notes)}</p></div>` : ''}
        <p style="margin:24px 0 0;font-size:13px;color:#9ca3af;">Log in to HallManager to approve or deny this request.</p>
      </div>
    `),
  }
}

// ── Booking submitted ─────────────────────────────────────────────────────────

export function bookingSubmitted(b: BookingData): { subject: string; html: string } {
  return {
    subject: `Booking request received — ${b.event}`,
    html: layout(`
      <div style="padding:32px 32px 0;border-bottom:3px solid ${ACCENT};">
        <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:${ACCENT};letter-spacing:0.5px;text-transform:uppercase;">Booking Request</p>
        <h1 style="margin:0 0 4px;font-size:22px;font-weight:700;color:#111827;">We've received your request</h1>
        <p style="margin:0 0 24px;color:#6b7280;font-size:14px;">Hi ${esc(b.name)}, your booking is pending review. We'll be in touch shortly.</p>
      </div>
      <div style="padding:24px 32px;">
        ${pill('Pending Review', '#92400e', '#fffbeb')}
        ${bookingTable(b)}
        ${b.notes ? `<div style="margin-top:16px;padding:12px 14px;background:#f9fafb;border-radius:8px;border-left:3px solid #e5e7eb;"><p style="margin:0;font-size:13px;color:#6b7280;font-weight:500;">Notes</p><p style="margin:4px 0 0;font-size:14px;color:#374151;">${esc(b.notes)}</p></div>` : ''}
        <p style="margin:24px 0 0;font-size:13px;color:#9ca3af;">If you have any questions, reply to your original enquiry or contact us directly.</p>
      </div>
    `),
  }
}

// ── Booking approved ──────────────────────────────────────────────────────────

export function bookingApproved(b: BookingData): { subject: string; html: string } {
  return {
    subject: `Booking approved — payment required to confirm your slot`,
    html: layout(`
      <div style="padding:32px 32px 0;border-bottom:3px solid #d97706;">
        <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#d97706;letter-spacing:0.5px;text-transform:uppercase;">Action Required</p>
        <h1 style="margin:0 0 4px;font-size:22px;font-weight:700;color:#111827;">Your booking has been approved</h1>
        <p style="margin:0 0 24px;color:#6b7280;font-size:14px;">Hi ${esc(b.name)}, great news — your booking request has been approved. Please read the important information below.</p>
      </div>
      <div style="padding:24px 32px;">
        ${pill('Awaiting Payment', '#92400e', '#fffbeb')}
        ${bookingTable(b)}
        <div style="margin-top:24px;padding:16px;background:#fffbeb;border-radius:10px;border:1px solid #fcd34d;">
          <p style="margin:0 0 6px;font-size:14px;color:#92400e;font-weight:700;">⚠️ Your booking is not confirmed until payment is received</p>
          <p style="margin:0;font-size:13px;color:#92400e;">Payment must be made within <strong>14 days</strong> to secure your slot. If payment is not received within this time, your booking will be automatically cancelled.</p>
        </div>
        ${b.payment_url ? `
        <div style="margin-top:24px;text-align:center;">
          <a href="${b.payment_url}" style="display:inline-block;background:${ACCENT};color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:700;font-size:15px;">Pay now — £${fp(b.total)}</a>
          <p style="margin:10px 0 0;font-size:12px;color:#9ca3af;">Secure payment powered by Stripe</p>
        </div>
        ` : `
        <div style="margin-top:16px;padding:16px;background:#f0fdf4;border-radius:10px;border:1px solid #bbf7d0;">
          <p style="margin:0;font-size:14px;color:#166534;font-weight:500;">💳 A deposit of <strong>£${fp(b.deposit)}</strong> is due to secure your booking. Please arrange payment within 14 days.</p>
        </div>
        `}
        <p style="margin:20px 0 0;font-size:13px;color:#9ca3af;">Once payment is received you'll receive a confirmation email. If you have any questions please get in touch.</p>
      </div>
    `),
  }
}

// ── Booking denied ────────────────────────────────────────────────────────────

export function bookingDenied(b: BookingData): { subject: string; html: string } {
  return {
    subject: `Booking update — ${b.event}`,
    html: layout(`
      <div style="padding:32px 32px 0;border-bottom:3px solid #dc2626;">
        <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#dc2626;letter-spacing:0.5px;text-transform:uppercase;">Booking Update</p>
        <h1 style="margin:0 0 4px;font-size:22px;font-weight:700;color:#111827;">Unfortunately we can't accommodate this booking</h1>
        <p style="margin:0 0 24px;color:#6b7280;font-size:14px;">Hi ${esc(b.name)}, we're sorry but your booking request could not be approved at this time.</p>
      </div>
      <div style="padding:24px 32px;">
        ${pill('Not approved', '#991b1b', '#fef2f2')}
        ${bookingTable(b)}
        <div style="margin-top:24px;padding:16px;background:#fef2f2;border-radius:10px;border:1px solid #fecaca;">
          <p style="margin:0;font-size:14px;color:#991b1b;">If you'd like to discuss alternative dates or arrangements, please get in touch and we'll do our best to help.</p>
        </div>
      </div>
    `),
  }
}

// ── Extra slot approved ───────────────────────────────────────────────────────

export function extraSlotApproved(s: ExtraSlotData): { subject: string; html: string } {
  return {
    subject: `Extra slot approved — ${s.date}`,
    html: layout(`
      <div style="padding:32px 32px 0;border-bottom:3px solid #059669;">
        <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#059669;letter-spacing:0.5px;text-transform:uppercase;">Extra Slot Approved</p>
        <h1 style="margin:0 0 4px;font-size:22px;font-weight:700;color:#111827;">Your extra slot is confirmed</h1>
        <p style="margin:0 0 24px;color:#6b7280;font-size:14px;">Hi ${esc(s.name)}, your additional session request has been approved.</p>
      </div>
      <div style="padding:24px 32px;">
        ${pill('Approved', '#065f46', '#ecfdf5')}
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:16px;">
          ${[
            ['Venue', esc(s.site_name)],
            ['Date', esc(s.date)],
            ['Time', `${esc(s.start_time)} – ${esc(s.end_time)}`],
            ['Duration', `${Number(s.hours)} hours`],
            ['Reason', esc(s.reason)],
            ['Total', `£${fp(s.total)}`],
          ].map(([label, value], i) => `
            <tr style="background:${i % 2 === 0 ? '#f9fafb' : '#ffffff'};">
              <td style="padding:10px 14px;color:#6b7280;font-weight:500;width:40%;">${label}</td>
              <td style="padding:10px 14px;color:#111827;font-weight:600;">${value}</td>
            </tr>
          `).join('')}
        </table>
        <p style="margin:24px 0 0;font-size:13px;color:#9ca3af;">An invoice will be raised for this session in due course.</p>
      </div>
    `),
  }
}

// ── Extra slot denied ─────────────────────────────────────────────────────────

export function extraSlotDenied(s: ExtraSlotData): { subject: string; html: string } {
  return {
    subject: `Extra slot request update — ${s.date}`,
    html: layout(`
      <div style="padding:32px 32px 0;border-bottom:3px solid #dc2626;">
        <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#dc2626;letter-spacing:0.5px;text-transform:uppercase;">Extra Slot Update</p>
        <h1 style="margin:0 0 4px;font-size:22px;font-weight:700;color:#111827;">Extra slot not available</h1>
        <p style="margin:0 0 24px;color:#6b7280;font-size:14px;">Hi ${esc(s.name)}, unfortunately we're unable to accommodate your additional session request.</p>
      </div>
      <div style="padding:24px 32px;">
        ${pill('Not approved', '#991b1b', '#fef2f2')}
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:16px;">
          ${[
            ['Venue', esc(s.site_name)],
            ['Date', esc(s.date)],
            ['Time', `${esc(s.start_time)} – ${esc(s.end_time)}`],
            ['Reason given', esc(s.reason)],
          ].map(([label, value], i) => `
            <tr style="background:${i % 2 === 0 ? '#f9fafb' : '#ffffff'};">
              <td style="padding:10px 14px;color:#6b7280;font-weight:500;width:40%;">${label}</td>
              <td style="padding:10px 14px;color:#111827;font-weight:600;">${value}</td>
            </tr>
          `).join('')}
        </table>
        <div style="margin-top:24px;padding:16px;background:#fef2f2;border-radius:10px;border:1px solid #fecaca;">
          <p style="margin:0;font-size:14px;color:#991b1b;">Please contact us if you'd like to discuss alternative arrangements.</p>
        </div>
      </div>
    `),
  }
}

// ── Booking cancelled ─────────────────────────────────────────────────────────

export function bookingCancelled(b: BookingData): { subject: string; html: string } {
  return {
    subject: `Booking cancelled — ${b.event}`,
    html: layout(`
      <div style="padding:32px 32px 0;border-bottom:3px solid #6b7280;">
        <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#6b7280;letter-spacing:0.5px;text-transform:uppercase;">Booking Cancelled</p>
        <h1 style="margin:0 0 4px;font-size:22px;font-weight:700;color:#111827;">Your booking has been cancelled</h1>
        <p style="margin:0 0 24px;color:#6b7280;font-size:14px;">Hi ${esc(b.name)}, your booking has been cancelled. Please see the details below.</p>
      </div>
      <div style="padding:24px 32px;">
        ${pill('Cancelled', '#374151', '#f3f4f6')}
        ${bookingTable(b)}
        <div style="margin-top:24px;padding:16px;background:#f9fafb;border-radius:10px;border:1px solid #e5e7eb;">
          <p style="margin:0;font-size:14px;color:#374151;">If you believe this is a mistake or would like to rebook, please get in touch and we'll be happy to help.</p>
        </div>
      </div>
    `),
  }
}
