'use client';

import { useState, useReducer, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, onIdTokenChanged, signOut as firebaseSignOut, type User } from 'firebase/auth';
import { auth } from '@/src/lib/firebase/client';
import { authFetch, syncSessionCookie } from '@/src/lib/firebase/authSync';
import type { FormField, UIFieldConfig, AnswerMode } from '@/src/types';

type Profile = { id: number; name: string; percentage: number; description: string };
type Tab = 'form-filler' | 'pdf-to-pptx' | 'youtube' | 'video-compress' | 'video-convert' | 'image-compress' | 'image-convert' | 'credits';

type TabProps = { balance: number | null; onGoToCredits: () => void };

const TYPE_BADGE: Record<string, string> = {
  text: 'bg-blue-100 text-blue-700',
  textarea: 'bg-blue-100 text-blue-700',
  radio: 'bg-purple-100 text-purple-700',
  checkbox: 'bg-purple-100 text-purple-700',
  dropdown: 'bg-purple-100 text-purple-700',
  date: 'bg-gray-100 text-gray-500',
  time: 'bg-gray-100 text-gray-500',
  linear_scale: 'bg-orange-100 text-orange-700',
  unknown: 'bg-gray-100 text-gray-400',
};

function badgeCls(type: string) {
  return TYPE_BADGE[type] ?? 'bg-gray-100 text-gray-400';
}

// ── Tab definitions ────────────────────────────────────────────────────────────
const TABS: { id: Tab; label: string; icon: string }[] = [
  {
    id: 'form-filler',
    label: 'Form Filler',
    icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
  },
  {
    id: 'pdf-to-pptx',
    label: 'PDF to PPTX',
    icon: 'M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z',
  },
  {
    id: 'youtube',
    label: 'YouTube Downloader',
    icon: 'M15 10l4.553-2.869A1 1 0 0121 8.054v7.892a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z',
  },
  {
    id: 'video-compress',
    label: 'Video Compress',
    icon: 'M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5M15 15l5.25 5.25',
  },
  {
    id: 'video-convert',
    label: 'Video Converter',
    icon: 'M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z',
  },
  {
    id: 'image-compress',
    label: 'Image Compress',
    icon: 'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z',
  },
  {
    id: 'image-convert',
    label: 'Image Converter',
    icon: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15',
  },
  {
    id: 'credits',
    label: 'Credits',
    icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  },
];

// ── PDF → PPTX tab ─────────────────────────────────────────────────────────────
function PdfToPptxTab({ balance, onGoToCredits }: TabProps) {
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [layout, setLayout] = useState('16:9');
  const [converting, setConverting] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const PDF_COST = 10;

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped?.type === 'application/pdf') { setFile(dropped); setError(''); }
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0];
    if (picked) { setFile(picked); setError(''); }
  }

  async function convert() {
    if (!file) return;
    if (balance !== null && balance < PDF_COST) { onGoToCredits(); return; }
    setConverting(true);
    setError('');
    setProgress('Uploading PDF...');

    try {
      const form = new FormData();
      form.append('file', file);
      form.append('layout', layout);

      setProgress('Converting pages to slides...');

      const res = await authFetch('/api/pdf-to-pptx', { method: 'POST', body: form });

      if (res.status === 402) {
        const d = await res.json() as { required: number; balance: number };
        throw new Error(`Not enough credits. Need ${d.required}, you have ${d.balance}.`);
      }
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || 'Conversion failed');
      }

      setProgress('Preparing download...');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name.replace(/\.pdf$/i, '.pptx');
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setProgress('Done!');
      setTimeout(() => setProgress(''), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Conversion failed');
      setProgress('');
    } finally {
      setConverting(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">

      {/* Upload area */}
      <section className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Upload PDF</h2>
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center cursor-pointer transition-colors ${
            dragging ? 'border-orange-400 bg-orange-50'
            : file ? 'border-green-300 bg-green-50'
            : 'border-gray-200 hover:border-orange-300 hover:bg-gray-50'
          }`}
        >
          <input ref={inputRef} type="file" accept=".pdf,application/pdf" className="hidden" onChange={handleFile} />
          {file ? (
            <>
              <svg className="w-10 h-10 text-green-500 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm font-semibold text-gray-800">{file.name}</p>
              <p className="text-xs text-gray-400 mt-1">{(file.size / 1024 / 1024).toFixed(2)} MB · {Math.round(file.size / 1024)} KB</p>
              <button
                onClick={e => { e.stopPropagation(); setFile(null); setError(''); setProgress(''); }}
                className="mt-3 text-xs text-red-400 hover:text-red-600 transition-colors"
              >
                Remove
              </button>
            </>
          ) : (
            <>
              <svg className="w-10 h-10 text-gray-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p className="text-sm font-medium text-gray-600">Drop a PDF here, or <span className="text-orange-500">browse</span></p>
              <p className="text-xs text-gray-400 mt-1">PDF files only</p>
            </>
          )}
        </div>
      </section>

      {/* Options */}
      <section className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Options</h2>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">Slide layout</label>
          <div className="flex gap-2">
            {[
              { value: '16:9', label: '16:9', desc: 'Widescreen' },
              { value: '4:3', label: '4:3', desc: 'Standard' },
              { value: 'A4', label: 'A4', desc: 'Portrait' },
            ].map(opt => (
              <button
                key={opt.value}
                onClick={() => setLayout(opt.value)}
                className={`flex-1 py-2.5 rounded-lg text-sm font-semibold border transition-colors ${
                  layout === opt.value
                    ? 'bg-orange-500 text-white border-orange-500'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-orange-300 hover:text-orange-500'
                }`}
              >
                <span className="block">{opt.label}</span>
                <span className={`text-[11px] font-normal ${layout === opt.value ? 'text-orange-100' : 'text-gray-400'}`}>{opt.desc}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Credit cost + convert button */}
      <div className="space-y-2">
        <div className={`text-xs text-center font-semibold rounded-lg px-3 py-1.5 border ${
          balance !== null && balance < PDF_COST
            ? 'text-red-700 bg-red-50 border-red-200'
            : 'text-orange-700 bg-orange-50 border-orange-200'
        }`}>
          Cost: {PDF_COST} credits{balance !== null ? ` · Balance: ${balance}` : ''}
        </div>
        {balance !== null && balance < PDF_COST ? (
          <button onClick={onGoToCredits} className="w-full bg-amber-500 hover:bg-amber-600 text-white font-semibold py-3.5 rounded-xl text-sm transition-colors">
            Buy Credits (need {PDF_COST - balance} more)
          </button>
        ) : (
          <button
            onClick={convert}
            disabled={!file || converting}
            className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3.5 rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
          >
            {converting ? (
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
            )}
            {converting ? progress || 'Converting...' : `Convert to PPTX · ${PDF_COST} credits`}
          </button>
        )}
        {progress === 'Done!' && (
          <p className="text-center text-xs text-green-600 font-medium">Download started successfully</p>
        )}
        {error && (
          <p className="text-center text-xs text-red-500">{error}</p>
        )}
      </div>

    </div>
  );
}

// ── Video Compress tab ─────────────────────────────────────────────────────────
type QualityTier = 'high' | 'balanced' | 'small' | 'custom';

const QUALITY_OPTIONS: { value: QualityTier; label: string; desc: string }[] = [
  { value: 'high', label: 'High Quality', desc: 'Best quality' },
  { value: 'balanced', label: 'Balanced', desc: 'Up to 1080p' },
  { value: 'small', label: 'Small File', desc: 'Up to 720p' },
  { value: 'custom', label: 'Custom Size', desc: 'Target MB' },
];

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function VideoCompressTab({ balance, onGoToCredits }: TabProps) {
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [quality, setQuality] = useState<QualityTier>('balanced');
  const [targetMb, setTargetMb] = useState<string>('10');
  const [duration, setDuration] = useState<number | null>(null);
  const [compressing, setCompressing] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState<{ originalSize: number; compressedSize: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const VIDEO_COST = 15;

  function onFileSelected(f: File) {
    setFile(f);
    setError('');
    setResult(null);
    const approx = Math.max(0.5, Math.round((f.size / (1024 * 1024) * 0.5) * 10) / 10);
    setTargetMb(String(approx));

    // Determine duration in browser
    const videoUrl = URL.createObjectURL(f);
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => {
      if (Number.isFinite(v.duration) && v.duration > 0) {
        setDuration(v.duration);
      }
      URL.revokeObjectURL(videoUrl);
    };
    v.src = videoUrl;
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped?.type.startsWith('video/')) {
      onFileSelected(dropped);
    }
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0];
    if (picked) {
      onFileSelected(picked);
    }
  }

  async function compress() {
    if (!file) return;
    if (balance !== null && balance < VIDEO_COST) { onGoToCredits(); return; }

    if (quality === 'custom') {
      const mb = parseFloat(targetMb);
      if (!Number.isFinite(mb) || mb < 0.5) {
        setError('Target size must be at least 0.5 MB.');
        return;
      }
      if (mb * 1024 * 1024 >= file.size) {
        setError('Target size must be smaller than the original file size.');
        return;
      }
    }

    setCompressing(true);
    setError('');
    setResult(null);
    setProgress('Uploading video...');

    try {
      const form = new FormData();
      form.append('file', file);
      form.append('quality', quality);
      if (duration) {
        form.append('duration', String(duration));
      }
      if (quality === 'custom') {
        form.append('targetMb', targetMb);
      }

      setProgress('Compressing video (this may take a while)...');

      const res = await authFetch('/api/video-compress', { method: 'POST', body: form });

      if (res.status === 402) {
        const d = await res.json() as { required: number; balance: number };
        throw new Error(`Not enough credits. Need ${d.required}, you have ${d.balance}.`);
      }
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || 'Compression failed');
      }

      const originalSize = Number(res.headers.get('X-Original-Size') ?? file.size);
      const compressedSize = Number(res.headers.get('X-Compressed-Size') ?? 0);

      setProgress('Preparing download...');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name.replace(/\.[^.]+$/, '') + '-compressed.mp4';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setResult({ originalSize, compressedSize: compressedSize || blob.size });
      setProgress('Done!');
      setTimeout(() => setProgress(''), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Compression failed');
      setProgress('');
    } finally {
      setCompressing(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">

      {/* Upload area */}
      <section className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Upload Video</h2>
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center cursor-pointer transition-colors ${
            dragging ? 'border-indigo-400 bg-indigo-50'
            : file ? 'border-green-300 bg-green-50'
            : 'border-gray-200 hover:border-indigo-300 hover:bg-gray-50'
          }`}
        >
          <input ref={inputRef} type="file" accept="video/*" className="hidden" onChange={handleFile} />
          {file ? (
            <>
              <svg className="w-10 h-10 text-green-500 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm font-semibold text-gray-800">{file.name}</p>
              <p className="text-xs text-gray-400 mt-1">{formatBytes(file.size)}</p>
              <button
                onClick={e => { e.stopPropagation(); setFile(null); setError(''); setProgress(''); setResult(null); }}
                className="mt-3 text-xs text-red-400 hover:text-red-600 transition-colors"
              >
                Remove
              </button>
            </>
          ) : (
            <>
              <svg className="w-10 h-10 text-gray-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.869A1 1 0 0121 8.054v7.892a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
              </svg>
              <p className="text-sm font-medium text-gray-600">Drop a video here, or <span className="text-indigo-500">browse</span></p>
              <p className="text-xs text-gray-400 mt-1">MP4, MOV, AVI, WebM, MKV</p>
            </>
          )}
        </div>
      </section>

      {/* Options */}
      <section className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Quality</h2>
        <div className="flex gap-2">
          {QUALITY_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setQuality(opt.value)}
              className={`flex-1 py-2.5 rounded-lg text-sm font-semibold border transition-colors ${
                quality === opt.value
                  ? 'bg-indigo-500 text-white border-indigo-500'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300 hover:text-indigo-500'
              }`}
            >
              <span className="block">{opt.label}</span>
              <span className={`text-[11px] font-normal ${quality === opt.value ? 'text-indigo-100' : 'text-gray-400'}`}>{opt.desc}</span>
            </button>
          ))}
        </div>

        {quality === 'custom' && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">
              Target Video File Size
            </label>
            <div className="flex items-center gap-3">
              <div className="relative">
                <input
                  type="number"
                  step="0.1"
                  min="0.5"
                  value={targetMb}
                  onChange={e => setTargetMb(e.target.value)}
                  className="w-32 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="10"
                />
              </div>
              <span className="text-sm font-medium text-gray-600">MB</span>
              {file && (
                <span className="text-xs text-gray-500">
                  (Original: <span className="font-semibold text-gray-700">{formatBytes(file.size)}</span>)
                </span>
              )}
            </div>
            <p className="text-[11px] text-gray-400 mt-1.5">
              Target bitrate will be dynamically calculated. Note: Minimum 0.5 MB and must be smaller than the original.
            </p>
          </div>
        )}
      </section>

      {/* Credit cost + compress button */}
      <div className="space-y-2">
        <div className={`text-xs text-center font-semibold rounded-lg px-3 py-1.5 border ${
          balance !== null && balance < VIDEO_COST
            ? 'text-red-700 bg-red-50 border-red-200'
            : 'text-indigo-700 bg-indigo-50 border-indigo-200'
        }`}>
          Cost: {VIDEO_COST} credits{balance !== null ? ` · Balance: ${balance}` : ''}
        </div>
        {balance !== null && balance < VIDEO_COST ? (
          <button onClick={onGoToCredits} className="w-full bg-amber-500 hover:bg-amber-600 text-white font-semibold py-3.5 rounded-xl text-sm transition-colors">
            Buy Credits (need {VIDEO_COST - balance} more)
          </button>
        ) : (
          <button
            onClick={compress}
            disabled={!file || compressing}
            className="w-full bg-indigo-500 hover:bg-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3.5 rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
          >
            {compressing ? (
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5M15 15l5.25 5.25" />
              </svg>
            )}
            {compressing ? progress || 'Compressing...' : `Compress Video · ${VIDEO_COST} credits`}
          </button>
        )}
        {result && progress === 'Done!' && (
          <p className="text-center text-xs text-green-600 font-medium">
            {formatBytes(result.originalSize)} → {formatBytes(result.compressedSize)}
            {result.originalSize > 0 && ` (${Math.round((1 - result.compressedSize / result.originalSize) * 100)}% smaller)`}
          </p>
        )}
        {error && (
          <p className="text-center text-xs text-red-500">{error}</p>
        )}
      </div>

    </div>
  );
}

