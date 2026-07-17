import { useRef, useState, useCallback } from 'react';
import { Camera, Upload, Image as ImageIcon, Wand2, X, Check, Loader2 } from 'lucide-react';
import { removeBackground } from '../lib/imageUtils';
import { optimizeImage, storageImageUrl } from '../lib/business';
import { useAlert } from './AlertProvider';

interface ImageUploadProps {
  onImageReady?: (file: Blob) => void;
  onImagesReady?: (files: File[]) => void;
  currentImagePath?: string | null;
  currentImageUrl?: string | null;
  currentImages?: string[];
  label?: string;
  multiple?: boolean;
}

export default function ImageUpload({
  onImageReady,
  onImagesReady,
  currentImagePath,
  currentImageUrl,
  currentImages,
  label = 'Foto Produk',
  multiple = false,
}: ImageUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const initialPreviews =
    currentImages?.map(storageImageUrl).filter(Boolean) ||
    (currentImagePath ? [storageImageUrl(currentImagePath)] : currentImageUrl ? [currentImageUrl] : []);
  const [previews, setPreviews] = useState<string[]>(initialPreviews);
  const [processing, setProcessing] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [bgRemoved, setBgRemoved] = useState(false);
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const { showAlert } = useAlert();

  const handleFiles = useCallback(async (list: FileList | null) => {
    const files = Array.from(list || []);
    if (files.length === 0) return;
    setProcessing(true);
    const optimized = await Promise.all(files.map(async (file) => {
      const blob = await optimizeImage(file);
      return new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' });
    }));
    setProcessing(false);
    if (multiple) {
      setSelectedFiles(optimized);
      setPreviews(optimized.map((file) => URL.createObjectURL(file)));
      onImagesReady?.(optimized);
      setShowOptions(false);
      return;
    }
    const file = optimized[0];
    setOriginalFile(file);
    setPreviews([URL.createObjectURL(file)]);
    setBgRemoved(false);
    setShowOptions(false);
  }, [multiple, onImagesReady]);

  const handleRemoveBg = useCallback(async () => {
    if (!originalFile && selectedFiles.length === 0) return;
    setProcessing(true);
    try {
      if (multiple) {
        const processed = await Promise.all(selectedFiles.map(async (file) => {
          const noBg = await removeBackground(file, 38, 2);
          const optimized = await optimizeImage(noBg, 1.1);
          return new File([optimized], file.name, { type: 'image/jpeg' });
        }));
        setSelectedFiles(processed);
        setPreviews(processed.map((file) => URL.createObjectURL(file)));
        onImagesReady?.(processed);
      } else if (originalFile) {
        const blob = await removeBackground(originalFile, 38, 2);
        const optimized = await optimizeImage(blob, 1.1);
        setPreviews([URL.createObjectURL(optimized)]);
        onImageReady?.(optimized);
      }
      setBgRemoved(true);
    } catch (err) {
      console.error('BG removal failed:', err);
      showAlert({
        title: 'Gagal menghapus latar',
        message: 'Coba foto dengan latar lebih polos.',
        variant: 'error',
      });
    } finally {
      setProcessing(false);
    }
  }, [multiple, originalFile, selectedFiles, onImageReady, onImagesReady, showAlert]);

  const handleUseOriginal = useCallback(() => {
    if (originalFile) onImageReady?.(originalFile);
  }, [originalFile, onImageReady]);

  const handleClear = useCallback(() => {
    setPreviews([]);
    setOriginalFile(null);
    setSelectedFiles([]);
    setBgRemoved(false);
    setShowOptions(false);
    onImagesReady?.([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  }, [onImagesReady]);

  return (
    <div className="space-y-3">
      <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">{label}</label>

      {previews.length > 0 ? (
        <div className="space-y-3">
          <div className={multiple ? 'grid grid-cols-2 gap-3 sm:grid-cols-3' : ''}>
            {previews.map((preview, index) => (
              <div key={preview} className="relative overflow-hidden rounded-2xl border-2 border-neutral-200 bg-white" style={{ aspectRatio: '1' }}>
                <img src={preview} alt={`Preview ${index + 1}`} className="h-full w-full object-contain" />
                {processing && index === 0 && (
                  <div className="absolute inset-0 flex items-center justify-center bg-white/70">
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
                      <span className="text-sm font-medium text-neutral-700">Memproses...</span>
                    </div>
                  </div>
                )}
                {bgRemoved && !processing && index === 0 && (
                  <span className="absolute right-2 top-2 badge bg-success-100 text-success-700">
                    <Check className="mr-1 h-3 w-3" /> Latar Putih
                  </span>
                )}
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            {!bgRemoved && !processing && (originalFile || selectedFiles.length > 0) && (
              <>
                <button type="button" onClick={handleRemoveBg} className="inline-flex items-center gap-2 rounded-full bg-primary-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-700">
                  <Wand2 className="h-4 w-4" /> Ganti Latar Putih
                </button>
                {!multiple && (
                  <button type="button" onClick={handleUseOriginal} className="inline-flex items-center gap-2 rounded-full bg-success-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-success-700">
                    <Check className="h-4 w-4" /> Pakai Apa Adanya
                  </button>
                )}
              </>
            )}
            <button type="button" onClick={handleClear} className="inline-flex items-center gap-2 rounded-full border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-600 transition hover:bg-neutral-100">
              <X className="h-4 w-4" /> Ganti Foto
            </button>
          </div>
        </div>
      ) : (
        <div>
          <input ref={fileInputRef} type="file" multiple={multiple} accept="image/*" className="hidden" onChange={(e) => handleFiles(e.target.files)} />
          <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handleFiles(e.target.files)} />

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
                <span className="text-xs text-neutral-500">{multiple ? 'Pilih beberapa foto' : 'Pilih dari HP'}</span>
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setShowOptions(true)} className="flex w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-neutral-300 bg-neutral-50 p-8 transition hover:border-primary-400 hover:bg-primary-50">
              <Upload className="h-10 w-10 text-neutral-400" />
              <span className="text-sm font-semibold text-neutral-700">{multiple ? 'Upload Banyak Foto' : 'Upload Foto Produk'}</span>
              <span className="text-xs text-neutral-500">Ketuk untuk ambil foto atau pilih dari galeri HP</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
