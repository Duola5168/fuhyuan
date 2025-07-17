
import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { WorkOrderData, ProductItem } from './types';
import SignaturePad from './components/SignaturePad';
import ImageUploader from './components/ImageUploader';

// Add type declarations for CDN libraries
declare const jsPDF: any;
declare const html2canvas: any;
// Add type declarations for Google APIs
declare const gapi: any;
declare const google: any;


// --- GOOGLE DRIVE API 設定 ---
// 從環境變數安全地讀取金鑰，避免外洩。
const API_KEY = process.env.GOOGLE_API_KEY;
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';
const SCOPES = 'https://www.googleapis.com/auth/drive.file';
const GOOGLE_AUTH_GRANTED_KEY = 'googleAuthGranted';


// --- BREVO API 設定 ---
// 從環境變數安全地讀取金鑰。如果未設定，則使用預留位置。
// 注意：這些預留位置值無法實際運作，它們僅用於開發和偵錯。
// 您必須在 .env.local 檔案或您的託管平台(如 Netlify)上設定真實金鑰。
const BREVO_API_KEY = process.env.BREVO_API_KEY || 'BREVO_API_KEY_PLACEHOLDER';
const BREVO_SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL || 'BREVO_SENDER_EMAIL_PLACEHOLDER';
const BREVO_SENDER_NAME = process.env.BREVO_SENDER_NAME || '富元機電有限公司';
// ------------------------------


// --- 全域設定參數 ---
const TOTAL_CONTENT_LINES_LIMIT = 20; 
const TASKS_STATUS_LIMIT = 18; 
const PRODUCTS_REMARKS_LIMIT = 16; 
const NAMED_DRAFTS_STORAGE_KEY = 'workOrderNamedDrafts';
const MAX_DRAFTS = 3;


const getFormattedDateTime = () => {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
};

const initialProduct: ProductItem = {
    id: `product-${Date.now()}`,
    name: '',
    quantity: 1,
    serialNumbers: [''],
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

// --- 工具函式 ---
const chunk = <T,>(arr: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(arr.length / size) }, (v, i) =>
    arr.slice(i * size, i * size + size)
  );

const calculateVisualLines = (str: string, avgCharsPerLine: number = 40): number => {
    if (!str) return 0;
    const manualLines = str.split('\n');
    if (manualLines.length === 1 && manualLines[0] === '') return 0;
    
    return manualLines.reduce((acc, line) => {
        const wrappedLines = Math.ceil(line.length / avgCharsPerLine);
        return acc + Math.max(1, wrappedLines);
    }, 0);
};