// ── Video Converter tab ────────────────────────────────────────────────────────
type VideoConvertQuality = 'high' | 'balanced' | 'fast';
type VideoResolution = 'original' | '1080p' | '720p' | '480p' | '360p';

const POPULAR_VIDEO_CONVERT_FORMATS = [
  { value: 'mp4',  label: 'MP4',  desc: 'Universal compatibility' },
  { value: 'mkv',  label: 'MKV',  desc: 'High quality container' },
  { value: 'webm', label: 'WEBM', desc: 'Modern web & streaming' },
  { value: 'avi',  label: 'AVI',  desc: 'Classic Windows AVI' },
  { value: 'mov',  label: 'MOV',  desc: 'Apple QuickTime' },
  { value: 'wmv',  label: 'WMV',  desc: 'Windows Media Video' },
  { value: 'm4v',  label: 'M4V',  desc: 'Apple iTunes format' },
  { value: 'flv',  label: 'FLV',  desc: 'Adobe Flash video' },
];

const EXTENDED_VIDEO_CONVERT_FORMATS = [
  { value: 'hevc',    label: 'HEVC / H.265 (High Efficiency)' },
  { value: 'av1',     label: 'AV1 (Next-Gen Open Video)' },
  { value: 'ogv',     label: 'OGV (Ogg Theora)' },
  { value: '3gp',     label: '3GP (Mobile Video)' },
  { value: '3g2',     label: '3G2 (Mobile 3GPP2)' },
  { value: 'mpeg',    label: 'MPEG (MPEG-1 System)' },
  { value: 'mpeg-2',  label: 'MPEG-2 (Broadcast Video)' },
  { value: 'mpg',     label: 'MPG (MPEG Video)' },
  { value: 'm2v',     label: 'M2V (MPEG-2 Video)' },
  { value: 'ts',      label: 'TS (Transport Stream)' },
  { value: 'mts',     label: 'MTS (AVCHD Camcorder)' },
  { value: 'm2ts',    label: 'M2TS (Blu-ray Stream)' },
  { value: 'avchd',   label: 'AVCHD (High-Def Video)' },
  { value: 'vob',     label: 'VOB (DVD Video)' },
  { value: 'divx',    label: 'DIVX (DivX Media)' },
  { value: 'xvid',    label: 'XVID (Xvid MPEG-4)' },
  { value: 'mjpeg',   label: 'MJPEG (Motion JPEG)' },
  { value: 'mxf',     label: 'MXF (Material Exchange)' },
  { value: 'swf',     label: 'SWF (Flash Movie)' },
  { value: 'f4v',     label: 'F4V (Flash MP4)' },
  { value: 'asf',     label: 'ASF (Advanced Systems)' },
  { value: 'wtv',     label: 'WTV (Windows TV)' },
  { value: 'rm',      label: 'RM (RealMedia)' },
  { value: 'rmvb',    label: 'RMVB (RealMedia Variable Bitrate)' },
];

const VIDEO_RESOLUTION_OPTIONS: { value: VideoResolution; label: string }[] = [
  { value: 'original', label: 'Original Resolution' },
  { value: '1080p',    label: '1080p Full HD (1920×1080)' },
  { value: '720p',     label: '720p HD (1280×720)' },
  { value: '480p',     label: '480p SD (854×480)' },
  { value: '360p',     label: '360p Mobile (640×360)' },
];

const VIDEO_QUALITY_OPTIONS: { value: VideoConvertQuality; label: string; desc: string }[] = [
  { value: 'high',     label: 'High',     desc: 'Best visual quality' },
  { value: 'balanced', label: 'Balanced', desc: 'Optimal size & speed' },
  { value: 'fast',     label: 'Fast',     desc: 'Fastest conversion' },
];

