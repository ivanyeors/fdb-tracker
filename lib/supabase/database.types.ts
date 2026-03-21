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
          telegram_bot_token: string | null
          onboarding_completed_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_count?: number
          telegram_chat_id?: string | null
          telegram_bot_token?: string | null
          onboarding_completed_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_count?: number
          telegram_chat_id?: string | null
          telegram_bot_token?: string | null
          onboarding_completed_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      families: {
        Row: {
          id: string
          household_id: string
          name: string
          user_count: number
          created_at: string
        }
        Insert: {
          id?: string
          household_id: string
          name?: string
          user_count?: number
          created_at?: string
        }
        Update: {
          id?: string
          household_id?: string
          name?: string
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
          telegram_user_id: string | null
          telegram_username: string | null
          birth_year: number
          optional_onboarding_completed_at: string | null
          dps_include_in_projection: boolean
          created_at: string
        }
        Insert: {
          id?: string
          family_id: string
          name: string
          telegram_user_id?: string | null
          telegram_username?: string | null
          birth_year: number
          optional_onboarding_completed_at?: string | null
          dps_include_in_projection?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          family_id?: string
          name?: string
          telegram_user_id?: string | null
          telegram_username?: string | null
          birth_year?: number
          optional_onboarding_completed_at?: string | null
          dps_include_in_projection?: boolean
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
          telegram_username: string | null
          telegram_chat_id: string
          linked_at: string
        }
        Insert: {
          id?: string
          link_api_key_id: string
          household_id: string
          telegram_user_id: string
          telegram_username?: string | null
          telegram_chat_id: string
          linked_at?: string
        }
        Update: {
          id?: string
          link_api_key_id?: string
          household_id?: string
          telegram_user_id?: string
          telegram_username?: string | null
          telegram_chat_id?: string
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
      bank_accounts: {
        Row: {
          id: string
          family_id: string
          profile_id: string | null
          bank_name: string
          account_type: string
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
          created_at: string
        }
        Insert: {
          id?: string
          account_id: string
          month: string
          opening_balance: number
          closing_balance: number
          created_at?: string
        }
        Update: {
          id?: string
          account_id?: string
          month?: string
          opening_balance?: number
          closing_balance?: number
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
          created_at?: string
          date_added?: string | null
        }
        Relationships: [
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
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          family_id: string
          profile_id?: string | null
          cash_balance?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          family_id?: string
          profile_id?: string | null
          cash_balance?: number
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
          type: string
          symbol: string
          quantity: number
          price: number
          journal_text: string | null
          screenshot_url: string | null
          created_at: string
        }
        Insert: {
          id?: string
          investment_id?: string | null
          family_id: string
          profile_id?: string | null
          type: string
          symbol: string
          quantity: number
          price: number
          journal_text?: string | null
          screenshot_url?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          investment_id?: string | null
          family_id?: string
          profile_id?: string | null
          type?: string
          symbol?: string
          quantity?: number
          price?: number
          journal_text?: string | null
          screenshot_url?: string | null
          created_at?: string
        }
        Relationships: [
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
      ilp_fund_groups: {
        Row: {
          id: string
          family_id: string
          name: string
          group_premium_amount: number | null
          premium_payment_mode: string
          created_at: string
        }
        Insert: {
          id?: string
          family_id: string
          name: string
          group_premium_amount?: number | null
          premium_payment_mode?: string
          created_at?: string
        }
        Update: {
          id?: string
          family_id?: string
          name?: string
          group_premium_amount?: number | null
          premium_payment_mode?: string
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
          ilp_fund_group_id: string | null
          group_allocation_pct: number | null
          premium_payment_mode: string
          created_at: string
        }
        Insert: {
          id?: string
          family_id: string
          profile_id?: string | null
          name: string
          monthly_premium: number
          end_date: string
          ilp_fund_group_id?: string | null
          group_allocation_pct?: number | null
          premium_payment_mode?: string
          created_at?: string
        }
        Update: {
          id?: string
          family_id?: string
          profile_id?: string | null
          name?: string
          monthly_premium?: number
          end_date?: string
          ilp_fund_group_id?: string | null
          group_allocation_pct?: number | null
          premium_payment_mode?: string
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
            foreignKeyName: "ilp_products_ilp_fund_group_id_fkey"
            columns: ["ilp_fund_group_id"]
            isOneToOne: false
            referencedRelation: "ilp_fund_groups"
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
        ]
      }
      income_config: {
        Row: {
          id: string
          profile_id: string
          annual_salary: number
          bonus_estimate: number
          pay_frequency: string
          employee_cpf_rate: number | null
          updated_at: string
        }
        Insert: {
          id?: string
          profile_id: string
          annual_salary: number
          bonus_estimate?: number
          pay_frequency?: string
          employee_cpf_rate?: number | null
          updated_at?: string
        }
        Update: {
          id?: string
          profile_id?: string
          annual_salary?: number
          bonus_estimate?: number
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
          created_at: string
        }
        Insert: {
          id?: string
          profile_id: string
          year: number
          relief_type: string
          amount: number
          created_at?: string
        }
        Update: {
          id?: string
          profile_id?: string
          year?: number
          relief_type?: string
          amount?: number
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
          source: string
          created_at: string
        }
        Insert: {
          id?: string
          profile_id: string
          year: number
          relief_type: string
          amount: number
          source: string
          created_at?: string
        }
        Update: {
          id?: string
          profile_id?: string
          year?: number
          relief_type?: string
          amount?: number
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
      loans: {
        Row: {
          id: string
          profile_id: string
          name: string
          type: string
          principal: number
          rate_pct: number
          tenure_months: number
          start_date: string
          lender: string | null
          use_cpf_oa: boolean
          valuation_limit: number | null
          created_at: string
        }
        Insert: {
          id?: string
          profile_id: string
          name: string
          type: string
          principal: number
          rate_pct: number
          tenure_months: number
          start_date: string
          lender?: string | null
          use_cpf_oa?: boolean
          valuation_limit?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          profile_id?: string
          name?: string
          type?: string
          principal?: number
          rate_pct?: number
          tenure_months?: number
          start_date?: string
          lender?: string | null
          use_cpf_oa?: boolean
          valuation_limit?: number | null
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
          created_at: string
        }
        Insert: {
          id?: string
          loan_id: string
          amount: number
          date: string
          created_at?: string
        }
        Update: {
          id?: string
          loan_id?: string
          amount?: number
          date?: string
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
          frequency: string
          yearly_outflow_date: number | null
          coverage_amount: number | null
          coverage_type: string | null
          current_amount: number | null
          end_date: string | null
          is_active: boolean
          deduct_from_outflow: boolean
          created_at: string
        }
        Insert: {
          id?: string
          profile_id: string
          name: string
          type: string
          premium_amount: number
          frequency?: string
          yearly_outflow_date?: number | null
          coverage_amount?: number | null
          coverage_type?: string | null
          current_amount?: number | null
          end_date?: string | null
          is_active?: boolean
          deduct_from_outflow?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          profile_id?: string
          name?: string
          type?: string
          premium_amount?: number
          frequency?: string
          yearly_outflow_date?: number | null
          coverage_amount?: number | null
          coverage_type?: string | null
          current_amount?: number | null
          end_date?: string | null
          is_active?: boolean
          deduct_from_outflow?: boolean
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
      insurance_coverage_benchmarks: {
        Row: {
          id: string
          profile_id: string
          death_coverage_target: number
          ci_coverage_target: number
          hospitalization_coverage: string
          created_at: string
        }
        Insert: {
          id?: string
          profile_id: string
          death_coverage_target: number
          ci_coverage_target: number
          hospitalization_coverage: string
          created_at?: string
        }
        Update: {
          id?: string
          profile_id?: string
          death_coverage_target?: number
          ci_coverage_target?: number
          hospitalization_coverage?: string
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
          raw_message: string
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
          raw_message: string
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
          raw_message?: string
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
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          session_data?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          session_data?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: []
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
