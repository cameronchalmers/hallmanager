import { supabase } from './supabase'

type EmailType =
  | 'booking_submitted'
  | 'booking_approved'
  | 'booking_denied'
  | 'slot_approved'
  | 'slot_denied'

export async function sendEmail(type: EmailType, id: string) {
  const { error } = await supabase.functions.invoke('send-email', {
    body: { type, id },
  })
  if (error) console.error('Email send failed:', error)
}
