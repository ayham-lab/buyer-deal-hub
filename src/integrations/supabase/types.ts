export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      buyer_archive: {
        Row: {
          added_by_user_id: string | null
          created_at: string
          email: string | null
          id: string
          is_shared: boolean
          markets: string[] | null
          name: string
          phone: string | null
          price_max: number | null
          price_min: number | null
          property_types: string[] | null
          source: string | null
        }
        Insert: {
          added_by_user_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_shared?: boolean
          markets?: string[] | null
          name: string
          phone?: string | null
          price_max?: number | null
          price_min?: number | null
          property_types?: string[] | null
          source?: string | null
        }
        Update: {
          added_by_user_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_shared?: boolean
          markets?: string[] | null
          name?: string
          phone?: string | null
          price_max?: number | null
          price_min?: number | null
          property_types?: string[] | null
          source?: string | null
        }
        Relationships: []
      }
      buyers: {
        Row: {
          created_at: string
          criteria_notes: string | null
          deal_count: number
          email: string | null
          id: string
          is_archived: boolean
          last_contact_at: string | null
          markets: string[] | null
          name: string
          phone: string | null
          price_max: number | null
          price_min: number | null
          property_types: string[] | null
          source: string | null
          tags: string[] | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          criteria_notes?: string | null
          deal_count?: number
          email?: string | null
          id?: string
          is_archived?: boolean
          last_contact_at?: string | null
          markets?: string[] | null
          name: string
          phone?: string | null
          price_max?: number | null
          price_min?: number | null
          property_types?: string[] | null
          source?: string | null
          tags?: string[] | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          criteria_notes?: string | null
          deal_count?: number
          email?: string | null
          id?: string
          is_archived?: boolean
          last_contact_at?: string | null
          markets?: string[] | null
          name?: string
          phone?: string | null
          price_max?: number | null
          price_min?: number | null
          property_types?: string[] | null
          source?: string | null
          tags?: string[] | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      deal_checklist: {
        Row: {
          created_at: string
          deal_id: string
          due_date: string | null
          id: string
          is_completed: boolean
          item_text: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          deal_id: string
          due_date?: string | null
          id?: string
          is_completed?: boolean
          item_text: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          deal_id?: string
          due_date?: string | null
          id?: string
          is_completed?: boolean
          item_text?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "deal_checklist_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      deals: {
        Row: {
          arv: number | null
          asking_price: number | null
          assignment_fee: number | null
          buyer_id: string | null
          city: string | null
          closing_date: string | null
          created_at: string
          emd_amount: number | null
          emd_received: boolean
          id: string
          ip_expiry_date: string | null
          jv_partner_id: string | null
          lead_source: string | null
          notes: string | null
          property_address: string
          state: string | null
          status: Database["public"]["Enums"]["deal_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          arv?: number | null
          asking_price?: number | null
          assignment_fee?: number | null
          buyer_id?: string | null
          city?: string | null
          closing_date?: string | null
          created_at?: string
          emd_amount?: number | null
          emd_received?: boolean
          id?: string
          ip_expiry_date?: string | null
          jv_partner_id?: string | null
          lead_source?: string | null
          notes?: string | null
          property_address: string
          state?: string | null
          status?: Database["public"]["Enums"]["deal_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          arv?: number | null
          asking_price?: number | null
          assignment_fee?: number | null
          buyer_id?: string | null
          city?: string | null
          closing_date?: string | null
          created_at?: string
          emd_amount?: number | null
          emd_received?: boolean
          id?: string
          ip_expiry_date?: string | null
          jv_partner_id?: string | null
          lead_source?: string | null
          notes?: string | null
          property_address?: string
          state?: string | null
          status?: Database["public"]["Enums"]["deal_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deals_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "buyers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_jv_partner_id_fkey"
            columns: ["jv_partner_id"]
            isOneToOne: false
            referencedRelation: "jv_partners"
            referencedColumns: ["id"]
          },
        ]
      }
      jv_partners: {
        Row: {
          company: string | null
          created_at: string
          deal_count: number
          email: string | null
          id: string
          name: string
          phone: string | null
          total_assigned_fees: number
          updated_at: string
          user_id: string
        }
        Insert: {
          company?: string | null
          created_at?: string
          deal_count?: number
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          total_assigned_fees?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          company?: string | null
          created_at?: string
          deal_count?: number
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          total_assigned_fees?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      kpi_snapshots: {
        Row: {
          avg_assignment_fee: number
          contract_conversion_rate: number
          created_at: string
          deals_closed: number
          deals_opened: number
          id: string
          month: number
          revenue_closed: number
          revenue_created: number
          top_lead_source: string | null
          user_id: string
          year: number
        }
        Insert: {
          avg_assignment_fee?: number
          contract_conversion_rate?: number
          created_at?: string
          deals_closed?: number
          deals_opened?: number
          id?: string
          month: number
          revenue_closed?: number
          revenue_created?: number
          top_lead_source?: string | null
          user_id: string
          year: number
        }
        Update: {
          avg_assignment_fee?: number
          contract_conversion_rate?: number
          created_at?: string
          deals_closed?: number
          deals_opened?: number
          id?: string
          month?: number
          revenue_closed?: number
          revenue_created?: number
          top_lead_source?: string | null
          user_id?: string
          year?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          ghl_location_id: string | null
          ghl_user_id: string | null
          id: string
          last_active_at: string | null
          name: string | null
          subscription_status: Database["public"]["Enums"]["subscription_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          ghl_location_id?: string | null
          ghl_user_id?: string | null
          id?: string
          last_active_at?: string | null
          name?: string | null
          subscription_status?: Database["public"]["Enums"]["subscription_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          ghl_location_id?: string | null
          ghl_user_id?: string | null
          id?: string
          last_active_at?: string | null
          name?: string | null
          subscription_status?: Database["public"]["Enums"]["subscription_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          assignee_id: string | null
          created_at: string
          deal_id: string | null
          description: string | null
          due_date: string | null
          id: string
          is_completed: boolean
          priority: Database["public"]["Enums"]["task_priority"]
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assignee_id?: string | null
          created_at?: string
          deal_id?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          is_completed?: boolean
          priority?: Database["public"]["Enums"]["task_priority"]
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assignee_id?: string | null
          created_at?: string
          deal_id?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          is_completed?: boolean
          priority?: Database["public"]["Enums"]["task_priority"]
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "user"
      deal_status: "lead" | "active" | "under_contract" | "closed" | "dead"
      subscription_status: "active" | "trialing" | "cancelled" | "past_due"
      task_priority: "low" | "medium" | "high"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
      deal_status: ["lead", "active", "under_contract", "closed", "dead"],
      subscription_status: ["active", "trialing", "cancelled", "past_due"],
      task_priority: ["low", "medium", "high"],
    },
  },
} as const
