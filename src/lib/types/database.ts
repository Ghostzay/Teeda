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
        };
        Insert: {
          id?: string;
          name: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          created_at?: string;
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
        };
        Insert: {
          id: string;
          salon_id: string;
          full_name: string;
          role?: Database["public"]["Enums"]["user_role"];
          is_active?: boolean;
          last_turn_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          salon_id?: string;
          full_name?: string;
          role?: Database["public"]["Enums"]["user_role"];
          is_active?: boolean;
          last_turn_at?: string | null;
          created_at?: string;
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
      turn_queue: {
        Args: { p_salon_id?: string | null };
        Returns: {
          tech_id: string;
          full_name: string;
          last_turn_at: string | null;
          is_busy: boolean;
          waiting_jobs: number;
          jobs_today: number;
          position: number;
        }[];
      };
      suggest_next_tech: {
        Args: { p_salon_id?: string | null };
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
    };
    Enums: {
      user_role: "manager" | "tech";
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
