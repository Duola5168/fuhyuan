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

const FormField: React.FC<{
  label: string;
  id: keyof WorkOrderData;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  type?: 'text' | 'textarea' | 'datetime-local' | 'tel';
  required?: boolean;
}> = ({ label, id, value, onChange, type = 'text', required = false }) => (
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

const App: React.FC = () => {
  const [formData, setFormData] = useState<WorkOrderData>(initialFormData);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSignatureSave = (signature: string) => {
    setFormData((prev) => ({ ...prev, signature }));
  };

  const handleSignatureClear = () => {
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

      const canvas1 = await html2canvas(page1Element, { scale: 3, useCORS: true });
      const imgData1 = canvas1.toDataURL('image/png');
      const imgProps1 = pdf.getImageProperties(imgData1);
      const page1Height = (imgProps1.height * pdfWidth) / imgProps1.width;
      pdf.addImage(imgData1, 'PNG', 0, 0, pdfWidth, page1Height);

      if (formData.photos.length > 0) {
        const page2Element = document.getElementById('pdf-page-2');
        if (page2Element) {
          pdf.addPage();
          const canvas2 = await html2canvas(page2Element, { scale: 3, useCORS: true });
          const imgData2 = canvas2.toDataURL('image/png');
          const imgProps2 = pdf.getImageProperties(imgData2);
          const page2Height = (imgProps2.height * pdfWidth) / imgProps2.width;
          pdf.addImage(imgData2, 'PNG', 0, 0, pdfWidth, Math.min(page2Height, pdfHeight));
        }
      }

      if (action === 'preview') {
        pdf.output('dataurlnewwindow');
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


  const ReportView: React.FC<{ data: WorkOrderData }> = ({ data }) => {
    const PdfPage1Content = () => (
      <div id="pdf-page-1" className="p-8 space-y-6 bg-white" style={{ width: '210mm', minHeight: '297mm', boxSizing: 'border-box' }}>
        <div className="text-center">
            <h1 className="text-2xl font-bold text-slate-800">富元機電有限公司</h1>
            <h2 className="text-xl font-semibold text-slate-600 mt-1">工作服務單</h2>
        </div>
        <div className="border-t border-slate-200 pt-6 grid grid-cols-2 gap-x-8 gap-y-4 text-sm">
            <div className="col-span-2"><strong>工作日期及時間:</strong> {data.dateTime ? new Date(data.dateTime).toLocaleString('zh-TW') : 'N/A'}</div>
            <div><strong>服務單位:</strong> {data.serviceUnit || 'N/A'}</div>
            <div><strong>接洽人:</strong> {data.contactPerson || 'N/A'}</div>
            <div className="col-span-2"><strong>連絡電話:</strong> {data.contactPhone || 'N/A'}</div>
            <div className="col-span-2"><strong>處理事項:</strong> <p className="mt-1 whitespace-pre-wrap">{data.tasks || 'N/A'}</p></div>
            <div className="col-span-2"><strong>處理情形:</strong> <p className="mt-1 whitespace-pre-wrap">{data.status || 'N/A'}</p></div>
            <div className="col-span-2"><strong>備註:</strong> <p className="mt-1 whitespace-pre-wrap">{data.remarks || 'N/A'}</p></div>

            <div className="col-span-1 pt-4">
                <strong>服務人員簽認:</strong>
                {data.technicianSignature ? (
                    <div className="mt-2 p-2 border border-slate-300 rounded-lg bg-slate-50 inline-block">
                        <img src={data.technicianSignature} alt="technician-signature" className="h-20 w-auto" />
                    </div>
                ) : <p className="mt-2">未簽名</p>}
            </div>
            <div className="col-span-1 pt-4">
                <strong>客戶簽認:</strong>
                {data.signature ? (
                    <div className="mt-2 p-2 border border-slate-300 rounded-lg bg-slate-50 inline-block">
                        <img src={data.signature} alt="customer-signature" className="h-20 w-auto" />
                    </div>
                ) : <p className="mt-2">未簽名</p>}
            </div>
        </div>
      </div>
    );
    
    const PdfPage2Content = () => (
        <div id="pdf-page-2" className="bg-white" style={{ width: '210mm', height: '297mm', boxSizing: 'border-box' }}>
            <div className="grid grid-cols-2 grid-rows-2 h-full w-full">
                {data.photos.slice(0, 4).map((photo, index) => (
                    <div key={index} className="flex items-center justify-center border border-slate-100 p-2">
                        <img src={photo} alt={`photo-${index}`} className="max-w-full max-h-full object-contain" />
                    </div>
                ))}
                {/* Fill remaining grid cells if less than 4 photos to maintain layout */}
                {Array(4 - data.photos.length).fill(0).map((_, i) => <div key={`placeholder-${i}`}></div>)}
            </div>
        </div>
    );
    
    return (
    <>
      {/* Hidden container for high-quality PDF rendering */}
      <div className="pdf-render-container">
        <PdfPage1Content />
        {data.photos.length > 0 && <PdfPage2Content />}
      </div>
      
      {/* Visible Report for the user */}
      <div className="p-6 sm:p-8 space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-800">富元機電有限公司</h1>
          <h2 className="text-xl font-semibold text-slate-600 mt-1">工作服務單</h2>
        </div>
        <div className="border-t border-slate-200 pt-6 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 text-sm">
          <div className="md:col-span-2"><strong>工作日期及時間:</strong> {data.dateTime ? new Date(data.dateTime).toLocaleString('zh-TW') : 'N/A'}</div>
          <div><strong>服務單位:</strong> {data.serviceUnit || 'N/A'}</div>
          <div><strong>接洽人:</strong> {data.contactPerson || 'N/A'}</div>
          <div className="md:col-span-2"><strong>連絡電話:</strong> {data.contactPhone || 'N/A'}</div>
          <div className="md:col-span-2"><strong>處理事項:</strong> <p className="mt-1 whitespace-pre-wrap">{data.tasks || 'N/A'}</p></div>
          <div className="md:col-span-2"><strong>處理情形:</strong> <p className="mt-1 whitespace-pre-wrap">{data.status || 'N/A'}</p></div>
          <div className="md:col-span-2"><strong>備註:</strong> <p className="mt-1 whitespace-pre-wrap">{data.remarks || 'N/A'}</p></div>
          <div className="md:col-span-2">
            <strong>現場照片:</strong>
            {data.photos.length > 0 ? (
              <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-4">
                {data.photos.map((photo, index) => (
                  <img key={index} src={photo} alt={`photo-${index}`} className="rounded-lg shadow-md w-full h-auto object-cover aspect-square" />
                ))}
              </div>
            ) : <p>無</p>}
          </div>
          <div className="pt-4">
              <strong>服務人員簽認:</strong>
              {data.technicianSignature ? (
                  <div className="mt-2 p-2 border border-slate-300 rounded-lg bg-slate-50 inline-block">
                      <img src={data.technicianSignature} alt="technician-signature" className="h-24 w-auto" />
                  </div>
              ) : <p className="mt-2">未簽名</p>}
          </div>
          <div className="pt-4">
              <strong>客戶簽認:</strong>
              {data.signature ? (
                  <div className="mt-2 p-2 border border-slate-300 rounded-lg bg-slate-50 inline-block">
                      <img src={data.signature} alt="customer-signature" className="h-24 w-auto" />
                  </div>
              ) : <p className="mt-2">未簽名</p>}
          </div>
        </div>
      </div>
      <div className="p-4 sm:p-6 bg-slate-50 border-t border-slate-200 flex flex-wrap gap-3 justify-end items-center">
            <button onClick={() => generatePdf('preview')} disabled={isGeneratingPdf} className="px-4 py-2 text-sm font-semibold bg-white border border-slate-300 text-slate-700 rounded-md shadow-sm hover:bg-slate-50 disabled:opacity-50">預覽 PDF</button>
            <button onClick={() => generatePdf('download')} disabled={isGeneratingPdf} className="px-4 py-2 text-sm font-semibold bg-white border border-slate-300 text-slate-700 rounded-md shadow-sm hover:bg-slate-50 disabled:opacity-50">下載 PDF</button>
            <button onClick={() => handleShare('line')} className="px-4 py-2 text-sm font-semibold bg-white border border-slate-300 text-slate-700 rounded-md shadow-sm hover:bg-slate-50">分享 (LINE)</button>
            <button onClick={() => handleShare('email')} className="px-4 py-2 text-sm font-semibold bg-white border border-slate-300 text-slate-700 rounded-md shadow-sm hover:bg-slate-50">分享 (Email)</button>
            <button onClick={handleReset} className="px-6 py-2 text-sm bg-indigo-600 text-white font-semibold rounded-md shadow-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">建立新服務單</button>
      </div>
      {isGeneratingPdf && (
        <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
          <div className="text-center">
            <p className="text-lg font-semibold text-slate-700">正在產生 PDF...</p>
            <p className="text-sm text-slate-500">請稍候</p>
          </div>
        </div>
      )}
    </>
    );
  };
  
  const WorkOrderForm: React.FC = () => (
     <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-8">
        <div className="text-center">
            <h1 className="text-2xl font-bold text-slate-800">富元機電有限公司</h1>
            <h2 className="text-xl font-semibold text-slate-600 mt-1">工作服務單</h2>
        </div>
        <div className="space-y-6">
            <FormField label="工作日期及時間" id="dateTime" type="datetime-local" value={formData.dateTime} onChange={handleInputChange} required />
            <FormField label="服務單位" id="serviceUnit" value={formData.serviceUnit} onChange={handleInputChange} required />
            <FormField label="接洽人" id="contactPerson" value={formData.contactPerson} onChange={handleInputChange} />
            <FormField label="連絡電話" id="contactPhone" type="tel" value={formData.contactPhone} onChange={handleInputChange} />
            <FormField label="處理事項" id="tasks" type="textarea" value={formData.tasks} onChange={handleInputChange} />
            <FormField label="處理情形" id="status" type="textarea" value={formData.status} onChange={handleInputChange} />
            <FormField label="備註" id="remarks" type="textarea" value={formData.remarks} onChange={handleInputChange} />
            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">拍照插入圖片 (最多4張)</label>
                <ImageUploader photos={formData.photos} onPhotosChange={handlePhotosChange} maxPhotos={4}/>
            </div>
            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">服務人員簽認</label>
                <SignaturePad onSave={handleTechnicianSignatureSave} onClear={handleTechnicianSignatureClear} />
            </div>
            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">客戶簽認</label>
                <SignaturePad onSave={handleSignatureSave} onClear={handleSignatureClear} />
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

  return (
    <div className="min-h-screen py-8 sm:py-12">
        <div className="max-w-4xl mx-auto bg-white rounded-xl shadow-2xl ring-1 ring-black ring-opacity-5 overflow-hidden">
           {isSubmitted ? <ReportView data={formData} /> : <WorkOrderForm />}
        </div>
    </div>
  );
};

export default App;