import React, { useState } from 'react';
import type { WorkOrderData } from './types';
import SignaturePad from './components/SignaturePad';
import ImageUploader from './components/ImageUploader';

// Add type declarations for CDN libraries
declare const jsPDF: any;
declare const html2canvas: any;

const getFormattedDateTime = () => {
  const now = new Date();
  // Adjust for timezone offset to get local time in YYYY-MM-DDTHH:mm format
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
};

const initialFormData: WorkOrderData = {
  dateTime: getFormattedDateTime(),
  serviceUnit: '',
  contactPerson: '',
  contactPhone: '',
  tasks: '',
  status: '',
  remarks: '',
  photos: [],
  signature: null,
  technicianSignature: null,
};

// --- Component Definitions ---
// By defining these components outside the App component, we prevent them from being
// re-created on every state change, which fixes the input focus and signature pad issues.

interface FormFieldProps {
  label: string;
  id: keyof WorkOrderData;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  type?: 'text' | 'textarea' | 'datetime-local' | 'tel';
  required?: boolean;
}

const FormField: React.FC<FormFieldProps> = ({ label, id, value, onChange, type = 'text', required = false }) => (
  <div>
    <label htmlFor={id} className="block text-sm font-medium text-slate-700">
      {label}
    </label>
    <div className="mt-1">
      {type === 'textarea' ? (
        <textarea
          id={id}
          name={id}
          rows={3}
          value={value}
          onChange={onChange}
          required={required}
          className="appearance-none block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm placeholder-slate-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
        />
      ) : (
        <input
          id={id}
          name={id}
          type={type}
          value={value}
          onChange={onChange}
          required={required}
          className="appearance-none block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm placeholder-slate-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
        />
      )}
    </div>
  </div>
);

interface WorkOrderFormProps {
    formData: WorkOrderData;
    onInputChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
    onPhotosChange: (photos: string[]) => void;
    onTechnicianSignatureSave: (signature: string) => void;
    onTechnicianSignatureClear: () => void;
    onCustomerSignatureSave: (signature: string) => void;
    onCustomerSignatureClear: () => void;
    onSubmit: (e: React.FormEvent) => void;
}

const WorkOrderForm: React.FC<WorkOrderFormProps> = ({
    formData,
    onInputChange,
    onPhotosChange,
    onTechnicianSignatureSave,
    onTechnicianSignatureClear,
    onCustomerSignatureSave,
    onCustomerSignatureClear,
    onSubmit
}) => (
     <form onSubmit={onSubmit} className="p-6 sm:p-8 space-y-8">
        <div className="text-center">
            <h1 className="text-2xl font-bold text-slate-800">富元機電有限公司</h1>
            <h2 className="text-xl font-semibold text-slate-600 mt-1">工作服務單</h2>
        </div>
        <div className="space-y-6">
            <FormField label="工作日期及時間" id="dateTime" type="datetime-local" value={formData.dateTime} onChange={onInputChange} required />
            <FormField label="服務單位" id="serviceUnit" value={formData.serviceUnit} onChange={onInputChange} required />
            <FormField label="接洽人" id="contactPerson" value={formData.contactPerson} onChange={onInputChange} />
            <FormField label="連絡電話" id="contactPhone" type="tel" value={formData.contactPhone} onChange={onInputChange} />
            <FormField label="處理事項" id="tasks" type="textarea" value={formData.tasks} onChange={onInputChange} />
            <FormField label="處理情形" id="status" type="textarea" value={formData.status} onChange={onInputChange} />
            <FormField label="備註" id="remarks" type="textarea" value={formData.remarks} onChange={onInputChange} />
            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">拍照插入圖片 (最多4張)</label>
                <ImageUploader photos={formData.photos} onPhotosChange={onPhotosChange} maxPhotos={4}/>
            </div>
            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">服務人員簽認</label>
                <SignaturePad onSave={onTechnicianSignatureSave} onClear={onTechnicianSignatureClear} />
            </div>
            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">客戶簽認</label>
                <SignaturePad onSave={onCustomerSignatureSave} onClear={onCustomerSignatureClear} />
            </div>
        </div>
        <div className="pt-5">
            <div className="flex justify-end">
                <button
                    type="submit"
                    className="w-full sm:w-auto px-6 py-3 border border-transparent rounded-md shadow-sm text-base font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                    產生服務單報告
                </button>
            </div>
        </div>
    </form>
);

