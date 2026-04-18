export interface ServiceAccountKey {
  client_email: string
  private_key: string
}

export interface BookingDetails {
  name: string
  event: string
  date: string       // "2026-04-18"
  start_time: string // "09:00"
  end_time: string   // "11:00"
  site_name: string
  notes?: string | null
}

function base64url(data: string | Uint8Array): string {
  let binary = ''
  if (typeof data === 'string') {
    binary = data
  } else {
    for (const byte of data) binary += String.fromCharCode(byte)
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

export async function getGoogleAccessToken(key: ServiceAccountKey): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const payload = {
    iss: key.client_email,
    scope: 'https://www.googleapis.com/auth/calendar',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  }

  const encodedHeader = base64url(JSON.stringify(header))
  const encodedPayload = base64url(JSON.stringify(payload))
  const signingInput = `${encodedHeader}.${encodedPayload}`

  const pem = key.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s/g, '')

  const binaryKey = Uint8Array.from(atob(pem), c => c.charCodeAt(0))
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )

  const signatureBuffer = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(signingInput),
  )

  const jwt = `${signingInput}.${base64url(new Uint8Array(signatureBuffer))}`

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })

  if (!tokenRes.ok) {
    const err = await tokenRes.text()
    throw new Error(`Google token error: ${err}`)
  }

  const { access_token } = await tokenRes.json()
  return access_token
}

export async function createCalendarEvent(
  accessToken: string,
  calendarId: string,
  booking: BookingDetails,
): Promise<string> {
  const event = {
    summary: `${booking.event} — ${booking.name}`,
    location: booking.site_name,
    description: booking.notes || undefined,
    start: { dateTime: `${booking.date}T${booking.start_time}:00`, timeZone: 'Europe/London' },
    end:   { dateTime: `${booking.date}T${booking.end_time}:00`,   timeZone: 'Europe/London' },
  }

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    },
  )

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Calendar API error: ${err}`)
  }

  const data = await res.json()
  return data.id as string
}

export async function deleteCalendarEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
): Promise<void> {
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  )

  if (!res.ok && res.status !== 404) {
    const err = await res.text()
    throw new Error(`Calendar delete error: ${err}`)
  }
}
