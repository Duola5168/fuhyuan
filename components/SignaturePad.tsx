
import React, { useRef, useEffect, useState } from 'react';

interface SignaturePadProps {
  signatureDataUrl: string | null;
  onSave: (signature: string) => void;
  onClear: () => void;
}

const PenIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L13.5 6.5z" />
    </svg>
);

const ClearIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
);


const SignaturePad: React.FC<SignaturePadProps> = ({ signatureDataUrl, onSave, onClear }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSigned, setHasSigned] = useState(false);

  const getCanvasContext = (): CanvasRenderingContext2D | null => {
      const canvas = canvasRef.current;
      return canvas ? canvas.getContext('2d') : null;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      const rect = canvas.parentElement!.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = 200; // Fixed height
      const context = getCanvasContext();
      if (context) {
        context.strokeStyle = "#000000";
        context.lineWidth = 2;
        context.lineCap = 'round';
        context.lineJoin = 'round';
      }
    }
  }, []);
  
  useEffect(() => {
    // When signatureDataUrl changes (e.g., loading a draft), update the 'hasSigned' state
    // so the placeholder text correctly disappears.
    setHasSigned(!!signatureDataUrl);
  }, [signatureDataUrl]);


  const getCoordinates = (event: React.MouseEvent | React.TouchEvent): { offsetX: number; offsetY: number } => {
    const canvas = canvasRef.current;
    if (!canvas) return { offsetX: 0, offsetY: 0 };
    const rect = canvas.getBoundingClientRect();
    if ('touches' in event) { // Touch event
        return {
            offsetX: event.touches[0].clientX - rect.left,
            offsetY: event.touches[0].clientY - rect.top,
        };
    }
    // Mouse event
    return { offsetX: event.nativeEvent.offsetX, offsetY: event.nativeEvent.offsetY };
  };

  const startDrawing = (event: React.MouseEvent | React.TouchEvent) => {
    if (signatureDataUrl) return; // Don't draw if a signature is already displayed
    event.preventDefault();
    const context = getCanvasContext();
    if (context) {
      const { offsetX, offsetY } = getCoordinates(event);
      context.beginPath();
      context.moveTo(offsetX, offsetY);
      setIsDrawing(true);
      setHasSigned(true);
    }
  };

  const draw = (event: React.MouseEvent | React.TouchEvent) => {
    if (signatureDataUrl) return;
    event.preventDefault();
    if (!isDrawing) return;
    const context = getCanvasContext();
    if (context) {
        const { offsetX, offsetY } = getCoordinates(event);
        context.lineTo(offsetX, offsetY);
        context.stroke();
    }
  };

  const stopDrawing = () => {
    if (signatureDataUrl) return;
    const context = getCanvasContext();
    if(context) {
        context.closePath();
    }
    setIsDrawing(false);
    if (canvasRef.current && hasSigned) {
      onSave(canvasRef.current.toDataURL('image/png'));
    }
  };
  
  const handleClear = () => {
    const context = getCanvasContext();
    if (context && canvasRef.current) {
      context.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
    setHasSigned(false);
    onClear();
  };

  return (
    <div className="w-full">
      <div className="relative w-full h-[200px] bg-slate-200/50 rounded-lg border-2 border-dashed border-slate-400 touch-none overflow-hidden">
        {signatureDataUrl ? (
          <div className="w-full h-full flex items-center justify-center p-2 bg-white">
            <img src={signatureDataUrl} alt="已儲存的簽名" className="max-w-full max-h-full object-contain" />
          </div>
        ) : (
          <>
            <canvas
              ref={canvasRef}
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              onTouchStart={startDrawing}
              onTouchMove={draw}
              onTouchEnd={stopDrawing}
              className="absolute top-0 left-0"
            />
            {!hasSigned && (
                <div className="absolute inset-0 flex items-center justify-center text-slate-500 pointer-events-none">
                    <PenIcon className="w-8 h-8 mr-2" />
                    <span className="text-lg">請在此處簽名</span>
                </div>
            )}
          </>
        )}
      </div>
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={handleClear}
          className="flex items-center px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        >
          <ClearIcon className="w-5 h-5 mr-2" />
          清除
        </button>
      </div>
    </div>
  );
};

export default SignaturePad;
