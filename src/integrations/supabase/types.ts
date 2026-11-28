export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
  public: {
    Tables: {
      addresses: {
        Row: {
          address_line: string;
          city: string;
          created_at: string;
          full_name: string;
          id: string;
          instructions: string | null;
          is_default: boolean;
          label: string | null;
          phone: string;
          user_id: string;
        };
        Insert: {
          address_line: string;
          city: string;
          created_at?: string;
          full_name: string;
          id?: string;
          instructions?: string | null;
          is_default?: boolean;
          label?: string | null;
          phone: string;
          user_id: string;
        };
        Update: {
          address_line?: string;
          city?: string;
          created_at?: string;
          full_name?: string;
          id?: string;
          instructions?: string | null;
          is_default?: boolean;
          label?: string | null;
          phone?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      ai_provider_settings: {
        Row: {
          ai_model: string;
          assistant_enabled: boolean;
          fal_api_key: string | null;
          id: boolean;
          image_model: string;
          openai_api_key: string | null;
          replicate_api_token: string | null;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          ai_model?: string;
          assistant_enabled?: boolean;
          fal_api_key?: string | null;
          id?: boolean;
          image_model?: string;
          openai_api_key?: string | null;
          replicate_api_token?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          ai_model?: string;
          assistant_enabled?: boolean;
          fal_api_key?: string | null;
          id?: boolean;
          image_model?: string;
          openai_api_key?: string | null;
          replicate_api_token?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      audit_logs: {
        Row: {
          action: string;
          actor_email: string | null;
          actor_id: string | null;
          created_at: string;
          details: Json;
          entity: string;
          entity_id: string | null;
          id: string;
          module: string | null;
          summary: string | null;
        };
        Insert: {
          action: string;
          actor_email?: string | null;
          actor_id?: string | null;
          created_at?: string;
          details?: Json;
          entity: string;
          entity_id?: string | null;
          id?: string;
          module?: string | null;
          summary?: string | null;
        };
        Update: {
          action?: string;
          actor_email?: string | null;
          actor_id?: string | null;
          created_at?: string;
          details?: Json;
          entity?: string;
          entity_id?: string | null;
          id?: string;
          module?: string | null;
          summary?: string | null;
        };
        Relationships: [];
      };
      brands: {
        Row: {
          created_at: string;
          description_ar: string | null;
          description_fr: string | null;
          display_order: number;
          id: string;
          is_active: boolean;
          logo_url: string | null;
          name: string;
          slug: string;
        };
        Insert: {
          created_at?: string;
          description_ar?: string | null;
          description_fr?: string | null;
          display_order?: number;
          id?: string;
          is_active?: boolean;
          logo_url?: string | null;
          name: string;
          slug: string;
        };
        Update: {
          created_at?: string;
          description_ar?: string | null;
          description_fr?: string | null;
          display_order?: number;
          id?: string;
          is_active?: boolean;
          logo_url?: string | null;
          name?: string;
          slug?: string;
        };
        Relationships: [];
      };
      cash_collections: {
        Row: {
          amount_collected: number;
          amount_expected: number;
          collected_at: string;
          collected_by_name: string;
          created_at: string;
          id: string;
          note: string | null;
          order_id: string;
          recorded_by: string | null;
        };
        Insert: {
          amount_collected: number;
          amount_expected: number;
          collected_at: string;
          collected_by_name: string;
          created_at?: string;
          id?: string;
          note?: string | null;
          order_id: string;
          recorded_by?: string | null;
        };
        Update: {
          amount_collected?: number;
          amount_expected?: number;
          collected_at?: string;
          collected_by_name?: string;
          created_at?: string;
          id?: string;
          note?: string | null;
          order_id?: string;
          recorded_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "cash_collections_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: true;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ];
      };
      categories: {
        Row: {
          allows_condition: boolean;
          created_at: string;
          description_ar: string | null;
          description_fr: string | null;
          display_order: number;
          id: string;
          image_url: string | null;
          is_active: boolean;
          name_ar: string | null;
          name_fr: string;
          parent_id: string | null;
          slug: string;
          updated_at: string;
        };
        Insert: {
          allows_condition?: boolean;
          created_at?: string;
          description_ar?: string | null;
          description_fr?: string | null;
          display_order?: number;
          id?: string;
          image_url?: string | null;
          is_active?: boolean;
          name_ar?: string | null;
          name_fr: string;
          parent_id?: string | null;
          slug: string;
          updated_at?: string;
        };
        Update: {
          allows_condition?: boolean;
          created_at?: string;
          description_ar?: string | null;
          description_fr?: string | null;
          display_order?: number;
          id?: string;
          image_url?: string | null;
          is_active?: boolean;
          name_ar?: string | null;
          name_fr?: string;
          parent_id?: string | null;
          slug?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
        ];
      };
      category_attribute_options: {
        Row: {
          attribute_id: string;
          color_hex: string | null;
          created_at: string;
          display_order: number;
          id: string;
          label_ar: string | null;
          label_fr: string | null;
          value: string;
        };
        Insert: {
          attribute_id: string;
          color_hex?: string | null;
          created_at?: string;
          display_order?: number;
          id?: string;
          label_ar?: string | null;
          label_fr?: string | null;
          value: string;
        };
        Update: {
          attribute_id?: string;
          color_hex?: string | null;
          created_at?: string;
          display_order?: number;
          id?: string;
          label_ar?: string | null;
          label_fr?: string | null;
          value?: string;
        };
        Relationships: [
          {
            foreignKeyName: "category_attribute_options_attribute_id_fkey";
            columns: ["attribute_id"];
            isOneToOne: false;
            referencedRelation: "category_attributes";
            referencedColumns: ["id"];
          },
        ];
      };
      category_attributes: {
        Row: {
          category_id: string;
          code: string;
          created_at: string;
          display_order: number;
          id: string;
          is_filterable: boolean;
          is_required: boolean;
          is_searchable: boolean;
          is_variant: boolean;
          name_ar: string | null;
          name_fr: string;
          type: Database["public"]["Enums"]["attribute_type"];
          unit: string | null;
        };
        Insert: {
          category_id: string;
          code: string;
          created_at?: string;
          display_order?: number;
          id?: string;
          is_filterable?: boolean;
          is_required?: boolean;
          is_searchable?: boolean;
          is_variant?: boolean;
          name_ar?: string | null;
          name_fr: string;
          type?: Database["public"]["Enums"]["attribute_type"];
          unit?: string | null;
        };
        Update: {
          category_id?: string;
          code?: string;
          created_at?: string;
          display_order?: number;
          id?: string;
          is_filterable?: boolean;
          is_required?: boolean;
          is_searchable?: boolean;
          is_variant?: boolean;
          name_ar?: string | null;
          name_fr?: string;
          type?: Database["public"]["Enums"]["attribute_type"];
          unit?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "category_attributes_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
        ];
      };
      description_templates: {
        Row: {
          created_at: string;
          display_order: number;
          id: string;
          instructions: string;
          is_active: boolean;
          name: string;
          summary: string | null;
          target_length: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          display_order?: number;
          id?: string;
          instructions: string;
          is_active?: boolean;
          name: string;
          summary?: string | null;
          target_length?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          display_order?: number;
          id?: string;
          instructions?: string;
          is_active?: boolean;
          name?: string;
          summary?: string | null;
          target_length?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      finance_entries: {
        Row: {
          amount: number;
          created_at: string;
          created_by: string | null;
          dedupe_key: string;
          entry_type: Database["public"]["Enums"]["finance_entry_type"];
          id: string;
          note: string | null;
          order_id: string | null;
          return_id: string | null;
          seller_group_id: string | null;
          seller_id: string | null;
          variant_id: string | null;
        };
        Insert: {
          amount: number;
          created_at?: string;
          created_by?: string | null;
          dedupe_key: string;
          entry_type: Database["public"]["Enums"]["finance_entry_type"];
          id?: string;
          note?: string | null;
          order_id?: string | null;
          return_id?: string | null;
          seller_group_id?: string | null;
          seller_id?: string | null;
          variant_id?: string | null;
        };
        Update: {
          amount?: number;
          created_at?: string;
          created_by?: string | null;
          dedupe_key?: string;
          entry_type?: Database["public"]["Enums"]["finance_entry_type"];
          id?: string;
          note?: string | null;
          order_id?: string | null;
          return_id?: string | null;
          seller_group_id?: string | null;
          seller_id?: string | null;
          variant_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "finance_entries_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "finance_entries_return_id_fkey";
            columns: ["return_id"];
            isOneToOne: false;
            referencedRelation: "returns";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "finance_entries_return_id_fkey";
            columns: ["return_id"];
            isOneToOne: false;
            referencedRelation: "seller_returns_view";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "finance_entries_seller_group_id_fkey";
            columns: ["seller_group_id"];
            isOneToOne: false;
            referencedRelation: "seller_order_groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "finance_entries_seller_group_id_fkey";
            columns: ["seller_group_id"];
            isOneToOne: false;
            referencedRelation: "seller_orders_view";
            referencedColumns: ["seller_group_id"];
          },
          {
            foreignKeyName: "finance_entries_seller_id_fkey";
            columns: ["seller_id"];
            isOneToOne: false;
            referencedRelation: "public_seller_shops";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "finance_entries_seller_id_fkey";
            columns: ["seller_id"];
            isOneToOne: false;
            referencedRelation: "seller_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      homepage_sections: {
        Row: {
          config: Json;
          display_order: number;
          id: string;
          is_enabled: boolean;
          section_key: string;
          subtitle_ar: string | null;
          subtitle_fr: string | null;
          title_ar: string;
          title_fr: string;
          updated_at: string;
        };
        Insert: {
          config?: Json;
          display_order?: number;
          id?: string;
          is_enabled?: boolean;
          section_key: string;
          subtitle_ar?: string | null;
          subtitle_fr?: string | null;
          title_ar: string;
          title_fr: string;
          updated_at?: string;
        };
        Update: {
          config?: Json;
          display_order?: number;
          id?: string;
          is_enabled?: boolean;
          section_key?: string;
          subtitle_ar?: string | null;
          subtitle_fr?: string | null;
          title_ar?: string;
          title_fr?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      inventory: {
        Row: {
          available: number;
          damaged: number;
          incoming: number;
          low_stock_threshold: number;
          reserved: number;
          updated_at: string;
          variant_id: string;
        };
        Insert: {
          available?: number;
          damaged?: number;
          incoming?: number;
          low_stock_threshold?: number;
          reserved?: number;
          updated_at?: string;
          variant_id: string;
        };
        Update: {
          available?: number;
          damaged?: number;
          incoming?: number;
          low_stock_threshold?: number;
          reserved?: number;
          updated_at?: string;
          variant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_variant_id_fkey";
            columns: ["variant_id"];
            isOneToOne: true;
            referencedRelation: "product_variants";
            referencedColumns: ["id"];
          },
        ];
      };
      inventory_movements: {
        Row: {
          created_at: string;
          created_by: string | null;
          from_bucket: string | null;
          id: string;
          movement_type: Database["public"]["Enums"]["movement_type"];
          order_id: string | null;
          quantity: number;
          reason: string | null;
          return_id: string | null;
          sku: string | null;
          to_bucket: string | null;
          variant_id: string | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          from_bucket?: string | null;
          id?: string;
          movement_type: Database["public"]["Enums"]["movement_type"];
          order_id?: string | null;
          quantity: number;
          reason?: string | null;
          return_id?: string | null;
          sku?: string | null;
          to_bucket?: string | null;
          variant_id?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          from_bucket?: string | null;
          id?: string;
          movement_type?: Database["public"]["Enums"]["movement_type"];
          order_id?: string | null;
          quantity?: number;
          reason?: string | null;
          return_id?: string | null;
          sku?: string | null;
          to_bucket?: string | null;
          variant_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_movements_variant_id_fkey";
            columns: ["variant_id"];
            isOneToOne: false;
            referencedRelation: "product_variants";
            referencedColumns: ["id"];
          },
        ];
      };
      listing_moderation_history: {
        Row: {
          action: Database["public"]["Enums"]["moderation_action"];
          actor_id: string | null;
          created_at: string;
          id: string;
          note: string | null;
          product_id: string;
        };
        Insert: {
          action: Database["public"]["Enums"]["moderation_action"];
          actor_id?: string | null;
          created_at?: string;
          id?: string;
          note?: string | null;
          product_id: string;
        };
        Update: {
          action?: Database["public"]["Enums"]["moderation_action"];
          actor_id?: string | null;
          created_at?: string;
          id?: string;
          note?: string | null;
          product_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "listing_moderation_history_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      newsletter_subscribers: {
        Row: {
          email: string;
          id: string;
          is_subscribed: boolean;
          locale: string;
          subscribed_at: string;
          unsubscribed_at: string | null;
        };
        Insert: {
          email: string;
          id?: string;
          is_subscribed?: boolean;
          locale?: string;
          subscribed_at?: string;
          unsubscribed_at?: string | null;
        };
        Update: {
          email?: string;
          id?: string;
          is_subscribed?: boolean;
          locale?: string;
          subscribed_at?: string;
          unsubscribed_at?: string | null;
        };
        Relationships: [];
      };
      notifications: {
        Row: {
          body: string | null;
          created_at: string;
          id: string;
          link: string | null;
          read_at: string | null;
          title: string;
          user_id: string;
        };
        Insert: {
          body?: string | null;
          created_at?: string;
          id?: string;
          link?: string | null;
          read_at?: string | null;
          title: string;
          user_id: string;
        };
        Update: {
          body?: string | null;
          created_at?: string;
          id?: string;
          link?: string | null;
          read_at?: string | null;
          title?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      order_items: {
        Row: {
          commission_amount: number;
          commission_rate: number;
          discount_amount: number;
          id: string;
          image_url: string | null;
          line_total: number;
          order_id: string;
          product_id: string | null;
          product_name: string;
          quantity: number;
          seller_group_id: string | null;
          seller_id: string | null;
          sku: string;
          unit_cost: number;
          unit_price: number;
          variant_id: string;
          variant_label: string | null;
        };
        Insert: {
          commission_amount?: number;
          commission_rate?: number;
          discount_amount?: number;
          id?: string;
          image_url?: string | null;
          line_total: number;
          order_id: string;
          product_id?: string | null;
          product_name: string;
          quantity: number;
          seller_group_id?: string | null;
          seller_id?: string | null;
          sku: string;
          unit_cost?: number;
          unit_price: number;
          variant_id: string;
          variant_label?: string | null;
        };
        Update: {
          commission_amount?: number;
          commission_rate?: number;
          discount_amount?: number;
          id?: string;
          image_url?: string | null;
          line_total?: number;
          order_id?: string;
          product_id?: string | null;
          product_name?: string;
          quantity?: number;
          seller_group_id?: string | null;
          seller_id?: string | null;
          sku?: string;
          unit_cost?: number;
          unit_price?: number;
          variant_id?: string;
          variant_label?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_items_seller_group_id_fkey";
            columns: ["seller_group_id"];
            isOneToOne: false;
            referencedRelation: "seller_order_groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_items_seller_group_id_fkey";
            columns: ["seller_group_id"];
            isOneToOne: false;
            referencedRelation: "seller_orders_view";
            referencedColumns: ["seller_group_id"];
          },
          {
            foreignKeyName: "order_items_seller_id_fkey";
            columns: ["seller_id"];
            isOneToOne: false;
            referencedRelation: "public_seller_shops";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_items_seller_id_fkey";
            columns: ["seller_id"];
            isOneToOne: false;
            referencedRelation: "seller_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_items_variant_id_fkey";
            columns: ["variant_id"];
            isOneToOne: false;
            referencedRelation: "product_variants";
            referencedColumns: ["id"];
          },
        ];
      };
      order_notes: {
        Row: {
          author_id: string;
          created_at: string;
          id: string;
          note: string;
          order_id: string;
        };
        Insert: {
          author_id?: string;
          created_at?: string;
          id?: string;
          note: string;
          order_id: string;
        };
        Update: {
          author_id?: string;
          created_at?: string;
          id?: string;
          note?: string;
          order_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "order_notes_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ];
      };
      order_status_history: {
        Row: {
          changed_by: string | null;
          created_at: string;
          from_status: Database["public"]["Enums"]["order_status"] | null;
          id: string;
          note: string | null;
          order_id: string;
          to_status: Database["public"]["Enums"]["order_status"];
        };
        Insert: {
          changed_by?: string | null;
          created_at?: string;
          from_status?: Database["public"]["Enums"]["order_status"] | null;
          id?: string;
          note?: string | null;
          order_id: string;
          to_status: Database["public"]["Enums"]["order_status"];
        };
        Update: {
          changed_by?: string | null;
          created_at?: string;
          from_status?: Database["public"]["Enums"]["order_status"] | null;
          id?: string;
          note?: string | null;
          order_id?: string;
          to_status?: Database["public"]["Enums"]["order_status"];
        };
        Relationships: [
          {
            foreignKeyName: "order_status_history_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ];
      };
      orders: {
        Row: {
          address: string;
          cancelled_at: string | null;
          city: string;
          confirmed_at: string | null;
          created_at: string;
          customer_name: string;
          delivered_at: string | null;
          delivery_fee: number;
          discount_total: number;
          email: string | null;
          has_seller_items: boolean;
          id: string;
          instructions: string | null;
          payment_method: string;
          payment_status: Database["public"]["Enums"]["payment_status"];
          phone: string;
          promo_code: string | null;
          promotion_id: string | null;
          reference: string;
          shipped_at: string | null;
          status: Database["public"]["Enums"]["order_status"];
          stock_state: Database["public"]["Enums"]["stock_state"];
          subtotal: number;
          total: number;
          updated_at: string;
          user_id: string | null;
        };
        Insert: {
          address: string;
          cancelled_at?: string | null;
          city: string;
          confirmed_at?: string | null;
          created_at?: string;
          customer_name: string;
          delivered_at?: string | null;
          delivery_fee?: number;
          discount_total?: number;
          email?: string | null;
          has_seller_items?: boolean;
          id?: string;
          instructions?: string | null;
          payment_method?: string;
          payment_status?: Database["public"]["Enums"]["payment_status"];
          phone: string;
          promo_code?: string | null;
          promotion_id?: string | null;
          reference: string;
          shipped_at?: string | null;
          status?: Database["public"]["Enums"]["order_status"];
          stock_state?: Database["public"]["Enums"]["stock_state"];
          subtotal?: number;
          total?: number;
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          address?: string;
          cancelled_at?: string | null;
          city?: string;
          confirmed_at?: string | null;
          created_at?: string;
          customer_name?: string;
          delivered_at?: string | null;
          delivery_fee?: number;
          discount_total?: number;
          email?: string | null;
          has_seller_items?: boolean;
          id?: string;
          instructions?: string | null;
          payment_method?: string;
          payment_status?: Database["public"]["Enums"]["payment_status"];
          phone?: string;
          promo_code?: string | null;
          promotion_id?: string | null;
          reference?: string;
          shipped_at?: string | null;
          status?: Database["public"]["Enums"]["order_status"];
          stock_state?: Database["public"]["Enums"]["stock_state"];
          subtotal?: number;
          total?: number;
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "orders_promotion_id_fkey";
            columns: ["promotion_id"];
            isOneToOne: false;
            referencedRelation: "promotions";
            referencedColumns: ["id"];
          },
        ];
      };
      product_attribute_values: {
        Row: {
          attribute_id: string;
          id: string;
          option_id: string | null;
          product_id: string;
          value_boolean: boolean | null;
          value_date: string | null;
          value_number: number | null;
          value_text: string | null;
        };
        Insert: {
          attribute_id: string;
          id?: string;
          option_id?: string | null;
          product_id: string;
          value_boolean?: boolean | null;
          value_date?: string | null;
          value_number?: number | null;
          value_text?: string | null;
        };
        Update: {
          attribute_id?: string;
          id?: string;
          option_id?: string | null;
          product_id?: string;
          value_boolean?: boolean | null;
          value_date?: string | null;
          value_number?: number | null;
          value_text?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "product_attribute_values_attribute_id_fkey";
            columns: ["attribute_id"];
            isOneToOne: false;
            referencedRelation: "category_attributes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "product_attribute_values_option_id_fkey";
            columns: ["option_id"];
            isOneToOne: false;
            referencedRelation: "category_attribute_options";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "product_attribute_values_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      product_images: {
        Row: {
          alt: string | null;
          created_at: string;
          id: string;
          position: number;
          product_id: string;
          storage_path: string | null;
          url: string;
        };
        Insert: {
          alt?: string | null;
          created_at?: string;
          id?: string;
          position?: number;
          product_id: string;
          storage_path?: string | null;
          url: string;
        };
        Update: {
          alt?: string | null;
          created_at?: string;
          id?: string;
          position?: number;
          product_id?: string;
          storage_path?: string | null;
          url?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_images_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      product_private: {
        Row: {
          internal_notes: string | null;
          product_id: string;
          purchase_price: number;
          updated_at: string;
        };
        Insert: {
          internal_notes?: string | null;
          product_id: string;
          purchase_price?: number;
          updated_at?: string;
        };
        Update: {
          internal_notes?: string | null;
          product_id?: string;
          purchase_price?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_private_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: true;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      product_variants: {
        Row: {
          barcode: string | null;
          combination_key: string;
          created_at: string;
          id: string;
          is_active: boolean;
          is_default: boolean;
          position: number;
          price: number;
          product_id: string;
          promo_price: number | null;
          sku: string;
          updated_at: string;
        };
        Insert: {
          barcode?: string | null;
          combination_key?: string;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          is_default?: boolean;
          position?: number;
          price: number;
          product_id: string;
          promo_price?: number | null;
          sku: string;
          updated_at?: string;
        };
        Update: {
          barcode?: string | null;
          combination_key?: string;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          is_default?: boolean;
          position?: number;
          price?: number;
          product_id?: string;
          promo_price?: number | null;
          sku?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      products: {
        Row: {
          approved_at: string | null;
          approved_by: string | null;
          barcode: string | null;
          boost_score: number;
          boost_tier: string | null;
          boosted_at: string | null;
          boosted_until: string | null;
          brand: string | null;
          brand_id: string | null;
          category_id: string;
          condition: Database["public"]["Enums"]["listing_condition"] | null;
          created_at: string;
          description_ar: string | null;
          description_fr: string | null;
          dimensions_cm: string | null;
          has_variants: boolean;
          id: string;
          is_boosted: boolean;
          is_featured: boolean;
          landed_cost: number | null;
          model: string | null;
          moderation_feedback: string | null;
          name_ar: string | null;
          name_fr: string;
          price: number;
          promo_price: number | null;
          published_at: string | null;
          rating_avg: number;
          rating_count: number;
          seller_id: string | null;
          seo_description_ar: string | null;
          seo_description_fr: string | null;
          seo_title_ar: string | null;
          seo_title_fr: string | null;
          sku: string;
          slug: string;
          status: Database["public"]["Enums"]["product_status"];
          submitted_at: string | null;
          updated_at: string;
          video_url: string | null;
          warranty: string | null;
          weight_grams: number | null;
        };
        Insert: {
          approved_at?: string | null;
          approved_by?: string | null;
          barcode?: string | null;
          boost_score?: number;
          boost_tier?: string | null;
          boosted_at?: string | null;
          boosted_until?: string | null;
          brand?: string | null;
          brand_id?: string | null;
          category_id: string;
          condition?: Database["public"]["Enums"]["listing_condition"] | null;
          created_at?: string;
          description_ar?: string | null;
          description_fr?: string | null;
          dimensions_cm?: string | null;
          has_variants?: boolean;
          id?: string;
          is_boosted?: boolean;
          is_featured?: boolean;
          landed_cost?: number | null;
          model?: string | null;
          moderation_feedback?: string | null;
          name_ar?: string | null;
          name_fr: string;
          price: number;
          promo_price?: number | null;
          published_at?: string | null;
          rating_avg?: number;
          rating_count?: number;
          seller_id?: string | null;
          seo_description_ar?: string | null;
          seo_description_fr?: string | null;
          seo_title_ar?: string | null;
          seo_title_fr?: string | null;
          sku: string;
          slug: string;
          status?: Database["public"]["Enums"]["product_status"];
          submitted_at?: string | null;
          updated_at?: string;
          video_url?: string | null;
          warranty?: string | null;
          weight_grams?: number | null;
        };
        Update: {
          approved_at?: string | null;
          approved_by?: string | null;
          barcode?: string | null;
          boost_score?: number;
          boost_tier?: string | null;
          boosted_at?: string | null;
          boosted_until?: string | null;
          brand?: string | null;
          brand_id?: string | null;
          category_id?: string;
          condition?: Database["public"]["Enums"]["listing_condition"] | null;
          created_at?: string;
          description_ar?: string | null;
          description_fr?: string | null;
          dimensions_cm?: string | null;
          has_variants?: boolean;
          id?: string;
          is_boosted?: boolean;
          is_featured?: boolean;
          landed_cost?: number | null;
          model?: string | null;
          moderation_feedback?: string | null;
          name_ar?: string | null;
          name_fr?: string;
          price?: number;
          promo_price?: number | null;
          published_at?: string | null;
          rating_avg?: number;
          rating_count?: number;
          seller_id?: string | null;
          seo_description_ar?: string | null;
          seo_description_fr?: string | null;
          seo_title_ar?: string | null;
          seo_title_fr?: string | null;
          sku?: string;
          slug?: string;
          status?: Database["public"]["Enums"]["product_status"];
          submitted_at?: string | null;
          updated_at?: string;
          video_url?: string | null;
          warranty?: string | null;
          weight_grams?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "products_brand_id_fkey";
            columns: ["brand_id"];
            isOneToOne: false;
            referencedRelation: "brands";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "products_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "products_seller_id_fkey";
            columns: ["seller_id"];
            isOneToOne: false;
            referencedRelation: "public_seller_shops";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "products_seller_id_fkey";
            columns: ["seller_id"];
            isOneToOne: false;
            referencedRelation: "seller_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          created_at: string;
          email: string | null;
          full_name: string | null;
          id: string;
          phone: string | null;
          preferred_locale: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          email?: string | null;
          full_name?: string | null;
          id: string;
          phone?: string | null;
          preferred_locale?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          email?: string | null;
          full_name?: string | null;
          id?: string;
          phone?: string | null;
          preferred_locale?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      promotions: {
        Row: {
          code: string;
          created_at: string;
          description: string | null;
          ends_at: string | null;
          id: string;
          is_active: boolean;
          max_uses: number | null;
          min_order_amount: number;
          starts_at: string | null;
          type: Database["public"]["Enums"]["promotion_type"];
          used_count: number;
          value: number;
        };
        Insert: {
          code: string;
          created_at?: string;
          description?: string | null;
          ends_at?: string | null;
          id?: string;
          is_active?: boolean;
          max_uses?: number | null;
          min_order_amount?: number;
          starts_at?: string | null;
          type?: Database["public"]["Enums"]["promotion_type"];
          used_count?: number;
          value: number;
        };
        Update: {
          code?: string;
          created_at?: string;
          description?: string | null;
          ends_at?: string | null;
          id?: string;
          is_active?: boolean;
          max_uses?: number | null;
          min_order_amount?: number;
          starts_at?: string | null;
          type?: Database["public"]["Enums"]["promotion_type"];
          used_count?: number;
          value?: number;
        };
        Relationships: [];
      };
      rbac_permissions: {
        Row: {
          code: string;
          display_order: number;
          label_ar: string;
          label_fr: string;
          module: string;
        };
        Insert: {
          code: string;
          display_order?: number;
          label_ar: string;
          label_fr: string;
          module: string;
        };
        Update: {
          code?: string;
          display_order?: number;
          label_ar?: string;
          label_fr?: string;
          module?: string;
        };
        Relationships: [];
      };
      rbac_role_permissions: {
        Row: {
          permission_code: string;
          role_code: string;
        };
        Insert: {
          permission_code: string;
          role_code: string;
        };
        Update: {
          permission_code?: string;
          role_code?: string;
        };
        Relationships: [
          {
            foreignKeyName: "rbac_role_permissions_permission_code_fkey";
            columns: ["permission_code"];
            isOneToOne: false;
            referencedRelation: "rbac_permissions";
            referencedColumns: ["code"];
          },
          {
            foreignKeyName: "rbac_role_permissions_role_code_fkey";
            columns: ["role_code"];
            isOneToOne: false;
            referencedRelation: "rbac_roles";
            referencedColumns: ["code"];
          },
        ];
      };
      rbac_roles: {
        Row: {
          code: string;
          created_at: string;
          description_ar: string;
          description_fr: string;
          display_order: number;
          is_system: boolean;
          name_ar: string;
          name_fr: string;
        };
        Insert: {
          code: string;
          created_at?: string;
          description_ar: string;
          description_fr: string;
          display_order?: number;
          is_system?: boolean;
          name_ar: string;
          name_fr: string;
        };
        Update: {
          code?: string;
          created_at?: string;
          description_ar?: string;
          description_fr?: string;
          display_order?: number;
          is_system?: boolean;
          name_ar?: string;
          name_fr?: string;
        };
        Relationships: [];
      };
      return_items: {
        Row: {
          condition: Database["public"]["Enums"]["return_condition"] | null;
          id: string;
          loss_amount: number;
          order_item_id: string;
          processed_at: string | null;
          quantity: number;
          return_id: string;
          variant_id: string;
        };
        Insert: {
          condition?: Database["public"]["Enums"]["return_condition"] | null;
          id?: string;
          loss_amount?: number;
          order_item_id: string;
          processed_at?: string | null;
          quantity: number;
          return_id: string;
          variant_id: string;
        };
        Update: {
          condition?: Database["public"]["Enums"]["return_condition"] | null;
          id?: string;
          loss_amount?: number;
          order_item_id?: string;
          processed_at?: string | null;
          quantity?: number;
          return_id?: string;
          variant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "return_items_order_item_id_fkey";
            columns: ["order_item_id"];
            isOneToOne: false;
            referencedRelation: "order_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "return_items_return_id_fkey";
            columns: ["return_id"];
            isOneToOne: false;
            referencedRelation: "returns";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "return_items_return_id_fkey";
            columns: ["return_id"];
            isOneToOne: false;
            referencedRelation: "seller_returns_view";
            referencedColumns: ["id"];
          },
        ];
      };
      return_status_history: {
        Row: {
          changed_by: string | null;
          created_at: string;
          from_status: Database["public"]["Enums"]["return_status"] | null;
          id: string;
          note: string | null;
          return_id: string;
          to_status: Database["public"]["Enums"]["return_status"];
        };
        Insert: {
          changed_by?: string | null;
          created_at?: string;
          from_status?: Database["public"]["Enums"]["return_status"] | null;
          id?: string;
          note?: string | null;
          return_id: string;
          to_status: Database["public"]["Enums"]["return_status"];
        };
        Update: {
          changed_by?: string | null;
          created_at?: string;
          from_status?: Database["public"]["Enums"]["return_status"] | null;
          id?: string;
          note?: string | null;
          return_id?: string;
          to_status?: Database["public"]["Enums"]["return_status"];
        };
        Relationships: [
          {
            foreignKeyName: "return_status_history_return_id_fkey";
            columns: ["return_id"];
            isOneToOne: false;
            referencedRelation: "returns";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "return_status_history_return_id_fkey";
            columns: ["return_id"];
            isOneToOne: false;
            referencedRelation: "seller_returns_view";
            referencedColumns: ["id"];
          },
        ];
      };
      returns: {
        Row: {
          admin_note: string | null;
          created_at: string;
          description: string | null;
          id: string;
          order_id: string;
          photos: string[];
          processed_at: string | null;
          processed_by: string | null;
          reason: string;
          reference: string;
          refund_amount: number;
          status: Database["public"]["Enums"]["return_status"];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          admin_note?: string | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          order_id: string;
          photos?: string[];
          processed_at?: string | null;
          processed_by?: string | null;
          reason: string;
          reference: string;
          refund_amount?: number;
          status?: Database["public"]["Enums"]["return_status"];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          admin_note?: string | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          order_id?: string;
          photos?: string[];
          processed_at?: string | null;
          processed_by?: string | null;
          reason?: string;
          reference?: string;
          refund_amount?: number;
          status?: Database["public"]["Enums"]["return_status"];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "returns_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ];
      };
      reviews: {
        Row: {
          author_name: string | null;
          comment: string | null;
          created_at: string;
          id: string;
          is_verified: boolean;
          product_id: string;
          rating: number;
          seller_id: string | null;
          status: Database["public"]["Enums"]["review_status"];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          author_name?: string | null;
          comment?: string | null;
          created_at?: string;
          id?: string;
          is_verified?: boolean;
          product_id: string;
          rating: number;
          seller_id?: string | null;
          status?: Database["public"]["Enums"]["review_status"];
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          author_name?: string | null;
          comment?: string | null;
          created_at?: string;
          id?: string;
          is_verified?: boolean;
          product_id?: string;
          rating?: number;
          seller_id?: string | null;
          status?: Database["public"]["Enums"]["review_status"];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reviews_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reviews_seller_id_fkey";
            columns: ["seller_id"];
            isOneToOne: false;
            referencedRelation: "public_seller_shops";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reviews_seller_id_fkey";
            columns: ["seller_id"];
            isOneToOne: false;
            referencedRelation: "seller_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      seller_application_fields: {
        Row: {
          created_at: string;
          display_order: number;
          field_key: string;
          field_type: string;
          id: string;
          is_active: boolean;
          is_required: boolean;
          label_ar: string | null;
          label_fr: string;
          options: string[];
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          display_order?: number;
          field_key: string;
          field_type?: string;
          id?: string;
          is_active?: boolean;
          is_required?: boolean;
          label_ar?: string | null;
          label_fr: string;
          options?: string[];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          display_order?: number;
          field_key?: string;
          field_type?: string;
          id?: string;
          is_active?: boolean;
          is_required?: boolean;
          label_ar?: string | null;
          label_fr?: string;
          options?: string[];
          updated_at?: string;
        };
        Relationships: [];
      };
      seller_applications: {
        Row: {
          address: string | null;
          admin_note: string | null;
          city: string;
          created_at: string;
          description_ar: string | null;
          description_fr: string | null;
          email: string | null;
          extra: Json;
          id: string;
          logo_url: string | null;
          phone: string;
          reviewed_at: string | null;
          reviewed_by: string | null;
          seller_id: string;
          shop_name: string;
          shop_slug: string;
          status: Database["public"]["Enums"]["seller_status"];
          user_id: string;
        };
        Insert: {
          address?: string | null;
          admin_note?: string | null;
          city: string;
          created_at?: string;
          description_ar?: string | null;
          description_fr?: string | null;
          email?: string | null;
          extra?: Json;
          id?: string;
          logo_url?: string | null;
          phone: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          seller_id: string;
          shop_name: string;
          shop_slug: string;
          status?: Database["public"]["Enums"]["seller_status"];
          user_id: string;
        };
        Update: {
          address?: string | null;
          admin_note?: string | null;
          city?: string;
          created_at?: string;
          description_ar?: string | null;
          description_fr?: string | null;
          email?: string | null;
          extra?: Json;
          id?: string;
          logo_url?: string | null;
          phone?: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          seller_id?: string;
          shop_name?: string;
          shop_slug?: string;
          status?: Database["public"]["Enums"]["seller_status"];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "seller_applications_seller_id_fkey";
            columns: ["seller_id"];
            isOneToOne: false;
            referencedRelation: "public_seller_shops";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "seller_applications_seller_id_fkey";
            columns: ["seller_id"];
            isOneToOne: false;
            referencedRelation: "seller_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      seller_commission_settings: {
        Row: {
          commission_pct: number;
          created_at: string;
          created_by: string | null;
          fixed_fee: number;
          id: string;
          note: string | null;
          seller_id: string | null;
          updated_at: string;
        };
        Insert: {
          commission_pct: number;
          created_at?: string;
          created_by?: string | null;
          fixed_fee?: number;
          id?: string;
          note?: string | null;
          seller_id?: string | null;
          updated_at?: string;
        };
        Update: {
          commission_pct?: number;
          created_at?: string;
          created_by?: string | null;
          fixed_fee?: number;
          id?: string;
          note?: string | null;
          seller_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "seller_commission_settings_seller_id_fkey";
            columns: ["seller_id"];
            isOneToOne: false;
            referencedRelation: "public_seller_shops";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "seller_commission_settings_seller_id_fkey";
            columns: ["seller_id"];
            isOneToOne: false;
            referencedRelation: "seller_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      seller_order_groups: {
        Row: {
          commission_fixed: number;
          commission_rate: number;
          commission_reversed: number;
          commission_total: number;
          created_at: string;
          delivered_at: string | null;
          discount_total: number;
          id: string;
          net_amount: number;
          order_id: string;
          refund_total: number;
          seller_id: string | null;
          status: Database["public"]["Enums"]["order_status"];
          stock_state: Database["public"]["Enums"]["stock_state"];
          subtotal: number;
          updated_at: string;
        };
        Insert: {
          commission_fixed?: number;
          commission_rate?: number;
          commission_reversed?: number;
          commission_total?: number;
          created_at?: string;
          delivered_at?: string | null;
          discount_total?: number;
          id?: string;
          net_amount?: number;
          order_id: string;
          refund_total?: number;
          seller_id?: string | null;
          status?: Database["public"]["Enums"]["order_status"];
          stock_state?: Database["public"]["Enums"]["stock_state"];
          subtotal?: number;
          updated_at?: string;
        };
        Update: {
          commission_fixed?: number;
          commission_rate?: number;
          commission_reversed?: number;
          commission_total?: number;
          created_at?: string;
          delivered_at?: string | null;
          discount_total?: number;
          id?: string;
          net_amount?: number;
          order_id?: string;
          refund_total?: number;
          seller_id?: string | null;
          status?: Database["public"]["Enums"]["order_status"];
          stock_state?: Database["public"]["Enums"]["stock_state"];
          subtotal?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "seller_order_groups_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "seller_order_groups_seller_id_fkey";
            columns: ["seller_id"];
            isOneToOne: false;
            referencedRelation: "public_seller_shops";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "seller_order_groups_seller_id_fkey";
            columns: ["seller_id"];
            isOneToOne: false;
            referencedRelation: "seller_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      seller_order_status_history: {
        Row: {
          changed_by: string | null;
          created_at: string;
          from_status: Database["public"]["Enums"]["order_status"] | null;
          id: string;
          note: string | null;
          seller_group_id: string;
          to_status: Database["public"]["Enums"]["order_status"];
        };
        Insert: {
          changed_by?: string | null;
          created_at?: string;
          from_status?: Database["public"]["Enums"]["order_status"] | null;
          id?: string;
          note?: string | null;
          seller_group_id: string;
          to_status: Database["public"]["Enums"]["order_status"];
        };
        Update: {
          changed_by?: string | null;
          created_at?: string;
          from_status?: Database["public"]["Enums"]["order_status"] | null;
          id?: string;
          note?: string | null;
          seller_group_id?: string;
          to_status?: Database["public"]["Enums"]["order_status"];
        };
        Relationships: [
          {
            foreignKeyName: "seller_order_status_history_seller_group_id_fkey";
            columns: ["seller_group_id"];
            isOneToOne: false;
            referencedRelation: "seller_order_groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "seller_order_status_history_seller_group_id_fkey";
            columns: ["seller_group_id"];
            isOneToOne: false;
            referencedRelation: "seller_orders_view";
            referencedColumns: ["seller_group_id"];
          },
        ];
      };
      seller_profiles: {
        Row: {
          address: string | null;
          admin_note: string | null;
          approved_at: string | null;
          approved_by: string | null;
          city: string;
          created_at: string;
          description_ar: string | null;
          description_fr: string | null;
          email: string | null;
          extra: Json;
          id: string;
          logo_url: string | null;
          phone: string;
          rating_avg: number;
          rating_count: number;
          shop_name: string;
          shop_slug: string;
          status: Database["public"]["Enums"]["seller_status"];
          suspended_at: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          address?: string | null;
          admin_note?: string | null;
          approved_at?: string | null;
          approved_by?: string | null;
          city: string;
          created_at?: string;
          description_ar?: string | null;
          description_fr?: string | null;
          email?: string | null;
          extra?: Json;
          id?: string;
          logo_url?: string | null;
          phone: string;
          rating_avg?: number;
          rating_count?: number;
          shop_name: string;
          shop_slug: string;
          status?: Database["public"]["Enums"]["seller_status"];
          suspended_at?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          address?: string | null;
          admin_note?: string | null;
          approved_at?: string | null;
          approved_by?: string | null;
          city?: string;
          created_at?: string;
          description_ar?: string | null;
          description_fr?: string | null;
          email?: string | null;
          extra?: Json;
          id?: string;
          logo_url?: string | null;
          phone?: string;
          rating_avg?: number;
          rating_count?: number;
          shop_name?: string;
          shop_slug?: string;
          status?: Database["public"]["Enums"]["seller_status"];
          suspended_at?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      seller_return_notes: {
        Row: {
          author_id: string | null;
          created_at: string;
          id: string;
          note: string;
          return_id: string;
          seller_id: string;
        };
        Insert: {
          author_id?: string | null;
          created_at?: string;
          id?: string;
          note: string;
          return_id: string;
          seller_id: string;
        };
        Update: {
          author_id?: string | null;
          created_at?: string;
          id?: string;
          note?: string;
          return_id?: string;
          seller_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "seller_return_notes_return_id_fkey";
            columns: ["return_id"];
            isOneToOne: false;
            referencedRelation: "returns";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "seller_return_notes_return_id_fkey";
            columns: ["return_id"];
            isOneToOne: false;
            referencedRelation: "seller_returns_view";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "seller_return_notes_seller_id_fkey";
            columns: ["seller_id"];
            isOneToOne: false;
            referencedRelation: "public_seller_shops";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "seller_return_notes_seller_id_fkey";
            columns: ["seller_id"];
            isOneToOne: false;
            referencedRelation: "seller_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      seller_settlement_items: {
        Row: {
          commission_amount: number;
          created_at: string;
          gross_amount: number;
          id: string;
          net_amount: number;
          seller_group_id: string;
          settlement_id: string;
        };
        Insert: {
          commission_amount?: number;
          created_at?: string;
          gross_amount?: number;
          id?: string;
          net_amount?: number;
          seller_group_id: string;
          settlement_id: string;
        };
        Update: {
          commission_amount?: number;
          created_at?: string;
          gross_amount?: number;
          id?: string;
          net_amount?: number;
          seller_group_id?: string;
          settlement_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "seller_settlement_items_seller_group_id_fkey";
            columns: ["seller_group_id"];
            isOneToOne: true;
            referencedRelation: "seller_order_groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "seller_settlement_items_seller_group_id_fkey";
            columns: ["seller_group_id"];
            isOneToOne: true;
            referencedRelation: "seller_orders_view";
            referencedColumns: ["seller_group_id"];
          },
          {
            foreignKeyName: "seller_settlement_items_settlement_id_fkey";
            columns: ["settlement_id"];
            isOneToOne: false;
            referencedRelation: "seller_settlements";
            referencedColumns: ["id"];
          },
        ];
      };
      seller_settlement_payments: {
        Row: {
          amount: number;
          created_at: string;
          id: string;
          note: string | null;
          paid_at: string;
          recorded_by: string | null;
          settlement_id: string;
        };
        Insert: {
          amount: number;
          created_at?: string;
          id?: string;
          note?: string | null;
          paid_at?: string;
          recorded_by?: string | null;
          settlement_id: string;
        };
        Update: {
          amount?: number;
          created_at?: string;
          id?: string;
          note?: string | null;
          paid_at?: string;
          recorded_by?: string | null;
          settlement_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "seller_settlement_payments_settlement_id_fkey";
            columns: ["settlement_id"];
            isOneToOne: false;
            referencedRelation: "seller_settlements";
            referencedColumns: ["id"];
          },
        ];
      };
      seller_settlements: {
        Row: {
          commission: number;
          created_at: string;
          discounts: number;
          fees: number;
          gross_sales: number;
          id: string;
          net_amount: number;
          note: string | null;
          paid_amount: number;
          period_end: string | null;
          period_start: string | null;
          reference: string;
          refunds: number;
          seller_id: string;
          settled_at: string | null;
          settled_by: string | null;
          status: Database["public"]["Enums"]["settlement_status"];
          updated_at: string;
        };
        Insert: {
          commission?: number;
          created_at?: string;
          discounts?: number;
          fees?: number;
          gross_sales?: number;
          id?: string;
          net_amount?: number;
          note?: string | null;
          paid_amount?: number;
          period_end?: string | null;
          period_start?: string | null;
          reference: string;
          refunds?: number;
          seller_id: string;
          settled_at?: string | null;
          settled_by?: string | null;
          status?: Database["public"]["Enums"]["settlement_status"];
          updated_at?: string;
        };
        Update: {
          commission?: number;
          created_at?: string;
          discounts?: number;
          fees?: number;
          gross_sales?: number;
          id?: string;
          net_amount?: number;
          note?: string | null;
          paid_amount?: number;
          period_end?: string | null;
          period_start?: string | null;
          reference?: string;
          refunds?: number;
          seller_id?: string;
          settled_at?: string | null;
          settled_by?: string | null;
          status?: Database["public"]["Enums"]["settlement_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "seller_settlements_seller_id_fkey";
            columns: ["seller_id"];
            isOneToOne: false;
            referencedRelation: "public_seller_shops";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "seller_settlements_seller_id_fkey";
            columns: ["seller_id"];
            isOneToOne: false;
            referencedRelation: "seller_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      seller_status_history: {
        Row: {
          changed_by: string | null;
          created_at: string;
          from_status: Database["public"]["Enums"]["seller_status"] | null;
          id: string;
          note: string | null;
          seller_id: string;
          to_status: Database["public"]["Enums"]["seller_status"];
        };
        Insert: {
          changed_by?: string | null;
          created_at?: string;
          from_status?: Database["public"]["Enums"]["seller_status"] | null;
          id?: string;
          note?: string | null;
          seller_id: string;
          to_status: Database["public"]["Enums"]["seller_status"];
        };
        Update: {
          changed_by?: string | null;
          created_at?: string;
          from_status?: Database["public"]["Enums"]["seller_status"] | null;
          id?: string;
          note?: string | null;
          seller_id?: string;
          to_status?: Database["public"]["Enums"]["seller_status"];
        };
        Relationships: [
          {
            foreignKeyName: "seller_status_history_seller_id_fkey";
            columns: ["seller_id"];
            isOneToOne: false;
            referencedRelation: "public_seller_shops";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "seller_status_history_seller_id_fkey";
            columns: ["seller_id"];
            isOneToOne: false;
            referencedRelation: "seller_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      store_settings: {
        Row: {
          announcement_ar: string | null;
          announcement_fr: string | null;
          commission_fixed_fee: number;
          condition_options: string[];
          currency: string;
          default_commission_pct: number;
          default_low_stock_threshold: number;
          delivery_cities: string[];
          delivery_fee: number;
          free_delivery_threshold: number | null;
          id: boolean;
          reapprove_seller_edits: boolean;
          return_window_days: number;
          seller_terms_ar: string | null;
          seller_terms_fr: string | null;
          store_name: string;
          support_email: string | null;
          support_phone: string | null;
          updated_at: string;
        };
        Insert: {
          announcement_ar?: string | null;
          announcement_fr?: string | null;
          commission_fixed_fee?: number;
          condition_options?: string[];
          currency?: string;
          default_commission_pct?: number;
          default_low_stock_threshold?: number;
          delivery_cities?: string[];
          delivery_fee?: number;
          free_delivery_threshold?: number | null;
          id?: boolean;
          reapprove_seller_edits?: boolean;
          return_window_days?: number;
          seller_terms_ar?: string | null;
          seller_terms_fr?: string | null;
          store_name?: string;
          support_email?: string | null;
          support_phone?: string | null;
          updated_at?: string;
        };
        Update: {
          announcement_ar?: string | null;
          announcement_fr?: string | null;
          commission_fixed_fee?: number;
          condition_options?: string[];
          currency?: string;
          default_commission_pct?: number;
          default_low_stock_threshold?: number;
          delivery_cities?: string[];
          delivery_fee?: number;
          free_delivery_threshold?: number | null;
          id?: boolean;
          reapprove_seller_edits?: boolean;
          return_window_days?: number;
          seller_terms_ar?: string | null;
          seller_terms_fr?: string | null;
          store_name?: string;
          support_email?: string | null;
          support_phone?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      token_balances: {
        Row: {
          balance: number;
          created_at: string;
          id: string;
          total_earned: number;
          total_spent: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          balance?: number;
          created_at?: string;
          id?: string;
          total_earned?: number;
          total_spent?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          balance?: number;
          created_at?: string;
          id?: string;
          total_earned?: number;
          total_spent?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      token_transactions: {
        Row: {
          amount: number;
          balance_after: number;
          created_at: string;
          id: string;
          note: string | null;
          product_id: string | null;
          reason: string;
          user_id: string;
        };
        Insert: {
          amount: number;
          balance_after: number;
          created_at?: string;
          id?: string;
          note?: string | null;
          product_id?: string | null;
          reason: string;
          user_id: string;
        };
        Update: {
          amount?: number;
          balance_after?: number;
          created_at?: string;
          id?: string;
          note?: string | null;
          product_id?: string | null;
          reason?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "token_transactions_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      user_rbac_roles: {
        Row: {
          assigned_by: string | null;
          created_at: string;
          role_code: string;
          user_id: string;
        };
        Insert: {
          assigned_by?: string | null;
          created_at?: string;
          role_code: string;
          user_id: string;
        };
        Update: {
          assigned_by?: string | null;
          created_at?: string;
          role_code?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_rbac_roles_role_code_fkey";
            columns: ["role_code"];
            isOneToOne: false;
            referencedRelation: "rbac_roles";
            referencedColumns: ["code"];
          },
        ];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
      variant_attribute_values: {
        Row: {
          attribute_id: string;
          option_id: string;
          variant_id: string;
        };
        Insert: {
          attribute_id: string;
          option_id: string;
          variant_id: string;
        };
        Update: {
          attribute_id?: string;
          option_id?: string;
          variant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "variant_attribute_values_attribute_id_fkey";
            columns: ["attribute_id"];
            isOneToOne: false;
            referencedRelation: "category_attributes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "variant_attribute_values_option_id_fkey";
            columns: ["option_id"];
            isOneToOne: false;
            referencedRelation: "category_attribute_options";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "variant_attribute_values_variant_id_fkey";
            columns: ["variant_id"];
            isOneToOne: false;
            referencedRelation: "product_variants";
            referencedColumns: ["id"];
          },
        ];
      };
      variant_costs: {
        Row: {
          cost: number;
          updated_at: string;
          variant_id: string;
        };
        Insert: {
          cost?: number;
          updated_at?: string;
          variant_id: string;
        };
        Update: {
          cost?: number;
          updated_at?: string;
          variant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "variant_costs_variant_id_fkey";
            columns: ["variant_id"];
            isOneToOne: true;
            referencedRelation: "product_variants";
            referencedColumns: ["id"];
          },
        ];
      };
      wishlists: {
        Row: {
          created_at: string;
          product_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          product_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          product_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "wishlists_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      public_seller_shops: {
        Row: {
          city: string | null;
          created_at: string | null;
          description_ar: string | null;
          description_fr: string | null;
          id: string | null;
          logo_url: string | null;
          rating_avg: number | null;
          rating_count: number | null;
          shop_name: string | null;
          shop_slug: string | null;
        };
        Insert: {
          city?: string | null;
          created_at?: string | null;
          description_ar?: string | null;
          description_fr?: string | null;
          id?: string | null;
          logo_url?: string | null;
          rating_avg?: number | null;
          rating_count?: number | null;
          shop_name?: string | null;
          shop_slug?: string | null;
        };
        Update: {
          city?: string | null;
          created_at?: string | null;
          description_ar?: string | null;
          description_fr?: string | null;
          id?: string | null;
          logo_url?: string | null;
          rating_avg?: number | null;
          rating_count?: number | null;
          shop_name?: string | null;
          shop_slug?: string | null;
        };
        Relationships: [];
      };
      seller_orders_view: {
        Row: {
          address: string | null;
          city: string | null;
          commission_fixed: number | null;
          commission_rate: number | null;
          commission_reversed: number | null;
          commission_total: number | null;
          created_at: string | null;
          customer_name: string | null;
          delivered_at: string | null;
          discount_total: number | null;
          email: string | null;
          instructions: string | null;
          item_count: number | null;
          net_amount: number | null;
          order_created_at: string | null;
          order_id: string | null;
          order_status: Database["public"]["Enums"]["order_status"] | null;
          payment_status: Database["public"]["Enums"]["payment_status"] | null;
          phone: string | null;
          reference: string | null;
          refund_total: number | null;
          seller_group_id: string | null;
          status: Database["public"]["Enums"]["order_status"] | null;
          stock_state: Database["public"]["Enums"]["stock_state"] | null;
          subtotal: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "seller_order_groups_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ];
      };
      seller_returns_view: {
        Row: {
          address: string | null;
          admin_note: string | null;
          all_mine: boolean | null;
          city: string | null;
          created_at: string | null;
          customer_name: string | null;
          description: string | null;
          id: string | null;
          my_item_count: number | null;
          my_refund_estimate: number | null;
          order_id: string | null;
          order_reference: string | null;
          phone: string | null;
          photos: string[] | null;
          processed_at: string | null;
          reason: string | null;
          reference: string | null;
          refund_amount: number | null;
          status: Database["public"]["Enums"]["return_status"] | null;
          total_item_count: number | null;
          user_id: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "returns_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Functions: {
      _apply_group_status: {
        Args: {
          _actor: string;
          _group_id: string;
          _note: string;
          _status: Database["public"]["Enums"]["order_status"];
        };
        Returns: undefined;
      };
      _apply_order_status: {
        Args: {
          _actor: string;
          _note: string;
          _order_id: string;
          _status: Database["public"]["Enums"]["order_status"];
        };
        Returns: undefined;
      };
      _move_stock: {
        Args: {
          _actor: string;
          _from: string;
          _order_id: string;
          _qty: number;
          _reason: string;
          _return_id: string;
          _to: string;
          _type: Database["public"]["Enums"]["movement_type"];
          _variant_id: string;
        };
        Returns: undefined;
      };
      _order_status_from_rank: {
        Args: { _rank: number };
        Returns: Database["public"]["Enums"]["order_status"];
      };
      _order_status_rank: {
        Args: { _status: Database["public"]["Enums"]["order_status"] };
        Returns: number;
      };
      _refresh_order_status_from_groups: {
        Args: { _actor: string; _order_id: string };
        Returns: undefined;
      };
      _seller_group_fully_returned: {
        Args: { _group_id: string };
        Returns: boolean;
      };
      adjust_inventory: {
        Args: {
          _action: string;
          _quantity: number;
          _reason: string;
          _variant_id: string;
        };
        Returns: undefined;
      };
      admin_bulk_adjust_product_prices: {
        Args: { _delta: number; _mode: string; _product_ids: string[] };
        Returns: number;
      };
      admin_cancel_settlement: {
        Args: { _note?: string; _settlement_id: string };
        Returns: undefined;
      };
      admin_create_settlement: {
        Args: {
          _note?: string;
          _period_end?: string;
          _period_start?: string;
          _seller_id: string;
        };
        Returns: Json;
      };
      admin_customer_directory: {
        Args: { _limit?: number; _offset?: number; _q?: string };
        Returns: {
          cancelled_count: number;
          city: string;
          customer_key: string;
          delivered_count: number;
          email: string;
          first_order_at: string;
          full_name: string;
          last_order_at: string;
          order_count: number;
          phone: string;
          total: number;
          total_spent: number;
          user_id: string;
        }[];
      };
      admin_duplicate_product: { Args: { _source_id: string }; Returns: string };
      admin_exists: { Args: never; Returns: boolean };
      admin_get_ai_settings_status: {
        Args: never;
        Returns: {
          ai_model: string;
          assistant_enabled: boolean;
          fal_key_hint: string;
          has_fal_key: boolean;
          has_openai_key: boolean;
          has_replicate_token: boolean;
          image_model: string;
          openai_key_hint: string;
          replicate_token_hint: string;
          updated_at: string;
        }[];
      };
      admin_manage_tokens: {
        Args: { _amount: number; _note?: string; _target_user_id: string };
        Returns: Json;
      };
      admin_record_settlement_payment: {
        Args: { _amount: number; _note?: string; _settlement_id: string };
        Returns: Json;
      };
      admin_review_seller: {
        Args: {
          _note?: string;
          _seller_id: string;
          _status: Database["public"]["Enums"]["seller_status"];
        };
        Returns: undefined;
      };
      admin_save_ai_settings: {
        Args: {
          _ai_model?: string;
          _assistant_enabled?: boolean;
          _clear_fal_key?: boolean;
          _clear_openai_key?: boolean;
          _clear_replicate_token?: boolean;
          _fal_api_key?: string;
          _image_model?: string;
          _openai_api_key?: string;
          _replicate_api_token?: string;
        };
        Returns: undefined;
      };
      admin_set_seller_commission: {
        Args: {
          _commission_pct: number;
          _fixed_fee?: number;
          _note?: string;
          _seller_id: string;
        };
        Returns: undefined;
      };
      boost_product: {
        Args: { _days?: number; _product_id: string; _tier: string };
        Returns: Json;
      };
      cancel_my_order: {
        Args: { _order_id: string; _reason?: string };
        Returns: undefined;
      };
      check_promo: { Args: { _code: string; _subtotal: number }; Returns: Json };
      claim_first_admin: { Args: never; Returns: boolean };
      collect_cod_payment: {
        Args: {
          _amount: number;
          _collected_at?: string;
          _collected_by: string;
          _note?: string;
          _order_id: string;
        };
        Returns: undefined;
      };
      create_order: {
        Args: {
          _address: string;
          _city: string;
          _customer_name: string;
          _email: string;
          _instructions: string;
          _items: Json;
          _phone: string;
          _promo_code?: string;
          _save_address?: boolean;
        };
        Returns: Json;
      };
      current_seller_id: { Args: never; Returns: string };
      delete_product: { Args: { _product_id: string }; Returns: string };
      get_assistant_public_status: { Args: never; Returns: boolean };
      get_best_sellers: {
        Args: { _limit?: number };
        Returns: {
          product_id: string;
          sold: number;
        }[];
      };
      get_category_attributes: {
        Args: { _category_id: string };
        Returns: {
          category_id: string;
          code: string;
          depth: number;
          display_order: number;
          id: string;
          inherited: boolean;
          is_filterable: boolean;
          is_required: boolean;
          is_searchable: boolean;
          is_variant: boolean;
          name_ar: string;
          name_fr: string;
          type: Database["public"]["Enums"]["attribute_type"];
          unit: string;
        }[];
      };
      get_my_rbac_profile: { Args: never; Returns: Json };
      get_or_create_token_balance: {
        Args: { _user_id?: string };
        Returns: {
          balance: number;
          total_earned: number;
          total_spent: number;
          user_id: string;
        }[];
      };
      get_seller_shop: { Args: { _slug: string }; Returns: Json };
      get_variant_availability: {
        Args: { _product_ids: string[] };
        Returns: {
          available: number;
          product_id: string;
          variant_id: string;
        }[];
      };
      has_permission: { Args: { _perm: string }; Returns: boolean };
      has_purchased: { Args: { _product_id: string }; Returns: boolean };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      is_admin: { Args: never; Returns: boolean };
      is_seller: { Args: never; Returns: boolean };
      is_staff: { Args: never; Returns: boolean };
      log_audit_event: {
        Args: {
          _action: string;
          _entity_id?: string;
          _entity_type?: string;
          _metadata?: Json;
          _module: string;
          _summary: string;
        };
        Returns: string;
      };
      mask_secret_hint: { Args: { _val: string }; Returns: string };
      moderate_listing: {
        Args: {
          _action: Database["public"]["Enums"]["moderation_action"];
          _note?: string;
          _product_id: string;
        };
        Returns: undefined;
      };
      my_seller_id: { Args: never; Returns: string };
      normalize_phone: { Args: { _phone: string }; Returns: string };
      process_return: {
        Args: { _items: Json; _note?: string; _return_id: string };
        Returns: Json;
      };
      request_return: {
        Args: {
          _description?: string;
          _items: Json;
          _order_id: string;
          _photos?: string[];
          _reason: string;
        };
        Returns: Json;
      };
      require_seller: {
        Args: never;
        Returns: {
          address: string | null;
          admin_note: string | null;
          approved_at: string | null;
          approved_by: string | null;
          city: string;
          created_at: string;
          description_ar: string | null;
          description_fr: string | null;
          email: string | null;
          extra: Json;
          id: string;
          logo_url: string | null;
          phone: string;
          rating_avg: number;
          rating_count: number;
          shop_name: string;
          shop_slug: string;
          status: Database["public"]["Enums"]["seller_status"];
          suspended_at: string | null;
          updated_at: string;
          user_id: string;
        };
        SetofOptions: {
          from: "*";
          to: "seller_profiles";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      save_product: {
        Args: {
          _attributes: Json;
          _images: Json;
          _product: Json;
          _variants: Json;
        };
        Returns: string;
      };
      search_products: {
        Args: {
          _category_id?: string;
          _filters?: Json;
          _limit?: number;
          _max_price?: number;
          _min_price?: number;
          _offset?: number;
          _q?: string;
          _sort?: string;
        };
        Returns: {
          product_id: string;
          total: number;
        }[];
      };
      seller_adjust_inventory: {
        Args: {
          _action: string;
          _quantity: number;
          _reason: string;
          _variant_id: string;
        };
        Returns: undefined;
      };
      seller_listing_detail: { Args: { _product_id: string }; Returns: Json };
      seller_owns_return: { Args: { _return_id: string }; Returns: boolean };
      seller_set_listing_status: {
        Args: {
          _product_id: string;
          _status: Database["public"]["Enums"]["product_status"];
        };
        Returns: undefined;
      };
      seller_update_return_status: {
        Args: {
          _note?: string;
          _return_id: string;
          _status: Database["public"]["Enums"]["return_status"];
        };
        Returns: undefined;
      };
      set_low_stock_threshold: {
        Args: { _threshold: number; _variant_id: string };
        Returns: undefined;
      };
      set_user_role: {
        Args: {
          _grant: boolean;
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: undefined;
      };
      staff_get_ai_runtime_config: {
        Args: never;
        Returns: {
          ai_model: string;
          assistant_enabled: boolean;
          fal_api_key: string;
          image_model: string;
          openai_api_key: string;
          replicate_api_token: string;
        }[];
      };
      submit_listing: { Args: { _product_id: string }; Returns: undefined };
      submit_seller_application: { Args: { _payload: Json }; Returns: Json };
      subscribe_newsletter: {
        Args: { _email: string; _locale?: string };
        Returns: boolean;
      };
      track_order: {
        Args: { _phone: string; _reference: string };
        Returns: Json;
      };
      update_order_status: {
        Args: {
          _note?: string;
          _order_id: string;
          _status: Database["public"]["Enums"]["order_status"];
        };
        Returns: undefined;
      };
      update_return_status: {
        Args: {
          _note?: string;
          _return_id: string;
          _status: Database["public"]["Enums"]["return_status"];
        };
        Returns: undefined;
      };
      update_seller_order_status: {
        Args: {
          _note?: string;
          _seller_group_id: string;
          _status: Database["public"]["Enums"]["order_status"];
        };
        Returns: undefined;
      };
      update_seller_profile: { Args: { _payload: Json }; Returns: undefined };
    };
    Enums: {
      app_role: "admin" | "staff";
      attribute_type:
        | "text"
        | "number"
        | "boolean"
        | "dropdown"
        | "multi_select"
        | "color"
        | "date"
        | "measurement";
      finance_entry_type:
        | "revenue"
        | "cogs"
        | "discount"
        | "delivery_income"
        | "cash_collected"
        | "refund"
        | "return_revenue_reversal"
        | "return_cogs_reversal"
        | "return_loss"
        | "damage_loss"
        | "commission"
        | "commission_reversal"
        | "seller_settlement";
      listing_condition: "new" | "like_new" | "good" | "acceptable" | "other";
      moderation_action:
        "submitted" | "approved" | "rejected" | "paused" | "reactivated" | "archived" | "updated";
      movement_type:
        | "initial"
        | "restock"
        | "removal"
        | "reservation"
        | "reservation_release"
        | "shipment"
        | "delivery_return"
        | "return_restock"
        | "return_damaged"
        | "damage"
        | "damage_writeoff"
        | "damage_repaired"
        | "incoming"
        | "incoming_received";
      order_status:
        | "pending"
        | "confirmed"
        | "preparing"
        | "shipped"
        | "out_for_delivery"
        | "delivered"
        | "cancelled"
        | "returned";
      payment_status: "unpaid" | "paid" | "refunded";
      product_status: "draft" | "published" | "archived" | "pending" | "rejected" | "paused";
      promotion_type: "percent" | "fixed";
      return_condition: "resalable" | "damaged" | "unsellable";
      return_status: "requested" | "approved" | "rejected" | "received" | "processed";
      review_status: "published" | "hidden";
      seller_status: "pending" | "approved" | "rejected" | "suspended";
      settlement_status: "pending" | "partial" | "paid" | "cancelled";
      stock_state: "reserved" | "consumed" | "released";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "staff"],
      attribute_type: [
        "text",
        "number",
        "boolean",
        "dropdown",
        "multi_select",
        "color",
        "date",
        "measurement",
      ],
      finance_entry_type: [
        "revenue",
        "cogs",
        "discount",
        "delivery_income",
        "cash_collected",
        "refund",
        "return_revenue_reversal",
        "return_cogs_reversal",
        "return_loss",
        "damage_loss",
        "commission",
        "commission_reversal",
        "seller_settlement",
      ],
      listing_condition: ["new", "like_new", "good", "acceptable", "other"],
      moderation_action: [
        "submitted",
        "approved",
        "rejected",
        "paused",
        "reactivated",
        "archived",
        "updated",
      ],
      movement_type: [
        "initial",
        "restock",
        "removal",
        "reservation",
        "reservation_release",
        "shipment",
        "delivery_return",
        "return_restock",
        "return_damaged",
        "damage",
        "damage_writeoff",
        "damage_repaired",
        "incoming",
        "incoming_received",
      ],
      order_status: [
        "pending",
        "confirmed",
        "preparing",
        "shipped",
        "out_for_delivery",
        "delivered",
        "cancelled",
        "returned",
      ],
      payment_status: ["unpaid", "paid", "refunded"],
      product_status: ["draft", "published", "archived", "pending", "rejected", "paused"],
      promotion_type: ["percent", "fixed"],
      return_condition: ["resalable", "damaged", "unsellable"],
      return_status: ["requested", "approved", "rejected", "received", "processed"],
      review_status: ["published", "hidden"],
      seller_status: ["pending", "approved", "rejected", "suspended"],
      settlement_status: ["pending", "partial", "paid", "cancelled"],
      stock_state: ["reserved", "consumed", "released"],
    },
  },
} as const;
