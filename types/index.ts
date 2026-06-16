// Shared domain types — mirror db/schema.sql.

export type BatchStatus =
  | 'draft'
  | 'generating'
  | 'ready'
  | 'sending'
  | 'paused'
  | 'completed';

export type CertificateStatus =
  | 'pending'
  | 'generated'
  | 'queued'
  | 'sending'
  | 'sent'
  | 'failed'
  | 'revoked';

export type EmailJobStatus = 'pending' | 'processing' | 'done' | 'failed';

export type TemplateFileType = 'image' | 'pdf';

/** Where + how to draw one merge token on the template. */
export interface Placeholder {
  x: number;
  y: number;
  fontSize: number;
  color?: string; // hex, e.g. "#1a1a1a"
  align?: 'left' | 'center' | 'right';
  font?: string; // pdf-lib StandardFonts name, e.g. "Helvetica-Bold"
}

/** Map of token name -> placeholder. e.g. { name: {...}, date: {...} } */
export type PlaceholderMap = Record<string, Placeholder>;

export interface QrPosition {
  x: number;
  y: number;
  size: number;
}

export interface Template {
  id: string;
  name: string;
  storage_path: string;
  file_type: TemplateFileType;
  placeholders: PlaceholderMap;
  qr_position: QrPosition;
  width: number;
  height: number;
  created_at: string;
}

export interface Batch {
  id: string;
  name: string;
  template_id: string | null;
  email_subject: string;
  email_body: string;
  send_interval_seconds: number;
  status: BatchStatus;
  total_count: number;
  sent_count: number;
  failed_count: number;
  created_at: string;
}

export interface Certificate {
  id: string;
  uuid: string;
  batch_id: string;
  recipient_name: string;
  recipient_email: string;
  custom_fields: Record<string, string>;
  pdf_path: string | null;
  status: CertificateStatus;
  attempts: number;
  last_error: string | null;
  issued_at: string | null;
  sent_at: string | null;
  created_at: string;
}

export interface EmailJob {
  id: string;
  certificate_id: string;
  batch_id: string;
  scheduled_for: string;
  status: EmailJobStatus;
  attempts: number;
  created_at: string;
}

/** Sanitized shape returned by the public verification endpoint. No PII. */
export interface VerificationResult {
  found: boolean;
  status: 'valid' | 'revoked' | 'not_found';
  recipient_name?: string;
  title?: string; // batch name / event
  issued_at?: string | null;
  pdf_url?: string | null; // short-lived signed URL, when available
}
