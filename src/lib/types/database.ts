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
      salons: {
        Row: {
          id: string;
          name: string;
          created_at: string;
          tech_split_percent: number;
          pay_period_days: number;
          pay_period_anchor: string;
        };
        Insert: {
          id?: string;
          name: string;
          created_at?: string;
          tech_split_percent?: number;
          pay_period_days?: number;
          pay_period_anchor?: string;
        };
        Update: {
          id?: string;
          name?: string;
          created_at?: string;
          tech_split_percent?: number;
          pay_period_days?: number;
          pay_period_anchor?: string;
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
        };
        Insert: {
          id?: string;
          salon_id: string;
          name: string;
          phone?: string | null;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          salon_id?: string;
          name?: string;
          phone?: string | null;
          notes?: string | null;
          created_at?: string;
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
      user_role: "manager" | "admin" | "tech";
      payment_method: "cash" | "card" | "other";
      skill: "manicure" | "pedicure" | "gel" | "acrylic" | "dip" | "nail_art" | "waxing" | "lash";
      notification_type:
        | "appointment_assigned"
        | "appointment_changed"
        | "appointment_cancelled"
        | "job_assigned";
      job_type: "walk-in" | "appointment";
      job_status: "waiting" | "in_progress" | "completed" | "cancelled";
      appointment_status: "scheduled" | "checked_in" | "completed" | "cancelled";
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