function VideoConvertTab({ balance, onGoToCredits }: TabProps) {
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [format, setFormat] = useState('mp4');
  const [resolution, setResolution] = useState<VideoResolution>('original');
  const [quality, setQuality] = useState<VideoConvertQuality>('balanced');
  const [muteAudio, setMuteAudio] = useState(false);
  const [converting, setConverting] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState<{ originalSize: number; convertedSize: number; format: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const VIDEO_CONVERT_COST = 10;

  function pick(f: File | undefined) {
    if (!f) return;
    setFile(f);
    setError('');
    setResult(null);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    pick(e.dataTransfer.files[0]);
  }

  async function convert() {
    if (!file) return;
    if (balance !== null && balance < VIDEO_CONVERT_COST) { onGoToCredits(); return; }

    setConverting(true);
    setError('');
    setResult(null);
    setProgress('Uploading video...');

    try {
      const form = new FormData();
      form.append('file', file);
      form.append('format', format);
      form.append('resolution', resolution);
      form.append('quality', quality);
      if (muteAudio) {
        form.append('muteAudio', 'true');
      }

      setProgress('Converting video (this may take a moment)...');
      const res = await authFetch('/api/video-convert', { method: 'POST', body: form });

      if (res.status === 402) {
        let reqCredits = VIDEO_CONVERT_COST;
        let bal = balance ?? 0;
        try {
          const raw = await res.text();
          const d = JSON.parse(raw) as { required: number; balance: number };
          reqCredits = d.required ?? reqCredits;
          bal = d.balance ?? bal;
        } catch {
          // ignore json parse failure
        }
        throw new Error(`Not enough credits. Need ${reqCredits}, you have ${bal}.`);
      }

      if (!res.ok) {
        let msg = 'Conversion failed';
        try {
          const raw = await res.text();
          try {
            const errData = JSON.parse(raw);
            msg = errData.error || errData.message || raw || msg;
          } catch {
            msg = raw || msg;
          }
        } catch {
          // fallback
        }
        throw new Error(msg);
      }

      const originalSize = Number(res.headers.get('X-Original-Size') ?? file.size);
      const convertedSize = Number(res.headers.get('X-Converted-Size') ?? 0);
      const outFormat = res.headers.get('X-Output-Format') || format.toUpperCase();

      setProgress('Preparing download...');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const stem = file.name.replace(/\.[^.]+$/, '');
      const ext = format === 'mpeg-2' ? 'mpg' : format === 'avchd' ? 'm2ts' : format;
      a.download = `${stem}-converted.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setResult({
        originalSize,
        convertedSize: convertedSize || blob.size,
        format: outFormat,
      });
      setProgress('Done!');
      setTimeout(() => setProgress(''), 3500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Conversion failed');
      setProgress('');
    } finally {
      setConverting(false);
    }
  }

  const isPopular = POPULAR_VIDEO_CONVERT_FORMATS.some(f => f.value === format);

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Upload area */}
      <section className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Upload Video</h2>
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
            dragging
              ? 'border-indigo-500 bg-indigo-50'
              : 'border-gray-200 hover:border-gray-300 bg-gray-50/50'
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept="video/*,.avi,.mov,.webm,.mpeg,.wmv,.mpg,.ogv,.mkv,.3gp,.hevc,.m4v,.mjpeg,.divx,.flv,.av1,.swf,.avchd,.vob,.ts,.xvid,.mxf,.rm,.mts,.f4v,.asf,.rmvb,.wtv,.3g2,.m2v,.m2ts,.mp4"
            className="hidden"
            onChange={e => pick(e.target.files?.[0])}
          />
          {file ? (
            <>
              <svg className="w-10 h-10 text-green-500 mb-3 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm font-semibold text-gray-800">{file.name}</p>
              <p className="text-xs text-gray-400 mt-1">{formatBytes(file.size)}</p>
              <button
                onClick={e => { e.stopPropagation(); setFile(null); setError(''); setProgress(''); setResult(null); }}
                className="mt-3 text-xs text-red-400 hover:text-red-600 transition-colors"
              >
                Remove
              </button>
            </>
          ) : (
            <>
              <svg className="w-10 h-10 text-gray-300 mb-3 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.869A1 1 0 0121 8.054v7.892a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
              </svg>
              <p className="text-sm font-medium text-gray-600">Drop a video here, or <span className="text-indigo-500">browse</span></p>
              <p className="text-xs text-gray-400 mt-1">Supports MP4, MKV, AVI, MOV, WEBM, FLV, AV1, and 30+ formats (up to 500 MB)</p>
            </>
          )}
        </div>
      </section>

      {/* Target Format Options */}
      <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        <div>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Target Format</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {POPULAR_VIDEO_CONVERT_FORMATS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setFormat(opt.value)}
                className={`p-3 rounded-lg border text-left transition-colors ${
                  format === opt.value
                    ? 'bg-indigo-50 border-indigo-500 text-indigo-700'
                    : 'bg-white border-gray-200 text-gray-700 hover:border-indigo-300'
                }`}
              >
                <p className="text-sm font-bold">{opt.label}</p>
                <p className="text-[11px] text-gray-400 leading-tight mt-0.5">{opt.desc}</p>
              </button>
            ))}
          </div>

          {/* More formats dropdown */}
          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs text-gray-400">Other formats:</span>
            <select
              value={isPopular ? '' : format}
              onChange={e => { if (e.target.value) setFormat(e.target.value); }}
              className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 focus:outline-none focus:border-indigo-500"
            >
              <option value="" disabled={!isPopular}>
                {isPopular ? 'Select more formats...' : `Selected: ${format.toUpperCase()}`}
              </option>
              {EXTENDED_VIDEO_CONVERT_FORMATS.map(f => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Video conversion settings */}
        <div className="pt-4 border-t border-gray-100 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase mb-2">Resolution</label>
            <select
              value={resolution}
              onChange={e => setResolution(e.target.value as VideoResolution)}
              className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 focus:outline-none focus:border-indigo-500"
            >
              {VIDEO_RESOLUTION_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase mb-2">Quality &amp; Speed</label>
            <div className="grid grid-cols-3 gap-2">
              {VIDEO_QUALITY_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setQuality(opt.value)}
                  className={`p-2.5 rounded-lg border text-left transition-colors ${
                    quality === opt.value
                      ? 'bg-indigo-50 border-indigo-500 text-indigo-700'
                      : 'bg-white border-gray-200 text-gray-700 hover:border-indigo-300'
                  }`}
                >
                  <p className="text-xs font-bold">{opt.label}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="pt-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={muteAudio}
                onChange={e => setMuteAudio(e.target.checked)}
                className="accent-indigo-500 rounded"
              />
              <span className="text-xs text-gray-700 font-medium">Mute / remove audio track</span>
            </label>
            <p className="text-[11px] text-gray-400 mt-1">
              Produces a video-only stream (useful for B-roll, presentations, or background loops).
            </p>
          </div>
        </div>
      </section>

      {/* Credit cost & action button */}
      <div className="space-y-2">
        <div className={`text-xs text-center font-semibold rounded-lg px-3 py-1.5 border ${
          balance !== null && balance < VIDEO_CONVERT_COST
            ? 'text-red-700 bg-red-50 border-red-200'
            : 'text-indigo-700 bg-indigo-50 border-indigo-200'
        }`}>
          Cost: {VIDEO_CONVERT_COST} credits{balance !== null ? ` · Balance: ${balance}` : ''}
        </div>

        {balance !== null && balance < VIDEO_CONVERT_COST ? (
          <button onClick={onGoToCredits} className="w-full bg-amber-500 hover:bg-amber-600 text-white font-semibold py-3.5 rounded-xl text-sm transition-colors">
            Buy Credits (need {VIDEO_CONVERT_COST - balance} more)
          </button>
        ) : (
          <button
            onClick={convert}
            disabled={!file || converting}
            className="w-full bg-indigo-500 hover:bg-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3.5 rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
          >
            {converting ? (
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
              </svg>
            )}
            {converting ? progress || 'Converting...' : `Convert to ${format.toUpperCase()} · ${VIDEO_CONVERT_COST} credits`}
          </button>
        )}

        {result && progress === 'Done!' && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center space-y-1">
            <p className="text-xs text-green-700 font-bold">
              ✓ Successfully converted to {result.format}!
            </p>
            <p className="text-xs text-green-600">
              {formatBytes(result.originalSize)} → {formatBytes(result.convertedSize)}
            </p>
          </div>
        )}

        {error && (
          <p className="text-center text-xs text-red-500">{error}</p>
        )}
      </div>
    </div>
  );
}

// ── Image Compress tab ─────────────────────────────────────────────────────────
type ImageFormat = 'original' | 'jpeg' | 'png' | 'webp' | 'avif';

const IMAGE_QUALITY_OPTIONS: { value: QualityTier; label: string; desc: string }[] = [
  { value: 'high', label: 'High Quality', desc: 'Original size' },
  { value: 'balanced', label: 'Balanced', desc: 'Up to 2560px' },
  { value: 'small', label: 'Small File', desc: 'Up to 1600px' },
  { value: 'custom', label: 'Custom Size', desc: 'Target KB / MB' },
];

const IMAGE_FORMAT_OPTIONS: { value: ImageFormat; label: string }[] = [
  { value: 'original', label: 'Keep format' },
  { value: 'jpeg', label: 'JPEG' },
  { value: 'png', label: 'PNG' },
  { value: 'webp', label: 'WebP' },
  { value: 'avif', label: 'AVIF' },
];

const IMAGE_EXT: Record<string, string> = { jpeg: 'jpg', png: 'png', webp: 'webp', avif: 'avif' };
const IMAGE_MIME_EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif' };
const IMAGE_ACCEPTED = Object.keys(IMAGE_MIME_EXT);

function ImageCompressTab({ balance, onGoToCredits }: TabProps) {
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [quality, setQuality] = useState<QualityTier>('balanced');
  const [targetSize, setTargetSize] = useState<string>('500');
  const [targetUnit, setTargetUnit] = useState<'KB' | 'MB'>('KB');
  const [format, setFormat] = useState<ImageFormat>('original');
  const [compressing, setCompressing] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState<{ originalSize: number; compressedSize: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const IMAGE_COST = 3;

  function pick(f: File | undefined) {
    if (!f) return;
    if (!IMAGE_ACCEPTED.includes(f.type)) { setError('Unsupported file. Use JPEG, PNG, WebP or AVIF.'); return; }
    setFile(f);
    setError('');
    setResult(null);
    const half = f.size * 0.5;
    if (half >= 1024 * 1024) {
      setTargetUnit('MB');
      setTargetSize(Math.max(0.1, Math.round((half / (1024 * 1024)) * 10) / 10).toString());
    } else {
      setTargetUnit('KB');
      setTargetSize(Math.max(10, Math.round(half / 1024)).toString());
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    pick(e.dataTransfer.files[0]);
  }

  async function compress() {
    if (!file) return;
    if (balance !== null && balance < IMAGE_COST) { onGoToCredits(); return; }

    if (quality === 'custom') {
      const val = parseFloat(targetSize);
      const kb = targetUnit === 'MB' ? val * 1024 : val;
      if (!Number.isFinite(kb) || kb < 5) {
        setError('Target size must be at least 5 KB.');
        return;
      }
      if (kb * 1024 >= file.size) {
        setError('Target size must be smaller than the original file size.');
        return;
      }
    }

    setCompressing(true);
    setError('');
    setResult(null);
    setProgress('Uploading image...');

    try {
      const form = new FormData();
      form.append('file', file);
      form.append('quality', quality);
      form.append('format', format);
      if (quality === 'custom') {
        const val = parseFloat(targetSize);
        const kb = targetUnit === 'MB' ? val * 1024 : val;
        form.append('targetKb', String(kb));
      }

      setProgress('Compressing image...');

      const res = await authFetch('/api/image-compress', { method: 'POST', body: form });

      if (res.status === 402) {
        const d = await res.json() as { required: number; balance: number };
        throw new Error(`Not enough credits. Need ${d.required}, you have ${d.balance}.`);
      }
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || 'Compression failed');
      }

      const originalSize = Number(res.headers.get('X-Original-Size') ?? file.size);
      const compressedSize = Number(res.headers.get('X-Compressed-Size') ?? 0);

      setProgress('Preparing download...');
      const blob = await res.blob();
      const ext = format === 'original' ? (IMAGE_MIME_EXT[file.type] ?? 'jpg') : IMAGE_EXT[format];
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name.replace(/\.[^.]+$/, '') + `-compressed.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setResult({ originalSize, compressedSize: compressedSize || blob.size });
      setProgress('Done!');
      setTimeout(() => setProgress(''), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Compression failed');
      setProgress('');
    } finally {
      setCompressing(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">

      {/* Upload area */}
      <section className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Upload Image</h2>
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center cursor-pointer transition-colors ${
            dragging ? 'border-indigo-400 bg-indigo-50'
            : file ? 'border-green-300 bg-green-50'
            : 'border-gray-200 hover:border-indigo-300 hover:bg-gray-50'
          }`}
        >
          <input ref={inputRef} type="file" accept={IMAGE_ACCEPTED.join(',')} className="hidden" onChange={e => pick(e.target.files?.[0])} />
          {file ? (
            <>
              <svg className="w-10 h-10 text-green-500 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm font-semibold text-gray-800">{file.name}</p>
              <p className="text-xs text-gray-400 mt-1">{formatBytes(file.size)}</p>
              <button
                onClick={e => { e.stopPropagation(); setFile(null); setError(''); setProgress(''); setResult(null); }}
                className="mt-3 text-xs text-red-400 hover:text-red-600 transition-colors"
              >
                Remove
              </button>
            </>
          ) : (
            <>
              <svg className="w-10 h-10 text-gray-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="text-sm font-medium text-gray-600">Drop an image here, or <span className="text-indigo-500">browse</span></p>
              <p className="text-xs text-gray-400 mt-1">JPEG, PNG, WebP, AVIF · max 25 MB</p>
            </>
          )}
        </div>
      </section>

      {/* Options */}
      <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        <div>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Quality</h2>
          <div className="flex gap-2">
            {IMAGE_QUALITY_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setQuality(opt.value)}
                className={`flex-1 py-2.5 rounded-lg text-sm font-semibold border transition-colors ${
                  quality === opt.value
                    ? 'bg-indigo-500 text-white border-indigo-500'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300 hover:text-indigo-500'
                }`}
              >
                <span className="block">{opt.label}</span>
                <span className={`text-[11px] font-normal ${quality === opt.value ? 'text-indigo-100' : 'text-gray-400'}`}>{opt.desc}</span>
              </button>
            ))}
          </div>

          {quality === 'custom' && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                Target Image File Size
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  step={targetUnit === 'MB' ? '0.1' : '10'}
                  min={targetUnit === 'MB' ? '0.01' : '5'}
                  value={targetSize}
                  onChange={e => setTargetSize(e.target.value)}
                  className="w-32 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder={targetUnit === 'MB' ? '1' : '500'}
                />
                <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs bg-gray-50">
                  <button
                    type="button"
                    onClick={() => setTargetUnit('KB')}
                    className={`px-3 py-2 font-semibold transition-colors ${targetUnit === 'KB' ? 'bg-indigo-500 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                  >
                    KB
                  </button>
                  <button
                    type="button"
                    onClick={() => setTargetUnit('MB')}
                    className={`px-3 py-2 font-semibold transition-colors ${targetUnit === 'MB' ? 'bg-indigo-500 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                  >
                    MB
                  </button>
                </div>
                {file && (
                  <span className="text-xs text-gray-500">
                    (Original: <span className="font-semibold text-gray-700">{formatBytes(file.size)}</span>)
                  </span>
                )}
              </div>
              <p className="text-[11px] text-gray-400 mt-1.5">
                Quality and dimensions are optimized automatically to reach or stay under your target size.
              </p>
            </div>
          )}
        </div>
        <div>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Output Format</h2>
          <div className="flex gap-2 flex-wrap">
            {IMAGE_FORMAT_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setFormat(opt.value)}
                className={`flex-1 min-w-[80px] py-2 rounded-lg text-sm font-semibold border transition-colors ${
                  format === opt.value
                    ? 'bg-indigo-500 text-white border-indigo-500'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300 hover:text-indigo-500'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Credit cost + compress button */}
      <div className="space-y-2">
        <div className={`text-xs text-center font-semibold rounded-lg px-3 py-1.5 border ${
          balance !== null && balance < IMAGE_COST
            ? 'text-red-700 bg-red-50 border-red-200'
            : 'text-indigo-700 bg-indigo-50 border-indigo-200'
        }`}>
          Cost: {IMAGE_COST} credits{balance !== null ? ` · Balance: ${balance}` : ''}
        </div>
        {balance !== null && balance < IMAGE_COST ? (
          <button onClick={onGoToCredits} className="w-full bg-amber-500 hover:bg-amber-600 text-white font-semibold py-3.5 rounded-xl text-sm transition-colors">
            Buy Credits (need {IMAGE_COST - balance} more)
          </button>
        ) : (
          <button
            onClick={compress}
            disabled={!file || compressing}
            className="w-full bg-indigo-500 hover:bg-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3.5 rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
          >
            {compressing ? (
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5M15 15l5.25 5.25" />
              </svg>
            )}
            {compressing ? progress || 'Compressing...' : `Compress Image · ${IMAGE_COST} credits`}
          </button>
        )}
        {result && progress === 'Done!' && (
          <p className="text-center text-xs text-green-600 font-medium">
            {formatBytes(result.originalSize)} → {formatBytes(result.compressedSize)}
            {result.originalSize > 0 && ` (${Math.round((1 - result.compressedSize / result.originalSize) * 100)}% smaller)`}
          </p>
        )}
        {error && (
          <p className="text-center text-xs text-red-500">{error}</p>
        )}
      </div>

    </div>
  );
}

// ── Image Converter tab ────────────────────────────────────────────────────────
const POPULAR_CONVERT_FORMATS = [
  { value: 'webp', label: 'WebP', desc: 'Modern web format' },
  { value: 'png',  label: 'PNG',  desc: 'Lossless + alpha' },
  { value: 'jpeg', label: 'JPEG', desc: 'Universal photo' },
  { value: 'svg',  label: 'SVG',  desc: 'Vector graphics' },
  { value: 'ico',  label: 'ICO',  desc: 'Windows icon' },
  { value: 'bmp',  label: 'BMP',  desc: 'Bitmap image' },
  { value: 'tiff', label: 'TIFF', desc: 'High-res print' },
  { value: 'gif',  label: 'GIF',  desc: 'Animated / palette' },
];

const EXTENDED_CONVERT_FORMATS = [
  { value: 'tga',  label: 'TGA (Truevision Targa)' },
  { value: 'dds',  label: 'DDS (DirectDraw Surface)' },
  { value: 'ppm',  label: 'PPM (Portable Pixmap)' },
  { value: 'pgm',  label: 'PGM (Portable Graymap)' },
  { value: 'pbm',  label: 'PBM (Portable Bitmap)' },
  { value: 'pcx',  label: 'PCX (PC Paintbrush)' },
  { value: 'sgi',  label: 'SGI (Silicon Graphics)' },
  { value: 'xbm',  label: 'XBM (X BitMap)' },
  { value: 'palm', label: 'PALM (Palm Pixmap)' },
  { value: 'jp2',  label: 'JP2 (JPEG 2000)' },
  { value: 'cur',  label: 'CUR (Windows Cursor)' },
];

function ImageConvertTab({ balance, onGoToCredits }: TabProps) {
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [format, setFormat] = useState('webp');
  const [quality, setQuality] = useState(90);
  const [background, setBackground] = useState('#FFFFFF');
  const [vectorize, setVectorize] = useState(false);
  const [lossless, setLossless] = useState(false);
  const [converting, setConverting] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState<{ originalSize: number; convertedSize: number; dimensions?: string; format: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const CONVERT_COST = 3;

  function pick(f: File | undefined) {
    if (!f) return;
    setFile(f);
    setError('');
    setResult(null);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    pick(e.dataTransfer.files[0]);
  }

  async function convert() {
    if (!file) return;
    if (balance !== null && balance < CONVERT_COST) { onGoToCredits(); return; }

    setConverting(true);
    setError('');
    setResult(null);
    setProgress('Uploading image...');

    try {
      const form = new FormData();
      form.append('file', file);
      form.append('format', format);
      if (['jpeg', 'webp'].includes(format)) {
        form.append('quality', String(quality));
      }
      if (format === 'webp' && lossless) {
        form.append('lossless', 'true');
      }
      if (['jpeg', 'bmp', 'ppm', 'pcx'].includes(format)) {
        form.append('background', background);
      }
      if (format === 'svg' && vectorize) {
        form.append('vectorize', 'true');
      }

      setProgress('Converting format...');
      const res = await authFetch('/api/image-convert', { method: 'POST', body: form });

      if (res.status === 402) {
        let reqCredits = CONVERT_COST;
        let bal = balance ?? 0;
        try {
          const d = await res.json() as { required: number; balance: number };
          reqCredits = d.required ?? reqCredits;
          bal = d.balance ?? bal;
        } catch {
          // ignore json parse failure
        }
        throw new Error(`Not enough credits. Need ${reqCredits}, you have ${bal}.`);
      }
      if (!res.ok) {
        let msg = 'Conversion failed';
        try {
          const raw = await res.text();
          try {
            const errData = JSON.parse(raw);
            msg = errData.error || errData.message || raw || msg;
          } catch {
            msg = raw || msg;
          }
        } catch {
          // fallback to default
        }
        throw new Error(msg);
      }

      const originalSize = Number(res.headers.get('X-Original-Size') ?? file.size);
      const convertedSize = Number(res.headers.get('X-Converted-Size') ?? 0);
      const dimensions = res.headers.get('X-Dimensions') || '';

      setProgress('Preparing download...');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const stem = file.name.replace(/\.[^.]+$/, '');
      a.download = `${stem}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setResult({
        originalSize,
        convertedSize: convertedSize || blob.size,
        dimensions,
        format: format.toUpperCase(),
      });
      setProgress('Done!');
      setTimeout(() => setProgress(''), 3500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Conversion failed');
      setProgress('');
    } finally {
      setConverting(false);
    }
  }

  const isPopular = POPULAR_CONVERT_FORMATS.some(f => f.value === format);

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Upload area */}
      <section className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Upload Image</h2>
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
            dragging
              ? 'border-indigo-500 bg-indigo-50'
              : 'border-gray-200 hover:border-gray-300 bg-gray-50/50'
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept="image/*,.png,.jpg,.jpeg,.webp,.svg,.ico,.bmp,.tiff,.gif,.tga,.dds,.ppm,.pgm,.pbm,.pcx,.sgi,.xbm,.palm,.jp2"
            className="hidden"
            onChange={e => pick(e.target.files?.[0])}
          />
          {file ? (
            <>
              <svg className="w-10 h-10 text-green-500 mb-3 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm font-semibold text-gray-800">{file.name}</p>
              <p className="text-xs text-gray-400 mt-1">{formatBytes(file.size)}</p>
              <button
                onClick={e => { e.stopPropagation(); setFile(null); setError(''); setProgress(''); setResult(null); }}
                className="mt-3 text-xs text-red-400 hover:text-red-600 transition-colors"
              >
                Remove
              </button>
            </>
          ) : (
            <>
              <svg className="w-10 h-10 text-gray-300 mb-3 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="text-sm font-medium text-gray-600">Drop an image here, or <span className="text-indigo-500">browse</span></p>
              <p className="text-xs text-gray-400 mt-1">Supports PNG, JPG, WebP, SVG, ICO, BMP, TIFF, GIF, and 60+ formats</p>
            </>
          )}
        </div>
      </section>

      {/* Target Format Options */}
      <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        <div>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Target Format</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {POPULAR_CONVERT_FORMATS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setFormat(opt.value)}
                className={`p-3 rounded-lg border text-left transition-colors ${
                  format === opt.value
                    ? 'bg-indigo-50 border-indigo-500 text-indigo-700'
                    : 'bg-white border-gray-200 text-gray-700 hover:border-indigo-300'
                }`}
              >
                <p className="text-sm font-bold">{opt.label}</p>
                <p className="text-[11px] text-gray-400 leading-tight mt-0.5">{opt.desc}</p>
              </button>
            ))}
          </div>

          {/* More formats dropdown */}
          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs text-gray-400">Other formats:</span>
            <select
              value={isPopular ? '' : format}
              onChange={e => { if (e.target.value) setFormat(e.target.value); }}
              className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 focus:outline-none focus:border-indigo-500"
            >
              <option value="" disabled={!isPopular}>
                {isPopular ? 'Select more formats...' : `Selected: ${format.toUpperCase()}`}
              </option>
              {EXTENDED_CONVERT_FORMATS.map(f => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Dynamic conversion settings */}
        {['jpeg', 'webp'].includes(format) && (
          <div className="pt-4 border-t border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-gray-600 uppercase">Quality</label>
              <span className="text-xs font-bold text-indigo-600">{quality}%</span>
            </div>
            <input
              type="range"
              min="10"
              max="100"
              value={quality}
              onChange={e => setQuality(Number(e.target.value))}
              className="w-full accent-indigo-500 h-1.5 bg-gray-200 rounded-lg cursor-pointer"
            />
          </div>
        )}

        {format === 'webp' && (
          <label className="flex items-center gap-2 cursor-pointer pt-2">
            <input
              type="checkbox"
              checked={lossless}
              onChange={e => setLossless(e.target.checked)}
              className="accent-indigo-500 rounded"
            />
            <span className="text-xs text-gray-700 font-medium">Lossless WebP compression</span>
          </label>
        )}

        {['jpeg', 'bmp', 'ppm', 'pcx'].includes(format) && (
          <div className="pt-4 border-t border-gray-100 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-gray-600 uppercase">Background Color</p>
              <p className="text-[11px] text-gray-400">For transparent pixels (JPEG/BMP don't support alpha)</p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={background}
                onChange={e => setBackground(e.target.value)}
                className="w-8 h-8 rounded border border-gray-200 cursor-pointer p-0.5"
              />
              <span className="text-xs font-mono text-gray-600">{background}</span>
            </div>
          </div>
        )}

        {format === 'svg' && (
          <div className="pt-4 border-t border-gray-100">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={vectorize}
                onChange={e => setVectorize(e.target.checked)}
                className="accent-indigo-500 rounded"
              />
              <span className="text-xs text-gray-700 font-medium">True vector tracing (requires server potrace)</span>
            </label>
            <p className="text-[11px] text-gray-400 mt-1">
              By default, SVG embeds raster as base64 for 100% pixel-perfect vector wrapping.
            </p>
          </div>
        )}
      </section>

      {/* Credit cost & action button */}
      <div className="space-y-2">
        <div className={`text-xs text-center font-semibold rounded-lg px-3 py-1.5 border ${
          balance !== null && balance < CONVERT_COST
            ? 'text-red-700 bg-red-50 border-red-200'
            : 'text-indigo-700 bg-indigo-50 border-indigo-200'
        }`}>
          Cost: {CONVERT_COST} credits{balance !== null ? ` · Balance: ${balance}` : ''}
        </div>

        {balance !== null && balance < CONVERT_COST ? (
          <button onClick={onGoToCredits} className="w-full bg-amber-500 hover:bg-amber-600 text-white font-semibold py-3.5 rounded-xl text-sm transition-colors">
            Buy Credits (need {CONVERT_COST - balance} more)
          </button>
        ) : (
          <button
            onClick={convert}
            disabled={!file || converting}
            className="w-full bg-indigo-500 hover:bg-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3.5 rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
          >
            {converting ? (
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            )}
            {converting ? progress || 'Converting...' : `Convert to ${format.toUpperCase()} · ${CONVERT_COST} credits`}
          </button>
        )}

        {result && progress === 'Done!' && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center space-y-1">
            <p className="text-xs text-green-700 font-bold">
              ✓ Successfully converted to {result.format}!
            </p>
            <p className="text-xs text-green-600">
              {formatBytes(result.originalSize)} → {formatBytes(result.convertedSize)}
              {result.dimensions ? ` (${result.dimensions})` : ''}
            </p>
          </div>
        )}

        {error && (
          <p className="text-center text-xs text-red-500">{error}</p>
        )}
      </div>
    </div>
  );
}

// ── YouTube Downloader tab ─────────────────────────────────────────────────────
type VideoInfo = {
  title: string;
  thumbnail: string;
  duration: number;
  channel: string;
  qualities: string[];
};

function formatDuration(secs: number) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

function YoutubeTab({ balance, onGoToCredits }: TabProps) {
  const [url, setUrl] = useState('');
  const [info, setInfo] = useState<VideoInfo | null>(null);
  const YT_COST = 5;
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [format, setFormat] = useState<'mp4' | 'mp3'>('mp4');
  const [quality, setQuality] = useState('highest');
  const [downloading, setDownloading] = useState(false);

  async function fetchInfo() {
    const trimmed = url.trim();
    if (!trimmed) return;
    setFetching(true);
    setFetchError('');
    setInfo(null);
    try {
      const res = await authFetch(`/api/youtube/info?url=${encodeURIComponent(trimmed)}`);
      const data = await res.json() as VideoInfo & { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed to fetch');
      setInfo(data);
      setQuality('highest');
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Failed to fetch video info');
    } finally {
      setFetching(false);
    }
  }

  async function startDownload() {
    if (!url.trim()) return;
    if (balance !== null && balance < YT_COST) { onGoToCredits(); return; }
    setDownloading(true);
    try {
      const params = new URLSearchParams({ url: url.trim(), format, quality });
      const res = await authFetch(`/api/youtube/download?${params}`);
      if (res.status === 402) {
        const d = await res.json() as { required: number; balance: number };
        alert(`Not enough credits. Need ${d.required}, you have ${d.balance}.`);
        onGoToCredits();
        return;
      }
      if (!res.ok) { alert('Download failed: ' + await res.text()); return; }
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      const cd = res.headers.get('Content-Disposition') ?? '';
      const match = cd.match(/filename="([^"]+)"/);
      a.download = match ? match[1] : `video.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      alert(`Download error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">

      {/* URL input */}
      <section className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">YouTube URL</h2>
        <div className="flex gap-3">
          <input
            type="url"
            value={url}
            onChange={e => { setUrl(e.target.value); setInfo(null); setFetchError(''); }}
            onKeyDown={e => e.key === 'Enter' && fetchInfo()}
            placeholder="https://www.youtube.com/watch?v=..."
            className="flex-1 border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
          />
          <button
            onClick={fetchInfo}
            disabled={fetching || !url.trim()}
            className="bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors flex items-center gap-2"
          >
            {fetching ? (
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            )}
            {fetching ? 'Fetching...' : 'Fetch'}
          </button>
        </div>
        {fetchError && <p className="mt-2 text-xs text-red-500">{fetchError}</p>}
      </section>

      {/* Video preview */}
      {info && (
        <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex gap-4 p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={info.thumbnail}
              alt={info.title}
              className="w-36 h-20 object-cover rounded-lg shrink-0 bg-gray-100"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-800 leading-snug line-clamp-2">{info.title}</p>
              <p className="text-xs text-gray-500 mt-1">{info.channel}</p>
              <div className="flex items-center gap-3 mt-2">
                <span className="text-xs text-gray-400 flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {formatDuration(info.duration)}
                </span>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Format & quality */}
      <section className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Format</h2>

        {/* Format toggle */}
        <div className="flex gap-2 mb-4">
          {(['mp4', 'mp3'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFormat(f)}
              className={`flex-1 py-2.5 rounded-lg text-sm font-semibold border transition-colors ${
                format === f
                  ? 'bg-red-500 text-white border-red-500'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-red-300 hover:text-red-500'
              }`}
            >
              {f === 'mp4' ? (
                <span className="flex items-center justify-center gap-1.5">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.869A1 1 0 0121 8.054v7.892a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
                  </svg>
                  MP4 Video
                </span>
              ) : (
                <span className="flex items-center justify-center gap-1.5">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                  </svg>
                  MP3 Audio
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Quality (MP4 only) */}
        {format === 'mp4' && (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Quality</label>
            <select
              value={quality}
              onChange={e => setQuality(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
            >
              <option value="highest">Best available</option>
              {info?.qualities.map(q => (
                <option key={q} value={q}>{q}</option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-gray-400">Max 720p for combined video+audio streams</p>
          </div>
        )}

        {format === 'mp3' && (
          <div className="flex items-start gap-3 p-3 bg-gray-50 border border-gray-200 rounded-lg">
            <svg className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-xs text-gray-500">Audio extracted and converted to MP3 at 192 kbps via ffmpeg</p>
          </div>
        )}
      </section>

      {/* Credit cost + download button */}
      <div className="space-y-2">
        <div className={`text-xs text-center font-semibold rounded-lg px-3 py-1.5 border ${
          balance !== null && balance < YT_COST
            ? 'text-red-700 bg-red-50 border-red-200'
            : 'text-blue-700 bg-blue-50 border-blue-200'
        }`}>
          Cost: {YT_COST} credits{balance !== null ? ` · Balance: ${balance}` : ''}
        </div>
        {balance !== null && balance < YT_COST ? (
          <button onClick={onGoToCredits} className="w-full bg-amber-500 hover:bg-amber-600 text-white font-semibold py-3.5 rounded-xl text-sm transition-colors">
            Buy Credits (need {YT_COST - balance} more)
          </button>
        ) : (
          <button
            onClick={startDownload}
            disabled={!info || downloading}
            className="w-full bg-red-500 hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3.5 rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
          >
            {downloading ? (
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            )}
            {downloading ? 'Downloading...' : `Download ${format.toUpperCase()} · ${YT_COST} credits`}
          </button>
        )}
      </div>

    </div>
  );
}

// ── Form Filler tab ────────────────────────────────────────────────────────────
function FormFillerTab({ balance, onGoToCredits }: TabProps) {
  const [fields, setFields] = useState<FormField[]>([]);
  const [formTitle, setFormTitle] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [pidCounter, setPidCounter] = useState(1);
  const [profilesOpen, setProfilesOpen] = useState(false);
  const [formUrl, setFormUrl] = useState('');
  const [respondentCount, setRespondentCount] = useState(10);
  const [provider, setProvider] = useState<'claude' | 'sealion'>('claude');
  const [mode, setMode] = useState<AnswerMode>('pct');
  const [headless, setHeadless] = useState(true);
  const [statusText, setStatusText] = useState('');
  const [statusType, setStatusType] = useState<'' | 'info' | 'success' | 'error'>('');
  const [inspecting, setInspecting] = useState(false);
  const [payBtnDisabled, setPayBtnDisabled] = useState(false);
  const [payBtnText, setPayBtnText] = useState('Submit');
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [, forceUpdate] = useReducer((n: number) => n + 1, 0);
  const fc = useRef<Record<string, UIFieldConfig>>({});

  const creditCost = Math.max(respondentCount, 1);

  function initFc(field: FormField) {
    if (fc.current[field.label]) return;
    const isChoice = ['radio', 'checkbox', 'dropdown'].includes(field.type);
    fc.current[field.label] = {
      label: field.label,
      type: field.type,
      answerHint: '',
      targetPercentage: 100,
      applyToProfiles: [],
      weightedOptions: isChoice && field.options?.length
        ? field.options.map(o => ({ option: o, percentage: 0 }))
        : [],
    };
  }

  function getFc(label: string): UIFieldConfig {
    return fc.current[label] ?? { label, type: 'text', answerHint: '', targetPercentage: 100, applyToProfiles: [], weightedOptions: [] };
  }

  function getTotal(label: string): number {
    return (fc.current[label]?.weightedOptions ?? []).reduce((s, w) => s + (w.percentage || 0), 0);
  }

  function distributeEvenly(label: string) {
    const c = fc.current[label];
    if (!c?.weightedOptions?.length) return;
    const n = c.weightedOptions.length, base = Math.floor(100 / n), rem = 100 - base * n;
    c.weightedOptions.forEach((w, i) => { w.percentage = base + (i === 0 ? rem : 0); });
    forceUpdate();
  }

  function resetOptions(label: string) {
    const c = fc.current[label];
    if (!c?.weightedOptions) return;
    c.weightedOptions.forEach(w => { w.percentage = 0; });
    forceUpdate();
  }

  function validate(): string[] {
    if (mode === 'ai-all') return [];
    return fields
      .filter(f => ['radio', 'checkbox', 'dropdown'].includes(f.type))
      .filter(f => fc.current[f.label]?.weightedOptions?.some(w => w.percentage > 0))
      .filter(f => Math.abs(getTotal(f.label) - 100) > 0.5)
      .map(f => {
        const lbl = f.label.length > 55 ? f.label.substring(0, 55) + '…' : f.label;
        return `"${lbl}" — total ${getTotal(f.label)}%, needs 100%`;
      });
  }

  async function inspectForm() {
    if (!formUrl) { setStatusText('Please enter a Google Form URL.'); setStatusType('error'); return; }
    setInspecting(true);
    setStatusText('Opening form in headless browser...'); setStatusType('info');
    try {
      const res = await authFetch('/api/inspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: formUrl }),
      });
      const data = await res.json() as { fields: FormField[]; title: string; error?: string };
      if (!res.ok) throw new Error(data.error);
      fc.current = {};
      data.fields.forEach(initFc);
      setFields(data.fields);
      setFormTitle(data.title);
      setSelectedIdx(-1);
      setValidationErrors([]);
      setStatusText(`Found ${data.fields.filter(f => f.type !== 'unknown').length} question(s) — click any to configure.`);
      setStatusType('success');
    } catch (err: unknown) {
      setStatusText(`Error: ${err instanceof Error ? err.message : String(err)}`);
      setStatusType('error');
    } finally {
      setInspecting(false);
    }
  }

  async function proceedToPayment() {
    const errors = validate();
    setValidationErrors(errors);
    if (errors.length) { document.getElementById('questionsSection')?.scrollIntoView({ behavior: 'smooth' }); return; }
    if (!formUrl) { alert('Please inspect a Google Form URL first.'); return; }
    if (!respondentCount || respondentCount < 1) { alert('Please enter a valid respondent count.'); return; }
    if (balance !== null && balance < creditCost) { onGoToCredits(); return; }

    const fieldConfigsArr = fields.map(f => ({ ...getFc(f.label) }));
    setPayBtnDisabled(true);
    setPayBtnText('Starting...');
    try {
      const res = await authFetch('/api/jobs/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: formUrl,
          respondentCount,
          headless,
          provider,
          mode,
          respondentProfiles: profiles.map(({ id: _id, ...p }) => p),
          fieldConfigs: fieldConfigsArr,
        }),
      });
      const data = await res.json() as { jobId?: string; error?: string; balance?: number; required?: number };
      if (res.status === 402) {
        alert(`Not enough credits. Need ${data.required}, you have ${data.balance}.`);
        onGoToCredits();
        return;
      }
      if (!res.ok) { alert(`Error: ${data.error}`); return; }
      window.location.href = `/payment-success?jobId=${data.jobId}`;
    } catch (err: unknown) {
      alert(`Network error: ${err instanceof Error ? err.message : String(err)}`);
      setPayBtnDisabled(false);
      setPayBtnText('Submit');
    }
  }

  function addProfile() {
    setProfiles(prev => [...prev, { id: pidCounter, name: '', percentage: 20, description: '' }]);
    setPidCounter(c => c + 1);
  }

  function removeProfile(id: number) {
    setProfiles(prev => prev.filter(p => p.id !== id));
  }

  function updateProfile(id: number, key: keyof Profile, val: string | number) {
    setProfiles(prev => prev.map(p => p.id === id ? { ...p, [key]: val } : p));
  }

  const field = selectedIdx >= 0 && selectedIdx < fields.length ? fields[selectedIdx] : null;
  const cfg = field ? getFc(field.label) : null;
  const isChoice = field ? ['radio', 'checkbox', 'dropdown'].includes(field.type) : false;
  const isText = field ? (field.type === 'text' || field.type === 'textarea') : false;
  const optionTotal = field ? getTotal(field.label) : 0;
  const hasAny = cfg?.weightedOptions?.some(w => w.percentage > 0) ?? false;
  const totalOk = !hasAny || Math.abs(optionTotal - 100) < 0.5;
  const profileTotal = profiles.reduce((s, p) => s + p.percentage, 0);
  const statusCls = { info: 'text-blue-500', success: 'text-green-600', error: 'text-red-500', '': 'text-gray-400' }[statusType];

  return (
    <div className="space-y-6">

      {/* Step 1: Form URL */}
      <section className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Step 1 — Form URL</h2>
        <div className="flex gap-3">
          <input
            type="url"
            value={formUrl}
            onChange={e => setFormUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && inspectForm()}
            placeholder="https://docs.google.com/forms/d/..."
            className="flex-1 border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={inspectForm}
            disabled={inspecting}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors flex items-center gap-2"
          >
            {inspecting && (
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            )}
            {inspecting ? 'Inspecting...' : 'Inspect Form'}
          </button>
        </div>
        <p className={`mt-2 text-xs h-4 ${statusCls}`}>{statusText}</p>
      </section>

      {/* Step 2: Questions */}
      {fields.length > 0 && (
        <section id="questionsSection" className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Step 2 — Configure Questions</h2>
              <span className="text-xs text-gray-400 italic max-w-sm truncate">{formTitle}</span>
            </div>
            <p className="text-xs text-gray-400 mt-1">Click a question → configure its answer distribution on the right. Choice questions must total 100%.</p>
            {validationErrors.length > 0 && (
              <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600">
                <strong>Fix before starting:</strong>
                <ul className="mt-1 list-disc list-inside space-y-0.5">
                  {validationErrors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </div>
            )}
          </div>

          <div className="flex" style={{ height: 560 }}>
            <div className="w-80 shrink-0 border-r border-gray-100 overflow-y-auto bg-gray-50/50">
              {fields.map((f, i) => {
                if (f.type === 'unknown') {
                  return (
                    <div key={i} className="px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide bg-gray-100 border-b border-gray-200">
                      {f.label}
                    </div>
                  );
                }
                const active = i === selectedIdx;
                const fChoice = ['radio', 'checkbox', 'dropdown'].includes(f.type);
                const hasErr = fChoice && fc.current[f.label]?.weightedOptions?.some(w => w.percentage > 0) && Math.abs(getTotal(f.label) - 100) > 0.5;
                return (
                  <button
                    key={i}
                    onClick={() => setSelectedIdx(i)}
                    className={`w-full text-left px-4 py-3 border-b border-gray-100 flex items-start gap-2 transition-colors ${active ? 'border-l-[3px] border-l-blue-500 bg-blue-50' : 'border-l-[3px] border-l-transparent hover:bg-gray-50'}`}
                  >
                    <span className="text-xs text-gray-400 shrink-0 mt-0.5 w-5">{i + 1}</span>
                    <div className="flex-1 min-w-0 space-y-1">
                      <p className="text-xs text-gray-700 leading-snug line-clamp-2">{f.label}</p>
                      <div className="flex items-center gap-1.5">
                        <span className={`inline-flex items-center text-[11px] font-semibold tracking-wide uppercase px-2 py-0.5 rounded-full ${badgeCls(f.type)}`}>
                          {f.type.replace('_', ' ')}
                        </span>
                        {hasErr && <span className="text-red-400 text-xs">⚠ fix %</span>}
                        {f.required && <span className="text-red-300 text-xs">*</span>}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="flex-1 overflow-y-auto">
              {!field ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-300 select-none">
                  <svg className="w-12 h-12 mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  <p className="text-sm font-medium">Select a question</p>
                  <p className="text-xs mt-1 opacity-60">Click any item in the list</p>
                </div>
              ) : field.type === 'unknown' ? (
                <div className="p-6">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Section Header</p>
                  <p className="text-sm font-medium text-gray-700">{field.label}</p>
                  <p className="text-xs text-gray-400 mt-3">This is a form section divider — no configuration needed.</p>
                </div>
              ) : (
                <div className="p-6">
                  <div className="flex items-center gap-2 mb-3">
                    <span className={`inline-flex items-center text-[11px] font-semibold tracking-wide uppercase px-2 py-0.5 rounded-full ${badgeCls(field.type)}`}>
                      {field.type.replace('_', ' ')}
                    </span>
                    {field.required && <span className="text-xs text-red-400">* required</span>}
                  </div>
                  <h3 className="text-sm font-semibold text-gray-800 leading-snug mb-5">{field.label}</h3>

                  {isText ? (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1.5">
                          Answer hint <span className="text-gray-400 font-normal">(steer AI toward this direction)</span>
                        </label>
                        <input
                          type="text"
                          value={cfg?.answerHint ?? ''}
                          placeholder="e.g. difficult, yes, not confident..."
                          onChange={e => { fc.current[field.label].answerHint = e.target.value; forceUpdate(); }}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1.5">
                          Apply hint to <strong className="text-gray-800">% of respondents</strong>
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="range" min="0" max="100"
                            value={cfg?.targetPercentage ?? 100}
                            onChange={e => { fc.current[field.label].targetPercentage = Number(e.target.value); forceUpdate(); }}
                            className="flex-1 h-2 rounded-lg appearance-none cursor-pointer bg-gray-200"
                          />
                          <span className="text-sm font-semibold text-gray-700 w-12 text-right">{cfg?.targetPercentage ?? 100}%</span>
                        </div>
                      </div>
                    </div>
                  ) : isChoice && mode === 'ai-all' ? (
                    <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl">
                      <svg className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.346.346a51.52 51.52 0 01-1.55 1.55C10.94 18.79 9 17.5 9 16a3 3 0 01.072-.285" />
                      </svg>
                      <div>
                        <p className="text-sm font-medium text-blue-800">AI will choose for this question</p>
                        <p className="text-xs text-blue-600 mt-1">
                          The AI reads the question and all options, then picks the most fitting answer. Switch to <strong>% distribution</strong> mode to configure manual weights.
                        </p>
                      </div>
                    </div>
                  ) : isChoice ? (
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-gray-600">Option distribution</span>
                          {!hasAny ? (
                            <span className="text-xs text-gray-400">(all 0% = random)</span>
                          ) : (
                            <span className={`text-xs font-semibold ${totalOk ? 'text-green-600' : 'text-red-500'}`}>
                              {totalOk ? `✓ ${optionTotal}%` : `✗ ${optionTotal}% — must be 100%`}
                            </span>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => distributeEvenly(field.label)}
                            className="text-xs text-blue-600 hover:text-blue-800 font-medium px-3 py-1 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
                          >Even split</button>
                          <button
                            onClick={() => resetOptions(field.label)}
                            className="text-xs text-gray-500 hover:text-gray-700 px-3 py-1 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors"
                          >Reset</button>
                        </div>
                      </div>
                      {cfg?.weightedOptions?.length ? (
                        <div className="border border-gray-200 rounded-xl overflow-hidden">
                          {cfg.weightedOptions.map((wo, idx) => (
                            <div key={idx} className="flex items-center gap-4 px-4 py-3 border-b border-gray-100 last:border-0 hover:bg-gray-50/50">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-gray-700">{wo.option}</p>
                                <div className="mt-1.5 w-full bg-gray-100 rounded" style={{ height: 4 }}>
                                  <div
                                    className="rounded"
                                    style={{
                                      width: `${Math.min(wo.percentage, 100)}%`,
                                      height: 4,
                                      background: totalOk ? '#22c55e' : '#f97316',
                                      transition: 'width .2s, background .2s',
                                    }}
                                  />
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <input
                                  type="number" min="0" max="100"
                                  value={wo.percentage}
                                  onChange={e => {
                                    if (!fc.current[field.label]?.weightedOptions?.[idx]) return;
                                    fc.current[field.label].weightedOptions![idx].percentage = Number(e.target.value) || 0;
                                    forceUpdate();
                                  }}
                                  className="w-16 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                                <span className="text-xs text-gray-400">%</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-gray-400 italic">No options detected for this field.</p>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 italic">This field type is generated automatically — no configuration needed.</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Step 3: Respondent Profiles */}
      <section className="bg-white rounded-xl border border-gray-200">
        <button onClick={() => setProfilesOpen(o => !o)} className="w-full flex items-center justify-between px-6 py-4 text-left">
          <div>
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
              Step 3 — Respondent Profiles{' '}
              <span className="text-gray-300 normal-case font-normal">(optional)</span>
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">Assign personas to respondents. Unused if left empty.</p>
          </div>
          <svg
            className="w-4 h-4 text-gray-400 transition-transform"
            style={{ transform: profilesOpen ? 'rotate(180deg)' : 'none' }}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {profilesOpen && (
          <div className="px-6 pb-6">
            <div className="flex justify-end mb-3">
              <button onClick={addProfile} className="text-sm text-blue-600 hover:text-blue-700 font-medium">+ Add Profile</button>
            </div>
            {profiles.length === 0 ? (
              <p className="text-xs text-gray-400 italic">No profiles — all respondents will be generic.</p>
            ) : (
              <>
                <div className="grid grid-cols-12 gap-2 text-xs text-gray-400 px-1 mb-2">
                  <div className="col-span-3">Name</div>
                  <div className="col-span-2">
                    %{' '}
                    {Math.abs(profileTotal - 100) > 1
                      ? <span className="text-amber-500 font-medium">({profileTotal}% — will normalize)</span>
                      : <span className="text-green-600 font-medium">({profileTotal}%)</span>
                    }
                  </div>
                  <div className="col-span-6">Description</div>
                  <div className="col-span-1" />
                </div>
                {profiles.map(p => (
                  <div key={p.id} className="grid grid-cols-12 gap-2 items-center mb-2">
                    <div className="col-span-3">
                      <input type="text" value={p.name} placeholder="e.g. Farmer"
                        onChange={e => updateProfile(p.id, 'name', e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                    </div>
                    <div className="col-span-2">
                      <input type="number" min="0" max="100" value={p.percentage}
                        onChange={e => updateProfile(p.id, 'percentage', Number(e.target.value))}
                        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                    </div>
                    <div className="col-span-6">
                      <input type="text" value={p.description} placeholder="Short description"
                        onChange={e => updateProfile(p.id, 'description', e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                    </div>
                    <div className="col-span-1 text-center">
                      <button onClick={() => removeProfile(p.id)} className="text-gray-300 hover:text-red-500 text-xl leading-none">×</button>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </section>

      {/* Step 4: Settings & Start */}
      <section className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Step 4 — Settings &amp; Start</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">AI Provider</label>
            <select value={provider} onChange={e => setProvider(e.target.value as 'claude' | 'sealion')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="claude">Claude (Anthropic)</option>
              <option value="sealion">SEA-LION (AI Singapore)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Respondents</label>
            <input type="number" min="1" value={respondentCount}
              onChange={e => setRespondentCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Answer Mode</label>
            <select value={mode} onChange={e => setMode(e.target.value as AnswerMode)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="pct">% distribution for choices</option>
              <option value="ai-all">AI decides everything</option>
            </select>
          </div>
          <div>
            <div className={`text-xs text-center font-semibold rounded-lg px-3 py-1.5 mb-1.5 border ${
              balance !== null && balance < creditCost
                ? 'text-red-700 bg-red-50 border-red-200'
                : 'text-blue-700 bg-blue-50 border-blue-200'
            }`}>
              Cost: {creditCost} credit{creditCost !== 1 ? 's' : ''}
              {balance !== null ? ` · Balance: ${balance}` : ''}
            </div>
            {balance !== null && balance < creditCost ? (
              <button
                onClick={onGoToCredits}
                className="w-full bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors"
              >
                Buy Credits (need {creditCost - balance} more)
              </button>
            ) : (
              <button
                onClick={proceedToPayment}
                disabled={payBtnDisabled}
                className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors"
              >
                {payBtnText}
              </button>
            )}
          </div>
        </div>
        {mode === 'ai-all' && (
          <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">
            <strong>AI decides everything:</strong> The AI will read each question and pick the best option based on the respondent persona. Percentage distributions in Step 2 are ignored.
          </div>
        )}
        <div className="mt-3 flex items-end pb-0.5">
          <label className="flex items-center gap-2 cursor-pointer py-2">
            <input type="checkbox" checked={headless} onChange={e => setHeadless(e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded"
            />
            <span className="text-sm text-gray-700">Headless mode</span>
          </label>
        </div>
      </section>

    </div>
  );
}

// ── Credits tab ────────────────────────────────────────────────────────────────
const PACKAGES = [
  { id: 'starter',  credits: 100,  usd: '$1.00', popular: false, note: '' },
  { id: 'standard', credits: 500,  usd: '$4.00', popular: true,  note: '20% off' },
  { id: 'pro',      credits: 1200, usd: '$8.00', popular: false, note: '33% off' },
] as const;

type CreditTransaction = { id: string; delta: number; kind: string; note: string | null; created_at: string };

type PollState = 'idle' | 'checking' | 'confirmed' | 'cancelled';

function calcCustomPrice(credits: number): number {
  return Math.max(credits * 0.01, 0.03);
}

function CreditsTab({ balance, onBalanceRefresh }: { balance: number | null; onBalanceRefresh: () => void }) {
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [buying, setBuying] = useState<string | null>(null);
  const [pollState, setPollState] = useState<PollState>('idle');
  const [confirmedCredits, setConfirmedCredits] = useState<number | null>(null);
  const [customCredits, setCustomCredits] = useState(10);

  function reloadTransactions() {
    authFetch('/api/credits/balance')
      .then(r => r.json())
      .then((d: { transactions?: CreditTransaction[] }) => { if (d.transactions) setTransactions(d.transactions); })
      .catch(() => {});
  }

  async function checkOrder(orderId: string) {
    // Retry up to 10 times (20 seconds total) — gives webhook time to arrive
    for (let attempt = 0; attempt < 10; attempt++) {
      if (attempt > 0) await new Promise(r => setTimeout(r, 2000));
      try {
        const res = await authFetch(`/api/orders/${orderId}`);
        if (!res.ok) break;
        const data = await res.json() as { paid: boolean; creditsToAdd?: number };
        if (data.paid) {
          setPollState('confirmed');
          setConfirmedCredits(data.creditsToAdd ?? null);
          onBalanceRefresh();
          reloadTransactions();
          return;
        }
      } catch {
        // network hiccup — keep retrying
      }
    }
    setPollState('cancelled');
  }

  useEffect(() => {
    reloadTransactions();

    const params = new URLSearchParams(window.location.search);
    const url = new URL(window.location.href);
    url.searchParams.delete('purchased');
    url.searchParams.delete('tab');
    url.searchParams.delete('orderId');
    url.searchParams.delete('cancelled');
    window.history.replaceState({}, '', url.toString());

    const orderId = params.get('orderId');
    if (orderId) {
      setPollState('checking');
      checkOrder(orderId);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function startPurchase(payload: { packageId: string } | { credits: number }, key: string) {
    setBuying(key);
    try {
      const res = await authFetch('/api/credits/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const raw = await res.text();
      let data: { checkoutUrl?: string; error?: string } = {};
      try {
        data = JSON.parse(raw);
      } catch {
        // Server returned HTML (crash, redirect, or expired session)
        alert(
          res.status === 401 || res.redirected
            ? 'Your session has expired. Please sign in again.'
            : `Payment request failed (HTTP ${res.status}). Please try again, or contact support if it keeps happening.`,
        );
        return;
      }
      if (!res.ok || !data.checkoutUrl) { alert(data.error ?? 'Failed to create payment'); return; }
      window.location.href = data.checkoutUrl;
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBuying(null);
    }
  }

  function buyPackage(packageId: string) {
    return startPurchase({ packageId }, packageId);
  }

  function buyCustom() {
    const credits = Math.max(1, Math.floor(customCredits));
    return startPurchase({ credits }, 'custom');
  }

  const kindLabel: Record<string, string> = {
    purchase:       'Purchase',
    form_fill:      'Form Fill',
    pdf_convert:    'PDF Convert',
    youtube_dl:     'YouTube',
    video_compress: 'Video Compress',
    image_compress: 'Image Compress',
    refund:         'Refund',
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Balance card */}
      <section className="bg-white rounded-xl border border-gray-200 p-6 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Your Balance</p>
          <p className="text-4xl font-bold text-gray-900">{balance === null ? '—' : balance.toLocaleString()}</p>
          <p className="text-xs text-gray-400 mt-1">credits</p>
        </div>
        <div className="text-right text-xs text-gray-400 space-y-1">
          <p>Form fill — 1 credit / respondent</p>
          <p>PDF to PPTX — 10 credits</p>
          <p>YouTube download — 5 credits</p>
          <p>Video compress — 15 credits</p>
          <p>Image compress — 3 credits</p>
        </div>
      </section>

      {/* Packages */}
      <section className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Buy Credits</h2>
        <div className="grid grid-cols-3 gap-3">
          {PACKAGES.map(pkg => (
            <div key={pkg.id} className={`relative rounded-xl border p-4 flex flex-col items-center text-center ${pkg.popular ? 'border-blue-300 bg-blue-50' : 'border-gray-200'}`}>
              {pkg.popular && (
                <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-blue-500 text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full">
                  POPULAR
                </span>
              )}
              <p className="text-2xl font-bold text-gray-900 mt-1">{pkg.credits.toLocaleString()}</p>
              <p className="text-xs text-gray-400 mb-1">credits</p>
              <p className="text-base font-semibold text-gray-800">{pkg.usd}</p>
              {pkg.note && <p className="text-xs text-green-600 font-medium mt-0.5">{pkg.note}</p>}
              <button
                onClick={() => buyPackage(pkg.id)}
                disabled={buying === pkg.id}
                className={`mt-3 w-full py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 ${
                  pkg.popular
                    ? 'bg-blue-500 hover:bg-blue-600 text-white'
                    : 'bg-gray-900 hover:bg-gray-700 text-white'
                }`}
              >
                {buying === pkg.id ? 'Redirecting…' : 'Buy'}
              </button>
            </div>
          ))}
        </div>

        {/* Custom amount */}
        <div className="mt-4 pt-4 border-t border-gray-100">
          <p className="text-xs font-medium text-gray-500 mb-3">Custom amount</p>
          <div className="flex items-center gap-3">
            <div className="flex-1 flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2.5">
              <input
                type="number"
                min="1"
                value={customCredits}
                onChange={e => setCustomCredits(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="w-full text-sm font-semibold text-gray-900 focus:outline-none bg-transparent"
              />
              <span className="text-xs text-gray-400 shrink-0">credits</span>
            </div>
            <div className="text-sm font-semibold text-gray-700 shrink-0 w-16 text-right">
              ${calcCustomPrice(customCredits).toFixed(2)}
            </div>
            <button
              onClick={buyCustom}
              disabled={buying === 'custom'}
              className="bg-gray-900 hover:bg-gray-700 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors shrink-0"
            >
              {buying === 'custom' ? 'Redirecting…' : 'Buy'}
            </button>
          </div>
          <p className="text-[11px] text-gray-400 mt-1.5">$0.01 per credit · min $0.03</p>
        </div>
      </section>

      {/* Transaction history */}
      {transactions.length > 0 && (
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Recent Activity</h2>
          <div className="space-y-2">
            {transactions.map(tx => (
              <div key={tx.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <div>
                  <span className="text-sm font-medium text-gray-700">{kindLabel[tx.kind] ?? tx.kind}</span>
                  {tx.note && <span className="ml-2 text-xs text-gray-400 truncate max-w-[240px] inline-block align-middle">{tx.note}</span>}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className={`text-sm font-semibold ${tx.delta > 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {tx.delta > 0 ? '+' : ''}{tx.delta}
                  </span>
                  <span className="text-xs text-gray-400">{new Date(tx.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

    </div>
  );
}

// ── Root page ──────────────────────────────────────────────────────────────────
export default function AppPage() {
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('form-filler');
  const [balance, setBalance] = useState<number | null>(null);
  const router = useRouter();

  async function refreshBalance() {
    const res = await authFetch('/api/credits/balance');
    if (res.ok) {
      const data = await res.json() as { balance: number };
      setBalance(data.balance);
    }
  }

  useEffect(() => {
    const unsubscribe = onIdTokenChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        // Ensure server session cookie is active and continually rolled forward
        await syncSessionCookie(firebaseUser);
        refreshBalance();
      } else {
        setBalance(null);
      }
    });

    // Periodically refresh/extend session cookie every 15 minutes while tab is open
    const interval = setInterval(() => {
      if (auth.currentUser) {
        syncSessionCookie(auth.currentUser);
      }
    }, 15 * 60 * 1000);

    // Handle return from credit purchase (?tab=credits)
    const params = new URLSearchParams(window.location.search);
    if (params.get('tab') === 'credits') setActiveTab('credits');

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function signOut() {
    await firebaseSignOut(auth);
    await fetch('/api/auth/session', { method: 'DELETE' });
    router.push('/login');
    router.refresh();
  }

  const tabProps: TabProps = { balance, onGoToCredits: () => setActiveTab('credits') };

  return (
    <div className="flex flex-col h-screen bg-gray-50">

      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 shrink-0 z-10">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.png" alt="Dev Kilo Zin" className="w-9 h-9 rounded-lg object-cover" />
          <h1 className="text-lg font-semibold text-gray-900">Dev Kilo Zin</h1>
          <span className="text-xs text-gray-400">AI-Powered</span>
          <div className="ml-auto flex items-center gap-3">
            {user ? (
              <>
                <span className="text-xs text-gray-500 hidden sm:block truncate max-w-[160px]">{user.email}</span>
                <button
                  onClick={signOut}
                  className="text-xs text-gray-500 hover:text-gray-800 border border-gray-200 hover:border-gray-300 px-3 py-1.5 rounded-lg transition-colors"
                >
                  Sign out
                </button>
              </>
            ) : (
              <a
                href="/login"
                className="text-xs text-gray-500 hover:text-gray-800 border border-gray-200 hover:border-gray-300 px-3 py-1.5 rounded-lg transition-colors"
              >
                Sign in
              </a>
            )}
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">

        {/* Sidebar */}
        <aside className="w-52 bg-white border-r border-gray-200 shrink-0 flex flex-col">
          {/* Balance chip */}
          {user && (
            <div className="px-4 py-3 border-b border-gray-100">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Credits</p>
              <p className="text-xl font-bold text-gray-900 mt-0.5">
                {balance === null ? '—' : balance.toLocaleString()}
              </p>
            </div>
          )}
          <nav className="flex-1 p-3 space-y-1">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left ${
                  activeTab === tab.id
                    ? 'bg-blue-50 text-blue-600'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={tab.icon} />
                </svg>
                {tab.label}
              </button>
            ))}
          </nav>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto px-6 py-8">
          {activeTab === 'form-filler' && <FormFillerTab {...tabProps} />}
          {activeTab === 'pdf-to-pptx' && <PdfToPptxTab {...tabProps} />}
          {activeTab === 'youtube' && <YoutubeTab {...tabProps} />}
          {activeTab === 'video-compress' && <VideoCompressTab {...tabProps} />}
          {activeTab === 'video-convert' && <VideoConvertTab {...tabProps} />}
          {activeTab === 'image-compress' && <ImageCompressTab {...tabProps} />}
          {activeTab === 'image-convert' && <ImageConvertTab {...tabProps} />}
          {activeTab === 'credits' && <CreditsTab balance={balance} onBalanceRefresh={refreshBalance} />}
        </main>

      </div>

    </div>
  );
}
