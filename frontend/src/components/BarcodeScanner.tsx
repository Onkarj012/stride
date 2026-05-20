import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Camera, Keyboard, Loader2, ZapOff } from "lucide-react";
import { motion } from "framer-motion";

interface BarcodeScannerProps {
  onBarcode: (barcode: string) => void;
  onClose: () => void;
}

const BARCODE_FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code"];
const isBarcodeDetectorSupported = typeof window !== "undefined" && "BarcodeDetector" in window;

export function BarcodeScanner({ onBarcode, onClose }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const detectorRef = useRef<any>(null);

  const [mode, setMode] = useState<"camera" | "manual">(isBarcodeDetectorSupported ? "camera" : "manual");
  const [manualInput, setManualInput] = useState("");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(false);

  useEffect(() => {
    if (mode !== "camera" || !isBarcodeDetectorSupported) return;
    startCamera();
    return () => stopCamera();
  }, [mode]);

  const startCamera = async () => {
    setCameraError(null);
    setScanning(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      detectorRef.current = new (window as any).BarcodeDetector({ formats: BARCODE_FORMATS });
      scanFrame();
    } catch (err: any) {
      const msg = err.name === "NotAllowedError"
        ? "Camera access denied. Use manual entry."
        : "Camera unavailable. Use manual entry.";
      setCameraError(msg);
      setScanning(false);
      setMode("manual");
    }
  };

  const stopCamera = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const scanFrame = async () => {
    if (!videoRef.current || !detectorRef.current || scanned) return;
    if (videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
      try {
        const barcodes = await detectorRef.current.detect(videoRef.current);
        if (barcodes.length > 0) {
          setScanned(true);
          stopCamera();
          setTimeout(() => onBarcode(barcodes[0].rawValue), 100);
          return;
        }
      } catch { /* ignore */ }
    }
    rafRef.current = requestAnimationFrame(scanFrame);
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = manualInput.trim().replace(/\s/g, "");
    if (!trimmed) return;
    onBarcode(trimmed);
  };

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] bg-black/95 flex items-center justify-center p-4 overflow-hidden"
    >
      <div className="w-full max-w-sm bg-[var(--bg-card)] border border-[var(--border-default)] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-default)]">
          <span className="text-xs font-mono uppercase tracking-wider">Scan Barcode</span>
          <div className="flex items-center gap-2">
            {isBarcodeDetectorSupported && (
              <>
                <button
                  onClick={() => setMode("camera")}
                  className={`p-1.5 transition-colors ${mode === "camera" ? "text-accent" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"}`}
                  title="Camera"
                >
                  <Camera size={14} />
                </button>
                <button
                  onClick={() => { stopCamera(); setMode("manual"); }}
                  className={`p-1.5 transition-colors ${mode === "manual" ? "text-accent" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"}`}
                  title="Manual entry"
                >
                  <Keyboard size={14} />
                </button>
              </>
            )}
            <button onClick={onClose} className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)]">
              <X size={14} />
            </button>
          </div>
        </div>

        <div className="p-4">
          {mode === "camera" ? (
            <div className="space-y-3">
              {cameraError ? (
                <div className="flex items-center gap-2 text-amber-400 text-xs font-mono p-3 border border-amber-400/30 bg-amber-400/10">
                  <ZapOff size={14} /> {cameraError}
                </div>
              ) : (
                <div className="relative bg-black aspect-video overflow-hidden">
                  <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
                  {/* Scanning overlay */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-48 h-32 border-2 border-accent relative">
                      <div className="absolute -top-1 -left-1 w-4 h-4 border-t-2 border-l-2 border-accent" />
                      <div className="absolute -top-1 -right-1 w-4 h-4 border-t-2 border-r-2 border-accent" />
                      <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-2 border-l-2 border-accent" />
                      <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-2 border-r-2 border-accent" />
                      <motion.div
                        animate={{ y: ["0%", "100%", "0%"] }}
                        transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                        className="absolute inset-x-0 h-0.5 bg-accent/80"
                      />
                    </div>
                  </div>
                  {scanned && (
                    <div className="absolute inset-0 bg-accent/20 flex items-center justify-center">
                      <div className="text-accent font-mono text-sm">Detected!</div>
                    </div>
                  )}
                  {!scanned && (
                    <div className="absolute bottom-2 left-0 right-0 flex justify-center">
                      <span className="text-white/70 text-[10px] font-mono px-2 py-1 bg-black/50">
                        Point at a barcode
                      </span>
                    </div>
                  )}
                </div>
              )}
              <button
                onClick={() => { stopCamera(); setMode("manual"); }}
                className="text-xs font-mono text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              >
                Enter barcode manually instead →
              </button>
            </div>
          ) : (
            <form onSubmit={handleManualSubmit} className="space-y-3">
              {!isBarcodeDetectorSupported && (
                <div className="text-[10px] font-mono text-[var(--text-muted)] p-2 border border-[var(--border-default)]">
                  Camera scanning isn't supported in this browser. Enter the barcode number from the product label.
                </div>
              )}
              <div>
                <label className="block text-[10px] font-mono uppercase text-[var(--text-muted)] mb-2 tracking-wider">
                  Barcode Number
                </label>
                <input
                  type="text"
                  value={manualInput}
                  onChange={(e) => setManualInput(e.target.value)}
                  placeholder="e.g. 8901030591011"
                  className="w-full px-3 py-2.5 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono text-sm focus:outline-none focus:border-accent"
                  autoFocus
                />
              </div>
              <button
                type="submit"
                disabled={!manualInput.trim()}
                className="w-full py-2.5 bg-accent text-[var(--theme-primary-text)] font-mono text-xs uppercase tracking-wider font-bold disabled:opacity-50"
              >
                Look Up Product
              </button>
            </form>
          )}
        </div>
      </div>
    </motion.div>,
    document.body
  );
}
