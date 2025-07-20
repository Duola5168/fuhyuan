import React, { useState, useRef, useEffect, useCallback } from 'react';

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

const ExpandIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M20.25 20.25v-4.5m0 4.5h-4.5m4.5 0L15 15M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15m11.25-6L15 9" />
    </svg>
);


const SignaturePad: React.FC<SignaturePadProps> = ({ signatureDataUrl, onSave, onClear }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);

  const getCanvasContext = (): CanvasRenderingContext2D | null => {
      const canvas = canvasRef.current;
      return canvas ? canvas.getContext('2d') : null;
  };

  const drawSignature = useCallback((url: string | null) => {
    const canvas = canvasRef.current;
    const context = getCanvasContext();
    if (!canvas || !context) return;

    context.clearRect(0, 0, canvas.width, canvas.height);
    if (url) {
        const image = new Image();
        image.onload = () => {
            const hRatio = canvas.width / image.width;
            const vRatio = canvas.height / image.height;
            const ratio = Math.min(hRatio, vRatio, 1);
            const centerShift_x = (canvas.width - image.width * ratio) / 2;
            const centerShift_y = (canvas.height - image.height * ratio) / 2;
            context.drawImage(image, 0, 0, image.width, image.height,
                              centerShift_x, centerShift_y, image.width * ratio, image.height * ratio);
        };
        image.src = url;
    }
  }, []);

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = wrapperRef.current;
    if (!canvas || !container) return;

    if (isFullScreen) {
        const padding = 32; // 16px on each side
        canvas.width = window.innerWidth - padding;
        canvas.height = window.innerHeight - 120; // Room for header and confirm button
    } else {
        const inlineContainer = container.querySelector('.signature-canvas-container');
        if (inlineContainer) {
            const rect = inlineContainer.getBoundingClientRect();
            canvas.width = rect.width;
            canvas.height = 200;
        }
    }
    
    const context = getCanvasContext();
    if (context) {
        context.strokeStyle = "#000000";
        context.lineWidth = isFullScreen ? 4 : 2; // Adjusted for better drawing
        context.lineCap = 'round';
        context.lineJoin = 'round';
    }
    drawSignature(signatureDataUrl);
  }, [isFullScreen, signatureDataUrl, drawSignature]);

  useEffect(() => {
    if (isFullScreen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('resize', resizeCanvas);
      resizeCanvas(); 
    } else {
      document.body.style.overflow = 'auto';
      window.removeEventListener('resize', resizeCanvas);
      // Ensure canvas resizes correctly when exiting fullscreen
      setTimeout(resizeCanvas, 0); 
    }
    return () => {
      window.removeEventListener('resize', resizeCanvas);
      document.body.style.overflow = 'auto';
    };
  }, [isFullScreen, resizeCanvas]);

  useEffect(() => {
    // Initial resize on mount
    resizeCanvas();
  }, [resizeCanvas]);

  useEffect(() => {
    // Redraw if the source signature changes
    drawSignature(signatureDataUrl);
  }, [signatureDataUrl, drawSignature]);

  const getCoordinates = (event: React.MouseEvent | React.TouchEvent): { offsetX: number; offsetY: number } => {
    const canvas = canvasRef.current;
    if (!canvas) return { offsetX: 0, offsetY: 0 };
    const rect = canvas.getBoundingClientRect();
    if ('touches' in event) { // Touch event
        return { offsetX: event.touches[0].clientX - rect.left, offsetY: event.touches[0].clientY - rect.top };
    }
    return { offsetX: event.nativeEvent.offsetX, offsetY: event.nativeEvent.offsetY };
  };

  const startDrawing = (event: React.MouseEvent | React.TouchEvent) => {
    event.preventDefault();
    const context = getCanvasContext();
    if (context) {
      const { offsetX, offsetY } = getCoordinates(event);
      context.beginPath();
      context.moveTo(offsetX, offsetY);
      setIsDrawing(true);
    }
  };

  const draw = (event: React.MouseEvent | React.TouchEvent) => {
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
    if (!isDrawing) return;
    const context = getCanvasContext();
    if (context) {
      context.closePath();
    }
    setIsDrawing(false);
  
    const canvas = canvasRef.current;
    if (!canvas) return;
  
    // 如果在全螢幕模式且裝置為橫向 (寬 > 高)，則自動旋轉簽名
    const needsRotation = isFullScreen && canvas.width > canvas.height;
  
    if (needsRotation) {
      const rotatedCanvas = document.createElement('canvas');
      const rotatedContext = rotatedCanvas.getContext('2d');
  
      if (rotatedContext) {
        // 交換寬高以進行旋轉
        rotatedCanvas.width = canvas.height;
        rotatedCanvas.height = canvas.width;
  
        // 移至中心點並旋轉 90 度
        rotatedContext.translate(rotatedCanvas.width / 2, rotatedCanvas.height / 2);
        rotatedContext.rotate(90 * Math.PI / 180);
  
        // 將原始 canvas 內容繪製到旋轉後的 canvas 上
        // 需將繪製起點平移至 (-寬/2, -高/2) 以使其置中
        rotatedContext.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
  
        onSave(rotatedCanvas.toDataURL('image/png'));
      } else {
        // 若無法建立旋轉後的 canvas，則儲存原始版本
        onSave(canvas.toDataURL('image/png'));
      }
    } else {
      // 不需要旋轉，直接儲存
      onSave(canvas.toDataURL('image/png'));
    }
  };
  
  const handleClear = () => { onClear(); };

  const fullScreenClasses = isFullScreen 
    ? "fixed inset-0 bg-slate-900/90 z-50 flex flex-col items-center justify-center p-4" 
    : "";
  
  const canvasContainerClasses = isFullScreen
    ? "bg-slate-200 rounded-lg border-2 border-dashed border-slate-500 touch-none overflow-hidden shadow-2xl"
    : "relative w-full h-[200px] bg-slate-200/50 rounded-lg border-2 border-dashed border-slate-500 touch-none overflow-hidden";
  
  const fullScreenCanvasStyle: React.CSSProperties = isFullScreen ? { flex: '1 1 auto', minHeight: 0, width: '100%' } : {};

  return (
    <div ref={wrapperRef} className={`w-full ${fullScreenClasses}`}>
      {isFullScreen && (
          <div className="text-white text-center mb-2 flex-shrink-0">
              <p className="text-lg">請在下方區域簽名</p>
              <p className="text-sm text-slate-300">將您的裝置橫放以獲得最佳體驗</p>
          </div>
      )}

      <div className={`signature-canvas-container ${canvasContainerClasses}`} style={fullScreenCanvasStyle}>
        <canvas
            ref={canvasRef}
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={stopDrawing}
            className="w-full h-full"
        />
        {!signatureDataUrl && !isFullScreen && (
            <div className="absolute inset-0 flex items-center justify-center text-slate-500 pointer-events-none">
                <PenIcon className="w-8 h-8 mr-2" />
                <span className="text-3xl">請在此處簽名</span>
            </div>
        )}
      </div>

      <div className={`mt-3 flex justify-end gap-3 ${isFullScreen ? 'mt-4 flex-shrink-0' : ''}`}>
        {!isFullScreen && (
             <button
                type="button"
                onClick={() => setIsFullScreen(true)}
                className="flex sm:hidden items-center px-4 py-2 text-xl font-medium text-indigo-600 bg-indigo-50 border border-indigo-500 rounded-md shadow-sm hover:bg-indigo-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                <ExpandIcon className="w-5 h-5 mr-2" />
                手機簽名
            </button>
        )}
        <button
            type="button"
            onClick={handleClear}
            className={`flex items-center px-4 py-2 text-xl font-medium rounded-md shadow-sm text-slate-700 bg-white border border-slate-500 hover:bg-slate-50`}
        >
            <ClearIcon className="w-5 h-5 mr-2" />
            清除
        </button>
        {isFullScreen && (
            <button
                type="button"
                onClick={() => setIsFullScreen(false)}
                className="flex items-center px-6 py-3 text-xl font-medium text-white bg-indigo-600 rounded-md shadow-sm hover:bg-indigo-700"
            >
                確認
            </button>
        )}
      </div>
    </div>
  );
};

export default SignaturePad;
