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
      archive_buyer_reveals: {
        Row: {
          buyer_id: string
          ghl_location_id: string
          id: string
          revealed_at: string
        }
        Insert: {
          buyer_id: string
          ghl_location_id: string
          id?: string
          revealed_at?: string
        }
        Update: {
          buyer_id?: string
          ghl_location_id?: string
          id?: string
          revealed_at?: string
        }
        Relationships: []
      }
      archive_buyers: {
        Row: {
          budget_notes: string | null
          buy_box: Json
          city: string | null
          completed_transaction: boolean
          created_at: string
          email: string | null
          exit_strategy: string | null
          first_name: string | null
          full_name: string | null
          id: string
          is_active: boolean
          last_active_at: string | null
          last_name: string | null
          last_outcome: string | null
          national: boolean
          notes: string | null
          phone: string | null
          phone_2: string | null
          preferred_markets: string[]
          preferred_zips: Json
          price_max: number | null
          price_min: number | null
          property_types: string[]
          quality_tier: string | null
          sources: Json
          state: string | null
          updated_at: string
        }
        Insert: {
          budget_notes?: string | null
          buy_box?: Json
          city?: string | null
          completed_transaction?: boolean
          created_at?: string
          email?: string | null
          exit_strategy?: string | null
          first_name?: string | null
          full_name?: string | null
          id?: string
          is_active?: boolean
          last_active_at?: string | null
          last_name?: string | null
          last_outcome?: string | null
          national?: boolean
          notes?: string | null
          phone?: string | null
          phone_2?: string | null
          preferred_markets?: string[]
          preferred_zips?: Json
          price_max?: number | null
          price_min?: number | null
          property_types?: string[]
          quality_tier?: string | null
          sources?: Json
          state?: string | null
          updated_at?: string
        }
        Update: {
          budget_notes?: string | null
          buy_box?: Json
          city?: string | null
          completed_transaction?: boolean
          created_at?: string
          email?: string | null
          exit_strategy?: string | null
          first_name?: string | null
          full_name?: string | null
          id?: string
          is_active?: boolean
          last_active_at?: string | null
          last_name?: string | null
          last_outcome?: string | null
          national?: boolean
          notes?: string | null
          phone?: string | null
          phone_2?: string | null
          preferred_markets?: string[]
          preferred_zips?: Json
          price_max?: number | null
          price_min?: number | null
          property_types?: string[]
          quality_tier?: string | null
          sources?: Json
          state?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      buyer_archive: {
        Row: {
          added_by_user_id: string | null
          created_at: string
          email: string | null
          ghl_location_id: string | null
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
          ghl_location_id?: string | null
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
          ghl_location_id?: string | null
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
          buyer_frequency: string[]
          buyer_status: Database["public"]["Enums"]["buyer_status"]
          buyer_types: string[]
          company_name: string | null
          created_at: string
          criteria_notes: string | null
          deal_count: number
          email: string | null
          experience: string | null
          first_name: string | null
          ghl_location_id: string | null
          id: string
          is_archived: boolean
          last_contact_at: string | null
          last_name: string | null
          markets: string[] | null
          name: string
          other_property_type: string | null
          phone: string | null
          previous_deals: string | null
          price_max: number | null
          price_min: number | null
          proof_of_funds_files: string[]
          property_types: string[] | null
          source: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          buyer_frequency?: string[]
          buyer_status?: Database["public"]["Enums"]["buyer_status"]
          buyer_types?: string[]
          company_name?: string | null
          created_at?: string
          criteria_notes?: string | null
          deal_count?: number
          email?: string | null
          experience?: string | null
          first_name?: string | null
          ghl_location_id?: string | null
          id?: string
          is_archived?: boolean
          last_contact_at?: string | null
          last_name?: string | null
          markets?: string[] | null
          name: string
          other_property_type?: string | null
          phone?: string | null
          previous_deals?: string | null
          price_max?: number | null
          price_min?: number | null
          proof_of_funds_files?: string[]
          property_types?: string[] | null
          source?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          buyer_frequency?: string[]
          buyer_status?: Database["public"]["Enums"]["buyer_status"]
          buyer_types?: string[]
          company_name?: string | null
          created_at?: string
          criteria_notes?: string | null
          deal_count?: number
          email?: string | null
          experience?: string | null
          first_name?: string | null
          ghl_location_id?: string | null
          id?: string
          is_archived?: boolean
          last_contact_at?: string | null
          last_name?: string | null
          markets?: string[] | null
          name?: string
          other_property_type?: string | null
          phone?: string | null
          previous_deals?: string | null
          price_max?: number | null
          price_min?: number | null
          proof_of_funds_files?: string[]
          property_types?: string[] | null
          source?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      credit_action_costs: {
        Row: {
          action_key: string
          credits: number
          id: string
          is_active: boolean
        }
        Insert: {
          action_key: string
          credits: number
          id?: string
          is_active?: boolean
        }
        Update: {
          action_key?: string
          credits?: number
          id?: string
          is_active?: boolean
        }
        Relationships: []
      }
      credit_balances: {
        Row: {
          balance: number
          ghl_location_id: string
          updated_at: string
        }
        Insert: {
          balance?: number
          ghl_location_id: string
          updated_at?: string
        }
        Update: {
          balance?: number
          ghl_location_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      credit_packs: {
        Row: {
          created_at: string
          credits: number
          id: string
          is_active: boolean
          is_featured: boolean
          name: string
          price_cents: number
          sort_order: number
          stripe_price_id: string | null
        }
        Insert: {
          created_at?: string
          credits: number
          id?: string
          is_active?: boolean
          is_featured?: boolean
          name: string
          price_cents: number
          sort_order?: number
          stripe_price_id?: string | null
        }
        Update: {
          created_at?: string
          credits?: number
          id?: string
          is_active?: boolean
          is_featured?: boolean
          name?: string
          price_cents?: number
          sort_order?: number
          stripe_price_id?: string | null
        }
        Relationships: []
      }
      credit_transactions: {
        Row: {
          action_key: string | null
          created_at: string
          delta: number
          description: string | null
          ghl_location_id: string
          id: string
          related_id: string | null
          stripe_session_id: string | null
        }
        Insert: {
          action_key?: string | null
          created_at?: string
          delta: number
          description?: string | null
          ghl_location_id: string
          id?: string
          related_id?: string | null
          stripe_session_id?: string | null
        }
        Update: {
          action_key?: string | null
          created_at?: string
          delta?: number
          description?: string | null
          ghl_location_id?: string
          id?: string
          related_id?: string | null
          stripe_session_id?: string | null
        }
        Relationships: []
      }
      deal_activity: {
        Row: {
          created_at: string
          deal_id: string
          event_type: string
          from_value: string | null
          id: string
          metadata: Json
          to_value: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          deal_id: string
          event_type: string
          from_value?: string | null
          id?: string
          metadata?: Json
          to_value?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          deal_id?: string
          event_type?: string
          from_value?: string | null
          id?: string
          metadata?: Json
          to_value?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      deal_assignees: {
        Row: {
          commission_split: number | null
          created_at: string
          deal_id: string
          id: string
          notes: string | null
          role: string
          team_member_id: string
        }
        Insert: {
          commission_split?: number | null
          created_at?: string
          deal_id: string
          id?: string
          notes?: string | null
          role?: string
          team_member_id: string
        }
        Update: {
          commission_split?: number | null
          created_at?: string
          deal_id?: string
          id?: string
          notes?: string | null
          role?: string
          team_member_id?: string
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
      deal_files: {
        Row: {
          category: string
          created_at: string
          deal_id: string
          file_name: string
          file_path: string
          ghl_location_id: string | null
          id: string
          mime_type: string | null
          size_bytes: number | null
          user_id: string
        }
        Insert: {
          category: string
          created_at?: string
          deal_id: string
          file_name: string
          file_path: string
          ghl_location_id?: string | null
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          deal_id?: string
          file_name?: string
          file_path?: string
          ghl_location_id?: string | null
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_files_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      deals: {
        Row: {
          acquisitions_manager_id: string | null
          arv: number | null
          asking_price: number | null
          assigned_at: string | null
          assignment_fee: number | null
          buyer_id: string | null
          city: string | null
          closed_at: string | null
          closing_date: string | null
          contract_price: number | null
          created_at: string
          emd_amount: number | null
          emd_received: boolean
          emd_received_at: string | null
          ghl_assigned_user_id: string | null
          ghl_contact_id: string | null
          ghl_location_id: string | null
          ghl_opportunity_id: string | null
          ghl_pipeline_id: string | null
          ghl_pipeline_stage_id: string | null
          id: string
          ip_expiry_date: string | null
          jv_partner_id: string | null
          jv_partner_name: string | null
          lead_source: string | null
          marketing_description: string | null
          marketing_name: string | null
          marketing_photos: string[]
          marketing_published: boolean
          minimum_sale_price: number | null
          notes: string | null
          owner_id: string | null
          property_address: string
          seller_email: string | null
          seller_name: string | null
          seller_phone: string | null
          state: string | null
          status: Database["public"]["Enums"]["deal_status"]
          title_company_id: string | null
          updated_at: string
          user_id: string | null
          va_id: string | null
        }
        Insert: {
          acquisitions_manager_id?: string | null
          arv?: number | null
          asking_price?: number | null
          assigned_at?: string | null
          assignment_fee?: number | null
          buyer_id?: string | null
          city?: string | null
          closed_at?: string | null
          closing_date?: string | null
          contract_price?: number | null
          created_at?: string
          emd_amount?: number | null
          emd_received?: boolean
          emd_received_at?: string | null
          ghl_assigned_user_id?: string | null
          ghl_contact_id?: string | null
          ghl_location_id?: string | null
          ghl_opportunity_id?: string | null
          ghl_pipeline_id?: string | null
          ghl_pipeline_stage_id?: string | null
          id?: string
          ip_expiry_date?: string | null
          jv_partner_id?: string | null
          jv_partner_name?: string | null
          lead_source?: string | null
          marketing_description?: string | null
          marketing_name?: string | null
          marketing_photos?: string[]
          marketing_published?: boolean
          minimum_sale_price?: number | null
          notes?: string | null
          owner_id?: string | null
          property_address: string
          seller_email?: string | null
          seller_name?: string | null
          seller_phone?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["deal_status"]
          title_company_id?: string | null
          updated_at?: string
          user_id?: string | null
          va_id?: string | null
        }
        Update: {
          acquisitions_manager_id?: string | null
          arv?: number | null
          asking_price?: number | null
          assigned_at?: string | null
          assignment_fee?: number | null
          buyer_id?: string | null
          city?: string | null
          closed_at?: string | null
          closing_date?: string | null
          contract_price?: number | null
          created_at?: string
          emd_amount?: number | null
          emd_received?: boolean
          emd_received_at?: string | null
          ghl_assigned_user_id?: string | null
          ghl_contact_id?: string | null
          ghl_location_id?: string | null
          ghl_opportunity_id?: string | null
          ghl_pipeline_id?: string | null
          ghl_pipeline_stage_id?: string | null
          id?: string
          ip_expiry_date?: string | null
          jv_partner_id?: string | null
          jv_partner_name?: string | null
          lead_source?: string | null
          marketing_description?: string | null
          marketing_name?: string | null
          marketing_photos?: string[]
          marketing_published?: boolean
          minimum_sale_price?: number | null
          notes?: string | null
          owner_id?: string | null
          property_address?: string
          seller_email?: string | null
          seller_name?: string | null
          seller_phone?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["deal_status"]
          title_company_id?: string | null
          updated_at?: string
          user_id?: string | null
          va_id?: string | null
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
          {
            foreignKeyName: "deals_title_company_id_fkey"
            columns: ["title_company_id"]
            isOneToOne: false
            referencedRelation: "title_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      ghl_dispo_stage_mappings: {
        Row: {
          created_at: string
          ghl_location_id: string
          ghl_pipeline_id: string
          ghl_pipeline_name: string | null
          ghl_stage_id: string
          ghl_stage_name: string | null
          id: string
          updated_at: string
          workspace_owner_user_id: string | null
        }
        Insert: {
          created_at?: string
          ghl_location_id: string
          ghl_pipeline_id: string
          ghl_pipeline_name?: string | null
          ghl_stage_id: string
          ghl_stage_name?: string | null
          id?: string
          updated_at?: string
          workspace_owner_user_id?: string | null
        }
        Update: {
          created_at?: string
          ghl_location_id?: string
          ghl_pipeline_id?: string
          ghl_pipeline_name?: string | null
          ghl_stage_id?: string
          ghl_stage_name?: string | null
          id?: string
          updated_at?: string
          workspace_owner_user_id?: string | null
        }
        Relationships: []
      }
      ghl_location_links: {
        Row: {
          ghl_company_id: string | null
          ghl_location_id: string
          ghl_location_name: string | null
          id: string
          linked_at: string
          linked_by_user_id: string
          user_id: string
          workspace_owner_user_id: string
        }
        Insert: {
          ghl_company_id?: string | null
          ghl_location_id: string
          ghl_location_name?: string | null
          id?: string
          linked_at?: string
          linked_by_user_id: string
          user_id: string
          workspace_owner_user_id: string
        }
        Update: {
          ghl_company_id?: string | null
          ghl_location_id?: string
          ghl_location_name?: string | null
          id?: string
          linked_at?: string
          linked_by_user_id?: string
          user_id?: string
          workspace_owner_user_id?: string
        }
        Relationships: []
      }
      ghl_location_tokens: {
        Row: {
          access_token: string
          created_at: string
          expires_at: string | null
          ghl_company_id: string | null
          ghl_location_id: string | null
          id: string
          location_name: string | null
          refresh_token: string
          updated_at: string
        }
        Insert: {
          access_token: string
          created_at?: string
          expires_at?: string | null
          ghl_company_id?: string | null
          ghl_location_id?: string | null
          id?: string
          location_name?: string | null
          refresh_token: string
          updated_at?: string
        }
        Update: {
          access_token?: string
          created_at?: string
          expires_at?: string | null
          ghl_company_id?: string | null
          ghl_location_id?: string | null
          id?: string
          location_name?: string | null
          refresh_token?: string
          updated_at?: string
        }
        Relationships: []
      }
      jv_partners: {
        Row: {
          company: string | null
          created_at: string
          deal_count: number
          email: string | null
          ghl_location_id: string | null
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
          ghl_location_id?: string | null
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
          ghl_location_id?: string | null
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
          ghl_location_id: string | null
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
          ghl_location_id?: string | null
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
          ghl_location_id?: string | null
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
      location_memberships: {
        Row: {
          created_at: string
          id: string
          is_owner: boolean
          joined_at: string
          location_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_owner?: boolean
          joined_at?: string
          location_id: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_owner?: boolean
          joined_at?: string
          location_id?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          ghl_location_id: string | null
          id: string
          is_read: boolean
          link_url: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          ghl_location_id?: string | null
          id?: string
          is_read?: boolean
          link_url?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          ghl_location_id?: string | null
          id?: string
          is_read?: boolean
          link_url?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      oauth_access_tokens: {
        Row: {
          access_token: string
          client_id: string
          created_at: string
          expires_at: string
          ghl_location_id: string | null
          refresh_token: string
          scope: string
          user_id: string
        }
        Insert: {
          access_token: string
          client_id: string
          created_at?: string
          expires_at: string
          ghl_location_id?: string | null
          refresh_token: string
          scope?: string
          user_id: string
        }
        Update: {
          access_token?: string
          client_id?: string
          created_at?: string
          expires_at?: string
          ghl_location_id?: string | null
          refresh_token?: string
          scope?: string
          user_id?: string
        }
        Relationships: []
      }
      oauth_authorization_codes: {
        Row: {
          client_id: string
          code: string
          created_at: string
          expires_at: string
          ghl_location_id: string | null
          redirect_uri: string
          scope: string
          used: boolean
          user_id: string
        }
        Insert: {
          client_id: string
          code: string
          created_at?: string
          expires_at: string
          ghl_location_id?: string | null
          redirect_uri: string
          scope?: string
          used?: boolean
          user_id: string
        }
        Update: {
          client_id?: string
          code?: string
          created_at?: string
          expires_at?: string
          ghl_location_id?: string | null
          redirect_uri?: string
          scope?: string
          used?: boolean
          user_id?: string
        }
        Relationships: []
      }
      oauth_clients: {
        Row: {
          client_id: string
          client_secret_hash: string
          created_at: string
          id: string
          name: string
          redirect_uris: string[]
          scopes: string[]
        }
        Insert: {
          client_id: string
          client_secret_hash: string
          created_at?: string
          id?: string
          name: string
          redirect_uris?: string[]
          scopes?: string[]
        }
        Update: {
          client_id?: string
          client_secret_hash?: string
          created_at?: string
          id?: string
          name?: string
          redirect_uris?: string[]
          scopes?: string[]
        }
        Relationships: []
      }
      oauth_install_log: {
        Row: {
          company_id: string | null
          created_at: string
          error: string | null
          id: string
          location_id: string | null
          payload: Json | null
          source: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          location_id?: string | null
          payload?: Json | null
          source: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          location_id?: string | null
          payload?: Json | null
          source?: string
        }
        Relationships: []
      }
      pending_invites: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by_user_id: string
          location_id: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by_user_id: string
          location_id: string
          token: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by_user_id?: string
          location_id?: string
          token?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          default_checklist: string[]
          email: string | null
          ghl_location_id: string | null
          ghl_user_id: string | null
          id: string
          last_active_at: string | null
          name: string | null
          notification_prefs: Json
          phone_number: string | null
          subscription_status: Database["public"]["Enums"]["subscription_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          default_checklist?: string[]
          email?: string | null
          ghl_location_id?: string | null
          ghl_user_id?: string | null
          id?: string
          last_active_at?: string | null
          name?: string | null
          notification_prefs?: Json
          phone_number?: string | null
          subscription_status?: Database["public"]["Enums"]["subscription_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          default_checklist?: string[]
          email?: string | null
          ghl_location_id?: string | null
          ghl_user_id?: string | null
          id?: string
          last_active_at?: string | null
          name?: string | null
          notification_prefs?: Json
          phone_number?: string | null
          subscription_status?: Database["public"]["Enums"]["subscription_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      subscription_plans: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          price_cents: number
          sort_order: number
          stripe_price_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          price_cents: number
          sort_order?: number
          stripe_price_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          price_cents?: number
          sort_order?: number
          stripe_price_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          created_at: string
          current_period_end: string | null
          ghl_location_id: string
          id: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_plan_id: string | null
          subscription_status: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_period_end?: string | null
          ghl_location_id: string
          id?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_plan_id?: string | null
          subscription_status?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_period_end?: string | null
          ghl_location_id?: string
          id?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_plan_id?: string | null
          subscription_status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_subscription_plan_id_fkey"
            columns: ["subscription_plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assignee_id: string | null
          created_at: string
          deal_id: string | null
          description: string | null
          due_date: string | null
          ghl_location_id: string | null
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
          ghl_location_id?: string | null
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
          ghl_location_id?: string | null
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
      team_members: {
        Row: {
          created_at: string
          email: string | null
          ghl_location_id: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          role: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          ghl_location_id?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          role?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          ghl_location_id?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          role?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      title_companies: {
        Row: {
          address: string | null
          charges_file_fee: boolean
          contact_name: string | null
          created_at: string
          deal_types: string[]
          email: string | null
          file_fee_amount: number | null
          ghl_location_id: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          service_cities: string[]
          service_states: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          charges_file_fee?: boolean
          contact_name?: string | null
          created_at?: string
          deal_types?: string[]
          email?: string | null
          file_fee_amount?: number | null
          ghl_location_id?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          service_cities?: string[]
          service_states?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          charges_file_fee?: boolean
          contact_name?: string | null
          created_at?: string
          deal_types?: string[]
          email?: string | null
          file_fee_amount?: number | null
          ghl_location_id?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          service_cities?: string[]
          service_states?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
      webhook_debug_log: {
        Row: {
          body: Json | null
          function_name: string
          headers: Json | null
          id: string
          ip: string | null
          method: string | null
          received_at: string
          user_agent: string | null
        }
        Insert: {
          body?: Json | null
          function_name: string
          headers?: Json | null
          id?: string
          ip?: string | null
          method?: string | null
          received_at?: string
          user_agent?: string | null
        }
        Update: {
          body?: Json | null
          function_name?: string
          headers?: Json | null
          id?: string
          ip?: string | null
          method?: string | null
          received_at?: string
          user_agent?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      consume_credits: {
        Args: { p_action: string; p_location: string; p_related_id?: string }
        Returns: boolean
      }
      current_ghl_location: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_location_member: {
        Args: { _location_id: string; _user_id: string }
        Returns: boolean
      }
      is_location_owner: {
        Args: { _location_id: string; _user_id: string }
        Returns: boolean
      }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      reveal_archive_buyer: {
        Args: { p_buyer_id: string; p_location: string }
        Returns: Json
      }
    }
    Enums: {
      app_role: "admin" | "user" | "super_admin"
      buyer_status: "not_vetted" | "vetted" | "repeat" | "recurring"
      deal_status:
        | "lead"
        | "active"
        | "under_contract"
        | "closed"
        | "dead"
        | "title_issues"
        | "seller_issue"
        | "could_not_sell"
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
      app_role: ["admin", "user", "super_admin"],
      buyer_status: ["not_vetted", "vetted", "repeat", "recurring"],
      deal_status: [
        "lead",
        "active",
        "under_contract",
        "closed",
        "dead",
        "title_issues",
        "seller_issue",
        "could_not_sell",
      ],
      subscription_status: ["active", "trialing", "cancelled", "past_due"],
      task_priority: ["low", "medium", "high"],
    },
  },
} as const
