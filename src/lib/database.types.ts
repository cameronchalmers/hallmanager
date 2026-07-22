export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      sites: {
        Row: {
          id: string
          name: string
          address: string
          capacity: number
          rate: number
          deposit: number
          emoji: string
          min_hours: number | null
          available_from: string | null
          available_until: string | null
          availability: Json | null
          description: string | null
          amenities: string[] | null
          photos: string[] | null
          slug: string | null
          blocked_dates: string[] | null
          whatsapp_number: string | null
          google_review_url: string | null
          pricing_mode: 'hourly' | 'packages'
          rate_packages: Json | null
          site_type: 'hall' | 'vehicle'
          custom_questions: Json | null
        }
        Insert: {
          id?: string
          name: string
          address: string
          capacity: number
          rate: number
          deposit: number
          emoji: string
          min_hours?: number | null
          available_from?: string | null
          available_until?: string | null
          availability?: Json | null
          description?: string | null
          amenities?: string[] | null
          photos?: string[] | null
          slug?: string | null
          blocked_dates?: string[] | null
          whatsapp_number?: string | null
          google_review_url?: string | null
          pricing_mode?: 'hourly' | 'packages'
          rate_packages?: Json | null
          site_type?: 'hall' | 'vehicle'
          custom_questions?: Json | null
        }
        Update: {
          id?: string
          name?: string
          address?: string
          capacity?: number
          rate?: number
          deposit?: number
          emoji?: string
          min_hours?: number | null
          available_from?: string | null
          available_until?: string | null
          availability?: Json | null
          description?: string | null
          amenities?: string[] | null
          photos?: string[] | null
          slug?: string | null
          blocked_dates?: string[] | null
          whatsapp_number?: string | null
          google_review_url?: string | null
          pricing_mode?: 'hourly' | 'packages'
          rate_packages?: Json | null
          site_type?: 'hall' | 'vehicle'
          custom_questions?: Json | null
        }
        Relationships: []
      }
      site_credentials: {
        Row: {
          site_id: string
          stripe_secret_key: string | null
          stripe_publishable_key: string | null
          stripe_webhook_secret: string | null
          qf_account_num: string | null
          qf_app_id: string | null
          qf_api_key: string | null
          google_calendar_id: string | null
          updated_at: string
        }
        Insert: {
          site_id: string
          stripe_secret_key?: string | null
          stripe_publishable_key?: string | null
          stripe_webhook_secret?: string | null
          qf_account_num?: string | null
          qf_app_id?: string | null
          qf_api_key?: string | null
          google_calendar_id?: string | null
          updated_at?: string
        }
        Update: {
          site_id?: string
          stripe_secret_key?: string | null
          stripe_publishable_key?: string | null
          stripe_webhook_secret?: string | null
          qf_account_num?: string | null
          qf_app_id?: string | null
          qf_api_key?: string | null
          google_calendar_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      bookings: {
        Row: {
          id: string
          name: string
          email: string
          phone: string
          type: string
          event: string
          date: string
          start_time: string
          end_time: string
          hours: number
          site_id: string
          status: string
          notes: string | null
          deposit: number
          total: number
          user_id: string | null
          recurrence: string | null
          recurrence_days: number[] | null
          created_at: string
          stripe_session_id: string | null
          stripe_payment_url: string | null
          stripe_payment_status: string | null
          stripe_payment_intent_id: string | null
          attended: boolean | null
          session_attendance: Record<string, boolean> | null
          cancelled_sessions: string[] | null
          assigned_to: string | null
          package_label: string | null
          end_date: string | null
          custom_answers: Record<string, string> | null
          amount_paid: number
          google_calendar_event_id: string | null
        }
        Insert: {
          id?: string
          name: string
          email: string
          phone: string
          type: string
          event: string
          date: string
          start_time: string
          end_time: string
          hours: number
          site_id: string
          status: string
          notes?: string | null
          deposit: number
          total: number
          user_id?: string | null
          recurrence?: string | null
          recurrence_days?: number[] | null
          created_at?: string
          stripe_session_id?: string | null
          stripe_payment_url?: string | null
          stripe_payment_status?: string | null
          stripe_payment_intent_id?: string | null
          attended?: boolean | null
          session_attendance?: Record<string, boolean> | null
          cancelled_sessions?: string[] | null
          assigned_to?: string | null
          package_label?: string | null
          end_date?: string | null
          custom_answers?: Record<string, string> | null
          amount_paid?: number
          google_calendar_event_id?: string | null
        }
        Update: {
          id?: string
          name?: string
          email?: string
          phone?: string
          type?: string
          event?: string
          date?: string
          start_time?: string
          end_time?: string
          hours?: number
          site_id?: string
          status?: string
          notes?: string | null
          deposit?: number
          total?: number
          user_id?: string | null
          recurrence?: string | null
          recurrence_days?: number[] | null
          created_at?: string
          stripe_session_id?: string | null
          stripe_payment_url?: string | null
          stripe_payment_status?: string | null
          stripe_payment_intent_id?: string | null
          attended?: boolean | null
          session_attendance?: Record<string, boolean> | null
          cancelled_sessions?: string[] | null
          assigned_to?: string | null
          package_label?: string | null
          end_date?: string | null
          custom_answers?: Record<string, string> | null
          amount_paid?: number
          google_calendar_event_id?: string | null
        }
        Relationships: []
      }
      users: {
        Row: {
          id: string
          name: string
          email: string
          role: string
          site_ids: string[]
          avatar: string | null
          color: string | null
          qf_client_id: string | null
          custom_rates: Json | null
          group_name: string | null
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          email: string
          role: string
          site_ids: string[]
          avatar?: string | null
          color?: string | null
          qf_client_id?: string | null
          custom_rates?: Json | null
          group_name?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          email?: string
          role?: string
          site_ids?: string[]
          avatar?: string | null
          color?: string | null
          qf_client_id?: string | null
          custom_rates?: Json | null
          group_name?: string | null
          created_at?: string
        }
        Relationships: []
      }
      invoices: {
        Row: {
          id: string
          booking_id: string | null
          user_id: string | null
          description: string
          amount: number
          status: string
          date: string
          qf_ref: string | null
          qf_synced: boolean
          created_at: string
        }
        Insert: {
          id?: string
          booking_id?: string | null
          user_id?: string | null
          description: string
          amount: number
          status: string
          date: string
          qf_ref?: string | null
          qf_synced?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          booking_id?: string | null
          user_id?: string | null
          description?: string
          amount?: number
          status?: string
          date?: string
          qf_ref?: string | null
          qf_synced?: boolean
          created_at?: string
        }
        Relationships: []
      }
      extra_slots: {
        Row: {
          id: string
          user_id: string
          name: string
          site_id: string
          date: string
          start_time: string
          end_time: string
          hours: number
          reason: string
          status: string
          rate: number
          total: number
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          site_id: string
          date: string
          start_time: string
          end_time: string
          hours: number
          reason: string
          status: string
          rate: number
          total: number
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          site_id?: string
          date?: string
          start_time?: string
          end_time?: string
          hours?: number
          reason?: string
          status?: string
          rate?: number
          total?: number
          created_at?: string
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}

// Convenience types
export type Site = Database['public']['Tables']['sites']['Row']
export type SiteCredentials = Database['public']['Tables']['site_credentials']['Row']
export type Booking = Database['public']['Tables']['bookings']['Row']
export type Invoice = Database['public']['Tables']['invoices']['Row']
export type ExtraSlot = Database['public']['Tables']['extra_slots']['Row']

export interface DaySchedule {
  open: boolean
  from: string
  until: string
}

/** Package for sites with pricing_mode 'packages' (e.g. minibus hire).
 *  pricing 'fixed' (default): price = total, days = length covered.
 *  pricing 'per_day': price = daily rate; customer picks the end date within
 *  min_days..max_days; tiers give whole-booking % discounts by length.
 *  All amounts in pence. deposit is legacy — package sites use a 25% split. */
export interface PerDayTier {
  min_days: number
  discount_pct: number
}

export interface RatePackage {
  label: string
  price: number
  deposit: number | null
  start_time: string
  end_time: string
  days: number
  pricing?: 'fixed' | 'per_day'
  min_days?: number
  max_days?: number
  tiers?: PerDayTier[]
}

export function getRatePackages(site: Pick<Site, 'rate_packages'> | null | undefined): RatePackage[] {
  const raw = site?.rate_packages
  if (!Array.isArray(raw)) return []
  return (raw as unknown as RatePackage[]).filter(p => p && p.label && p.start_time && p.end_time)
}

/** Extra booking-form question defined per site (e.g. driver details for a vehicle).
 *  type 'terms' renders as a required agreement checkbox linking to `url`. */
export interface CustomQuestion {
  label: string
  required: boolean
  type?: 'text' | 'terms'
  url?: string
}

export function getCustomQuestions(site: Pick<Site, 'custom_questions'> | null | undefined): CustomQuestion[] {
  const raw = site?.custom_questions
  if (!Array.isArray(raw)) return []
  return (raw as unknown as CustomQuestion[]).filter(q => q && q.label)
}

export type WeekAvailability = {
  monday: DaySchedule
  tuesday: DaySchedule
  wednesday: DaySchedule
  thursday: DaySchedule
  friday: DaySchedule
  saturday: DaySchedule
  sunday: DaySchedule
}

export const DEFAULT_AVAILABILITY: WeekAvailability = {
  monday:    { open: true,  from: '09:00', until: '22:00' },
  tuesday:   { open: true,  from: '09:00', until: '22:00' },
  wednesday: { open: true,  from: '09:00', until: '22:00' },
  thursday:  { open: true,  from: '09:00', until: '22:00' },
  friday:    { open: true,  from: '09:00', until: '22:00' },
  saturday:  { open: true,  from: '09:00', until: '17:00' },
  sunday:    { open: false, from: '10:00', until: '16:00' },
}

export interface AppUser {
  id: string
  name: string
  email: string
  role: 'admin' | 'site_admin' | 'manager' | 'regular'
  site_ids: string[]
  avatar: string | null
  color: string | null
  qf_client_id: string | null
  custom_rates: Record<string, number> | null
  group_name: string | null
  created_at: string
}
