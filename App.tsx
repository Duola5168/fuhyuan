import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { WorkOrderData, ProductItem } from './types';
import SignaturePad from './components/SignaturePad';
import ImageUploader from './components/ImageUploader';

// Add type declarations for CDN libraries
declare const jsPDF: any;
declare const html2canvas: any;

const A4_SAFE_HEIGHT_MM = 280; // A4 height is 297mm, leave some margin

const getFormattedDateTime = () => {
  const now = new Date();
  // Adjust for timezone offset to get local time in YYYY-MM-DDTHH:mm format
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
};

const initialProduct: ProductItem = {
    id: `product-${Date.now()}`,
    name: '',
    quantity: 1,
    serialNumber: '',
};

const initialFormData: WorkOrderData = {
  dateTime: getFormattedDateTime(),
  serviceUnit: '',
  contactPerson: '',
  contactPhone: '',
  products: [initialProduct],
  tasks: '',
  status: '',
  remarks: '',
  photos: [],
  signature: null,
  technicianSignature: null,
};

// --- Utility Functions ---
const chunk = <T,>(arr: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(arr.length / size) }, (v, i) =>
    arr.slice(i * size, i * size + size)
  );


// --- Component Definitions ---
interface FormFieldProps {
  label: string;
  id: keyof WorkOrderData | string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  type?: 'text' | 'textarea' | 'datetime-local' | 'tel';
  required?: boolean;
  placeholder?: string;
  rows?: number;
  autoSize?: boolean;
}