const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64String = reader.result as string;
            resolve(base64String.split(',')[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
};


const migrateWorkOrderData = (data: any): WorkOrderData => {
    const sanitizedData = { ...initialFormData, ...data };

    if (!Array.isArray(sanitizedData.products) || sanitizedData.products.length === 0) {
        sanitizedData.products = [{...initialProduct}];
    }
    
    sanitizedData.products = sanitizedData.products.map((p: any) => {
        if (typeof p !== 'object' || p === null) {
            return { ...initialProduct, id: `product-${Date.now()}` };
        }

        const product = { ...initialProduct, ...p }; 
        const quantity = Number(product.quantity) || 1;
        product.quantity = quantity;

        if (typeof (p as any).serialNumber === 'string' && !Array.isArray(p.serialNumbers)) {
            product.serialNumbers = [(p as any).serialNumber];
            delete (product as any).serialNumber;
        }
        
        if (!Array.isArray(product.serialNumbers)) {
            product.serialNumbers = Array(quantity).fill('');
        } else {
            const currentLength = product.serialNumbers.length;
            if (currentLength < quantity) {
                product.serialNumbers.push(...Array(quantity - currentLength).fill(''));
            } else if (currentLength > quantity) {
                product.serialNumbers = product.serialNumbers.slice(0, quantity);
            }
        }
        
        return product;
    });

    const stringKeys: (keyof WorkOrderData)[] = ['dateTime', 'serviceUnit', 'contactPerson', 'contactPhone', 'tasks', 'status', 'remarks'];
    for (const key of stringKeys) {
        if (typeof sanitizedData[key] !== 'string') {
            sanitizedData[key] = '';
        }
    }

    sanitizedData.photos = Array.isArray(sanitizedData.photos) ? sanitizedData.photos : [];
    sanitizedData.signature = typeof sanitizedData.signature === 'string' ? sanitizedData.signature : null;
    sanitizedData.technicianSignature = typeof sanitizedData.technicianSignature === 'string' ? sanitizedData.technicianSignature : null;

    return sanitizedData as WorkOrderData;
};


// --- 表單元件定義 ---
interface FormFieldProps {
  label: string;
  id: keyof WorkOrderData | string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  type?: 'text' | 'textarea' | 'datetime-local' | 'tel';
  required?: boolean;
  rows?: number;
  autoSize?: boolean;
  cornerHint?: string;
}

const FormField: React.FC<FormFieldProps> = ({
  label, id, value, onChange, type = 'text', required = false, rows = 3, autoSize = false, cornerHint,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (autoSize && textareaRef.current) {
      const textarea = textareaRef.current;
      textarea.style.height = 'auto'; 
      textarea.style.height = `${textarea.scrollHeight}px`; 
    }
  }, [autoSize, value]);

  return (
    <div>
      <div className="flex justify-between items-baseline mb-1">
        <label htmlFor={id} className="block text-sm font-medium text-slate-700">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
        {cornerHint && <span className="text-xs text-slate-500 font-mono">{cornerHint}</span>}
      </div>
      <div>
        {type === 'textarea' ? (
          <textarea
            ref={textareaRef}
            id={id}
            name={id}
            rows={autoSize ? 1 : rows}
            value={value}
            onChange={onChange}
            required={required}
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


// --- 圖示元件 ---
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

const SpinnerIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={`animate-spin ${className}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
);


// --- 互動式彈出視窗元件 ---
interface DraftActionModalProps {
  isOpen: boolean;
  action: 'delete' | 'export' | null;
  drafts: string[];
  onClose: () => void;
  onConfirm: (draftName: string) => void;
}

const DraftActionModal: React.FC<DraftActionModalProps> = ({ isOpen, action, drafts, onClose, onConfirm }) => {
  const [selectedDraft, setSelectedDraft] = useState('');

  useEffect(() => {
    if (isOpen && drafts.length > 0) {
      setSelectedDraft(drafts[0]);
    }
  }, [isOpen, drafts]);

  if (!isOpen || !action) return null;

  const title = action === 'delete' ? '刪除本機暫存' : '匯出至 Google 雲端硬碟';
  const buttonText = action === 'delete' ? '確認刪除' : '匯出';
  const buttonClass = action === 'delete' 
    ? 'bg-red-600 hover:bg-red-700 focus:ring-red-500' 
    : 'bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedDraft) {
      onConfirm(selectedDraft);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-sm transform transition-all">
        <form onSubmit={handleSubmit}>
          <div className="p-6">
            <h3 id="modal-title" className="text-lg font-medium leading-6 text-gray-900">{title}</h3>
            <div className="mt-4">
              <label htmlFor="draft-select" className="text-sm text-gray-500 mb-2 block">請從下方選擇要操作的暫存檔：</label>
              {drafts.length > 0 ? (
                <select
                  id="draft-select"
                  value={selectedDraft}
                  onChange={(e) => setSelectedDraft(e.target.value)}
                  className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                >
                  {drafts.map(name => <option key={name} value={name}>{name}</option>)}
                </select>
              ) : (
                <p className="text-sm text-center text-gray-600 bg-gray-100 p-4 rounded-md">沒有可用的暫存檔。</p>
              )}
            </div>
          </div>
          <div className="bg-gray-50 px-6 py-4 flex flex-row-reverse gap-3">
            <button
              type="submit"
              disabled={!selectedDraft}
              className={`inline-flex justify-center px-4 py-2 text-sm font-medium text-white border border-transparent rounded-md shadow-sm ${buttonClass} disabled:opacity-50`}
            >
              {buttonText}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              取消
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};


interface WorkOrderFormProps {
    formData: WorkOrderData;
    onInputChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
    onProductChange: (index: number, field: 'name' | 'quantity', value: string | number) => void;
    onProductSerialNumberChange: (productIndex: number, serialIndex: number, value: string) => void;
    onAddProduct: () => void;
    onRemoveProduct: (index: number) => void;
    onPhotosChange: (photos: string[]) => void;
    onTechnicianSignatureSave: (signature: string) => void;
    onTechnicianSignatureClear: () => void;
    onCustomerSignatureSave: (signature: string) => void;
    onCustomerSignatureClear: () => void;
    onSubmit: (e: React.FormEvent) => void;
    onSaveAsDraft: () => void;
    onLoadDraft: (name: string) => void;
    onDeleteDraft: () => void;
    onClearData: () => void;
    onImportFromDrive: () => void;
    onExportToDrive: () => void;
    namedDrafts: { [name: string]: WorkOrderData };
}

const WorkOrderForm: React.FC<WorkOrderFormProps> = ({
    formData,
    onInputChange,
    onProductChange,
    onProductSerialNumberChange,
    onAddProduct,
    onRemoveProduct,
    onPhotosChange,
    onTechnicianSignatureSave,
    onTechnicianSignatureClear,
    onCustomerSignatureSave,
    onCustomerSignatureClear,
    onSubmit,
    onSaveAsDraft,
    onLoadDraft,
    onDeleteDraft,
    onClearData,
    onImportFromDrive,
    onExportToDrive,
    namedDrafts
}) => {
    const tasksStatusTotal = calculateVisualLines(formData.tasks) + calculateVisualLines(formData.status);
    const productsRemarksTotal = formData.products.reduce((acc, product) => acc + product.quantity, 0) + calculateVisualLines(formData.remarks);
    const draftNames = Object.keys(namedDrafts);

    return (
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
            <FormField label="處理事項" id="tasks" type="textarea" value={formData.tasks} onChange={onInputChange} rows={8} cornerHint={`${tasksStatusTotal}/${TASKS_STATUS_LIMIT} 行`} />
            <FormField label="處理情形" id="status" type="textarea" value={formData.status} onChange={onInputChange} rows={8} cornerHint={`${tasksStatusTotal}/${TASKS_STATUS_LIMIT} 行`}/>
            
            <div>
              <div className="flex justify-between items-baseline mb-2">
                <label className="block text-sm font-medium text-slate-700">產品項目</label>
                <span className="text-xs text-slate-500 font-mono">{`${productsRemarksTotal}/${PRODUCTS_REMARKS_LIMIT} 行`}</span>
              </div>
              <div className="space-y-4">
                {formData.products.map((product, index) => (
                    <div key={product.id} className="grid grid-cols-12 gap-x-3 gap-y-4 p-4 border border-slate-200 rounded-lg relative">
                        <div className="col-span-12 sm:col-span-8">
                            <label htmlFor={`product-name-${index}`} className="block text-xs font-medium text-slate-600">產品品名</label>
                            <input
                                id={`product-name-${index}`}
                                type="text"
                                value={product.name}
                                onChange={(e) => onProductChange(index, 'name', e.target.value)}
                                className="mt-1 appearance-none block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm placeholder-slate-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                            />
                        </div>
                        <div className="col-span-12 sm:col-span-4">
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
                        
                        <div className="col-span-12">
                            {(product.serialNumbers?.length || 0) > 0 && 
                                <label className="block text-xs font-medium text-slate-600 mb-2">序號</label>
                            }
                            <div className="space-y-2">
                                {(product.serialNumbers || []).map((serial, serialIndex) => (
                                    <div key={serialIndex} className="flex items-center gap-2">
                                        <span className="text-sm text-slate-500 font-mono w-8 text-right pr-2">#{serialIndex + 1}</span>
                                        <input
                                            type="text"
                                            value={serial}
                                            onChange={(e) => onProductSerialNumberChange(index, serialIndex, e.target.value)}
                                            placeholder={`第 ${serialIndex + 1} 組產品序號`}
                                            className="flex-1 min-w-0 appearance-none block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm placeholder-slate-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                        />
                                    </div>
                                ))}
                            </div>
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

            <FormField label="備註" id="remarks" type="textarea" value={formData.remarks} onChange={onInputChange} autoSize cornerHint={`${productsRemarksTotal}/${PRODUCTS_REMARKS_LIMIT} 行`} />
            
            <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">拍照插入圖片</label>
                <ImageUploader photos={formData.photos} onPhotosChange={onPhotosChange} />
            </div>
            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">服務人員簽認</label>
                <SignaturePad signatureDataUrl={formData.technicianSignature} onSave={onTechnicianSignatureSave} onClear={onTechnicianSignatureClear} />
            </div>
            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">客戶簽認</label>
                <SignaturePad signatureDataUrl={formData.signature} onSave={onCustomerSignatureSave} onClear={onCustomerSignatureClear} />
            </div>
        </div>
        <div className="pt-5">
            <div className="flex flex-col-reverse sm:flex-row justify-between items-center gap-4">
                 <div className="flex gap-2 w-full sm:w-auto flex-wrap">
                    <select
                        onChange={(e) => {
                            const value = e.target.value;
                            if (value === '__DELETE__') {
                                onDeleteDraft();
                            } else if (value === '__EXPORT_GDRIVE__') {
                                onExportToDrive();
                            } else if (value === '__IMPORT_GDRIVE__') {
                                onImportFromDrive();
                            } else if (value) {
                                onLoadDraft(value);
                            }
                            e.target.value = '';
                        }}
                        defaultValue=""
                        className="w-full sm:w-auto px-3 py-2 border border-slate-300 text-slate-700 rounded-md shadow-sm text-base font-medium bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                    >
                         <option value="" disabled>載入/管理暫存</option>
                         {draftNames.length > 0 && (
                             <optgroup label="從本機載入">
                                {draftNames.map(name => (
                                    <option key={name} value={name}>{name}</option>
                                ))}
                            </optgroup>
                         )}
                         <optgroup label="雲端操作">
                            <option value="__IMPORT_GDRIVE__">從 Google 雲端硬碟匯入...</option>
                            <option value="__EXPORT_GDRIVE__">匯出暫存至 Google 雲端硬碟...</option>
                         </optgroup>
                         <optgroup label="本機管理">
                            <option value="__DELETE__">刪除本機暫存...</option>
                         </optgroup>
                    </select>

                    <button
                        type="button"
                        onClick={onSaveAsDraft}
                        className="flex-1 sm:w-auto px-4 py-2 border border-blue-600 text-blue-600 rounded-md shadow-sm text-base font-medium hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    >
                        另存新檔
                    </button>
                    <button
                        type="button"
                        onClick={onClearData}
                        className="flex-1 sm:w-auto px-4 py-2 border border-red-600 text-red-600 rounded-md shadow-sm text-base font-medium hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                    >
                        清除資料
                    </button>
                </div>
                <button
                    type="submit"
                    className="w-full sm:w-auto px-6 py-3 border border-transparent rounded-md shadow-sm text-base font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                    產生服務單報告
                </button>
            </div>
        </div>
    </form>
)};


// --- 報告相關元件 ---

const PdfFooter: React.FC<{ currentPage?: number; totalPages?: number; }> = ({ currentPage, totalPages }) => (
    <div className="flex-shrink-0 flex justify-between items-center text-xs text-slate-500 border-t border-slate-200 pt-2 mt-auto">
      <span>本表單(V1.2)由富元機電有限公司提供,電話(02)2697-5163 傳真(02)2697-5339</span>
      {totalPages && currentPage && (
        <span className="font-mono text-base">{`${currentPage} / ${totalPages}`}</span>
      )}
    </div>
);


type ReportLayoutProps = {
  data: WorkOrderData;
  mode: 'screen' | 'pdf-full' | 'pdf-page1' | 'pdf-page2';
  currentPage?: number;
  totalPages?: number;
};

const ReportLayout: React.FC<ReportLayoutProps> = ({ data, mode, currentPage, totalPages }) => {
  const isPdf = mode.startsWith('pdf');
  const formattedDateTime = data.dateTime ? new Date(data.dateTime).toLocaleString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'N/A';
  const hasProducts = data.products && data.products.filter(p => p.name.trim() !== '').length > 0;
  const showManagerApproval = mode !== 'pdf-page2';
  const showMainHeaderAndCustomerInfo = mode === 'screen' || mode === 'pdf-full' || mode === 'pdf-page1' || mode === 'pdf-page2';
  const showTasksAndStatus = mode === 'screen' || mode === 'pdf-full' || mode === 'pdf-page1';
  const showProductsAndRemarks = mode === 'screen' || mode === 'pdf-full' || mode === 'pdf-page2';
  
  return (
    <div
      id={isPdf ? `pdf-${mode}` : undefined}
      className="p-8 bg-white"
      style={{
        width: isPdf ? '210mm' : '100%',
        minHeight: isPdf ? '297mm' : 'auto',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: "'Helvetica Neue', 'Arial', 'sans-serif'"
      }}
    >
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

      <div className="flex-grow text-base text-gray-800 space-y-5 pt-5">
        {showTasksAndStatus && (
          <>
            <div>
              <strong className="text-base">處理事項：</strong>
              <div className="mt-1 p-3 border border-slate-200 rounded-md bg-slate-50 whitespace-pre-wrap w-full min-h-[9rem]">{data.tasks || '\u00A0'}</div>
            </div>
            <div>
              <strong className="text-base">處理情形：</strong>
              <div className="mt-1 p-3 border border-slate-200 rounded-md bg-slate-50 whitespace-pre-wrap w-full min-h-[9rem]">{data.status || '\u00A0'}</div>
            </div>
          </>
        )}

        {showProductsAndRemarks && (
          <div>
            <strong className="text-base">產品項目：</strong>
            <div className="mt-2 border border-slate-200 rounded-md overflow-hidden">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th scope="col" className="px-3 py-2 text-left font-medium text-slate-600">產品品名</th>
                    <th scope="col" className="px-3 py-2 text-left font-medium text-slate-600">数量</th>
                    <th scope="col" className="px-3 py-2 text-left font-medium text-slate-600">序號</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {hasProducts ? (
                    data.products.filter(p => p.name.trim() !== '').map((product, index) => (
                      <tr key={index}>
                        <td className="px-3 py-2 whitespace-nowrap">{product.name}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{product.quantity}</td>
                        <td className="px-3 py-2 align-top">
                          {(() => {
                            const serials = (product.serialNumbers || [])
                              .map(s => s.trim())
                              .filter(s => s);

                            if (serials.length === 0) return 'N/A';

                            return (
                              <div className="flex flex-col">
                                {serials.map((s, idx) => (
                                  <React.Fragment key={idx}>
                                    {idx > 0 && <div className="border-t border-slate-200 my-1"></div>}
                                    <span>{`#${idx + 1}: ${s}`}</span>
                                  </React.Fragment>
                                ))}
                              </div>
                            );
                          })()}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="px-3 py-2 whitespace-nowrap">&nbsp;</td>
                      <td className="px-3 py-2 whitespace-nowrap">&nbsp;</td>
                      <td className="px-3 py-2 align-top">&nbsp;</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {showProductsAndRemarks && (
          <div>
            <strong className="text-base">備註：</strong>
            <div className="mt-1 p-3 border border-slate-200 rounded-md bg-slate-50 whitespace-pre-wrap w-full min-h-[3rem]">{data.remarks || '\u00A0'}</div>
          </div>
        )}

        {mode === 'screen' && data.photos.length > 0 && (
            <div>
                <strong className="text-base">附件照片：</strong>
                <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {data.photos.map((photo, index) => (
                        <img key={index} src={photo} alt={`attachment-${index}`} className="w-full h-auto object-cover rounded-lg shadow-md aspect-square"/>
                    ))}
                </div>
            </div>
        )}
      </div>

      <div className="mt-auto pt-10 flex-shrink-0">
          <div className="grid grid-cols-12 gap-x-6 gap-y-8">
              <div className="col-span-4">
                  <strong className="block text-center">服務人員簽認</strong>
                  {data.technicianSignature ? (
                      <img src={data.technicianSignature} alt="Technician Signature" className="mx-auto mt-2 h-20 object-contain"/>
                  ) : <div className="h-20 mt-2 border-b-2 border-dotted border-gray-400"></div>}
              </div>
              <div className="col-span-4">
                  <strong className="block text-center">客戶簽認</strong>
                  {data.signature ? (
                      <img src={data.signature} alt="Client Signature" className="mx-auto mt-2 h-20 object-contain"/>
                  ) : <div className="h-20 mt-2 border-b-2 border-dotted border-gray-400"></div>}
              </div>
              {showManagerApproval && (
                  <div className="col-span-4">
                      <strong className="block text-center">經理核可</strong>
                      <div className="h-20 mt-2 border-b-2 border-dotted border-gray-400"></div>
                  </div>
              )}
          </div>
          {isPdf && <PdfFooter currentPage={currentPage} totalPages={totalPages} />}
      </div>
    </div>
  );
};


