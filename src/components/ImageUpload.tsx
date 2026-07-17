import { useRef, useState, useCallback } from 'react';
import { Camera, Upload, Image as ImageIcon, Wand2, X, Check, Loader2 } from 'lucide-react';
import { removeBackground } from '../lib/imageUtils';

interface ImageUploadProps {
  onImageReady: (file: Blob) => void;
  currentImagePath?: string | null;
  currentImageUrl?: string | null;
  label?: string;
}

export default function ImageUpload({ onImageReady, currentImagePath, currentImageUrl, label = 'Foto Produk' }: ImageUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(
    currentImagePath
      ? `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/products/${currentImagePath}`
      : currentImageUrl || null
  );
  const [processing, setProcessing] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [bgRemoved, setBgRemoved] = useState(false);
  const [originalFile, setOriginalFile] = useState<File | null>(null);

  const handleFile = useCallback((file: File) => {
    const url = URL.createObjectURL(file);
    setOriginalFile(file);
    setPreview(url);
    setBgRemoved(false);
    setShowOptions(false);
  }, []);

  const handleRemoveBg = useCallback(async () => {
    if (!originalFile) return;
    setProcessing(true);
    try {
      const blob = await removeBackground(originalFile, 38, 2);
      const url = URL.createObjectURL(blob);
      setPreview(url);
      setBgRemoved(true);
      onImageReady(blob);
    } catch (err) {
      console.error('BG removal failed:', err);
      alert('Gagal menghapus latar. Coba foto dengan latar lebih polos.');
    } finally {
      setProcessing(false);
    }
  }, [originalFile, onImageReady]);

  const handleUseOriginal = useCallback(() => {
    if (!originalFile) return;
    onImageReady(originalFile);
  }, [originalFile, onImageReady]);

  const handleClear = useCallback(() => {
    setPreview(null);
    setOriginalFile(null);
    setBgRemoved(false);
    setShowOptions(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  }, []);

  return (
    <div className="space-y-3">
      <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">{label}</label>

      {preview ? (
        <div className="space-y-3">
          <div className="relative overflow-hidden rounded-2xl border-2 border-neutral-200 bg-white" style={{ aspectRatio: '1' }}>
            <img src={preview} alt="Preview" className="h-full w-full object-contain" />
            {processing && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/70">
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
                  <span className="text-sm font-medium text-neutral-700">Memproses...</span>
                </div>
              </div>
            )}
            {bgRemoved && !processing && (
              <span className="absolute right-2 top-2 badge bg-success-100 text-success-700">
                <Check className="mr-1 h-3 w-3" /> Latar Putih
              </span>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {!bgRemoved && !processing && (
              <button type="button" onClick={handleRemoveBg} className="inline-flex items-center gap-2 rounded-full bg-primary-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-700">
                <Wand2 className="h-4 w-4" /> Ganti Latar Putih
              </button>
            )}
            {!bgRemoved && !processing && originalFile && (
              <button type="button" onClick={handleUseOriginal} className="inline-flex items-center gap-2 rounded-full bg-success-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-success-700">
                <Check className="h-4 w-4" /> Pakai Apa Adanya
              </button>
            )}
            {bgRemoved && !processing && (
              <button type="button" onClick={handleRemoveBg} className="inline-flex items-center gap-2 rounded-full border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-600 transition hover:bg-neutral-100">
                <Wand2 className="h-4 w-4" /> Ulangi
              </button>
            )}
            <button type="button" onClick={handleClear} className="inline-flex items-center gap-2 rounded-full border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-600 transition hover:bg-neutral-100">
              <X className="h-4 w-4" /> Ganti Foto
            </button>
          </div>
        </div>
      ) : (
        <div>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
          <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />

          {showOptions ? (
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={() => cameraInputRef.current?.click()} className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-primary-300 bg-primary-50 p-6 transition hover:border-primary-500 hover:bg-primary-100">
                <Camera className="h-8 w-8 text-primary-600" />
                <span className="text-sm font-semibold text-primary-700">Ambil Foto</span>
                <span className="text-xs text-neutral-500">Langsung dari kamera HP</span>
              </button>
              <button type="button" onClick={() => fileInputRef.current?.click()} className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-neutral-300 bg-neutral-50 p-6 transition hover:border-neutral-400 hover:bg-neutral-100">
                <ImageIcon className="h-8 w-8 text-neutral-500" />
                <span className="text-sm font-semibold text-neutral-700">Dari Galeri</span>
                <span className="text-xs text-neutral-500">Pilih dari HP</span>
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setShowOptions(true)} className="flex w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-neutral-300 bg-neutral-50 p-8 transition hover:border-primary-400 hover:bg-primary-50">
              <Upload className="h-10 w-10 text-neutral-400" />
              <span className="text-sm font-semibold text-neutral-700">Upload Foto Produk</span>
              <span className="text-xs text-neutral-500">Ketuk untuk ambil foto atau pilih dari galeri HP</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