interface ReportViewProps {
    data: WorkOrderData;
    onGeneratePdf: (action: 'preview' | 'download') => void;
    onShare: (platform: 'line' | 'email') => void;
    onReset: () => void;
    isGeneratingPdf: boolean;
}

const ReportView: React.FC<ReportViewProps> = ({ data, onGeneratePdf, onShare, onReset, isGeneratingPdf }) => {
    // This is the improved layout for both the hidden PDF render and the visible report.
    const ReportLayout = ({ isForPdf }: { isForPdf: boolean }) => {
        const formattedDate = data.dateTime ? new Date(data.dateTime).toLocaleDateString('zh-TW') : 'N/A';
        const formattedDateTime = data.dateTime ? new Date(data.dateTime).toLocaleString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'N/A';
        const textSectionClass = "mt-1 p-3 border border-slate-200 rounded-md bg-slate-50 min-h-[60px] whitespace-pre-wrap w-full";
        
        return (
            <div
              id={isForPdf ? "pdf-page-1" : undefined}
              className="p-8 bg-white"
              style={{
                  width: '210mm',
                  minHeight: '297mm',
                  boxSizing: 'border-box',
                  display: 'flex',
                  flexDirection: 'column',
                  fontFamily: "'Helvetica Neue', 'Arial', 'sans-serif'" // A common font stack
              }}
            >
                {/* Header */}
                <div className="text-center mb-10 flex-shrink-0">
                    <h1 className="text-3xl font-bold text-gray-800">富元機電有限公司</h1>
                    <h2 className="text-2xl font-semibold text-gray-600 mt-2">工作服務單</h2>
                </div>

                {/* Main Content (grows to fill space) */}
                <div className="flex-grow text-base text-gray-800 space-y-5">
                    <div className="grid grid-cols-12 gap-x-6 gap-y-4">
                        <div className="col-span-12"><strong>工作日期及時間：</strong>{formattedDateTime}</div>
                        <div className="col-span-7"><strong>服務單位：</strong>{data.serviceUnit || 'N/A'}</div>
                        <div className="col-span-5"><strong>接洽人：</strong>{data.contactPerson || 'N/A'}</div>
                        <div className="col-span-12"><strong>連絡電話：</strong>{data.contactPhone || 'N/A'}</div>
                    </div>

                    <div className="pt-2">
                        <strong className="text-base">處理事項：</strong>
                        <div className={textSectionClass}>{data.tasks || 'N/A'}</div>
                    </div>
                    <div className="pt-2">
                        <strong className="text-base">處理情形：</strong>
                        <div className={textSectionClass}>{data.status || 'N/A'}</div>
                    </div>
                    <div className="pt-2">
                        <strong className="text-base">備註：</strong>
                        <div className={textSectionClass}>{data.remarks || 'N/A'}</div>
                    </div>

                    {/* On-screen photo display (not for PDF page 1) */}
                    {!isForPdf && data.photos.length > 0 && (
                        <div className="pt-2">
                            <strong className="text-base">現場照片：</strong>
                            <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-4">
                                {data.photos.map((photo, index) => (
                                    <img key={index} src={photo} alt={`現場照片 ${index + 1}`} className="rounded-lg shadow-md w-full h-auto object-cover aspect-square" />
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Signature Footer */}
                <div className="flex-shrink-0 pt-12 mt-auto grid grid-cols-2 gap-x-12 text-base">
                    <div className="text-center">
                        <strong>服務人員簽認：</strong>
                        <div className="mt-2 p-2 border border-slate-300 rounded-lg bg-slate-50 inline-block min-h-[100px] min-w-[200px] flex items-center justify-center">
                            {data.technicianSignature ? (
                                <img src={data.technicianSignature} alt="服務人員簽名" className="h-20 w-auto" />
                            ) : <span className="text-slate-400">未簽名</span>}
                        </div>
                    </div>
                    <div className="text-center">
                        <strong>客戶簽認：</strong>
                        <div className="mt-2 p-2 border border-slate-300 rounded-lg bg-slate-50 inline-block min-h-[100px] min-w-[200px] flex items-center justify-center">
                            {data.signature ? (
                                <img src={data.signature} alt="客戶簽名" className="h-20 w-auto" />
                            ) : <span className="text-slate-400">未簽名</span>}
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    const PdfPage2Content = () => {
        const formattedDate = data.dateTime ? new Date(data.dateTime).toLocaleDateString('zh-TW') : 'N/A';
        return (
            <div id="pdf-page-2" className="p-8 bg-white" style={{ width: '210mm', height: '297mm', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
                <div className="text-center mb-4 flex-shrink-0">
                    <h3 className="text-xl font-semibold text-slate-700">
                        施工照片 - {data.serviceUnit} ({formattedDate})
                    </h3>
                </div>
                <div className="grid grid-cols-2 grid-rows-2 gap-4 flex-grow">
                    {data.photos.slice(0, 4).map((photo, index) => (
                        <div key={index} className="flex items-center justify-center border border-slate-200 p-1 bg-slate-50 rounded-md overflow-hidden">
                            <img src={photo} alt={`photo-${index}`} className="max-w-full max-h-full object-contain" />
                        </div>
                    ))}
                    {/* Fill remaining grid cells if less than 4 photos to maintain layout */}
                    {Array(4 - data.photos.length).fill(0).map((_, i) => <div key={`placeholder-${i}`}></div>)}
                </div>
            </div>
        );
    };
    
    return (
    <>
      {/* Hidden container for high-quality PDF rendering */}
      <div className="pdf-render-container">
        <ReportLayout isForPdf={true} />
        {data.photos.length > 0 && <PdfPage2Content />}
      </div>
      
      {/* Visible Report for the user, scaled down to fit viewport */}
      <div className="p-4 sm:p-6 bg-slate-50/50">
        <div className="max-w-[210mm] mx-auto scale-[0.9] sm:scale-100 origin-top">
            <div className="shadow-lg">
                <ReportLayout isForPdf={false} />
            </div>
        </div>
      </div>

      <div className="p-4 sm:p-6 bg-slate-50 border-t border-slate-200 flex flex-wrap gap-3 justify-end items-center">
            <button onClick={() => onGeneratePdf('preview')} disabled={isGeneratingPdf} className="px-4 py-2 text-sm font-semibold bg-white border border-slate-300 text-slate-700 rounded-md shadow-sm hover:bg-slate-50 disabled:opacity-50">預覽 PDF</button>
            <button onClick={() => onGeneratePdf('download')} disabled={isGeneratingPdf} className="px-4 py-2 text-sm font-semibold bg-white border border-slate-300 text-slate-700 rounded-md shadow-sm hover:bg-slate-50 disabled:opacity-50">下載 PDF</button>
            <button onClick={() => onShare('line')} className="px-4 py-2 text-sm font-semibold bg-white border border-slate-300 text-slate-700 rounded-md shadow-sm hover:bg-slate-50">分享 (LINE)</button>
            <button onClick={() => onShare('email')} className="px-4 py-2 text-sm font-semibold bg-white border border-slate-300 text-slate-700 rounded-md shadow-sm hover:bg-slate-50">分享 (Email)</button>
            <button onClick={onReset} className="px-6 py-2 text-sm bg-indigo-600 text-white font-semibold rounded-md shadow-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">建立新服務單</button>
      </div>
    </>
    );
};

// --- Main App Component ---

const App: React.FC = () => {
  const [formData, setFormData] = useState<WorkOrderData>(initialFormData);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleCustomerSignatureSave = (signature: string) => {
    setFormData((prev) => ({ ...prev, signature }));
  };

  const handleCustomerSignatureClear = () => {
    setFormData((prev) => ({ ...prev, signature: null }));
  };
  
  const handleTechnicianSignatureSave = (signature: string) => {
    setFormData((prev) => ({ ...prev, technicianSignature: signature }));
  };

  const handleTechnicianSignatureClear = () => {
    setFormData((prev) => ({ ...prev, technicianSignature: null }));
  };

  const handlePhotosChange = (photos: string[]) => {
    setFormData((prev) => ({ ...prev, photos }));
  };
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitted(true);
    window.scrollTo(0, 0);
  };

  const handleReset = () => {
    setFormData(initialFormData);
    setIsSubmitted(false);
    setPdfPreviewUrl(null);
  };

  const generatePdf = async (action: 'preview' | 'download') => {
    if (isGeneratingPdf) return;
    setIsGeneratingPdf(true);
    try {
      const { jsPDF: JSPDF } = (window as any).jspdf;
      const pdf = new JSPDF('p', 'mm', 'a4');
      const pdfWidth = 210;
      const pdfHeight = 297;
      
      const page1Element = document.getElementById('pdf-page-1');
      if (!page1Element) throw new Error('Report page 1 element not found');

      // Removed useCORS: true as it's not needed for data URLs and can cause issues.
      const canvas1 = await html2canvas(page1Element, { scale: 3 });
      const imgData1 = canvas1.toDataURL('image/png');
      const imgProps1 = pdf.getImageProperties(imgData1);
      const page1Height = (imgProps1.height * pdfWidth) / imgProps1.width;
      pdf.addImage(imgData1, 'PNG', 0, 0, pdfWidth, Math.min(page1Height, pdfHeight));

      if (formData.photos.length > 0) {
        const page2Element = document.getElementById('pdf-page-2');
        if (page2Element) {
          pdf.addPage();
          // Removed useCORS: true here as well.
          const canvas2 = await html2canvas(page2Element, { scale: 3 });
          const imgData2 = canvas2.toDataURL('image/png');
          const imgProps2 = pdf.getImageProperties(imgData2);
          const page2Height = (imgProps2.height * pdfWidth) / imgProps2.width;
          pdf.addImage(imgData2, 'PNG', 0, 0, pdfWidth, Math.min(page2Height, pdfHeight));
        }
      }

      if (action === 'preview') {
        setPdfPreviewUrl(pdf.output('datauristring'));
      } else {
        const fileName = `工作服務單-${formData.serviceUnit || 'report'}-${new Date().toISOString().split('T')[0]}.pdf`;
        pdf.save(fileName);
      }
    } catch (error) {
      console.error("Failed to generate PDF:", error);
      alert("無法產生PDF，請檢查主控台中的錯誤訊息。");
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleShare = (platform: 'line' | 'email') => {
    const subject = `富元機電工作服務單 - ${formData.serviceUnit}`;
    const body = `
工作服務單
-----------------
服務單位: ${formData.serviceUnit}
接洽人: ${formData.contactPerson || 'N/A'}
連絡電話: ${formData.contactPhone || 'N/A'}
日期時間: ${formData.dateTime ? new Date(formData.dateTime).toLocaleString('zh-TW') : 'N/A'}
-----------------
處理事項:
${formData.tasks || 'N/A'}
-----------------
處理情形:
${formData.status || 'N/A'}
-----------------
備註:
${formData.remarks || 'N/A'}
`.trim().replace(/\n/g, '%0A');

    if (platform === 'line') {
      const lineUrl = `https://line.me/R/msg/text/?${encodeURIComponent(body.replace(/%0A/g, '\n'))}`;
      window.open(lineUrl, '_blank', 'noopener,noreferrer');
    } else {
      const mailtoUrl = `mailto:?subject=${encodeURIComponent(subject)}&body=${body}`;
      window.open(mailtoUrl);
    }
  };
  
  return (
    <div className="min-h-screen bg-slate-100">
        <div className="max-w-4xl mx-auto bg-white rounded-xl shadow-2xl ring-1 ring-black ring-opacity-5 overflow-hidden my-8 sm:my-12">
           {isSubmitted ? (
             <ReportView 
                data={formData}
                onGeneratePdf={generatePdf}
                onShare={handleShare}
                onReset={handleReset}
                isGeneratingPdf={isGeneratingPdf}
              />
            ) : (
             <WorkOrderForm 
                formData={formData}
                onInputChange={handleInputChange}
                onPhotosChange={handlePhotosChange}
                onTechnicianSignatureSave={handleTechnicianSignatureSave}
                onTechnicianSignatureClear={handleTechnicianSignatureClear}
                onCustomerSignatureSave={handleCustomerSignatureSave}
                onCustomerSignatureClear={handleCustomerSignatureClear}
                onSubmit={handleSubmit}
             />
            )}
        </div>
        
        {isGeneratingPdf && (
            <div className="fixed inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-50">
              <div className="text-center">
                <p className="text-lg font-semibold text-slate-700">正在產生 PDF...</p>
                <p className="text-sm text-slate-500">請稍候</p>
              </div>
            </div>
        )}

        {pdfPreviewUrl && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-40 p-4" onClick={() => setPdfPreviewUrl(null)}>
                <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl h-full max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                    <div className="flex-shrink-0 p-4 border-b flex justify-between items-center">
                        <h3 className="text-lg font-semibold">PDF 預覽</h3>
                        <button 
                            onClick={() => setPdfPreviewUrl(null)}
                            className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md text-sm font-medium"
                        >
                            關閉
                        </button>
                    </div>
                    <div className="flex-grow bg-slate-200">
                        <iframe src={pdfPreviewUrl} className="w-full h-full border-none" title="PDF Preview"></iframe>
                    </div>
                </div>
            </div>
        )}

    </div>
  );
};

export default App;