const PhotoAppendix: React.FC<{ photos: string[]; currentPage: number; totalPages: number; }> = ({ photos, currentPage, totalPages }) => (
  <div className="p-8 bg-white" style={{ width: '210mm', minHeight: '297mm', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
    <div className="text-center mb-10 flex-shrink-0">
      <h1 className="text-3xl font-bold text-gray-800">工作服務單</h1>
      <h2 className="text-2xl font-semibold text-gray-600 mt-2">附件照片</h2>
    </div>
    <div className="grid grid-cols-2 gap-6 flex-grow">
      {photos.map((photo, index) => (
        <div key={index} className="flex flex-col items-center">
          <img src={photo} alt={`appendix-${index}`} className="w-full h-auto object-contain border border-gray-200 rounded-lg shadow-sm" style={{ maxHeight: '120mm' }}/>
          <span className="text-sm mt-2 text-gray-600">附件 {index + 1}</span>
        </div>
      ))}
    </div>
    <div className="mt-auto pt-10 flex-shrink-0">
      <PdfFooter currentPage={currentPage} totalPages={totalPages} />
    </div>
  </div>
);


interface ReportViewProps {
  data: WorkOrderData;
  onBack: () => void;
  onPdfAction: (action: 'download' | 'share' | 'email') => void;
  isGenerating: boolean;
}

const ReportView: React.FC<ReportViewProps> = ({ data, onBack, onPdfAction, isGenerating }) => {
  const [canShare, setCanShare] = useState(false);
  
  useEffect(() => {
    // 檢查瀏覽器是否支援 Web Share API，並且可以分享檔案
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [new File([], "test.pdf", { type: "application/pdf" })] })) {
      setCanShare(true);
    }
  }, []);

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6">
      <div className="bg-white rounded-lg shadow-lg overflow-hidden">
        <div className="p-4 sm:p-6 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-center gap-4">
          <h2 className="text-xl font-semibold text-slate-800">服務單報告預覽</h2>
          <div className="flex items-center gap-2 flex-wrap justify-center">
            {isGenerating ? (
                <span className="flex items-center text-indigo-600">
                    <SpinnerIcon className="w-5 h-5 mr-2" />
                    處理中...
                </span>
            ) : (
              <>
                <button
                    onClick={() => onPdfAction('email')}
                    className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md shadow-sm hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                >
                    上傳PDF
                </button>
                {canShare && (
                    <button
                        onClick={() => onPdfAction('share')}
                        className="px-4 py-2 text-sm font-medium text-white bg-sky-600 rounded-md shadow-sm hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500"
                    >
                        分享PDF
                    </button>
                )}
                <button
                    onClick={() => onPdfAction('download')}
                    className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                    下載PDF
                </button>
              </>
            )}
            <button
                onClick={onBack}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-400"
            >
                返回編輯
            </button>
          </div>
        </div>
        <div className="p-2 sm:p-4 bg-slate-200">
          <div className="overflow-auto" style={{ maxHeight: '70vh' }}>
            <div className="shadow-lg">
                <ReportLayout data={data} mode="screen" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};