const FormField: React.FC<FormFieldProps> = ({
  label, id, value, onChange, type = 'text', required = false, placeholder, rows: initialRows = 3, autoSize = false,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Effect for auto-sizing
  useEffect(() => {
    if (autoSize && textareaRef.current) {
      const textarea = textareaRef.current;
      textarea.style.height = 'auto'; // Reset height
      textarea.style.height = `${textarea.scrollHeight}px`; // Set to scroll height
    }
  }, [autoSize, value]); // Re-run when value changes

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      <div className="mt-1">
        {type === 'textarea' ? (
          <textarea
            ref={textareaRef}
            id={id}
            name={id}
            rows={autoSize ? 1 : initialRows}
            value={value}
            onChange={onChange}
            required={required}
            placeholder={placeholder}
            className="appearance-none block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm placeholder-slate-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            style={autoSize ? { overflowY: 'hidden', resize: 'none' } : {}}
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
};


// --- Icons for Product Section ---
const PlusIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
    </svg>
);

const TrashIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
);


interface WorkOrderFormProps {
    formData: WorkOrderData;
    onInputChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
    onProductChange: (index: number, field: keyof Omit<ProductItem, 'id'>, value: string | number) => void;
    onAddProduct: () => void;
    onRemoveProduct: (index: number) => void;
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
    onProductChange,
    onAddProduct,
    onRemoveProduct,
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
            <FormField label="處理事項" id="tasks" type="textarea" value={formData.tasks} onChange={onInputChange} rows={8} placeholder="單行40字,行數8行" />
            <FormField label="處理情形" id="status" type="textarea" value={formData.status} onChange={onInputChange} rows={8} placeholder="單行40字,行數8行" />
            
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">產品項目</label>
              <div className="space-y-4">
                {formData.products.map((product, index) => (
                    <div key={product.id} className="grid grid-cols-12 gap-x-3 gap-y-4 p-4 border border-slate-200 rounded-lg relative">
                        <div className="col-span-12 sm:col-span-6">
                            <label htmlFor={`product-name-${index}`} className="block text-xs font-medium text-slate-600">產品品名</label>
                            <input
                                id={`product-name-${index}`}
                                type="text"
                                value={product.name}
                                onChange={(e) => onProductChange(index, 'name', e.target.value)}
                                className="mt-1 appearance-none block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm placeholder-slate-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                            />
                        </div>
                        <div className="col-span-6 sm:col-span-2">
                            <label htmlFor={`product-quantity-${index}`} className="block text-xs font-medium text-slate-600">數量</label>
                            <select
                                id={`product-quantity-${index}`}
                                value={product.quantity}
                                onChange={(e) => onProductChange(index, 'quantity', parseInt(e.target.value, 10))}
                                className="mt-1 block w-full pl-3 pr-8 py-2 text-base border-slate-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                            >
                                {Array.from({ length: 20 }, (_, i) => i + 1).map(q => <option key={q} value={q}>{q}</option>)}
                            </select>
                        </div>
                        <div className="col-span-6 sm:col-span-4">
                             <label htmlFor={`product-serial-${index}`} className="block text-xs font-medium text-slate-600">序號</label>
                            <input
                                id={`product-serial-${index}`}
                                type="text"
                                value={product.serialNumber}
                                onChange={(e) => onProductChange(index, 'serialNumber', e.target.value)}
                                className="mt-1 appearance-none block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm placeholder-slate-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                            />
                        </div>
                        {formData.products.length > 1 && (
                            <button
                                type="button"
                                onClick={() => onRemoveProduct(index)}
                                className="absolute top-2 right-2 p-1 text-slate-400 hover:text-red-600 rounded-full hover:bg-red-100"
                                aria-label="Remove product"
                            >
                                <TrashIcon className="w-5 h-5"/>
                            </button>
                        )}
                    </div>
                ))}
                <button
                    type="button"
                    onClick={onAddProduct}
                    className="flex items-center justify-center w-full px-4 py-2 border-2 border-dashed border-slate-300 rounded-md text-sm font-medium text-slate-600 hover:bg-slate-50 hover:border-slate-400 focus:outline-none"
                >
                    <PlusIcon className="w-5 h-5 mr-2" />
                    新增項目
                </button>
              </div>
            </div>

            <FormField label="備註" id="remarks" type="textarea" value={formData.remarks} onChange={onInputChange} autoSize />
            
            <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">拍照插入圖片</label>
                <ImageUploader photos={formData.photos} onPhotosChange={onPhotosChange} />
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


// --- Report Components ---

type ReportLayoutProps = {
  data: WorkOrderData;
  mode: 'screen' | 'pdf-full' | 'pdf-page1' | 'pdf-page2';
};

const ReportLayout: React.FC<ReportLayoutProps> = ({ data, mode }) => {
  const isPdf = mode.startsWith('pdf');
  const formattedDateTime = data.dateTime ? new Date(data.dateTime).toLocaleString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'N/A';
  const hasProducts = data.products && data.products.filter(p => p.name.trim() !== '').length > 0;

  // Flags for what to display based on the mode
  const showMainHeaderAndCustomerInfo = mode === 'screen' || mode === 'pdf-full' || mode === 'pdf-page1' || mode === 'pdf-page2';
  const showTasksAndStatus = mode === 'screen' || mode === 'pdf-full' || mode === 'pdf-page1';
  const showProductsAndRemarks = mode === 'screen' || mode === 'pdf-full' || mode === 'pdf-page2';
  const showSignatures = true; // Signatures are part of every layout

  return (
    <div
      id={isPdf ? `pdf-${mode}` : undefined}
      className="p-8 bg-white"
      style={{
        width: isPdf ? '210mm' : '100%',
        minHeight: isPdf ? '297mm' : 'auto', // Ensure it fills page for page1/2
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: "'Helvetica Neue', 'Arial', 'sans-serif'"
      }}
    >
      {/* HEADER */}
      {showMainHeaderAndCustomerInfo && (
        <>
          <div className="text-center mb-10 flex-shrink-0">
            <h1 className="text-3xl font-bold text-gray-800">富元機電有限公司</h1>
            <h2 className="text-2xl font-semibold text-gray-600 mt-2">
              工作服務單
              {mode === 'pdf-page2' && ' (產品項目與備註)'}
            </h2>
          </div>

          <div className="grid grid-cols-12 gap-x-6 gap-y-4">
            <div className="col-span-12"><strong>工作日期及時間：</strong>{formattedDateTime}</div>
            <div className="col-span-7"><strong>服務單位：</strong>{data.serviceUnit || 'N/A'}</div>
            <div className="col-span-5"><strong>接洽人：</strong>{data.contactPerson || 'N/A'}</div>
            <div className="col-span-12"><strong>連絡電話：</strong>{data.contactPhone || 'N/A'}</div>
          </div>
        </>
      )}

      {/* BODY */}
      <div className="flex-grow text-base text-gray-800 space-y-5 pt-5">
        {showTasksAndStatus && (
          <>
            <div>
              <strong className="text-base">處理事項：</strong>
              <div className="mt-1 p-3 border border-slate-200 rounded-md bg-slate-50 whitespace-pre-wrap w-full">{data.tasks || 'N/A'}</div>
            </div>
            <div>
              <strong className="text-base">處理情形：</strong>
              <div className="mt-1 p-3 border border-slate-200 rounded-md bg-slate-50 whitespace-pre-wrap w-full">{data.status || 'N/A'}</div>
            </div>
          </>
        )}

        {showProductsAndRemarks && hasProducts && (
          <div>
            <strong className="text-base">產品項目：</strong>
            <div className="mt-2 border border-slate-200 rounded-md overflow-hidden">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th scope="col" className="px-3 py-2 text-left font-medium text-slate-600">產品品名</th>
                    <th scope="col" className="px-3 py-2 text-left font-medium text-slate-600">數量</th>
                    <th scope="col" className="px-3 py-2 text-left font-medium text-slate-600">序號</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {data.products.filter(p => p.name.trim() !== '').map((product, index) => (
                    <tr key={index}>
                      <td className="px-3 py-2 whitespace-nowrap">{product.name}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{product.quantity}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{product.serialNumber || 'N/A'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {showProductsAndRemarks && (
          <div>
            <strong className="text-base">備註：</strong>
            <div className="mt-1 p-3 border border-slate-200 rounded-md bg-slate-50 whitespace-pre-wrap w-full">{data.remarks || 'N/A'}</div>
          </div>
        )}

        {mode === 'screen' && data.photos.length > 0 && (
          <div>
            <strong className="text-base">現場照片：</strong>
            <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-4">
              {data.photos.map((photo, index) => (
                <img key={index} src={photo} alt={`現場照片 ${index + 1}`} className="rounded-lg shadow-md w-full h-auto object-cover aspect-square" />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* FOOTER - Signatures */}
      {showSignatures && (
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
      )}
    </div>
  );
};


const PdfPhotoPage = ({ photos, pageNumber, totalPages, data }: { photos: string[], pageNumber: number, totalPages: number, data: WorkOrderData }) => {
    const formattedDate = data.dateTime ? new Date(data.dateTime).toLocaleDateString('zh-TW') : 'N/A';
    const pageTitle = totalPages > 1
        ? `施工照片 (第 ${pageNumber} / ${totalPages} 頁) - ${data.serviceUnit} (${formattedDate})`
        : `施工照片 - ${data.serviceUnit} (${formattedDate})`;

    return (
        <div id={`pdf-photo-page-${pageNumber - 1}`} className="p-8 bg-white" style={{ width: '210mm', height: '297mm', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
            <div className="text-center mb-4 flex-shrink-0">
                <h3 className="text-xl font-semibold text-slate-700">{pageTitle}</h3>
            </div>
            <div className="grid grid-cols-2 grid-rows-2 gap-4 flex-grow">
                {photos.map((photo, index) => (
                    <div key={index} className="flex items-center justify-center border border-slate-200 p-1 bg-slate-50 rounded-md overflow-hidden">
                        <img src={photo} alt={`photo-${index}`} className="max-w-full max-h-full object-contain" />
                    </div>
                ))}
                {Array(4 - photos.length).fill(0).map((_, i) => <div key={`placeholder-${i}`}></div>)}
            </div>
        </div>
    );
};

interface ReportViewProps {
    data: WorkOrderData;
    onDownloadPdf: () => void;
    onSharePdf: () => void;
    onReset: () => void;
    onEdit: () => void;
    isGeneratingPdf: boolean;
}

const ReportView: React.FC<ReportViewProps> = ({ data, onDownloadPdf, onSharePdf, onReset, onEdit, isGeneratingPdf }) => {
    const photoChunks = chunk(data.photos, 4);
    
    return (
    <>
      {/* Hidden container for pre-rendering PDF layouts */}
      <div className="pdf-render-container">
        <ReportLayout data={data} mode="pdf-full" />
        <ReportLayout data={data} mode="pdf-page1" />
        <ReportLayout data={data} mode="pdf-page2" />
        {photoChunks.map((photoChunk, index) => (
            <PdfPhotoPage
                key={index}
                photos={photoChunk}
                pageNumber={index + 1}
                totalPages={photoChunks.length}
                data={data}
            />
        ))}
      </div>
      
      {/* Visible report on screen */}
      <div className="p-4 sm:p-6 bg-slate-50/50 overflow-x-auto">
        <div className="w-full max-w-[800px] mx-auto origin-top">
            <div className="shadow-lg">
                <ReportLayout data={data} mode="screen" />
            </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="p-4 sm:p-6 bg-slate-50 border-t border-slate-200 flex flex-wrap gap-3 justify-between items-center">
            <button onClick={onReset} className="px-6 py-2 text-sm bg-red-600 text-white font-semibold rounded-md shadow-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500">建立新服務單</button>
            <div className="flex flex-wrap gap-3">
              <button onClick={onDownloadPdf} disabled={isGeneratingPdf} className="px-4 py-2 text-sm font-semibold bg-white border border-slate-300 text-slate-700 rounded-md shadow-sm hover:bg-slate-50 disabled:opacity-50">下載 PDF</button>
              <button onClick={onSharePdf} disabled={isGeneratingPdf} className="px-4 py-2 text-sm font-semibold bg-green-600 text-white rounded-md shadow-sm hover:bg-green-700 disabled:opacity-50">分享 PDF</button>
              <button onClick={onEdit} className="px-4 py-2 text-sm font-semibold bg-white border border-slate-300 text-slate-700 rounded-md shadow-sm hover:bg-slate-50">修改內容</button>
            </div>
      </div>
    </>
    );
};

// --- Main App Component ---

const App: React.FC = () => {
  const [formData, setFormData] = useState<WorkOrderData>(initialFormData);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    
    // Enforce line limit for tasks and status
    if (name === 'tasks' || name === 'status') {
      const lines = value.split('\n');
      if (lines.length > 8) {
        const truncatedValue = lines.slice(0, 8).join('\n');
        setFormData((prev) => ({ ...prev, [name]: truncatedValue }));
        return; // Exit to prevent setting the longer value
      }
    }

    setFormData((prev) => ({ ...prev, [name]: value }));
  };
  
  const handleProductChange = (index: number, field: keyof Omit<ProductItem, 'id'>, value: string | number) => {
    setFormData(prev => {
        const newProducts = [...prev.products];
        newProducts[index] = { ...newProducts[index], [field]: value };
        return { ...prev, products: newProducts };
    });
  };

  const handleAddProduct = () => {
    const newProduct: ProductItem = {
      id: `product-${Date.now()}`,
      name: '',
      quantity: 1,
      serialNumber: '',
    };
    setFormData(prev => ({ ...prev, products: [...prev.products, newProduct] }));
  };

  const handleRemoveProduct = (index: number) => {
    if (formData.products.length <= 1) return; // Prevent removing the last item
    setFormData(prev => ({
        ...prev,
        products: prev.products.filter((_, i) => i !== index),
    }));
  };

  const handleCustomerSignatureSave = useCallback((signature: string) => {
    setFormData((prev) => ({ ...prev, signature }));
  }, []);

  const handleCustomerSignatureClear = useCallback(() => {
    setFormData((prev) => ({ ...prev, signature: null }));
  }, []);
  
  const handleTechnicianSignatureSave = useCallback((signature: string) => {
    setFormData((prev) => ({ ...prev, technicianSignature: signature }));
  }, []);

  const handleTechnicianSignatureClear = useCallback(() => {
    setFormData((prev) => ({ ...prev, technicianSignature: null }));
  }, []);

  const handlePhotosChange = useCallback((photos: string[]) => {
    setFormData((prev) => ({ ...prev, photos }));
  }, []);
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitted(true);
    window.scrollTo(0, 0);
  };
  
  const handleEdit = () => {
      setIsSubmitted(false);
  };

  const handleReset = () => {
    if (window.confirm("您確定要清除所有資料並建立新的服務單嗎？")) {
        setFormData({
            ...initialFormData,
            products: [{
                id: `product-${Date.now()}`,
                name: '',
                quantity: 1,
                serialNumber: '',
            }],
            dateTime: getFormattedDateTime() // Reset time to now
        });
        setIsSubmitted(false);
    }
  };
  
  const generatePdfBlob = async (): Promise<Blob | null> => {
    try {
      const { jsPDF: JSPDF } = (window as any).jspdf;
      const pdf = new JSPDF('p', 'mm', 'a4');
      const pdfWidth = 210;
      const pdfHeight = 297;
      const options = {
          scale: 2,
          useCORS: true,
          backgroundColor: '#ffffff',
      };
      const imageType = 'image/jpeg';
      const imageQuality = 0.92;

      // 1. Measure the full content
      const fullElement = document.getElementById('pdf-pdf-full');
      if (!fullElement) throw new Error('Full report element not found for measurement');
      
      const fullCanvas = await html2canvas(fullElement, options);
      const fullImgProps = pdf.getImageProperties(fullCanvas.toDataURL(imageType, imageQuality));
      const fullHeight = (fullImgProps.height * pdfWidth) / fullImgProps.width;

      let pageCount = 0;

      // 2. Decide whether to split the page
      if (fullHeight > A4_SAFE_HEIGHT_MM) {
        // --- SPLIT PAGE LOGIC ---
        const page1Element = document.getElementById('pdf-pdf-page1');
        const page2Element = document.getElementById('pdf-pdf-page2');
        if (!page1Element || !page2Element) throw new Error('Split page elements not found');
        
        // Add Page 1
        const canvas1 = await html2canvas(page1Element, options);
        pdf.addImage(canvas1.toDataURL(imageType, imageQuality), 'JPEG', 0, 0, pdfWidth, pdfHeight);
        pageCount++;

        // Add Page 2
        pdf.addPage();
        const canvas2 = await html2canvas(page2Element, options);
        pdf.addImage(canvas2.toDataURL(imageType, imageQuality), 'JPEG', 0, 0, pdfWidth, pdfHeight);
        pageCount++;

      } else {
        // --- SINGLE PAGE LOGIC ---
        pdf.addImage(fullCanvas.toDataURL(imageType, imageQuality), 'JPEG', 0, 0, pdfWidth, fullHeight);
        pageCount++;
      }
      
      // 3. Add photo pages
      if (formData.photos.length > 0) {
        const photoChunks = chunk(formData.photos, 4);
        for (let i = 0; i < photoChunks.length; i++) {
          const photoPageElement = document.getElementById(`pdf-photo-page-${i}`);
          if (photoPageElement) {
              if (pageCount > 0) pdf.addPage();
              const canvas = await html2canvas(photoPageElement, options);
              const imgData = canvas.toDataURL(imageType, imageQuality);
              pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
              pageCount++;
          }
        }
      }
      return pdf.output('blob');
    } catch (error) {
      console.error("Failed to generate PDF blob:", error);
      alert("無法產生PDF，可能是內容過於複雜。請檢查主控台中的錯誤訊息。");
      return null;
    }
  };
  
  const handleDownloadPdf = async () => {
    if (isGeneratingPdf) return;
    setIsGeneratingPdf(true);

    const blob = await generatePdfBlob();
    if (blob) {
        const fileName = `工作服務單-${formData.serviceUnit || 'report'}-${new Date().toISOString().split('T')[0]}.pdf`;
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
    }
    setIsGeneratingPdf(false);
  };

  const handleSharePdf = async () => {
    if (isGeneratingPdf) return;
    setIsGeneratingPdf(true);

    const blob = await generatePdfBlob();
    if (!blob) {
      setIsGeneratingPdf(false);
      return;
    }

    const fileName = `工作服務單-${formData.serviceUnit || 'report'}-${new Date().toISOString().split('T')[0]}.pdf`;
    const file = new File([blob], fileName, { type: 'application/pdf' });
    const shareData = {
      files: [file],
      title: `工作服務單 - ${formData.serviceUnit}`,
      text: `請查收 ${formData.serviceUnit} 的工作服務單。`,
    };
    
    if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
      try {
        await navigator.share(shareData);
      } catch (error) {
        // This is a special type of error that means the user canceled the share dialog.
        // We shouldn't show an error message for this.
        const abortError = error as DOMException;
        if (abortError.name !== 'AbortError') {
            console.error('Error sharing PDF:', error);
            alert('分享失敗，請稍後再試。');
        }
      }
    } else {
      alert('您的瀏覽器不支援檔案分享。請先下載PDF後再手動分享。');
    }
    setIsGeneratingPdf(false);
  };
  
  return (
    <div className="min-h-screen bg-slate-100">
        <div className="max-w-4xl mx-auto bg-white rounded-xl shadow-2xl ring-1 ring-black ring-opacity-5 overflow-hidden my-8 sm:my-12">
           {isSubmitted ? (
             <ReportView 
                data={formData}
                onDownloadPdf={handleDownloadPdf}
                onSharePdf={handleSharePdf}
                onReset={handleReset}
                onEdit={handleEdit}
                isGeneratingPdf={isGeneratingPdf}
              />
            ) : (
             <WorkOrderForm 
                formData={formData}
                onInputChange={handleInputChange}
                onProductChange={handleProductChange}
                onAddProduct={handleAddProduct}
                onRemoveProduct={handleRemoveProduct}
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
                <p className="text-lg font-semibold text-slate-700">正在處理 PDF...</p>
                <p className="text-sm text-slate-500">請稍候</p>
              </div>
            </div>
        )}
    </div>
  );
};

export default App;
