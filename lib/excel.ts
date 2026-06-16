// Parse an uploaded .xlsx/.csv into validated recipient rows.
// Expects a `name` column and an `email` column (case-insensitive, some
// common aliases accepted). Every other column becomes a custom field.

import * as XLSX from 'xlsx';

export interface ParsedRecipient {
  name: string;
  email: string;
  custom_fields: Record<string, string>;
}

export interface ParseResult {
  recipients: ParsedRecipient[];
  errors: string[]; // per-row problems (skipped rows)
  columns: string[]; // header columns seen (original casing)
}

const NAME_KEYS = ['name', 'full name', 'fullname', 'recipient', 'recipient name'];
const EMAIL_KEYS = ['email', 'e-mail', 'email address', 'mail'];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function pick(row: Record<string, unknown>, keys: string[]): string | undefined {
  for (const original of Object.keys(row)) {
    if (keys.includes(original.trim().toLowerCase())) {
      const v = row[original];
      if (v != null && String(v).trim() !== '') return String(v).trim();
    }
  }
  return undefined;
}

export function parseRecipients(buffer: ArrayBuffer | Uint8Array): ParseResult {
  // Buffer is a Uint8Array subclass; normalize either input to a Uint8Array.
  const data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const wb = XLSX.read(data, { type: 'array' });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) {
    return { recipients: [], errors: ['Workbook has no sheets.'], columns: [] };
  }

  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
    raw: false,
  });

  const columns = rows.length ? Object.keys(rows[0]) : [];
  const recipients: ParsedRecipient[] = [];
  const errors: string[] = [];

  rows.forEach((row, i) => {
    const rowNum = i + 2; // +1 for header, +1 for 1-based
    const name = pick(row, NAME_KEYS);
    const email = pick(row, EMAIL_KEYS);

    if (!name) {
      errors.push(`Row ${rowNum}: missing name — skipped.`);
      return;
    }
    if (!email) {
      errors.push(`Row ${rowNum}: missing email — skipped.`);
      return;
    }
    if (!EMAIL_RE.test(email)) {
      errors.push(`Row ${rowNum}: invalid email "${email}" — skipped.`);
      return;
    }

    // Everything that isn't the name/email column becomes a custom field.
    const custom_fields: Record<string, string> = {};
    for (const key of Object.keys(row)) {
      const k = key.trim().toLowerCase();
      if (NAME_KEYS.includes(k) || EMAIL_KEYS.includes(k)) continue;
      const value = row[key];
      if (value != null && String(value).trim() !== '') {
        custom_fields[key.trim()] = String(value).trim();
      }
    }

    recipients.push({ name, email, custom_fields });
  });

  return { recipients, errors, columns };
}