interface EmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (recipientEmail: string) => void;
  status: 'idle' | 'sending' | 'success' | 'error';
  errorMessage: string;
}

const EmailModal: React.FC<EmailModalProps> = ({ isOpen, onClose, onConfirm, status, errorMessage }) => {
    const [recipient, setRecipient] = useState('');
    const [isValidEmail, setIsValidEmail] = useState(true);

    useEffect(() => {
        if (isOpen) {
            setRecipient('');
            setIsValidEmail(true);
        }
    }, [isOpen]);

    const handleConfirm = () => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (emailRegex.test(recipient)) {
            setIsValidEmail(true);
            onConfirm(recipient);
        } else {
            setIsValidEmail(false);
        }
    };
    
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-labelledby="email-modal-title">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-sm transform transition-all">
                <div className="p-6">
                    <h3 id="email-modal-title" className="text-lg font-medium leading-6 text-gray-900">傳送服務單 Email</h3>
                    
                    {status === 'idle' && (
                        <>
                            <p className="mt-2 text-sm text-gray-500">請輸入客戶的 Email 地址，系統將會把 PDF 服務單附加在郵件中寄出。</p>
                            <div className="mt-4">
                                <label htmlFor="email-recipient" className="sr-only">客戶 Email</label>
                                <input
                                    type="email"
                                    id="email-recipient"
                                    value={recipient}
                                    onChange={(e) => setRecipient(e.target.value)}
                                    placeholder="customer@example.com"
                                    className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none sm:text-sm ${!isValidEmail ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : 'border-gray-300 focus:ring-indigo-500 focus:border-indigo-500'}`}
                                />
                                {!isValidEmail && <p className="mt-1 text-xs text-red-600">請輸入有效的 Email 格式。</p>}
                            </div>
                        </>
                    )}

                    {status === 'sending' && (
                        <div className="flex flex-col items-center justify-center p-8 text-center">
                            <SpinnerIcon className="w-10 h-10 text-indigo-600" />
                            <p className="mt-4 text-sm font-medium text-gray-700">傳送中...</p>
                        </div>
                    )}

                    {status === 'success' && (
                         <div className="flex flex-col items-center justify-center p-8 text-center">
                            <svg className="w-12 h-12 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            <p className="mt-4 text-sm font-medium text-gray-700">Email 已成功寄出！</p>
                        </div>
                    )}

                    {status === 'error' && (
                        <div className="p-4 text-center">
                            <svg className="w-12 h-12 text-red-500 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            <h4 className="mt-2 text-md font-bold text-red-800">傳送失敗</h4>
                            <pre className="mt-2 text-xs text-left text-red-700 bg-red-50 p-3 rounded-md overflow-x-auto whitespace-pre-wrap">{errorMessage}</pre>
                        </div>
                    )}
                </div>
                <div className="bg-gray-50 px-6 py-4 flex flex-row-reverse gap-3">
                    {status === 'idle' && (
                        <>
                            <button
                                type="button"
                                onClick={handleConfirm}
                                disabled={!recipient}
                                className="inline-flex justify-center px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md shadow-sm hover:bg-indigo-700 focus:ring-indigo-500 disabled:opacity-50"
                            >
                                確認傳送
                            </button>
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                            >
                                取消
                            </button>
                        </>
                    )}
                     {(status === 'success' || status === 'error') && (
                        <button
                            type="button"
                            onClick={onClose}
                            className="w-full inline-flex justify-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50"
                        >
                            關閉
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};


// --- 主應用程式元件 ---
export const App: React.FC = () => {
  const [formData, setFormData] = useState<WorkOrderData>(initialFormData);
  const [view, setView] = useState<'form' | 'report'>('form');
  const [namedDrafts, setNamedDrafts] = useState<{ [name: string]: WorkOrderData }>({});
  const [isGapiReady, setIsGapiReady] = useState(false);
  const [googleAuth, setGoogleAuth] = useState<any>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalAction, setModalAction] = useState<'delete' | 'export' | null>(null);
  const pdfRenderContainerRef = useRef<HTMLDivElement>(null);

  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [emailStatus, setEmailStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [emailError, setEmailError] = useState('');

  useEffect(() => {
    const drafts = JSON.parse(localStorage.getItem(NAMED_DRAFTS_STORAGE_KEY) || '{}');
    setNamedDrafts(drafts);
  }, []);

  const handleGapiLoad = useCallback(() => {
    gapi.load('client:picker', async () => {
      await gapi.client.init({
        apiKey: API_KEY,
        clientId: CLIENT_ID,
        discoveryDocs: [DISCOVERY_DOC],
        scope: SCOPES,
      });
      const auth = gapi.auth2.getAuthInstance();
      setGoogleAuth(auth);
      // 如果之前已授權，直接設定為已登入狀態
      if (localStorage.getItem(GOOGLE_AUTH_GRANTED_KEY) === 'true' && auth.isSignedIn.get()) {
          console.log("已保持 Google 登入狀態。");
      }
      setIsGapiReady(true);
    });
  }, []);

  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/api.js';
    script.onload = handleGapiLoad;
    document.body.appendChild(script);
    return () => {
      document.body.removeChild(script);
    };
  }, [handleGapiLoad]);


  const saveDraftsToStorage = (drafts: { [name: string]: WorkOrderData }) => {
    localStorage.setItem(NAMED_DRAFTS_STORAGE_KEY, JSON.stringify(drafts));
    setNamedDrafts(drafts);
  };
  
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleProductChange = (index: number, field: 'name' | 'quantity', value: string | number) => {
    const newProducts = [...formData.products];
    const productToUpdate = { ...newProducts[index] };
    
    if (field === 'quantity') {
      const newQuantity = Number(value);
      productToUpdate.quantity = newQuantity;
      const currentSerials = productToUpdate.serialNumbers || [];
      if (currentSerials.length < newQuantity) {
        productToUpdate.serialNumbers = [...currentSerials, ...Array(newQuantity - currentSerials.length).fill('')];
      } else if (currentSerials.length > newQuantity) {
        productToUpdate.serialNumbers = currentSerials.slice(0, newQuantity);
      }
    } else {
      productToUpdate[field] = value as string;
    }
    
    newProducts[index] = productToUpdate;
    setFormData(prev => ({ ...prev, products: newProducts }));
  };
  
  const handleProductSerialNumberChange = (productIndex: number, serialIndex: number, value: string) => {
      const newProducts = [...formData.products];
      newProducts[productIndex].serialNumbers[serialIndex] = value;
      setFormData(prev => ({ ...prev, products: newProducts }));
  };

  const handleAddProduct = () => {
    setFormData(prev => ({
      ...prev,
      products: [...prev.products, { ...initialProduct, id: `product-${Date.now()}` }],
    }));
  };

  const handleRemoveProduct = (index: number) => {
    setFormData(prev => ({
      ...prev,
      products: prev.products.filter((_, i) => i !== index),
    }));
  };

  const handlePhotosChange = (photos: string[]) => {
    setFormData(prev => ({...prev, photos }));
  }

  const handleSignatureSave = (field: 'signature' | 'technicianSignature', signature: string) => {
    setFormData(prev => ({ ...prev, [field]: signature }));
  };

  const handleSignatureClear = (field: 'signature' | 'technicianSignature') => {
    setFormData(prev => ({ ...prev, [field]: null }));
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setView('report');
  };

  const handleSaveAsDraft = () => {
    const draftName = prompt(`請為此暫存檔命名 (例如：客戶名稱-日期):`, `草稿-${Object.keys(namedDrafts).length + 1}`);
    if (draftName && draftName.trim()) {
        if (Object.keys(namedDrafts).length >= MAX_DRAFTS && !namedDrafts[draftName]) {
            alert(`暫存檔數量已達上限(${MAX_DRAFTS})，請先刪除一個舊的暫存檔。`);
            return;
        }
        const newDrafts = { ...namedDrafts, [draftName]: formData };
        saveDraftsToStorage(newDrafts);
        alert(`"${draftName}" 已成功儲存！`);
    }
  };

  const handleLoadDraft = (name: string) => {
    if (confirm(`確定要載入 "${name}" 嗎？目前的表單資料將會被覆蓋。`)) {
      const loadedData = migrateWorkOrderData(namedDrafts[name]);
      setFormData(loadedData);
      alert(`"${name}" 已成功載入。`);
    }
  };

  const handleDeleteDraft = () => {
      setModalAction('delete');
      setIsModalOpen(true);
  };
  
  const confirmDeleteDraft = (draftName: string) => {
      if (confirm(`您確定要永久刪除暫存檔 "${draftName}" 嗎？此操作無法復原。`)) {
          const newDrafts = { ...namedDrafts };
          delete newDrafts[draftName];
          saveDraftsToStorage(newDrafts);
          alert(`暫存檔 "${draftName}" 已被刪除。`);
      }
      setIsModalOpen(false);
  };

  const handleClearData = () => {
    if (confirm('確定要清除所有欄位並開啟一份新的服務單嗎？')) {
      setFormData(migrateWorkOrderData(initialFormData));
    }
  };
  
  const handleAuth = async () => {
    try {
      if (!googleAuth.isSignedIn.get()) {
        await googleAuth.signIn();
        localStorage.setItem(GOOGLE_AUTH_GRANTED_KEY, 'true'); // 授權成功後，寫入標記
      }
      return true;
    } catch (error) {
      console.error("Google 授權失敗:", error);
      alert("Google 授權失敗，請檢查彈出視窗是否被阻擋，或稍後再試。");
      return false;
    }
  };

  const handleImportFromDrive = async () => {
    if (!isGapiReady || !googleAuth) {
        alert("Google API 尚未準備就緒，請稍候...");
        return;
    }
    
    if (!await handleAuth()) return;
    
    const view = new google.picker.View(google.picker.ViewId.DOCS);
    view.setMimeTypes("application/json");

    const picker = new google.picker.PickerBuilder()
      .setAppId(CLIENT_ID.split('-')[0])
      .setOAuthToken(gapi.client.getToken().access_token)
      .addView(view)
      .setDeveloperKey(API_KEY)
      .setCallback((data: any) => {
        if (data.action === google.picker.Action.PICKED) {
          const fileId = data.docs[0].id;
          gapi.client.drive.files.get({
            fileId: fileId,
            alt: 'media'
          }).then((res: any) => {
            const importedData = migrateWorkOrderData(res.result);
            const draftName = data.docs[0].name.replace('.json', '');
            
            if (namedDrafts[draftName] || Object.keys(namedDrafts).length >= MAX_DRAFTS) {
                if (!confirm(`暫存檔 "${draftName}" 已存在或暫存數量已達上限。是否要覆蓋/新增？`)) return;
            }

            const newDrafts = { ...namedDrafts, [draftName]: importedData };
            saveDraftsToStorage(newDrafts);
            alert(`已成功從雲端硬碟匯入 "${draftName}" 並儲存為本機暫存。`);
          });
        }
      })
      .build();
    picker.setVisible(true);
  };
  
  const handleExportToDrive = () => {
    if (!isGapiReady || !googleAuth) {
        alert("Google API 尚未準備就緒，請稍候...");
        return;
    }
    setModalAction('export');
    setIsModalOpen(true);
  };
  
  const confirmExportToDrive = async (draftName: string) => {
    setIsModalOpen(false);
    if (!await handleAuth()) return;

    const dataToExport = namedDrafts[draftName];
    if (!dataToExport) {
        alert("找不到要匯出的暫存檔。");
        return;
    }

    const fileContent = JSON.stringify(dataToExport, null, 2);
    const fileName = `${draftName}.json`;
    const boundary = '-------314159265358979323846';
    const delimiter = "\r\n--" + boundary + "\r\n";
    const close_delim = "\r\n--" + boundary + "--";

    const metadata = {
        'name': fileName,
        'mimeType': 'application/json'
    };

    const multipartRequestBody =
        delimiter +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        JSON.stringify(metadata) +
        delimiter +
        'Content-Type: application/json\r\n\r\n' +
        fileContent +
        close_delim;

    try {
        const result = await gapi.client.request({
            'path': '/upload/drive/v3/files',
            'method': 'POST',
            'params': {'uploadType': 'multipart'},
            'headers': {
                'Content-Type': 'multipart/related; boundary="' + boundary + '"'
            },
            'body': multipartRequestBody
        });
        console.log("檔案匯出成功:", result);
        alert(`暫存檔 "${draftName}" 已成功匯出至您的 Google 雲端硬碟，檔名為 "${fileName}"。`);
    } catch (error) {
        console.error("檔案匯出失敗:", error);
        alert("檔案匯出失敗，請檢查主控台錯誤訊息。");
    }
  };

  const generatePdfBlob = useCallback(async (data: WorkOrderData): Promise<Blob | null> => {
    const container = pdfRenderContainerRef.current;
    if (!container) return null;

    const tasksLines = calculateVisualLines(data.tasks);
    const statusLines = calculateVisualLines(data.status);
    const productsCount = data.products.reduce((acc, p) => acc + p.quantity, 0);
    const remarksLines = calculateVisualLines(data.remarks);
    
    const isSplitNeeded = (tasksLines + statusLines > TASKS_STATUS_LIMIT) || (productsCount + remarksLines > PRODUCTS_REMARKS_LIMIT);

    const pdf = new jsPDF.jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: 'a4',
        putOnlyUsedFonts: true,
        floatPrecision: 16
    });

    const renderPage = async (element: HTMLElement) => {
        const canvas = await html2canvas(element, {
            scale: 2,
            useCORS: true,
            logging: false
        });
        const imgData = canvas.toDataURL('image/png');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    };

    const photoPages = data.photos.length > 0 ? chunk(data.photos, 2) : [];
    const totalPages = (isSplitNeeded ? 2 : 1) + photoPages.length;

    if (isSplitNeeded) {
        const page1Element = document.getElementById('pdf-pdf-page1');
        const page2Element = document.getElementById('pdf-pdf-page2');
        if (!page1Element || !page2Element) return null;

        await renderPage(page1Element);
        pdf.addPage();
        await renderPage(page2Element);
    } else {
        const fullPageElement = document.getElementById('pdf-pdf-full');
        if (!fullPageElement) return null;
        await renderPage(fullPageElement);
    }

    for (let i = 0; i < photoPages.length; i++) {
        pdf.addPage();
        const appendixElementId = `pdf-appendix-${i}`;
        const appendixElement = document.getElementById(appendixElementId);
        if (appendixElement) {
          await renderPage(appendixElement);
        }
    }

    return pdf.output('blob');
  }, []);

  const handlePdfAction = useCallback(async (action: 'download' | 'share' | 'email') => {
    if (action === 'email') {
        setEmailStatus('idle');
        setEmailError('');
        setIsEmailModalOpen(true);
        return;
    }

    setIsGeneratingPdf(true);
    const blob = await generatePdfBlob(formData);
    setIsGeneratingPdf(false);

    if (!blob) {
      alert('產生 PDF 失敗！');
      return;
    }

    const fileName = `工作服務單-${formData.serviceUnit || '未命名'}-${new Date().toISOString().slice(0, 10)}.pdf`;
    
    if (action === 'download') {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } else if (action === 'share') {
        const file = new File([blob], fileName, { type: 'application/pdf' });
        try {
            await navigator.share({
                title: '工作服務單',
                text: `來自 ${formData.serviceUnit} 的工作服務單`,
                files: [file],
            });
        } catch (error) {
            console.error('分享失敗:', error);
            alert('分享失敗，您的裝置或 App 可能不支援此功能。');
        }
    }
  }, [formData, generatePdfBlob]);

  const handleEmailSend = async (recipientEmail: string) => {
    setEmailStatus('sending');

    if (BREVO_API_KEY === 'BREVO_API_KEY_PLACEHOLDER' || BREVO_SENDER_EMAIL === 'BREVO_SENDER_EMAIL_PLACEHOLDER') {
        const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        const errorMsg = `Email 功能設定不完整!

${isLocalhost ? 
`偵測到您正在本機開發環境。請檢查：
1. 專案根目錄下是否存在 .env.local 檔案。
2. .env.local 檔案中是否已正確填寫 BREVO_API_KEY 和 BREVO_SENDER_EMAIL。
3. 儲存 .env.local 檔案後，是否已「完全重新啟動」Vite 開發伺服器 (關閉後再執行 npm run dev)？` :
`偵測到您正在線上環境。請檢查：
1. 您是否已在您的託管平台 (如 Netlify) 的後台設定了環境變數？
2. 環境變數的「名稱」是否完全符合：BREVO_API_KEY 和 BREVO_SENDER_EMAIL？
3. 設定完成後，是否已重新部署 (re-deploy) 您的網站？`
}`;
        setEmailError(errorMsg);
        setEmailStatus('error');
        return;
    }
    
    const pdfBlob = await generatePdfBlob(formData);
    if (!pdfBlob) {
        setEmailError('產生 PDF 檔案時發生錯誤，無法寄送 Email。');
        setEmailStatus('error');
        return;
    }
    const pdfBase64 = await blobToBase64(pdfBlob);
    
    const emailData = {
        sender: {
            name: BREVO_SENDER_NAME,
            email: BREVO_SENDER_EMAIL
        },
        to: [{ email: recipientEmail }],
        subject: `來自 ${BREVO_SENDER_NAME} 的工作服務單`,
        htmlContent: `
            <html>
                <body>
                    <p>您好，</p>
                    <p>附件是本次的服務單報告，請查收。</p>
                    <p>服務單位：${formData.serviceUnit}<br>
                       日期：${new Date(formData.dateTime).toLocaleDateString()}</p>
                    <p>感謝您！</p>
                    <p><strong>${BREVO_SENDER_NAME}</strong></p>
                </body>
            </html>
        `,
        attachment: [{
            name: `工作服務單-${formData.serviceUnit || '未命名'}-${new Date().toISOString().slice(0, 10)}.pdf`,
            content: pdfBase64
        }]
    };

    try {
        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
                'accept': 'application/json',
                'api-key': BREVO_API_KEY,
                'content-type': 'application/json'
            },
            body: JSON.stringify(emailData)
        });

        if (!response.ok) {
            const errorBody = await response.json();
            throw new Error(`Brevo API 錯誤 (${response.status}): ${errorBody.message || '未知錯誤'}`);
        }
        
        setEmailStatus('success');
    } catch (error: any) {
        console.error('Email 傳送失敗:', error);
        setEmailError(error.message);
        setEmailStatus('error');
    }
  };


  // PDF 產生所需的隱藏容器
  const PdfRenderContainer = () => {
    const tasksLines = calculateVisualLines(formData.tasks);
    const statusLines = calculateVisualLines(formData.status);
    const productsCount = formData.products.reduce((acc, p) => acc + p.quantity, 0);
    const remarksLines = calculateVisualLines(formData.remarks);
    
    const isSplitNeeded = (tasksLines + statusLines > TASKS_STATUS_LIMIT) || (productsCount + remarksLines > PRODUCTS_REMARKS_LIMIT);
    const photoPages = formData.photos.length > 0 ? chunk(formData.photos, 2) : [];
    const totalPages = (isSplitNeeded ? 2 : 1) + photoPages.length;

    return (
      <div ref={pdfRenderContainerRef} className="pdf-render-container">
        {isSplitNeeded ? (
          <>
            <div id="pdf-pdf-page1">
              <ReportLayout data={formData} mode="pdf-page1" currentPage={1} totalPages={totalPages} />
            </div>
            <div id="pdf-pdf-page2">
              <ReportLayout data={formData} mode="pdf-page2" currentPage={2} totalPages={totalPages} />
            </div>
          </>
        ) : (
          <div id="pdf-pdf-full">
            <ReportLayout data={formData} mode="pdf-full" currentPage={1} totalPages={totalPages} />
          </div>
        )}
        {photoPages.map((pagePhotos, index) => (
            <div id={`pdf-appendix-${index}`} key={index}>
                <PhotoAppendix photos={pagePhotos} currentPage={(isSplitNeeded ? 2 : 1) + index + 1} totalPages={totalPages} />
            </div>
        ))}
      </div>
    );
  };


  return (
    <div className="min-h-screen bg-slate-100">
      <main className="container mx-auto max-w-5xl">
        <PdfRenderContainer />
        <DraftActionModal 
            isOpen={isModalOpen} 
            action={modalAction} 
            drafts={Object.keys(namedDrafts)}
            onClose={() => setIsModalOpen(false)}
            onConfirm={(draftName) => {
                if (modalAction === 'delete') confirmDeleteDraft(draftName);
                if (modalAction === 'export') confirmExportToDrive(draftName);
            }}
        />
        <EmailModal 
            isOpen={isEmailModalOpen}
            status={emailStatus}
            errorMessage={emailError}
            onClose={() => setIsEmailModalOpen(false)}
            onConfirm={handleEmailSend}
        />

        {view === 'form' ? (
          <WorkOrderForm
            formData={formData}
            onInputChange={handleInputChange}
            onProductChange={handleProductChange}
            onProductSerialNumberChange={handleProductSerialNumberChange}
            onAddProduct={handleAddProduct}
            onRemoveProduct={handleRemoveProduct}
            onPhotosChange={handlePhotosChange}
            onTechnicianSignatureSave={(sig) => handleSignatureSave('technicianSignature', sig)}
            onTechnicianSignatureClear={() => handleSignatureClear('technicianSignature')}
            onCustomerSignatureSave={(sig) => handleSignatureSave('signature', sig)}
            onCustomerSignatureClear={() => handleSignatureClear('signature')}
            onSubmit={handleFormSubmit}
            onSaveAsDraft={handleSaveAsDraft}
            onLoadDraft={handleLoadDraft}
            onDeleteDraft={handleDeleteDraft}
            onClearData={handleClearData}
            onImportFromDrive={handleImportFromDrive}
            onExportToDrive={handleExportToDrive}
            namedDrafts={namedDrafts}
          />
        ) : (
          <ReportView
            data={formData}
            onBack={() => setView('form')}
            onPdfAction={handlePdfAction}
            isGenerating={isGeneratingPdf}
          />
        )}
      </main>
    </div>
  );
};
