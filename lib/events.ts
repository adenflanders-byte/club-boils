// Shared school-event types (safe to import in the browser).

export interface SchoolEventRow {
  id: string;
  slug: string;
  school_name: string;
  short_name: string;
  event_date: string;
  timezone: string;
  order_cutoff_at: string;
  collection_start_at: string;
  collection_end_at: string;
  collection_location: string;
  collection_instructions: string;
  access_code_hash: string | null;
  access_code_version: number;
  session_ttl_minutes: number;
  status: "draft" | "open" | "closed" | "archived";
  event_fee: number;
  allowed_payment_methods: string[];
  hidden_item_ids: string[];
  student_id_required: boolean;
  policy_version: string;
  policy_text: string;
  created_at: string;
  updated_at: string;
}

export const EVENT_SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
