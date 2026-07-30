/**
 * Supabase database types.
 *
 * Mirrors the shape emitted by:
 *   supabase gen types typescript --project-id "$SUPABASE_PROJECT_ID" --schema public
 * (also available as `npm run types:gen` — regenerate after every migration).
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      tech_profiles: {
        Row: {
          tech_id: string;
          salon_id: string;
          phone: string | null;
          email: string | null;
          started_on: string | null;
          pronouns: string | null;
          bio: string | null;
          specialties: string | null;
          certifications: string | null;
          emergency_contact: string | null;
          emergency_phone: string | null;
          manager_notes: string | null;
          updated_at: string;
        };
        Insert: {
          tech_id: string;
          salon_id?: string;
          phone?: string | null;
          email?: string | null;
          started_on?: string | null;
          pronouns?: string | null;
          bio?: string | null;
          specialties?: string | null;
          certifications?: string | null;
          emergency_contact?: string | null;
          emergency_phone?: string | null;
          manager_notes?: string | null;
          updated_at?: string;
        };
        Update: {
          phone?: string | null;
          email?: string | null;
          started_on?: string | null;
          pronouns?: string | null;
          bio?: string | null;
          specialties?: string | null;
          certifications?: string | null;
          emergency_contact?: string | null;
          emergency_phone?: string | null;
          manager_notes?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      salons: {
        Row: {
          id: string;
          name: string;
          created_at: string;
          tech_split_percent: number;
          pay_period_days: number;
          pay_period_anchor: string;
          open_hour: number;
          close_hour: number;
          default_theme: string;
          timezone: string;
          default_dashboard_layout: Json | null;
          checkin_early_minutes: number;
          checkin_late_minutes: number;
          /** bcrypt. Never sent to a client — coerced to a boolean server-side. */
          kiosk_exit_pin_hash: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          created_at?: string;
          tech_split_percent?: number;
          pay_period_days?: number;
          pay_period_anchor?: string;
          open_hour?: number;
          close_hour?: number;
          default_theme?: string;
          timezone?: string;
          default_dashboard_layout?: Json | null;
          checkin_early_minutes?: number;
          checkin_late_minutes?: number;
          kiosk_exit_pin_hash?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          created_at?: string;
          tech_split_percent?: number;
          pay_period_days?: number;
          pay_period_anchor?: string;
          open_hour?: number;
          close_hour?: number;
          default_theme?: string;
          timezone?: string;
          default_dashboard_layout?: Json | null;
          checkin_early_minutes?: number;
          checkin_late_minutes?: number;
          kiosk_exit_pin_hash?: string | null;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          salon_id: string;
          full_name: string;
          role: Database["public"]["Enums"]["user_role"];
          is_active: boolean;
          last_turn_at: string | null;
          created_at: string;
          skills: Database["public"]["Enums"]["skill"][];
          theme: string | null;
          mode: string | null;
          dashboard_layout: Json | null;
        };
        Insert: {
          id: string;
          salon_id: string;
          full_name: string;
          role?: Database["public"]["Enums"]["user_role"];
          is_active?: boolean;
          last_turn_at?: string | null;
          created_at?: string;
          skills?: Database["public"]["Enums"]["skill"][];
          theme?: string | null;
          mode?: string | null;
          dashboard_layout?: Json | null;
        };
        Update: {
          id?: string;
          salon_id?: string;
          full_name?: string;
          role?: Database["public"]["Enums"]["user_role"];
          is_active?: boolean;
          last_turn_at?: string | null;
          created_at?: string;
          skills?: Database["public"]["Enums"]["skill"][];
          theme?: string | null;
          mode?: string | null;
          dashboard_layout?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_salon_id_fkey";
            columns: ["salon_id"];
            isOneToOne: false;
            referencedRelation: "salons";
            referencedColumns: ["id"];
          },
        ];
      };
      customers: {
        Row: {
          id: string;
          salon_id: string;
          name: string;
          phone: string | null;
          notes: string | null;
          created_at: string;
          email: string | null;
          birthday: string | null;
          preferred_tech_id: string | null;
          allergies: string | null;
          is_active: boolean;
          first_name: string | null;
          last_name: string | null;
          language: string;
        };
        Insert: {
          id?: string;
          salon_id: string;
          name: string;
          phone?: string | null;
          notes?: string | null;
          created_at?: string;
          email?: string | null;
          birthday?: string | null;
          preferred_tech_id?: string | null;
          allergies?: string | null;
          is_active?: boolean;
          first_name?: string | null;
          last_name?: string | null;
          language?: string;
        };
        Update: {
          id?: string;
          salon_id?: string;
          name?: string;
          phone?: string | null;
          notes?: string | null;
          created_at?: string;
          email?: string | null;
          birthday?: string | null;
          preferred_tech_id?: string | null;
          allergies?: string | null;
          is_active?: boolean;
          first_name?: string | null;
          last_name?: string | null;
          language?: string;
        };
        Relationships: [
          {
            foreignKeyName: "customers_salon_id_fkey";
            columns: ["salon_id"];
            isOneToOne: false;
            referencedRelation: "salons";
            referencedColumns: ["id"];
          },
        ];
      };
      jobs: {
        Row: {
          id: string;
          salon_id: string;
          customer_id: string;
          tech_id: string | null;
          appointment_id: string | null;
          service_id: string | null;
          required_skills: Database["public"]["Enums"]["skill"][];
          type: Database["public"]["Enums"]["job_type"];
          status: Database["public"]["Enums"]["job_status"];
          service_name: string;
          notes: string | null;
          photo_url: string | null;
          checked_in_at: string;
          started_at: string | null;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          salon_id: string;
          customer_id: string;
          tech_id?: string | null;
          appointment_id?: string | null;
          service_id?: string | null;
          required_skills?: Database["public"]["Enums"]["skill"][];
          type?: Database["public"]["Enums"]["job_type"];
          status?: Database["public"]["Enums"]["job_status"];
          service_name: string;
          notes?: string | null;
          photo_url?: string | null;
          checked_in_at?: string;
          started_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          salon_id?: string;
          customer_id?: string;
          tech_id?: string | null;
          appointment_id?: string | null;
          service_id?: string | null;
          required_skills?: Database["public"]["Enums"]["skill"][];
          type?: Database["public"]["Enums"]["job_type"];
          status?: Database["public"]["Enums"]["job_status"];
          service_name?: string;
          notes?: string | null;
          photo_url?: string | null;
          checked_in_at?: string;
          started_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "jobs_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "jobs_tech_id_fkey";
            columns: ["tech_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "jobs_appointment_id_fkey";
            columns: ["appointment_id"];
            isOneToOne: false;
            referencedRelation: "appointments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "jobs_salon_id_fkey";
            columns: ["salon_id"];
            isOneToOne: false;
            referencedRelation: "salons";
            referencedColumns: ["id"];
          },
        ];
      };
      appointments: {
        Row: {
          id: string;
          salon_id: string;
          customer_id: string;
          tech_id: string | null;
          service_id: string | null;
          scheduled_at: string;
          service_name: string;
          notes: string | null;
          status: Database["public"]["Enums"]["appointment_status"];
          created_at: string;
        };
        Insert: {
          id?: string;
          salon_id: string;
          customer_id: string;
          tech_id?: string | null;
          service_id?: string | null;
          scheduled_at: string;
          service_name: string;
          notes?: string | null;
          status?: Database["public"]["Enums"]["appointment_status"];
          created_at?: string;
        };
        Update: {
          id?: string;
          salon_id?: string;
          customer_id?: string;
          tech_id?: string | null;
          service_id?: string | null;
          scheduled_at?: string;
          service_name?: string;
          notes?: string | null;
          status?: Database["public"]["Enums"]["appointment_status"];
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "appointments_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "appointments_tech_id_fkey";
            columns: ["tech_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "appointments_salon_id_fkey";
            columns: ["salon_id"];
            isOneToOne: false;
            referencedRelation: "salons";
            referencedColumns: ["id"];
          },
        ];
      };
      payments: {
        Row: {
          id: string;
          salon_id: string;
          job_id: string;
          tech_id: string | null;
          service_amount: number;
          tip_amount: number;
          method: Database["public"]["Enums"]["payment_method"];
          split_percent: number;
          tech_amount: number;
          salon_amount: number;
          note: string | null;
          recorded_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          salon_id: string;
          job_id: string;
          tech_id?: string | null;
          service_amount?: number;
          tip_amount?: number;
          method?: Database["public"]["Enums"]["payment_method"];
          split_percent?: number;
          tech_amount?: number;
          salon_amount?: number;
          note?: string | null;
          recorded_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          salon_id?: string;
          job_id?: string;
          tech_id?: string | null;
          service_amount?: number;
          tip_amount?: number;
          method?: Database["public"]["Enums"]["payment_method"];
          split_percent?: number;
          tech_amount?: number;
          salon_amount?: number;
          note?: string | null;
          recorded_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payments_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: true;
            referencedRelation: "jobs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payments_tech_id_fkey";
            columns: ["tech_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payments_salon_id_fkey";
            columns: ["salon_id"];
            isOneToOne: false;
            referencedRelation: "salons";
            referencedColumns: ["id"];
          },
        ];
      };
      services: {
        Row: {
          id: string;
          salon_id: string;
          name: string;
          category: Database["public"]["Enums"]["service_category"];
          price: number;
          duration_minutes: number | null;
          required_skills: Database["public"]["Enums"]["skill"][];
          is_active: boolean;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          salon_id: string;
          name: string;
          category?: Database["public"]["Enums"]["service_category"];
          price?: number;
          duration_minutes?: number | null;
          required_skills?: Database["public"]["Enums"]["skill"][];
          is_active?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          salon_id?: string;
          name?: string;
          category?: Database["public"]["Enums"]["service_category"];
          price?: number;
          duration_minutes?: number | null;
          required_skills?: Database["public"]["Enums"]["skill"][];
          is_active?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "services_salon_id_fkey";
            columns: ["salon_id"];
            isOneToOne: false;
            referencedRelation: "salons";
            referencedColumns: ["id"];
          },
        ];
      };
      kiosk_devices: {
        Row: {
          id: string;
          salon_id: string;
          label: string;
          is_active: boolean;
          last_seen_at: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          salon_id: string;
          label: string;
          is_active?: boolean;
          last_seen_at?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          salon_id?: string;
          label?: string;
          is_active?: boolean;
          last_seen_at?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      appointment_services: {
        Row: {
          id: string;
          salon_id: string;
          appointment_id: string;
          service_id: string | null;
          name: string;
          price: number;
          quantity: number;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          salon_id: string;
          appointment_id: string;
          service_id?: string | null;
          name: string;
          price?: number;
          quantity?: number;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          salon_id?: string;
          appointment_id?: string;
          service_id?: string | null;
          name?: string;
          price?: number;
          quantity?: number;
          sort_order?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "appointment_services_appointment_id_fkey";
            columns: ["appointment_id"];
            isOneToOne: false;
            referencedRelation: "appointments";
            referencedColumns: ["id"];
          },
        ];
      };
      job_services: {
        Row: {
          id: string;
          salon_id: string;
          job_id: string;
          service_id: string | null;
          name: string;
          price: number;
          quantity: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          salon_id: string;
          job_id: string;
          service_id?: string | null;
          name: string;
          price?: number;
          quantity?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          salon_id?: string;
          job_id?: string;
          service_id?: string | null;
          name?: string;
          price?: number;
          quantity?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "job_services_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "jobs";
            referencedColumns: ["id"];
          },
        ];
      };
      turn_checkins: {
        Row: {
          id: string;
          salon_id: string;
          tech_id: string;
          checkin_date: string;
          checked_in_at: string;
          checked_in_by: string | null;
          checked_out_at: string | null;
          checked_out_by: string | null;
        };
        Insert: {
          id?: string;
          salon_id: string;
          tech_id: string;
          checkin_date?: string;
          checked_in_at?: string;
          checked_in_by?: string | null;
          checked_out_at?: string | null;
          checked_out_by?: string | null;
        };
        Update: {
          id?: string;
          salon_id?: string;
          tech_id?: string;
          checkin_date?: string;
          checked_in_at?: string;
          checked_in_by?: string | null;
          checked_out_at?: string | null;
          checked_out_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "turn_checkins_tech_id_fkey";
            columns: ["tech_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          id: string;
          salon_id: string;
          user_id: string;
          type: Database["public"]["Enums"]["notification_type"];
          title: string;
          body: string | null;
          link: string | null;
          appointment_id: string | null;
          job_id: string | null;
          read_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          salon_id: string;
          user_id: string;
          type: Database["public"]["Enums"]["notification_type"];
          title: string;
          body?: string | null;
          link?: string | null;
          appointment_id?: string | null;
          job_id?: string | null;
          read_at?: string | null;
          created_at?: string;
        };
        Update: {
          read_at?: string | null;
        };
        Relationships: [];
      };
      tech_pay: {
        Row: {
          tech_id: string;
          salon_id: string;
          commission_percent: number | null;
          note: string | null;
          updated_by: string | null;
          updated_at: string;
        };
        Insert: {
          tech_id: string;
          salon_id: string;
          commission_percent?: number | null;
          note?: string | null;
          updated_by?: string | null;
          updated_at?: string;
        };
        Update: {
          commission_percent?: number | null;
          note?: string | null;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      schedule_blocks: {
        Row: {
          id: string;
          salon_id: string;
          tech_id: string;
          kind: Database["public"]["Enums"]["block_kind"];
          starts_at: string;
          ends_at: string;
          buffer_minutes: number;
          blocked_from: string;
          blocked_to: string;
          appointment_id: string | null;
          title: string | null;
          note: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          salon_id: string;
          tech_id: string;
          kind?: Database["public"]["Enums"]["block_kind"];
          starts_at: string;
          ends_at: string;
          buffer_minutes?: number;
          appointment_id?: string | null;
          title?: string | null;
          note?: string | null;
          created_by?: string | null;
        };
        Update: {
          kind?: Database["public"]["Enums"]["block_kind"];
          starts_at?: string;
          ends_at?: string;
          buffer_minutes?: number;
          title?: string | null;
          note?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "schedule_blocks_tech_id_fkey";
            columns: ["tech_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      shift_blocks: {
        Row: {
          id: string;
          salon_id: string;
          tech_id: string;
          kind: Database["public"]["Enums"]["shift_kind"];
          starts_at: string;
          ends_at: string;
          note: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          salon_id?: string;
          tech_id: string;
          kind?: Database["public"]["Enums"]["shift_kind"];
          starts_at: string;
          ends_at: string;
          note?: string | null;
          created_by?: string | null;
        };
        Update: {
          tech_id?: string;
          kind?: Database["public"]["Enums"]["shift_kind"];
          starts_at?: string;
          ends_at?: string;
          note?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "shift_blocks_tech_id_fkey";
            columns: ["tech_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<never, never>;
    Functions: {
      current_salon_id: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      is_manager: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      can_manage_floor: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      bootstrap_salon: {
        Args: { p_salon_name: string; p_full_name?: string | null };
        Returns: string;
      };
      turn_queue: {
        Args: {
          p_salon_id?: string | null;
          p_required_skills?: Database["public"]["Enums"]["skill"][] | null;
        };
        Returns: {
          tech_id: string;
          full_name: string;
          last_turn_at: string | null;
          is_busy: boolean;
          is_checked_in: boolean;
          is_booked_now: boolean;
          has_skills: boolean;
          skills: Database["public"]["Enums"]["skill"][];
          waiting_jobs: number;
          jobs_today: number;
          queue_position: number | null;
        }[];
      };
      suggest_next_tech: {
        Args: {
          p_salon_id?: string | null;
          p_required_skills?: Database["public"]["Enums"]["skill"][] | null;
          p_exclude_tech_id?: string | null;
        };
        Returns: string | null;
      };
      assign_job: {
        Args: { p_job_id: string; p_tech_id: string | null };
        Returns: Database["public"]["Tables"]["jobs"]["Row"];
      };
      start_job: {
        Args: { p_job_id: string; p_tech_id?: string | null };
        Returns: Database["public"]["Tables"]["jobs"]["Row"];
      };
      complete_job: {
        Args: { p_job_id: string };
        Returns: Database["public"]["Tables"]["jobs"]["Row"];
      };
      check_in_appointment: {
        Args: { p_appointment_id: string };
        Returns: Database["public"]["Tables"]["jobs"]["Row"];
      };
      reset_turn: {
        Args: { p_tech_id: string };
        Returns: undefined;
      };
      skip_job: {
        Args: { p_job_id: string };
        Returns: Database["public"]["Tables"]["jobs"]["Row"];
      };
      record_payment: {
        Args: {
          p_job_id: string;
          p_service_amount?: number | null;
          p_tip_amount?: number;
          p_method?: string;
          p_tech_id?: string | null;
          p_note?: string | null;
          p_services?: Json | null;
          p_split_percent?: number | null;
        };
        Returns: Database["public"]["Tables"]["payments"]["Row"];
      };
      payment_totals_today: {
        Args: Record<PropertyKey, never>;
        Returns: {
          service_total: number;
          tip_total: number;
          tech_total: number;
          salon_total: number;
          payment_count: number;
          cash_total: number;
          card_total: number;
        }[];
      };
      my_tips_today: {
        Args: Record<PropertyKey, never>;
        Returns: number;
      };
      set_my_skills: {
        Args: { p_skills: Database["public"]["Enums"]["skill"][] };
        Returns: Database["public"]["Tables"]["profiles"]["Row"];
      };
      set_tech_skills: {
        Args: { p_tech_id: string; p_skills: Database["public"]["Enums"]["skill"][] };
        Returns: Database["public"]["Tables"]["profiles"]["Row"];
      };
      check_in_for_turns: {
        Args: { p_tech_id?: string | null };
        Returns: Database["public"]["Tables"]["turn_checkins"]["Row"];
      };
      check_out_of_turns: {
        Args: { p_tech_id?: string | null };
        Returns: Database["public"]["Tables"]["turn_checkins"]["Row"];
      };
      am_i_checked_in: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      pay_period_start: {
        Args: { p_salon_id?: string | null };
        Returns: string;
      };
      tech_earnings: {
        Args: { p_tech_id?: string | null };
        Returns: {
          scope: string;
          period_start: string;
          services_count: number;
          service_total: number;
          tip_total: number;
          tech_total: number;
          split_percent: number;
        }[];
      };
      salon_earnings: {
        Args: { p_scope?: string };
        Returns: {
          tech_id: string;
          full_name: string;
          commission_percent: number;
          services_count: number;
          service_total: number;
          tip_total: number;
          tech_total: number;
          salon_total: number;
        }[];
      };
      update_salon_pay_settings: {
        Args: { p_split_percent: number; p_pay_period_days?: number | null; p_anchor?: string | null };
        Returns: Database["public"]["Tables"]["salons"]["Row"];
      };
      is_super_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      effective_commission: {
        Args: { p_tech_id: string };
        Returns: number;
      };
      set_commission: {
        Args: { p_tech_id: string; p_percent?: number | null; p_note?: string | null };
        Returns: Database["public"]["Tables"]["tech_pay"]["Row"];
      };
      create_salon_as_owner: {
        Args: { p_name: string };
        Returns: Database["public"]["Tables"]["salons"]["Row"];
      };
      dismiss_notification: {
        Args: { p_id: string };
        Returns: number;
      };
      clear_notifications: {
        Args: Record<PropertyKey, never>;
        Returns: number;
      };
      is_booked_now: {
        Args: { p_tech_id: string; p_at?: string };
        Returns: boolean;
      };
      block_time: {
        Args: {
          p_tech_id: string | null;
          p_starts_at: string;
          p_ends_at: string;
          p_kind?: string;
          p_title?: string | null;
          p_buffer?: number;
        };
        Returns: Database["public"]["Tables"]["schedule_blocks"]["Row"];
      };
      unblock_time: {
        Args: { p_id: string };
        Returns: number;
      };
      save_shift: {
        Args: {
          p_id: string | null;
          p_tech_id: string;
          p_starts_at: string;
          p_ends_at: string;
          p_kind?: string;
          p_note?: string | null;
        };
        Returns: Database["public"]["Tables"]["shift_blocks"]["Row"];
      };
      delete_shift: {
        Args: { p_id: string };
        Returns: number;
      };
      delete_tech: {
        Args: { p_tech_id: string };
        Returns: string;
      };
      tech_deletion_check: {
        Args: { p_tech_id: string };
        Returns: {
          can_delete: boolean;
          completed_jobs: number;
          payments_count: number;
          future_bookings: number;
          reason: string;
        }[];
      };
      bulk_update_skills: {
        Args: {
          p_tech_ids?: string[] | null;
          p_add?: Database["public"]["Enums"]["skill"][];
          p_remove?: Database["public"]["Enums"]["skill"][];
        };
        Returns: number;
      };
      save_tech_profile: {
        Args: {
          p_tech_id: string;
          p_phone: string | null;
          p_email: string | null;
          p_started_on: string | null;
          p_pronouns: string | null;
          p_bio: string | null;
          p_specialties: string | null;
          p_certifications: string | null;
          p_emergency_contact: string | null;
          p_emergency_phone: string | null;
          p_manager_notes: string | null;
        };
        Returns: Database["public"]["Tables"]["tech_profiles"]["Row"];
      };
      update_customer_details: {
        Args: {
          p_id: string;
          p_email?: string | null;
          p_birthday?: string | null;
          p_preferred_tech_id?: string | null;
          p_allergies?: string | null;
          p_clear_preferred?: boolean;
        };
        Returns: Database["public"]["Tables"]["customers"]["Row"];
      };
      client_history: {
        Args: { p_customer_id: string };
        Returns: {
          kind: string;
          id: string;
          at: string;
          service_name: string;
          tech_id: string | null;
          tech_name: string;
          status: string;
          notes: string | null;
          amount: number;
          tip: number;
          paid: boolean;
          is_future: boolean;
        }[];
      };
      client_summary: {
        Args: { p_customer_id: string };
        Returns: {
          visits: number;
          lifetime_spend: number;
          lifetime_tips: number;
          first_visit: string | null;
          last_visit: string | null;
          upcoming: number;
          favourite_tech: string | null;
          favourite_service: string | null;
        }[];
      };
      team_skills: {
        Args: Record<string, never>;
        Returns: {
          tech_id: string;
          full_name: string;
          is_active: boolean;
          skills: Database["public"]["Enums"]["skill"][];
          specialties: string | null;
          jobs_30d: number;
        }[];
      };
      salon_day_bounds: {
        Args: { p_day: string };
        Returns: { starts_at: string; ends_at: string }[];
      };
      appointment_minutes: {
        Args: { p_appointment_id: string };
        Returns: number;
      };
      kiosk_context: {
        Args: Record<string, never>;
        // JSON; shape lives in `KioskContext` in lib/types.
        Returns: unknown;
      };
      kiosk_lookup_client: {
        Args: { p_phone: string };
        // JSON; shape lives in `KioskLookup` in lib/types.
        Returns: unknown;
      };
      kiosk_checkin: {
        Args: { p_appointment_id: string };
        // JSON; shape lives in `KioskCheckin` in lib/types.
        Returns: unknown;
      };
      staff_search_clients: {
        Args: { q?: string; lim?: number };
        Returns: {
          id: string;
          first_name: string | null;
          last_name: string | null;
          phone_last4: string | null;
          last_visit: string | null;
          usual_tech: string | null;
          is_active: boolean;
        }[];
      };
      staff_recent_clients: {
        Args: { lim?: number };
        Returns: Database["public"]["Functions"]["staff_search_clients"]["Returns"];
      };
      kiosk_service_menu: {
        Args: Record<string, never>;
        Returns: {
          id: string;
          name: string;
          category: Database["public"]["Enums"]["service_category"];
          price: number;
          duration_minutes: number;
          sort_order: number;
        }[];
      };
      kiosk_available_techs: {
        Args: { p_service_ids: string[]; p_day?: string | null };
        Returns: {
          tech_id: string;
          full_name: string;
          next_opening: string;
          openings: number;
        }[];
      };
      kiosk_available_slots: {
        Args: { p_service_ids: string[]; p_tech_id?: string | null; p_day?: string | null };
        Returns: { slot_at: string; tech_id: string; tech_name: string }[];
      };
      kiosk_register_client: {
        Args: {
          p_first: string;
          p_last: string;
          p_phone: string;
          p_language?: string;
          p_sensitivities?: string | null;
        };
        Returns: string;
      };
      kiosk_book: {
        Args: {
          p_customer_id: string;
          p_service_ids: string[];
          p_tech_id: string | null;
          p_starts_at: string;
        };
        // JSON; shape lives in `KioskBooking` in lib/types.
        Returns: unknown;
      };
      services_basket_is_valid: {
        Args: { p_service_ids: string[] };
        Returns: boolean;
      };
      services_total_minutes: {
        Args: { p_service_ids: string[] };
        Returns: number;
      };
      kiosk_check_exit_pin: {
        Args: { p_pin: string };
        Returns: boolean;
      };
      set_kiosk_exit_pin: {
        Args: { p_pin: string };
        Returns: undefined;
      };
      register_kiosk_device: {
        Args: { p_user_id: string; p_label: string };
        Returns: Database["public"]["Tables"]["kiosk_devices"]["Row"];
      };
      day_calendar: {
        Args: { p_day: string; p_tech_id?: string | null };
        // A JSON document; the shape lives in `DayCalendar` in lib/types.
        Returns: unknown;
      };
      service_menu: {
        Args: { p_include_inactive?: boolean };
        Returns: {
          id: string;
          name: string;
          category: Database["public"]["Enums"]["service_category"];
          price: number;
          duration_minutes: number | null;
          /** Only the extras a manager typed — the category's base skill is implied. */
          required_skills: Database["public"]["Enums"]["skill"][];
          /** What a tech actually has to hold: base skill ∪ extras. */
          effective_skills: Database["public"]["Enums"]["skill"][];
          is_active: boolean;
          sort_order: number;
        }[];
      };
      techs_for_service: {
        Args: { p_service_id: string };
        Returns: { tech_id: string; full_name: string; eligible: boolean }[];
      };
      skills_for_services: {
        Args: { p_service_ids: string[] };
        Returns: Database["public"]["Enums"]["skill"][];
      };
      book_appointment: {
        Args: {
          p_customer_id: string;
          p_scheduled_at: string;
          p_service_ids: string[];
          p_service_name: string | null;
          p_tech_id?: string | null;
          p_notes?: string | null;
        };
        Returns: Database["public"]["Tables"]["appointments"]["Row"];
      };
      check_in_walkin: {
        Args: {
          p_customer_id: string;
          p_service_ids: string[];
          p_service_name: string | null;
          p_type?: Database["public"]["Enums"]["job_type"];
          p_tech_id?: string | null;
          p_leave_open?: boolean;
          p_notes?: string | null;
          p_photo_url?: string | null;
        };
        Returns: Database["public"]["Tables"]["jobs"]["Row"];
      };
      appointment_basket: {
        Args: { p_appointment_id: string };
        Returns: { service_id: string | null; name: string; price: number; quantity: number }[];
      };
      set_appointment_services: {
        Args: { p_appointment_id: string; p_service_ids: string[] };
        Returns: undefined;
      };
      save_service: {
        Args: {
          p_id: string | null;
          p_name: string;
          p_category: Database["public"]["Enums"]["service_category"];
          p_price: number;
          p_minutes: number | null;
          p_skills: Database["public"]["Enums"]["skill"][];
          p_is_active: boolean;
          p_sort_order?: number | null;
        };
        Returns: Database["public"]["Tables"]["services"]["Row"];
      };
      update_appointment: {
        Args: {
          p_id: string;
          p_scheduled_at?: string | null;
          p_tech_id?: string | null;
          p_service_id?: string | null;
          p_customer_id?: string | null;
          p_notes?: string | null;
          p_clear_tech?: boolean;
        };
        Returns: Database["public"]["Tables"]["appointments"]["Row"];
      };
      service_log: {
        Args: { p_day?: string | null; p_tech_id?: string | null };
        Returns: {
          id: string;
          status: string;
          tech_id: string | null;
          tech_name: string;
          customer_name: string;
          service_name: string;
          checked_in_at: string;
          started_at: string | null;
          completed_at: string | null;
          is_appointment: boolean;
          amount: number;
          tip: number;
          paid: boolean;
        }[];
      };
      set_dashboard_layout: {
        Args: { p_layout: Json | null };
        Returns: Database["public"]["Tables"]["profiles"]["Row"];
      };
      set_salon_dashboard_layout: {
        Args: { p_layout: Json | null };
        Returns: Database["public"]["Tables"]["salons"]["Row"];
      };
      takings_comparison: {
        Args: Record<string, never>;
        Returns: {
          today_total: number;
          today_clients: number;
          compared_total: number;
          compared_clients: number;
          compared_day: string;
        }[];
      };
      save_availability_pattern: {
        Args: {
          p_tech_id: string;
          p_weekdays: number[];
          p_from: string;
          p_to: string;
          p_ends?: string | null;
        };
        Returns: {
          id: string;
          salon_id: string;
          tech_id: string;
          weekdays: number[];
          start_time: string;
          end_time: string;
          effective_from: string;
          effective_to: string | null;
          created_at: string;
          updated_at: string;
        };
      };
      clear_availability_pattern: {
        Args: { p_tech_id?: string | null };
        Returns: number;
      };
      availability_patterns_for_salon: {
        Args: Record<string, never>;
        Returns: {
          tech_id: string;
          tech_name: string;
          weekdays: number[];
          start_time: string;
          end_time: string;
          effective_to: string | null;
          editable: boolean;
        }[];
      };
      unmarked_techs: {
        Args: { p_days?: number };
        Returns: {
          tech_id: string;
          full_name: string;
          has_pattern: boolean;
          days_marked: number;
        }[];
      };
      month_availability: {
        Args: { p_from: string; p_to: string };
        Returns: {
          day: string;
          tech_id: string;
          tech_name: string;
          kind: Database["public"]["Enums"]["shift_kind"];
          starts_at: string;
          ends_at: string;
          note: string | null;
          editable: boolean;
          booking_count: number;
        }[];
      };
      set_day_availability: {
        Args: {
          p_tech_id: string;
          p_day: string;
          p_from: string;
          p_to: string;
          p_kind?: string;
          p_note?: string | null;
        };
        Returns: Database["public"]["Tables"]["shift_blocks"]["Row"];
      };
      clear_day_availability: {
        Args: { p_tech_id: string; p_day: string };
        Returns: number;
      };
      set_appearance: {
        Args: { p_theme?: string | null; p_mode?: string | null };
        Returns: Database["public"]["Tables"]["profiles"]["Row"];
      };
      set_salon_theme: {
        Args: { p_theme: string };
        Returns: Database["public"]["Tables"]["salons"]["Row"];
      };
      salon_today: {
        Args: { p_salon_id?: string | null };
        Returns: string;
      };
      salon_day_start: {
        Args: { p_salon_id?: string | null };
        Returns: string;
      };
      today_stats: {
        Args: Record<string, never>;
        Returns: {
          waiting: number;
          in_progress: number;
          completed_today: number;
          appointments_today: number;
          checked_in: number;
          on_shift: number;
          day_start: string;
        }[];
      };
      floor_status: {
        Args: Record<string, never>;
        Returns: {
          tech_id: string;
          full_name: string;
          skills: Database["public"]["Enums"]["skill"][];
          is_checked_in: boolean;
          shift_start: string | null;
          shift_end: string | null;
          break_until: string | null;
          current_job_id: string | null;
          current_client: string | null;
          current_service: string | null;
          started_at: string | null;
          expected_end: string | null;
          jobs_today: number;
          earnings_today: number;
          last_turn_at: string | null;
          queue_position: number | null;
        }[];
      };
      schedule_overlay: {
        Args: { p_from: string; p_to: string; p_tech_id?: string | null };
        Returns: {
          id: string;
          layer: string;
          kind: string;
          tech_id: string;
          tech_name: string;
          starts_at: string;
          ends_at: string;
          title: string | null;
          status: string | null;
          editable: boolean;
        }[];
      };
      schedule_for_range: {
        Args: { p_from: string; p_to: string; p_tech_id?: string | null };
        Returns: {
          id: string;
          tech_id: string;
          tech_name: string;
          kind: Database["public"]["Enums"]["block_kind"];
          starts_at: string;
          ends_at: string;
          blocked_from: string;
          blocked_to: string;
          buffer_minutes: number;
          title: string | null;
          appointment_id: string | null;
        }[];
      };
      mark_notifications_read: {
        Args: { p_ids?: string[] | null };
        Returns: number;
      };
      seed_default_services: {
        Args: { p_salon_id: string };
        Returns: number;
      };
    };
    Enums: {
      user_role: "super_admin" | "manager" | "admin" | "tech" | "kiosk";
      payment_method: "cash" | "card" | "other";
      skill: "manicure" | "pedicure" | "gel" | "acrylic" | "dip" | "nail_art" | "waxing" | "lash";
      block_kind: "appointment" | "break" | "unavailable";
      shift_kind: "shift" | "break" | "time_off";
      notification_type:
        | "appointment_assigned"
        | "appointment_changed"
        | "appointment_cancelled"
        | "job_assigned";
      job_type: "walk-in" | "appointment";
      job_status: "waiting" | "in_progress" | "completed" | "cancelled";
      appointment_status: "scheduled" | "checked_in" | "completed" | "cancelled";
      service_category: "manicure" | "pedicure" | "enhancement" | "wax" | "addon";
    };
    CompositeTypes: Record<never, never>;
  };
};

type PublicSchema = Database["public"];

export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"];
export type TablesInsert<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Update"];
export type Enums<T extends keyof PublicSchema["Enums"]> = PublicSchema["Enums"][T];
export type FunctionReturns<T extends keyof PublicSchema["Functions"]> =
  PublicSchema["Functions"][T]["Returns"];
