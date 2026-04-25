export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      households: {
        Row: {
          id: string
          user_count: number
          telegram_chat_id: string | null
          telegram_chat_id_enc: string | null
          telegram_chat_id_hash: string | null
          telegram_bot_token: string | null
          telegram_bot_token_enc: string | null
          onboarding_completed_at: string | null
          account_type: string
          is_super_admin: boolean
          created_at: string
        }
        Insert: {
          id?: string
          user_count?: number
          telegram_chat_id?: string | null
          telegram_chat_id_enc?: string | null
          telegram_chat_id_hash?: string | null
          telegram_bot_token?: string | null
          telegram_bot_token_enc?: string | null
          onboarding_completed_at?: string | null
          account_type?: string
          is_super_admin?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          user_count?: number
          telegram_chat_id?: string | null
          telegram_chat_id_enc?: string | null
          telegram_chat_id_hash?: string | null
          telegram_bot_token?: string | null
          telegram_bot_token_enc?: string | null
          onboarding_completed_at?: string | null
          account_type?: string
          is_super_admin?: boolean
          created_at?: string
        }
        Relationships: []
      }
      families: {
        Row: {
          id: string
          household_id: string
          name: string
          name_enc: string | null
          user_count: number
          created_at: string
        }
        Insert: {
          id?: string
          household_id: string
          name?: string
          name_enc?: string | null
          user_count?: number
          created_at?: string
        }
        Update: {
          id?: string
          household_id?: string
          name?: string
          name_enc?: string | null
          user_count?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "families_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          id: string
          family_id: string
          name: string
          name_enc: string | null
          name_hash: string | null
          telegram_user_id: string | null
          telegram_user_id_enc: string | null
          telegram_user_id_hash: string | null
          telegram_username: string | null
          telegram_username_enc: string | null
          telegram_username_hash: string | null
          telegram_chat_id: string | null
          telegram_chat_id_enc: string | null
          telegram_chat_id_hash: string | null
          telegram_link_token: string | null
          telegram_link_token_enc: string | null
          telegram_link_token_hash: string | null
          telegram_last_used: string | null
          birth_year: number
          birth_year_enc: string | null
          optional_onboarding_completed_at: string | null
          dps_include_in_projection: boolean
          self_help_group: string
          marital_status: string | null
          num_dependents: number
          primary_bank_account_id: string | null
          gender: string | null
          spouse_profile_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          family_id: string
          name: string
          name_enc?: string | null
          name_hash?: string | null
          telegram_user_id?: string | null
          telegram_user_id_enc?: string | null
          telegram_user_id_hash?: string | null
          telegram_username?: string | null
          telegram_username_enc?: string | null
          telegram_username_hash?: string | null
          telegram_chat_id?: string | null
          telegram_chat_id_enc?: string | null
          telegram_chat_id_hash?: string | null
          telegram_link_token?: string | null
          telegram_link_token_enc?: string | null
          telegram_link_token_hash?: string | null
          telegram_last_used?: string | null
          birth_year: number
          birth_year_enc?: string | null
          optional_onboarding_completed_at?: string | null
          dps_include_in_projection?: boolean
          self_help_group?: string
          marital_status?: string | null
          num_dependents?: number
          primary_bank_account_id?: string | null
          gender?: string | null
          spouse_profile_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          family_id?: string
          name?: string
          name_enc?: string | null
          name_hash?: string | null
          telegram_user_id?: string | null
          telegram_user_id_enc?: string | null
          telegram_user_id_hash?: string | null
          telegram_username?: string | null
          telegram_username_enc?: string | null
          telegram_username_hash?: string | null
          telegram_chat_id?: string | null
          telegram_chat_id_enc?: string | null
          telegram_chat_id_hash?: string | null
          telegram_link_token?: string | null
          telegram_link_token_enc?: string | null
          telegram_link_token_hash?: string | null
          telegram_last_used?: string | null
          birth_year?: number
          birth_year_enc?: string | null
          optional_onboarding_completed_at?: string | null
          dps_include_in_projection?: boolean
          self_help_group?: string
          marital_status?: string | null
          num_dependents?: number
          primary_bank_account_id?: string | null
          gender?: string | null
          spouse_profile_id?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      otp_tokens: {
        Row: {
          id: string
          household_id: string
          otp_hash: string
          expires_at: string
          used: boolean
          ip_address: string | null
          created_at: string
        }
        Insert: {
          id?: string
          household_id: string
          otp_hash: string
          expires_at: string
          used?: boolean
          ip_address?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          household_id?: string
          otp_hash?: string
          expires_at?: string
          used?: boolean
          ip_address?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "otp_tokens_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      link_api_keys: {
        Row: {
          id: string
          household_id: string
          api_key_hash: string
          key_prefix: string
          name: string | null
          max_members: number
          created_at: string
        }
        Insert: {
          id?: string
          household_id: string
          api_key_hash: string
          key_prefix: string
          name?: string | null
          max_members?: number
          created_at?: string
        }
        Update: {
          id?: string
          household_id?: string
          api_key_hash?: string
          key_prefix?: string
          name?: string | null
          max_members?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "link_api_keys_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      linked_telegram_accounts: {
        Row: {
          id: string
          link_api_key_id: string
          household_id: string
          telegram_user_id: string
          telegram_user_id_enc: string | null
          telegram_user_id_hash: string | null
          telegram_username: string | null
          telegram_username_enc: string | null
          telegram_username_hash: string | null
          telegram_chat_id: string
          telegram_chat_id_enc: string | null
          telegram_chat_id_hash: string | null
          linked_at: string
        }
        Insert: {
          id?: string
          link_api_key_id: string
          household_id: string
          telegram_user_id: string
          telegram_user_id_enc?: string | null
          telegram_user_id_hash?: string | null
          telegram_username?: string | null
          telegram_username_enc?: string | null
          telegram_username_hash?: string | null
          telegram_chat_id: string
          telegram_chat_id_enc?: string | null
          telegram_chat_id_hash?: string | null
          linked_at?: string
        }
        Update: {
          id?: string
          link_api_key_id?: string
          household_id?: string
          telegram_user_id?: string
          telegram_user_id_enc?: string | null
          telegram_user_id_hash?: string | null
          telegram_username?: string | null
          telegram_username_enc?: string | null
          telegram_username_hash?: string | null
          telegram_chat_id?: string
          telegram_chat_id_enc?: string | null
          telegram_chat_id_hash?: string | null
          linked_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "linked_telegram_accounts_link_api_key_id_fkey"
            columns: ["link_api_key_id"]
            isOneToOne: false
            referencedRelation: "link_api_keys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "linked_telegram_accounts_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      signup_codes: {
        Row: {
          id: string
          type: string
          code: string
          household_id: string | null
          telegram_username: string | null
          telegram_username_enc: string | null
          telegram_username_hash: string | null
          target_profile_id: string | null
          created_by_household_id: string | null
          used: boolean
          used_by_telegram_user_id: string | null
          used_by_telegram_user_id_enc: string | null
          used_by_telegram_user_id_hash: string | null
          expires_at: string
          created_at: string
        }
        Insert: {
          id?: string
          type: string
          code: string
          household_id?: string | null
          telegram_username?: string | null
          telegram_username_enc?: string | null
          telegram_username_hash?: string | null
          target_profile_id?: string | null
          created_by_household_id?: string | null
          used?: boolean
          used_by_telegram_user_id?: string | null
          used_by_telegram_user_id_enc?: string | null
          used_by_telegram_user_id_hash?: string | null
          expires_at: string
          created_at?: string
        }
        Update: {
          id?: string
          type?: string
          code?: string
          household_id?: string | null
          telegram_username?: string | null
          telegram_username_enc?: string | null
          telegram_username_hash?: string | null
          target_profile_id?: string | null
          created_by_household_id?: string | null
          used?: boolean
          used_by_telegram_user_id?: string | null
          used_by_telegram_user_id_enc?: string | null
          used_by_telegram_user_id_hash?: string | null
          expires_at?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "signup_codes_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signup_codes_target_profile_id_fkey"
            columns: ["target_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signup_codes_created_by_household_id_fkey"
            columns: ["created_by_household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_accounts: {
        Row: {
          id: string
          family_id: string
          profile_id: string | null
          bank_name: string
          account_type: string
          account_number: string | null
          account_number_enc: string | null
          account_number_hash: string | null
          account_number_last4: string | null
          interest_rate_pct: number | null
          opening_balance: number
          created_at: string
        }
        Insert: {
          id?: string
          family_id: string
          profile_id?: string | null
          bank_name: string
          account_type?: string
          account_number?: string | null
          account_number_enc?: string | null
          account_number_hash?: string | null
          account_number_last4?: string | null
          interest_rate_pct?: number | null
          opening_balance?: number
          created_at?: string
        }
        Update: {
          id?: string
          family_id?: string
          profile_id?: string | null
          bank_name?: string
          account_type?: string
          account_number?: string | null
          account_number_enc?: string | null
          account_number_hash?: string | null
          account_number_last4?: string | null
          interest_rate_pct?: number | null
          opening_balance?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_accounts_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_accounts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      giro_rules: {
        Row: {
          id: string
          family_id: string
          profile_id: string | null
          source_bank_account_id: string
          amount: number
          destination_type: string
          destination_bank_account_id: string | null
          is_active: boolean
          linked_entity_type: string | null
          linked_entity_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          family_id: string
          profile_id?: string | null
          source_bank_account_id: string
          amount: number
          destination_type: string
          destination_bank_account_id?: string | null
          is_active?: boolean
          linked_entity_type?: string | null
          linked_entity_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          family_id?: string
          profile_id?: string | null
          source_bank_account_id?: string
          amount?: number
          destination_type?: string
          destination_bank_account_id?: string | null
          is_active?: boolean
          linked_entity_type?: string | null
          linked_entity_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "giro_rules_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "giro_rules_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "giro_rules_source_bank_account_id_fkey"
            columns: ["source_bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "giro_rules_destination_bank_account_id_fkey"
            columns: ["destination_bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_cashflow: {
        Row: {
          id: string
          profile_id: string
          month: string
          inflow: number
          outflow: number
          source: string
          created_at: string
          updated_at: string
          inflow_memo: string | null
          outflow_memo: string | null
          is_auto_generated: boolean
          inflow_enc: string | null
          outflow_enc: string | null
        }
        Insert: {
          id?: string
          profile_id: string
          month: string
          inflow?: number
          outflow?: number
          source?: string
          created_at?: string
          updated_at?: string
          inflow_memo?: string | null
          outflow_memo?: string | null
          is_auto_generated?: boolean
          inflow_enc?: string | null
          outflow_enc?: string | null
        }
        Update: {
          id?: string
          profile_id?: string
          month?: string
          inflow?: number
          outflow?: number
          source?: string
          created_at?: string
          updated_at?: string
          inflow_memo?: string | null
          outflow_memo?: string | null
          is_auto_generated?: boolean
          inflow_enc?: string | null
          outflow_enc?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "monthly_cashflow_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_balance_snapshots: {
        Row: {
          id: string
          account_id: string
          month: string
          opening_balance: number
          closing_balance: number
          is_reconciliation: boolean
          created_at: string
        }
        Insert: {
          id?: string
          account_id: string
          month: string
          opening_balance: number
          closing_balance: number
          is_reconciliation?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          account_id?: string
          month?: string
          opening_balance?: number
          closing_balance?: number
          is_reconciliation?: boolean
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_balance_snapshots_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      savings_goals: {
        Row: {
          id: string
          family_id: string
          profile_id: string | null
          name: string
          target_amount: number
          current_amount: number
          monthly_auto_amount: number
          deadline: string | null
          category: string
          linked_bank_account_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          family_id: string
          profile_id?: string | null
          name: string
          target_amount: number
          current_amount?: number
          monthly_auto_amount?: number
          deadline?: string | null
          category: string
          linked_bank_account_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          family_id?: string
          profile_id?: string | null
          name?: string
          target_amount?: number
          current_amount?: number
          monthly_auto_amount?: number
          deadline?: string | null
          category?: string
          linked_bank_account_id?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "savings_goals_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_goals_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      goal_contributions: {
        Row: {
          id: string
          goal_id: string
          amount: number
          source: string
          created_at: string
        }
        Insert: {
          id?: string
          goal_id: string
          amount: number
          source: string
          created_at?: string
        }
        Update: {
          id?: string
          goal_id?: string
          amount?: number
          source?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "goal_contributions_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "savings_goals"
            referencedColumns: ["id"]
          },
        ]
      }
      investments: {
        Row: {
          id: string
          family_id: string
          profile_id: string | null
          type: string
          symbol: string
          units: number
          cost_basis: number
          target_allocation_pct: number | null
          account_id: string | null
          created_at: string
          date_added: string | null
        }
        Insert: {
          id?: string
          family_id: string
          profile_id?: string | null
          type: string
          symbol: string
          units?: number
          cost_basis?: number
          target_allocation_pct?: number | null
          account_id?: string | null
          created_at?: string
          date_added?: string | null
        }
        Update: {
          id?: string
          family_id?: string
          profile_id?: string | null
          type?: string
          symbol?: string
          units?: number
          cost_basis?: number
          target_allocation_pct?: number | null
          account_id?: string | null
          created_at?: string
          date_added?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "investments_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "investment_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investments_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investments_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      investment_accounts: {
        Row: {
          id: string
          family_id: string
          profile_id: string | null
          cash_balance: number
          account_name: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          family_id: string
          profile_id?: string | null
          cash_balance?: number
          account_name?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          family_id?: string
          profile_id?: string | null
          cash_balance?: number
          account_name?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "investment_accounts_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investment_accounts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      investment_tabs: {
        Row: {
          id: string
          family_id: string
          tab_type: string
          tab_label: string
          sort_order: number
          is_visible: boolean
          created_at: string
        }
        Insert: {
          id?: string
          family_id: string
          tab_type: string
          tab_label: string
          sort_order?: number
          is_visible?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          family_id?: string
          tab_type?: string
          tab_label?: string
          sort_order?: number
          is_visible?: boolean
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "investment_tabs_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      collectible_cards: {
        Row: {
          id: string
          family_id: string
          profile_id: string
          tab_id: string
          name: string
          type_label: string
          purchase_price: number
          current_value: number | null
          value_updated_at: string | null
          set_name: string | null
          franchise: string | null
          language: string | null
          edition: string | null
          card_number: string | null
          grading_company: string | null
          grade: number | null
          cert_number: string | null
          condition: string | null
          rarity: string | null
          quantity: number
          purchase_date: string | null
          notes: string | null
          image_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          family_id: string
          profile_id: string
          tab_id: string
          name: string
          type_label?: string
          purchase_price: number
          current_value?: number | null
          value_updated_at?: string | null
          set_name?: string | null
          franchise?: string | null
          language?: string | null
          edition?: string | null
          card_number?: string | null
          grading_company?: string | null
          grade?: number | null
          cert_number?: string | null
          condition?: string | null
          rarity?: string | null
          quantity?: number
          purchase_date?: string | null
          notes?: string | null
          image_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          family_id?: string
          profile_id?: string
          tab_id?: string
          name?: string
          type_label?: string
          purchase_price?: number
          current_value?: number | null
          value_updated_at?: string | null
          set_name?: string | null
          franchise?: string | null
          language?: string | null
          edition?: string | null
          card_number?: string | null
          grading_company?: string | null
          grade?: number | null
          cert_number?: string | null
          condition?: string | null
          rarity?: string | null
          quantity?: number
          purchase_date?: string | null
          notes?: string | null
          image_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "collectible_cards_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collectible_cards_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collectible_cards_tab_id_fkey"
            columns: ["tab_id"]
            isOneToOne: false
            referencedRelation: "investment_tabs"
            referencedColumns: ["id"]
          },
        ]
      }
      collectible_others: {
        Row: {
          id: string
          family_id: string
          profile_id: string
          tab_id: string
          name: string
          type_label: string
          purchase_price: number
          current_value: number | null
          value_updated_at: string | null
          brand: string | null
          description: string | null
          condition: string | null
          quantity: number
          purchase_date: string | null
          notes: string | null
          image_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          family_id: string
          profile_id: string
          tab_id: string
          name: string
          type_label?: string
          purchase_price: number
          current_value?: number | null
          value_updated_at?: string | null
          brand?: string | null
          description?: string | null
          condition?: string | null
          quantity?: number
          purchase_date?: string | null
          notes?: string | null
          image_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          family_id?: string
          profile_id?: string
          tab_id?: string
          name?: string
          type_label?: string
          purchase_price?: number
          current_value?: number | null
          value_updated_at?: string | null
          brand?: string | null
          description?: string | null
          condition?: string | null
          quantity?: number
          purchase_date?: string | null
          notes?: string | null
          image_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "collectible_others_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collectible_others_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collectible_others_tab_id_fkey"
            columns: ["tab_id"]
            isOneToOne: false
            referencedRelation: "investment_tabs"
            referencedColumns: ["id"]
          },
        ]
      }
      investment_snapshots: {
        Row: {
          id: string
          family_id: string
          profile_id: string | null
          date: string
          total_value: number
          created_at: string
        }
        Insert: {
          id?: string
          family_id: string
          profile_id?: string | null
          date: string
          total_value: number
          created_at?: string
        }
        Update: {
          id?: string
          family_id?: string
          profile_id?: string | null
          date?: string
          total_value?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "investment_snapshots_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investment_snapshots_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      investment_transactions: {
        Row: {
          id: string
          investment_id: string | null
          family_id: string
          profile_id: string | null
          account_id: string | null
          type: string
          symbol: string
          quantity: number
          price: number
          commission: number
          journal_text: string | null
          screenshot_url: string | null
          created_at: string
        }
        Insert: {
          id?: string
          investment_id?: string | null
          family_id: string
          profile_id?: string | null
          account_id?: string | null
          type: string
          symbol: string
          quantity: number
          price: number
          commission?: number
          journal_text?: string | null
          screenshot_url?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          investment_id?: string | null
          family_id?: string
          profile_id?: string | null
          account_id?: string | null
          type?: string
          symbol?: string
          quantity?: number
          price?: number
          commission?: number
          journal_text?: string | null
          screenshot_url?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "investment_transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "investment_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investment_transactions_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investment_transactions_investment_id_fkey"
            columns: ["investment_id"]
            isOneToOne: false
            referencedRelation: "investments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investment_transactions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ilp_fund_group_members: {
        Row: {
          id: string
          fund_group_id: string
          product_id: string
          allocation_pct: number
          created_at: string
        }
        Insert: {
          id?: string
          fund_group_id: string
          product_id: string
          allocation_pct?: number
          created_at?: string
        }
        Update: {
          id?: string
          fund_group_id?: string
          product_id?: string
          allocation_pct?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ilp_fund_group_members_fund_group_id_fkey"
            columns: ["fund_group_id"]
            isOneToOne: false
            referencedRelation: "ilp_fund_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ilp_fund_group_members_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "ilp_products"
            referencedColumns: ["id"]
          },
        ]
      }
      ilp_fund_groups: {
        Row: {
          id: string
          family_id: string
          name: string
          group_premium_amount: number | null
          premium_payment_mode: string
          profile_id: string | null
          total_invested: number | null
          created_at: string
        }
        Insert: {
          id?: string
          family_id: string
          name: string
          group_premium_amount?: number | null
          premium_payment_mode?: string
          profile_id?: string | null
          total_invested?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          family_id?: string
          name?: string
          group_premium_amount?: number | null
          premium_payment_mode?: string
          profile_id?: string | null
          total_invested?: number | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ilp_fund_groups_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ilp_fund_groups_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ilp_products: {
        Row: {
          id: string
          family_id: string
          profile_id: string | null
          name: string
          monthly_premium: number
          end_date: string
          premium_payment_mode: string
          deduction_bank_account_id: string | null
          start_date: string | null
          created_at: string
        }
        Insert: {
          id?: string
          family_id: string
          profile_id?: string | null
          name: string
          monthly_premium: number
          end_date: string
          premium_payment_mode?: string
          deduction_bank_account_id?: string | null
          start_date?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          family_id?: string
          profile_id?: string | null
          name?: string
          monthly_premium?: number
          end_date?: string
          premium_payment_mode?: string
          deduction_bank_account_id?: string | null
          start_date?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ilp_products_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ilp_products_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ilp_entries: {
        Row: {
          id: string
          product_id: string
          month: string
          fund_value: number
          premiums_paid: number | null
          fund_report_snapshot: Record<string, unknown> | null
          created_at: string
        }
        Insert: {
          id?: string
          product_id: string
          month: string
          fund_value: number
          premiums_paid?: number | null
          fund_report_snapshot?: Record<string, unknown> | null
          created_at?: string
        }
        Update: {
          id?: string
          product_id?: string
          month?: string
          fund_value?: number
          premiums_paid?: number | null
          fund_report_snapshot?: Record<string, unknown> | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ilp_entries_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "ilp_products"
            referencedColumns: ["id"]
          },
        ]
      }
      cpf_balances: {
        Row: {
          id: string
          profile_id: string
          month: string
          oa: number
          sa: number
          ma: number
          oa_enc: string | null
          sa_enc: string | null
          ma_enc: string | null
          is_manual_override: boolean
          created_at: string
        }
        Insert: {
          id?: string
          profile_id: string
          month: string
          oa?: number
          sa?: number
          ma?: number
          oa_enc?: string | null
          sa_enc?: string | null
          ma_enc?: string | null
          is_manual_override?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          profile_id?: string
          month?: string
          oa?: number
          sa?: number
          ma?: number
          oa_enc?: string | null
          sa_enc?: string | null
          ma_enc?: string | null
          is_manual_override?: boolean
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cpf_balances_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cpf_housing_usage: {
        Row: {
          id: string
          loan_id: string
          profile_id: string | null
          principal_withdrawn: number
          accrued_interest: number
          withdrawal_date: string
          usage_type: string | null
          loan_repayment_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          loan_id: string
          profile_id?: string | null
          principal_withdrawn: number
          accrued_interest?: number
          withdrawal_date: string
          usage_type?: string | null
          loan_repayment_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          loan_id?: string
          profile_id?: string | null
          principal_withdrawn?: number
          accrued_interest?: number
          withdrawal_date?: string
          usage_type?: string | null
          loan_repayment_id?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cpf_housing_usage_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cpf_housing_usage_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cpf_healthcare_config: {
        Row: {
          id: string
          profile_id: string
          msl_annual_override: number | null
          csl_annual: number
          csl_supplement_annual: number
          isp_annual: number
          msl_annual_override_enc: string | null
          csl_annual_enc: string | null
          csl_supplement_annual_enc: string | null
          isp_annual_enc: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          profile_id: string
          msl_annual_override?: number | null
          csl_annual?: number
          csl_supplement_annual?: number
          isp_annual?: number
          msl_annual_override_enc?: string | null
          csl_annual_enc?: string | null
          csl_supplement_annual_enc?: string | null
          isp_annual_enc?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          profile_id?: string
          msl_annual_override?: number | null
          csl_annual?: number
          csl_supplement_annual?: number
          isp_annual?: number
          msl_annual_override_enc?: string | null
          csl_annual_enc?: string | null
          csl_supplement_annual_enc?: string | null
          isp_annual_enc?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cpf_healthcare_config_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      income_history: {
        Row: {
          id: string
          profile_id: string
          employer_name: string
          monthly_salary: number
          monthly_salary_enc: string | null
          start_date: string
          end_date: string | null
          is_primary: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          profile_id: string
          employer_name: string
          monthly_salary: number
          monthly_salary_enc?: string | null
          start_date: string
          end_date?: string | null
          is_primary?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          profile_id?: string
          employer_name?: string
          monthly_salary?: number
          monthly_salary_enc?: string | null
          start_date?: string
          end_date?: string | null
          is_primary?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "income_history_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      income_config: {
        Row: {
          id: string
          profile_id: string
          annual_salary: number
          bonus_estimate: number
          annual_salary_enc: string | null
          bonus_estimate_enc: string | null
          pay_frequency: string
          employee_cpf_rate: number | null
          updated_at: string
        }
        Insert: {
          id?: string
          profile_id: string
          annual_salary: number
          bonus_estimate?: number
          annual_salary_enc?: string | null
          bonus_estimate_enc?: string | null
          pay_frequency?: string
          employee_cpf_rate?: number | null
          updated_at?: string
        }
        Update: {
          id?: string
          profile_id?: string
          annual_salary?: number
          bonus_estimate?: number
          annual_salary_enc?: string | null
          bonus_estimate_enc?: string | null
          pay_frequency?: string
          employee_cpf_rate?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "income_config_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_entries: {
        Row: {
          id: string
          profile_id: string
          year: number
          calculated_amount: number
          actual_amount: number | null
          created_at: string
        }
        Insert: {
          id?: string
          profile_id: string
          year: number
          calculated_amount: number
          actual_amount?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          profile_id?: string
          year?: number
          calculated_amount?: number
          actual_amount?: number | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_entries_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_relief_inputs: {
        Row: {
          id: string
          profile_id: string
          year: number
          relief_type: string
          amount: number
          amount_enc: string | null
          created_at: string
        }
        Insert: {
          id?: string
          profile_id: string
          year: number
          relief_type: string
          amount: number
          amount_enc?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          profile_id?: string
          year?: number
          relief_type?: string
          amount?: number
          amount_enc?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_relief_inputs_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_relief_auto: {
        Row: {
          id: string
          profile_id: string
          year: number
          relief_type: string
          amount: number
          amount_enc: string | null
          source: string
          created_at: string
        }
        Insert: {
          id?: string
          profile_id: string
          year: number
          relief_type: string
          amount: number
          amount_enc?: string | null
          source: string
          created_at?: string
        }
        Update: {
          id?: string
          profile_id?: string
          year?: number
          relief_type?: string
          amount?: number
          amount_enc?: string | null
          source?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_relief_auto_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_noa_data: {
        Row: {
          id: string
          profile_id: string
          year: number
          employment_income: number | null
          chargeable_income: number | null
          total_deductions: number | null
          donations_deduction: number | null
          reliefs_total: number | null
          tax_payable: number | null
          payment_due_date: string | null
          reliefs_json: unknown
          bracket_summary_json: unknown
          employment_income_enc: string | null
          chargeable_income_enc: string | null
          total_deductions_enc: string | null
          donations_deduction_enc: string | null
          reliefs_total_enc: string | null
          tax_payable_enc: string | null
          reliefs_json_enc: string | null
          bracket_summary_json_enc: string | null
          is_on_giro: boolean
          created_at: string
        }
        Insert: {
          id?: string
          profile_id: string
          year: number
          employment_income?: number | null
          chargeable_income?: number | null
          total_deductions?: number | null
          donations_deduction?: number | null
          reliefs_total?: number | null
          tax_payable?: number | null
          payment_due_date?: string | null
          reliefs_json?: unknown
          bracket_summary_json?: unknown
          employment_income_enc?: string | null
          chargeable_income_enc?: string | null
          total_deductions_enc?: string | null
          donations_deduction_enc?: string | null
          reliefs_total_enc?: string | null
          tax_payable_enc?: string | null
          reliefs_json_enc?: string | null
          bracket_summary_json_enc?: string | null
          is_on_giro?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          profile_id?: string
          year?: number
          employment_income?: number | null
          chargeable_income?: number | null
          total_deductions?: number | null
          donations_deduction?: number | null
          reliefs_total?: number | null
          tax_payable?: number | null
          payment_due_date?: string | null
          reliefs_json?: unknown
          bracket_summary_json?: unknown
          employment_income_enc?: string | null
          chargeable_income_enc?: string | null
          total_deductions_enc?: string | null
          donations_deduction_enc?: string | null
          reliefs_total_enc?: string | null
          tax_payable_enc?: string | null
          reliefs_json_enc?: string | null
          bracket_summary_json_enc?: string | null
          is_on_giro?: boolean
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_noa_data_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_giro_schedule: {
        Row: {
          id: string
          profile_id: string
          year: number
          schedule: unknown
          total_payable: number | null
          outstanding_balance: number
          schedule_enc: string | null
          total_payable_enc: string | null
          outstanding_balance_enc: string | null
          source: string
          created_at: string
        }
        Insert: {
          id?: string
          profile_id: string
          year: number
          schedule?: unknown
          total_payable?: number | null
          outstanding_balance?: number
          schedule_enc?: string | null
          total_payable_enc?: string | null
          outstanding_balance_enc?: string | null
          source?: string
          created_at?: string
        }
        Update: {
          id?: string
          profile_id?: string
          year?: number
          schedule?: unknown
          total_payable?: number | null
          outstanding_balance?: number
          schedule_enc?: string | null
          total_payable_enc?: string | null
          outstanding_balance_enc?: string | null
          source?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_giro_schedule_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      loans: {
        Row: {
          id: string
          profile_id: string
          name: string
          type: string
          principal: number
          principal_enc: string | null
          rate_pct: number
          tenure_months: number
          start_date: string
          lender: string | null
          lender_enc: string | null
          use_cpf_oa: boolean
          valuation_limit: number | null
          split_profile_id: string | null
          split_pct: number
          rate_increase_pct: number | null
          property_type: string | null
          lock_in_end_date: string | null
          early_repayment_penalty_pct: number | null
          max_annual_prepayment_pct: number | null
          deduction_bank_account_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          profile_id: string
          name: string
          type: string
          principal: number
          principal_enc?: string | null
          rate_pct: number
          tenure_months: number
          start_date: string
          lender?: string | null
          lender_enc?: string | null
          use_cpf_oa?: boolean
          valuation_limit?: number | null
          split_profile_id?: string | null
          split_pct?: number
          rate_increase_pct?: number | null
          property_type?: string | null
          lock_in_end_date?: string | null
          early_repayment_penalty_pct?: number | null
          max_annual_prepayment_pct?: number | null
          deduction_bank_account_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          profile_id?: string
          name?: string
          type?: string
          principal?: number
          principal_enc?: string | null
          rate_pct?: number
          tenure_months?: number
          start_date?: string
          lender?: string | null
          lender_enc?: string | null
          use_cpf_oa?: boolean
          valuation_limit?: number | null
          split_profile_id?: string | null
          split_pct?: number
          rate_increase_pct?: number | null
          property_type?: string | null
          lock_in_end_date?: string | null
          early_repayment_penalty_pct?: number | null
          max_annual_prepayment_pct?: number | null
          deduction_bank_account_id?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "loans_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loans_split_profile_id_fkey"
            columns: ["split_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      loan_repayments: {
        Row: {
          id: string
          loan_id: string
          amount: number
          principal_portion: number | null
          interest_portion: number | null
          cpf_oa_amount: number | null
          date: string
          created_at: string
          is_auto_generated: boolean
        }
        Insert: {
          id?: string
          loan_id: string
          amount: number
          principal_portion?: number | null
          interest_portion?: number | null
          cpf_oa_amount?: number | null
          date: string
          created_at?: string
          is_auto_generated?: boolean
        }
        Update: {
          id?: string
          loan_id?: string
          amount?: number
          principal_portion?: number | null
          interest_portion?: number | null
          cpf_oa_amount?: number | null
          date?: string
          created_at?: string
          is_auto_generated?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "loan_repayments_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
        ]
      }
      loan_early_repayments: {
        Row: {
          id: string
          loan_id: string
          amount: number
          date: string
          penalty_amount: number
          source: string
          created_at: string
        }
        Insert: {
          id?: string
          loan_id: string
          amount: number
          date: string
          penalty_amount?: number
          source?: string
          created_at?: string
        }
        Update: {
          id?: string
          loan_id?: string
          amount?: number
          date?: string
          penalty_amount?: number
          source?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "loan_early_repayments_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
        ]
      }
      insurance_policies: {
        Row: {
          id: string
          profile_id: string
          name: string
          type: string
          premium_amount: number
          premium_amount_enc: string | null
          frequency: string
          yearly_outflow_date: number | null
          coverage_amount: number | null
          coverage_amount_enc: string | null
          coverage_type: string | null
          current_amount: number | null
          end_date: string | null
          is_active: boolean
          deduct_from_outflow: boolean
          sub_type: string | null
          rider_name: string | null
          rider_premium: number | null
          insurer: string | null
          policy_number: string | null
          maturity_value: number | null
          cash_value: number | null
          coverage_till_age: number | null
          inception_date: string | null
          cpf_premium: number | null
          premium_waiver: boolean
          remarks: string | null
          deduction_bank_account_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          profile_id: string
          name: string
          type: string
          premium_amount: number
          premium_amount_enc?: string | null
          frequency?: string
          yearly_outflow_date?: number | null
          coverage_amount?: number | null
          coverage_amount_enc?: string | null
          coverage_type?: string | null
          current_amount?: number | null
          end_date?: string | null
          is_active?: boolean
          deduct_from_outflow?: boolean
          sub_type?: string | null
          rider_name?: string | null
          rider_premium?: number | null
          insurer?: string | null
          policy_number?: string | null
          maturity_value?: number | null
          cash_value?: number | null
          coverage_till_age?: number | null
          inception_date?: string | null
          cpf_premium?: number | null
          premium_waiver?: boolean
          remarks?: string | null
          deduction_bank_account_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          profile_id?: string
          name?: string
          type?: string
          premium_amount?: number
          premium_amount_enc?: string | null
          frequency?: string
          yearly_outflow_date?: number | null
          coverage_amount?: number | null
          coverage_amount_enc?: string | null
          coverage_type?: string | null
          current_amount?: number | null
          end_date?: string | null
          is_active?: boolean
          deduct_from_outflow?: boolean
          sub_type?: string | null
          rider_name?: string | null
          rider_premium?: number | null
          insurer?: string | null
          policy_number?: string | null
          maturity_value?: number | null
          cash_value?: number | null
          coverage_till_age?: number | null
          inception_date?: string | null
          cpf_premium?: number | null
          premium_waiver?: boolean
          remarks?: string | null
          deduction_bank_account_id?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "insurance_policies_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      insurance_policy_coverages: {
        Row: {
          id: string
          policy_id: string
          coverage_type: string | null
          coverage_amount: number
          benefit_name: string | null
          benefit_premium: number | null
          renewal_bonus: number | null
          benefit_expiry_date: string | null
          benefit_unit: string | null
          sort_order: number
          created_at: string
        }
        Insert: {
          id?: string
          policy_id: string
          coverage_type?: string | null
          coverage_amount?: number
          benefit_name?: string | null
          benefit_premium?: number | null
          renewal_bonus?: number | null
          benefit_expiry_date?: string | null
          benefit_unit?: string | null
          sort_order?: number
          created_at?: string
        }
        Update: {
          id?: string
          policy_id?: string
          coverage_type?: string | null
          coverage_amount?: number
          benefit_name?: string | null
          benefit_premium?: number | null
          renewal_bonus?: number | null
          benefit_expiry_date?: string | null
          benefit_unit?: string | null
          sort_order?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "insurance_policy_coverages_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "insurance_policies"
            referencedColumns: ["id"]
          },
        ]
      }
      insurance_coverage_benchmarks: {
        Row: {
          id: string
          profile_id: string
          death_coverage_target: number
          ci_coverage_target: number
          hospitalization_coverage: string
          tpd_coverage_target: number | null
          long_term_care_monthly_target: number | null
          created_at: string
        }
        Insert: {
          id?: string
          profile_id: string
          death_coverage_target: number
          ci_coverage_target: number
          hospitalization_coverage: string
          tpd_coverage_target?: number | null
          long_term_care_monthly_target?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          profile_id?: string
          death_coverage_target?: number
          ci_coverage_target?: number
          hospitalization_coverage?: string
          tpd_coverage_target?: number | null
          long_term_care_monthly_target?: number | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "insurance_coverage_benchmarks_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      insurance_premium_schedule: {
        Row: {
          id: string
          policy_id: string
          age_band_min: number
          age_band_max: number
          premium: number
          created_at: string
        }
        Insert: {
          id?: string
          policy_id: string
          age_band_min: number
          age_band_max: number
          premium: number
          created_at?: string
        }
        Update: {
          id?: string
          policy_id?: string
          age_band_min?: number
          age_band_max?: number
          premium?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "insurance_premium_schedule_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "insurance_policies"
            referencedColumns: ["id"]
          },
        ]
      }
      prompt_schedule: {
        Row: {
          id: string
          family_id: string
          prompt_type: string
          frequency: string
          day_of_month: number
          month_of_year: number | null
          time: string
          timezone: string
          created_at: string
        }
        Insert: {
          id?: string
          family_id: string
          prompt_type: string
          frequency: string
          day_of_month: number
          month_of_year?: number | null
          time: string
          timezone: string
          created_at?: string
        }
        Update: {
          id?: string
          family_id?: string
          prompt_type?: string
          frequency?: string
          day_of_month?: number
          month_of_year?: number | null
          time?: string
          timezone?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prompt_schedule_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          id: string
          profile_id: string
          notification_type: string
          enabled: boolean
          day_of_month: number | null
          month_of_year: number | null
          time: string | null
          timezone: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          profile_id: string
          notification_type: string
          enabled?: boolean
          day_of_month?: number | null
          month_of_year?: number | null
          time?: string | null
          timezone?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          profile_id?: string
          notification_type?: string
          enabled?: boolean
          day_of_month?: number | null
          month_of_year?: number | null
          time?: string | null
          timezone?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_account_ocbc360_config: {
        Row: {
          id: string
          account_id: string
          salary_met: boolean
          save_met: boolean
          spend_met: boolean
          insure_met: boolean
          invest_met: boolean
          grow_met: boolean
          ocbc_card_spend_monthly: number | null
          linked_insurance_policy_id: string | null
          linked_investment_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          account_id: string
          salary_met?: boolean
          save_met?: boolean
          spend_met?: boolean
          insure_met?: boolean
          invest_met?: boolean
          grow_met?: boolean
          ocbc_card_spend_monthly?: number | null
          linked_insurance_policy_id?: string | null
          linked_investment_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          account_id?: string
          salary_met?: boolean
          save_met?: boolean
          spend_met?: boolean
          insure_met?: boolean
          invest_met?: boolean
          grow_met?: boolean
          ocbc_card_spend_monthly?: number | null
          linked_insurance_policy_id?: string | null
          linked_investment_id?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_account_ocbc360_config_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
        ]
      },
      telegram_commands: {
        Row: {
          id: string
          household_id: string
          family_id: string | null
          profile_id: string | null
          command: string
          args: string | null
          args_enc: string | null
          raw_message: string
          raw_message_enc: string | null
          success: boolean
          error_message: string | null
          created_at: string
        }
        Insert: {
          id?: string
          household_id: string
          family_id?: string | null
          profile_id?: string | null
          command: string
          args?: string | null
          args_enc?: string | null
          raw_message: string
          raw_message_enc?: string | null
          success?: boolean
          error_message?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          household_id?: string
          family_id?: string | null
          profile_id?: string | null
          command?: string
          args?: string | null
          args_enc?: string | null
          raw_message?: string
          raw_message_enc?: string | null
          success?: boolean
          error_message?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "telegram_commands_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telegram_commands_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telegram_commands_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      precious_metals_prices: {
        Row: {
          id: string
          metal_type: string
          buy_price_sgd: number
          sell_price_sgd: number
          unit: string
          last_updated: string
        }
        Insert: {
          id?: string
          metal_type: string
          buy_price_sgd: number
          sell_price_sgd: number
          unit: string
          last_updated?: string
        }
        Update: {
          id?: string
          metal_type?: string
          buy_price_sgd?: number
          sell_price_sgd?: number
          unit?: string
          last_updated?: string
        }
        Relationships: []
      }
      net_worth_snapshots: {
        Row: {
          id: string
          family_id: string
          profile_id: string | null
          month: string
          liquid_net_worth: number
          total_net_worth: number
          bank_total: number
          cpf_total: number
          investment_total: number
          loan_total: number
          created_at: string
        }
        Insert: {
          id?: string
          family_id: string
          profile_id?: string | null
          month: string
          liquid_net_worth: number
          total_net_worth: number
          bank_total: number
          cpf_total: number
          investment_total: number
          loan_total: number
          created_at?: string
        }
        Update: {
          id?: string
          family_id?: string
          profile_id?: string | null
          month?: string
          liquid_net_worth?: number
          total_net_worth?: number
          bank_total?: number
          cpf_total?: number
          investment_total?: number
          loan_total?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "net_worth_snapshots_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "net_worth_snapshots_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      },
      telegram_sessions: {
        Row: {
          id: string
          session_data: Json
          session_data_enc: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          session_data?: Json
          session_data_enc?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          session_data?: Json
          session_data_enc?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      outflow_categories: {
        Row: {
          id: string
          household_id: string
          name: string
          icon: string | null
          sort_order: number
          is_system: boolean
          created_at: string
        }
        Insert: {
          id?: string
          household_id: string
          name: string
          icon?: string | null
          sort_order?: number
          is_system?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          household_id?: string
          name?: string
          icon?: string | null
          sort_order?: number
          is_system?: boolean
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "outflow_categories_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      outflow_entries: {
        Row: {
          id: string
          profile_id: string
          month: string
          category_id: string | null
          amount: number
          memo: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          profile_id: string
          month: string
          category_id?: string | null
          amount: number
          memo?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          profile_id?: string
          month?: string
          category_id?: string | null
          amount?: number
          memo?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "outflow_entries_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outflow_entries_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "outflow_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      dependents: {
        Row: {
          id: string
          family_id: string
          name: string
          name_enc: string | null
          birth_year: number
          birth_year_enc: string | null
          relationship: string
          claimed_by_profile_id: string | null
          in_full_time_education: boolean
          annual_income: number
          annual_income_enc: string | null
          living_with_claimant: boolean
          is_handicapped: boolean
          created_at: string
        }
        Insert: {
          id?: string
          family_id: string
          name: string
          name_enc?: string | null
          birth_year: number
          birth_year_enc?: string | null
          relationship: string
          claimed_by_profile_id?: string | null
          in_full_time_education?: boolean
          annual_income?: number
          annual_income_enc?: string | null
          living_with_claimant?: boolean
          is_handicapped?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          family_id?: string
          name?: string
          name_enc?: string | null
          birth_year?: number
          birth_year_enc?: string | null
          relationship?: string
          claimed_by_profile_id?: string | null
          in_full_time_education?: boolean
          annual_income?: number
          annual_income_enc?: string | null
          living_with_claimant?: boolean
          is_handicapped?: boolean
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dependents_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dependents_claimed_by_profile_id_fkey"
            columns: ["claimed_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      developer_graph_layouts: {
        Row: {
          id: string
          household_id: string
          graph_key: string
          positions: Record<string, unknown>
          viewport: Record<string, unknown> | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          household_id: string
          graph_key?: string
          positions?: Record<string, unknown>
          viewport?: Record<string, unknown> | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          household_id?: string
          graph_key?: string
          positions?: Record<string, unknown>
          viewport?: Record<string, unknown> | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "developer_graph_layouts_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
