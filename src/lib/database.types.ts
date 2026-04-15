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
          attended: boolean | null
          session_attendance: Record<string, boolean> | null
          cancelled_sessions: string[] | null
          assigned_to: string | null
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
          attended?: boolean | null
          session_attendance?: Record<string, boolean> | null
          cancelled_sessions?: string[] | null
          assigned_to?: string | null
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
          attended?: boolean | null
          session_attendance?: Record<string, boolean> | null
          cancelled_sessions?: string[] | null
          assigned_to?: string | null
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
export type Booking = Database['public']['Tables']['bookings']['Row']
export type Invoice = Database['public']['Tables']['invoices']['Row']
export type ExtraSlot = Database['public']['Tables']['extra_slots']['Row']

export interface DaySchedule {
  open: boolean
  from: string
  until: string
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
  role: 'admin' | 'manager' | 'regular'
  site_ids: string[]
  avatar: string | null
  color: string | null
  qf_client_id: string | null
  custom_rates: Record<string, number> | null
  group_name: string | null
  created_at: string
}
