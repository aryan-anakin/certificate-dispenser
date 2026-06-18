'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

const inputCls =
  'w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-900';
const labelCls = 'block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1';

const FONTS = [
  'Helvetica',
  'Helvetica-Bold',
  'Times-Roman',
  'Times-Bold',
  'Courier',
];

// Editing coords are in NATURAL image pixels, TOP-LEFT origin.
// A text field's (x, y) is its baseline anchor (the alignment point).
// They're converted to PDF points (bottom-left origin) on submit.
interface TextField {
  id: string;
  token: string;
  sample: string;
  x: number;
  y: number;
  fontSize: number;
  color: string;
  align: 'left' | 'center' | 'right';
  font: string;
}
interface QrBox {
  x: number; // top-left
  y: number;
  size: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
let idSeq = 0;
const nextId = () => `f${++idSeq}`;

export default function TemplateUploadForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isImage, setIsImage] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [natW, setNatW] = useState(0);
  const [natH, setNatH] = useState(0);

  const [fields, setFields] = useState<TextField[]>([]);
  const [qr, setQr] = useState<QrBox>({ x: 0, y: 0, size: 0 });
  const [selectedId, setSelectedId] = useState<string>('qr');
  const [newToken, setNewToken] = useState('');

  // Manual JSON fallback (used for PDF templates / no preview).
  const [jsonPlaceholders, setJsonPlaceholders] = useState(
    '{\n  "name": { "x": 421, "y": 320, "fontSize": 36, "color": "#1a1a1a", "align": "center", "font": "Helvetica-Bold" }\n}'
  );
  const [jsonQr, setJsonQr] = useState('{ "x": 700, "y": 60, "size": 90 }');

  const previewRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: string; kind: 'text' | 'qr'; dx: number; dy: number } | null>(null);

  // Displayed preview size (cap width, keep aspect). scale maps natural→screen.
  const DISPLAY_W = Math.min(natW || 1, 560);
  const scale = natW ? DISPLAY_W / natW : 1;

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  function onFile(f: File | null) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setError(null);
    if (!f) {
      setFile(null); setIsImage(false); setPreviewUrl(null); setNatW(0); setNatH(0);
      return;
    }
    setFile(f);
    const image = f.type.startsWith('image/');
    setIsImage(image);
    if (!image) { setPreviewUrl(null); setNatW(0); setNatH(0); return; }

    const url = URL.createObjectURL(f);
    setPreviewUrl(url);
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth, h = img.naturalHeight;
      setNatW(w); setNatH(h);
      // Seed sensible defaults relative to the image size.
      const fs = Math.round(h * 0.06);
      setFields([
        { id: nextId(), token: 'name', sample: 'Recipient Name', x: w / 2, y: h * 0.46, fontSize: fs, color: '#1a1a1a', align: 'center', font: 'Helvetica-Bold' },
      ]);
      const qs = Math.round(Math.min(w, h) * 0.15);
      setQr({ x: w - qs - Math.round(w * 0.06), y: h - qs - Math.round(h * 0.06), size: qs });
      setSelectedId('name');
    };
    img.src = url;
  }

  // ── dragging (pointer capture keeps events on the marker) ───────────────────
  function startDrag(e: React.PointerEvent, id: string, kind: 'text' | 'qr') {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setSelectedId(id);
    const rect = previewRef.current!.getBoundingClientRect();
    const px = (e.clientX - rect.left) / scale;
    const py = (e.clientY - rect.top) / scale;
    const cur = kind === 'text' ? fields.find((f) => f.id === id)! : qr;
    dragRef.current = { id, kind, dx: px - cur.x, dy: py - cur.y };
  }
  function onDrag(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    const rect = previewRef.current!.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / scale - d.dx;
    const ny = (e.clientY - rect.top) / scale - d.dy;
    if (d.kind === 'text') {
      setFields((fs) => fs.map((f) => f.id === d.id ? { ...f, x: clamp(nx, 0, natW), y: clamp(ny, 0, natH) } : f));
    } else {
      setQr((q) => ({ ...q, x: clamp(nx, 0, natW - q.size), y: clamp(ny, 0, natH - q.size) }));
    }
  }
  function endDrag(e: React.PointerEvent) {
    dragRef.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* noop */ }
  }

  function addField() {
    const token = newToken.trim();
    if (!token) return;
    setFields((fs) => [
      ...fs,
      { id: nextId(), token, sample: token, x: natW / 2, y: natH * 0.6, fontSize: Math.round(natH * 0.035), color: '#555555', align: 'center', font: 'Helvetica' },
    ]);
    setNewToken('');
  }

  // Optional: the public verification UUID, placed centered just below the QR.
  function addVerificationId() {
    const existing = fields.find((f) => f.token === 'verification_id');
    if (existing) { setSelectedId(existing.id); return; }
    const fs = Math.max(7, Math.round(natH * 0.014));
    const id = nextId();
    setFields((arr) => [
      ...arr,
      {
        id,
        token: 'verification_id',
        sample: '5d516189-df8d-49ad-b42f-8e9e14487ed3',
        x: qr.x + qr.size / 2,
        y: clamp(qr.y + qr.size + Math.round(natH * 0.025), 0, natH),
        fontSize: fs,
        color: '#777777',
        align: 'center',
        font: 'Courier',
      },
    ]);
    setSelectedId(id);
  }
  function updateField(id: string, patch: Partial<TextField>) {
    setFields((fs) => fs.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }
  function removeField(id: string) {
    setFields((fs) => fs.filter((f) => f.id !== id));
    if (selectedId === id) setSelectedId('qr');
  }

  // ── build the placeholders/qr JSON from the visual editor ───────────────────
  function buildPlaceholders(): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const f of fields) {
      out[f.token] = {
        x: Math.round(f.x),
        y: Math.round(natH - f.y), // flip to PDF bottom-left origin
        fontSize: f.fontSize,
        color: f.color,
        align: f.align,
        font: f.font,
      };
    }
    return out;
  }
  function buildQr() {
    return {
      x: Math.round(qr.x),
      y: Math.round(natH - (qr.y + qr.size)), // bottom-left corner
      size: Math.round(qr.size),
    };
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) { setError('Choose a template file.'); return; }
    if (!name.trim()) { setError('Enter a template name.'); return; }

    let placeholders: string;
    let qrPos: string;
    let width: number;
    let height: number;

    if (isImage && natW) {
      placeholders = JSON.stringify(buildPlaceholders());
      qrPos = JSON.stringify(buildQr());
      width = natW;
      height = natH;
    } else {
      // PDF / no preview: use the manual JSON fallback.
      placeholders = jsonPlaceholders;
      qrPos = jsonQr;
      width = 842;
      height = 595;
    }

    const fd = new FormData();
    fd.set('file', file);
    fd.set('name', name.trim());
    fd.set('placeholders', placeholders);
    fd.set('qr_position', qrPos);
    fd.set('width', String(width));
    fd.set('height', String(height));

    setBusy(true);
    setError(null);
    const res = await fetch('/api/templates', { method: 'POST', body: fd });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) {
      onFile(null);
      setName('');
      setFields([]);
      router.refresh();
    } else {
      setError(body.error ?? 'Upload failed');
    }
  }

  const selected = fields.find((f) => f.id === selectedId);

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
    >
      <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">Upload template</h2>

      <div>
        <label className={labelCls}>Template name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Workshop certificate A4" className={inputCls} />
      </div>

      <div>
        <label className={labelCls}>File (PNG / JPG / PDF)</label>
        <input
          type="file"
          accept="image/png,image/jpeg,application/pdf"
          onChange={(e) => onFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-zinc-600 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 file:text-sm dark:text-zinc-400 dark:file:bg-zinc-800"
        />
        <p className="mt-1 text-xs text-zinc-400">
          Upload an <strong>image</strong> to place the name and QR visually by dragging.
        </p>
      </div>

      {/* ── Visual editor (image templates) ─────────────────────────────────── */}
      {isImage && previewUrl && natW > 0 && (
        <div className="space-y-3">
          <label className={labelCls}>Drag the name and QR onto the certificate</label>
          <div
            ref={previewRef}
            className="relative mx-auto select-none overflow-hidden rounded-lg border border-zinc-300 dark:border-zinc-700"
            style={{ width: DISPLAY_W, height: natH * scale, touchAction: 'none' }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt="template" draggable={false} style={{ width: '100%', height: '100%', display: 'block' }} />

            {/* Text markers */}
            {fields.map((f) => (
              <div
                key={f.id}
                onPointerDown={(e) => startDrag(e, f.id, 'text')}
                onPointerMove={onDrag}
                onPointerUp={endDrag}
                className={`absolute cursor-move whitespace-nowrap leading-none ${
                  selectedId === f.id ? 'outline outline-2 outline-blue-500' : ''
                }`}
                style={{
                  left: f.x * scale,
                  top: f.y * scale,
                  transform: `translate(${f.align === 'center' ? '-50%' : f.align === 'right' ? '-100%' : '0'}, -0.8em)`,
                  fontSize: Math.max(8, f.fontSize * scale),
                  color: f.color,
                  fontWeight: f.font.includes('Bold') ? 700 : 400,
                  fontFamily: f.font.includes('Times') ? 'Georgia, serif' : f.font.includes('Courier') ? 'monospace' : 'Helvetica, Arial, sans-serif',
                }}
                title={`{{${f.token}}}`}
              >
                {f.sample || `{{${f.token}}}`}
              </div>
            ))}

            {/* QR marker */}
            <div
              onPointerDown={(e) => startDrag(e, 'qr', 'qr')}
              onPointerMove={onDrag}
              onPointerUp={endDrag}
              className={`absolute flex cursor-move items-center justify-center bg-white/70 text-[10px] font-medium text-zinc-700 ${
                selectedId === 'qr' ? 'outline outline-2 outline-blue-500' : 'outline-dashed outline-1 outline-zinc-500'
              }`}
              style={{ left: qr.x * scale, top: qr.y * scale, width: qr.size * scale, height: qr.size * scale }}
            >
              QR
            </div>
          </div>

          {/* Property panel */}
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm dark:border-zinc-800 dark:bg-zinc-900/50">
            {selectedId === 'qr' ? (
              <div className="flex items-center gap-3">
                <span className="font-medium text-zinc-700 dark:text-zinc-200">QR size</span>
                <input
                  type="range" min={Math.round(Math.min(natW, natH) * 0.05)} max={Math.round(Math.min(natW, natH) * 0.4)}
                  value={qr.size}
                  onChange={(e) => setQr((q) => {
                    const size = Number(e.target.value);
                    return { ...q, size, x: clamp(q.x, 0, natW - size), y: clamp(q.y, 0, natH - size) };
                  })}
                  className="flex-1"
                />
                <span className="w-12 text-right text-zinc-500">{Math.round(qr.size)}px</span>
              </div>
            ) : selected ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-zinc-700 dark:text-zinc-200">
                    Field <code className="text-xs">{`{{${selected.token}}}`}</code>
                  </span>
                  <button type="button" onClick={() => removeField(selected.id)} className="text-xs text-red-500 hover:text-red-700">
                    remove
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-xs text-zinc-500">
                    Token
                    <input value={selected.token} onChange={(e) => updateField(selected.id, { token: e.target.value })} className={`${inputCls} mt-0.5`} />
                  </label>
                  <label className="text-xs text-zinc-500">
                    Preview text
                    <input value={selected.sample} onChange={(e) => updateField(selected.id, { sample: e.target.value })} className={`${inputCls} mt-0.5`} />
                  </label>
                  <label className="text-xs text-zinc-500">
                    Font size
                    <input type="number" value={selected.fontSize} onChange={(e) => updateField(selected.id, { fontSize: Number(e.target.value) })} className={`${inputCls} mt-0.5`} />
                  </label>
                  <label className="text-xs text-zinc-500">
                    Align
                    <select value={selected.align} onChange={(e) => updateField(selected.id, { align: e.target.value as TextField['align'] })} className={`${inputCls} mt-0.5`}>
                      <option value="left">left</option>
                      <option value="center">center</option>
                      <option value="right">right</option>
                    </select>
                  </label>
                  <label className="text-xs text-zinc-500">
                    Font
                    <select value={selected.font} onChange={(e) => updateField(selected.id, { font: e.target.value })} className={`${inputCls} mt-0.5`}>
                      {FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </label>
                  <label className="text-xs text-zinc-500">
                    Color
                    <input type="color" value={selected.color} onChange={(e) => updateField(selected.id, { color: e.target.value })} className="mt-0.5 h-9 w-full rounded-lg border border-zinc-300 dark:border-zinc-700" />
                  </label>
                </div>
              </div>
            ) : null}
          </div>

          {/* Add fields */}
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={newToken}
              onChange={(e) => setNewToken(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addField())}
              placeholder="Add field (e.g. event, date, course)"
              className={`${inputCls} min-w-40 flex-1`}
            />
            <button type="button" onClick={addField} className="shrink-0 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900">
              + Field
            </button>
            <button
              type="button"
              onClick={addVerificationId}
              disabled={fields.some((f) => f.token === 'verification_id')}
              className="shrink-0 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              + Verification ID
            </button>
          </div>
          <p className="text-xs text-zinc-400">
            Tokens map to spreadsheet columns. <code>name</code> = recipient, <code>event</code> = batch name.
            <strong> Verification ID</strong> (optional) prints the certificate’s unique code, e.g. under the QR.
          </p>
        </div>
      )}

      {/* ── Manual JSON fallback (PDF / no image) ───────────────────────────── */}
      {file && !isImage && (
        <div className="space-y-3">
          <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            Visual placement is available for image templates. For PDF, enter coordinates manually
            (PDF points from the bottom-left). Page size defaults to 842×595.
          </p>
          <div>
            <label className={labelCls}>Placeholders (JSON)</label>
            <textarea value={jsonPlaceholders} onChange={(e) => setJsonPlaceholders(e.target.value)} rows={6} className={`${inputCls} font-mono text-xs`} />
          </div>
          <div>
            <label className={labelCls}>QR position (JSON)</label>
            <textarea value={jsonQr} onChange={(e) => setJsonQr(e.target.value)} rows={3} className={`${inputCls} font-mono text-xs`} />
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={busy}
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {busy ? 'Uploading…' : 'Upload template'}
      </button>
    </form>
  );
}
