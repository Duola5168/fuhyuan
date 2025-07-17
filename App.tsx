
import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { WorkOrderData, ProductItem } from './types';
import { config } from './config'; // Centralized configuration
import SignaturePad from './components/SignaturePad';
import ImageUploader from './components/ImageUploader';
import { UploadModal, UploadOptions } from './components/UploadModal';
import { Toast } from './components/Toast';

// --- 全域型別宣告 ---
// These declarations allow TypeScript to recognize libraries loaded via CDN scripts.
declare const jsPDF: any;
declare const html2canvas: any;
declare const gapi: any;
declare const google: any;


/**
 * 取得目前時間並格式化為 'YYYY-MM-DDTHH:mm' 格式的字串。
 * @returns 回傳格式化後的日期時間字串。
 */
const getFormattedDateTime = () => {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
};

// 初始產品項目的結構，用於新增產品時的預設值
const initialProduct: ProductItem = {
    id: `product-${Date.now()}`,
    name: '',
    quantity: 1,
    serialNumbers: [''],
};

// 整個表單的初始資料結構，用於清空表單或建立新表單
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

/**
 * 將一個陣列分割成指定大小的多個子陣列。
 * @param arr - 要分割的來源陣列。
 * @param size - 每個子陣列的大小。
 * @returns 回傳一個包含多個子陣列的新陣列。
 */
const chunk = <T,>(arr: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(arr.length / size) }, (v, i) =>
    arr.slice(i * size, i * size + size)
  );

/**
 * 計算一個字串在視覺上大約會佔用的行數。
 * 這會考慮手動換行 (\n) 和自動換行（根據每行平均字數）。
 * @param str - 要計算的字串。
 * @param avgCharsPerLine - 估計每行平均容納的字元數，用於計算自動換行。
 * @returns 回傳估算的視覺行數。
 */
const calculateVisualLines = (str: string, avgCharsPerLine: number = 40): number => {
    if (!str) return 0;
    const manualLines = str.split('\n');
    if (manualLines.length === 1 && manualLines[0] === '') return 0;
    
    return manualLines.reduce((acc, line) => {
        const wrappedLines = Math.ceil(line.length / avgCharsPerLine);
        return acc + Math.max(1, wrappedLines);
    }, 0);
};

/**
 * 資料遷移與淨化函式。
 * 用於處理從暫存或匯入檔案中載入的資料，確保其符合最新的資料結構，避免因版本更新造成錯誤。
 * @param data - 可能是舊版或不完整的資料物件。
 * @returns 回傳一個符合最新 WorkOrderData 結構的物件。
 */
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

/**
 * 將 Blob 物件轉換為 Base64 字串。
 * 主要用於將 PDF 檔案轉換成可以附加到 Email 或傳送到後端的格式。
 * @param blob - 要轉換的 Blob 物件。
 * @returns 回傳一個 Promise，其解析值為 Base64 字串。
 */
const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      // 移除 dataURL 前綴 (e.g., "data:application/pdf;base64,")
      const base64String = (reader.result as string).split(',')[1];
      resolve(base64String);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};


// --- 表單元件定義 ---

/**
 * @interface FormFieldProps
 * @description 標準化表單欄位的 props 介面。
 */
interface FormFieldProps {
  label: string;
  id: keyof WorkOrderData | string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  type?: 'text' | 'textarea' | 'datetime-local' | 'tel';
  required?: boolean;
  rows?: number;
  autoSize?: boolean; // 是否讓 textarea 高度自動增長
  cornerHint?: string; // 顯示在右上角的提示文字
}

/**
 * @component FormField
 * @description 一個可重用的表單欄位元件，支援 input 和 textarea，並包含自動高度調整功能。
 */
const FormField: React.FC<FormFieldProps> = ({
  label, id, value, onChange, type = 'text', required = false, rows = 3, autoSize = false, cornerHint,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 當 autoSize 為 true 且 value 改變時，自動調整 textarea 的高度
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
        <label htmlFor={id as string} className="block text-sm font-medium text-slate-700">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
        {cornerHint && <span className="text-xs text-slate-500 font-mono">{cornerHint}</span>}
      </div>
      <div>
        {type === 'textarea' ? (
          <textarea
            ref={textareaRef}
            id={id as string}
            name={id as string}
            rows={autoSize ? 1 : rows}
            value={value}
            onChange={onChange}
            required={required}
            className="appearance-none block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm placeholder-slate-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            style={autoSize ? { overflowY: 'hidden', resize: 'none' } : {}}
          />
        ) : (
          <input
            id={id as string}
            name={id as string}
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
    formData, onInputChange, onProductChange, onProductSerialNumberChange, onAddProduct, onRemoveProduct, onPhotosChange,
    onTechnicianSignatureSave, onTechnicianSignatureClear, onCustomerSignatureSave, onCustomerSignatureClear,
    onSubmit, onSaveAsDraft, onLoadDraft, onDeleteDraft, onClearData, onImportFromDrive, onExportToDrive, namedDrafts
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
            <FormField label="處理事項" id="tasks" type="textarea" value={formData.tasks} onChange={onInputChange} rows={8} cornerHint={`${tasksStatusTotal}/${config.app.pdfLimits.tasksStatus} 行`} />
            <FormField label="處理情形" id="status" type="textarea" value={formData.status} onChange={onInputChange} rows={8} cornerHint={`${tasksStatusTotal}/${config.app.pdfLimits.tasksStatus} 行`}/>
            
            <div>
              <div className="flex justify-between items-baseline mb-2">
                <label className="block text-sm font-medium text-slate-700">產品項目</label>
                <span className="text-xs text-slate-500 font-mono">{`${productsRemarksTotal}/${config.app.pdfLimits.productsRemarks} 行`}</span>
              </div>
              <div className="space-y-4">
                {formData.products.map((product, index) => (
                    <div key={product.id} className="grid grid-cols-12 gap-x-3 gap-y-4 p-4 border border-slate-200 rounded-lg relative">
                        <div className="col-span-12 sm:col-span-8">
                            <label htmlFor={`product-name-${index}`} className="block text-xs font-medium text-slate-600">產品品名</label>
                            <input id={`product-name-${index}`} type="text" value={product.name} onChange={(e) => onProductChange(index, 'name', e.target.value)} className="mt-1 appearance-none block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm placeholder-slate-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" />
                        </div>
                        <div className="col-span-12 sm:col-span-4">
                            <label htmlFor={`product-quantity-${index}`} className="block text-xs font-medium text-slate-600">數量</label>
                            <select id={`product-quantity-${index}`} value={product.quantity} onChange={(e) => onProductChange(index, 'quantity', parseInt(e.target.value, 10))} className="mt-1 block w-full pl-3 pr-8 py-2 text-base border-slate-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md">
                                {Array.from({ length: 20 }, (_, i) => i + 1).map(q => <option key={q} value={q}>{q}</option>)}
                            </select>
                        </div>
                        <div className="col-span-12">
                            {(product.serialNumbers?.length || 0) > 0 && <label className="block text-xs font-medium text-slate-600 mb-2">序號</label>}
                            <div className="space-y-2">
                                {(product.serialNumbers || []).map((serial, serialIndex) => (
                                    <div key={serialIndex} className="flex items-center gap-2">
                                        <span className="text-sm text-slate-500 font-mono w-8 text-right pr-2">#{serialIndex + 1}</span>
                                        <input type="text" value={serial} onChange={(e) => onProductSerialNumberChange(index, serialIndex, e.target.value)} placeholder={`第 ${serialIndex + 1} 組產品序號`} className="flex-1 min-w-0 appearance-none block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm placeholder-slate-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" />
                                    </div>
                                ))}
                            </div>
                        </div>
                        {formData.products.length > 1 && (
                            <button type="button" onClick={() => onRemoveProduct(index)} className="absolute top-2 right-2 p-1 text-slate-400 hover:text-red-600 rounded-full hover:bg-red-100" aria-label="Remove product">
                                <TrashIcon className="w-5 h-5"/>
                            </button>
                        )}
                    </div>
                ))}
                <button type="button" onClick={onAddProduct} className="flex items-center justify-center w-full px-4 py-2 border-2 border-dashed border-slate-300 rounded-md text-sm font-medium text-slate-600 hover:bg-slate-50 hover:border-slate-400 focus:outline-none">
                    <PlusIcon className="w-5 h-5 mr-2" />
                    新增項目
                </button>
              </div>
            </div>

            <FormField label="備註" id="remarks" type="textarea" value={formData.remarks} onChange={onInputChange} autoSize cornerHint={`${productsRemarksTotal}/${config.app.pdfLimits.productsRemarks} 行`} />
            
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
                            if (value === '__DELETE__') { onDeleteDraft(); }
                            else if (value === '__EXPORT_GDRIVE__') { onExportToDrive(); } 
                            else if (value === '__IMPORT_GDRIVE__') { onImportFromDrive(); }
                            else if (value) { onLoadDraft(value); }
                            e.target.value = '';
                        }}
                        defaultValue=""
                        className="w-full sm:w-auto px-3 py-2 border border-slate-300 text-slate-700 rounded-md shadow-sm text-base font-medium bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                    >
                         <option value="" disabled>載入/管理暫存</option>
                         {draftNames.length > 0 && (
                             <optgroup label="從本機載入">
                                {draftNames.map(name => (<option key={name} value={name}>{name}</option>))}
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

                    <button type="button" onClick={onSaveAsDraft} className="flex-1 sm:w-auto px-4 py-2 border border-blue-600 text-blue-600 rounded-md shadow-sm text-base font-medium hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
                        另存新檔
                    </button>
                    <button type="button" onClick={onClearData} className="flex-1 sm:w-auto px-4 py-2 border border-red-600 text-red-600 rounded-md shadow-sm text-base font-medium hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500">
                        清除資料
                    </button>
                </div>
                <button type="submit" className="w-full sm:w-auto px-6 py-3 border border-transparent rounded-md shadow-sm text-base font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
                    產生服務單報告
                </button>
            </div>
        </div>
    </form>
)};


// --- 報告相關元件 ---

const PdfFooter: React.FC<{ currentPage?: number; totalPages?: number; }> = ({ currentPage, totalPages }) => (
    <div className="flex-shrink-0 flex justify-between items-center text-xs text-slate-500 border-t border-slate-200 pt-2 mt-auto">
      <span>{`本表單(${config.version.formatted})由富元機電有限公司提供,電話(02)2697-5163 傳真(02)2697-5339`}</span>
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
  const showMainHeaderAndCustomerInfo = true;
  const showTasksAndStatus = mode === 'screen' || mode === 'pdf-full' || mode === 'pdf-page1';
  const showProductsAndRemarks = mode === 'screen' || mode === 'pdf-full' || mode === 'pdf-page2';
  const showSignatures = true;

  return (
    <div id={isPdf ? `pdf-${mode}` : undefined} className="p-8 bg-white" style={{ width: isPdf ? '210mm' : '100%', minHeight: isPdf ? '297mm' : 'auto', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', fontFamily: "'Helvetica Neue', 'Arial', 'sans-serif'" }}>
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
            <div><strong className="text-base">處理事項：</strong><div className="mt-1 p-3 border border-slate-200 rounded-md bg-slate-50 whitespace-pre-wrap w-full min-h-[9rem]">{data.tasks || '\u00A0'}</div></div>
            <div><strong className="text-base">處理情形：</strong><div className="mt-1 p-3 border border-slate-200 rounded-md bg-slate-50 whitespace-pre-wrap w-full min-h-[9rem]">{data.status || '\u00A0'}</div></div>
          </>
        )}
        {showProductsAndRemarks && (
          <div>
            <strong className="text-base">產品項目：</strong>
            <div className="mt-2 border border-slate-200 rounded-md overflow-hidden">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50"><tr><th scope="col" className="px-3 py-2 text-left font-medium text-slate-600">產品品名</th><th scope="col" className="px-3 py-2 text-left font-medium text-slate-600">数量</th><th scope="col" className="px-3 py-2 text-left font-medium text-slate-600">序號</th></tr></thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {hasProducts ? (
                    data.products.filter(p => p.name.trim() !== '').map((product, index) => (
                      <tr key={index}>
                        <td className="px-3 py-2 whitespace-nowrap">{product.name}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{product.quantity}</td>
                        <td className="px-3 py-2 align-top">
                          {(() => {
                            const serials = (product.serialNumbers || []).map(s => s.trim()).filter(s => s);
                            if (serials.length === 0) return 'N/A';
                            return (<div className="flex flex-col">{serials.map((s, idx) => (<React.Fragment key={idx}>{idx > 0 && <div className="border-t border-slate-200 my-1"></div>}<span>{`#${idx + 1}: ${s}`}</span></React.Fragment>))}</div>);
                          })()}
                        </td>
                      </tr>
                    ))
                  ) : (<tr><td className="px-3 py-2 whitespace-nowrap">&nbsp;</td><td className="px-3 py-2 whitespace-nowrap">&nbsp;</td><td className="px-3 py-2 align-top">&nbsp;</td></tr>)}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {showProductsAndRemarks && (
          <div><strong className="text-base">備註：</strong><div className="mt-1 p-3 border border-slate-200 rounded-md bg-slate-50 whitespace-pre-wrap w-full min-h-[3rem]">{data.remarks || '\u00A0'}</div></div>
        )}
        {mode === 'screen' && data.photos.length > 0 && (
          <div><strong className="text-base">現場照片：</strong><div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-4">{data.photos.map((photo, index) => (<img key={index} src={photo} alt={`現場照片 ${index + 1}`} className="rounded-lg shadow-md w-full h-auto object-cover aspect-square" />))}</div></div>
        )}
      </div>

      {showSignatures && (
         <div className="pt-12 mt-auto">
            <div className={`grid ${showManagerApproval ? 'grid-cols-3' : 'grid-cols-2'} gap-x-8 text-base`}>
                {showManagerApproval && (<div className="text-center"><strong>經理核可：</strong><div className="mt-2 p-2 border border-slate-300 rounded-lg bg-slate-50 w-full min-h-[100px] flex items-center justify-center"></div></div>)}
                <div className="text-center"><strong>服務人員簽認：</strong><div className="mt-2 p-2 border border-slate-300 rounded-lg bg-slate-50 w-full min-h-[100px] flex items-center justify-center">{data.technicianSignature ? (<img src={data.technicianSignature} alt="服務人員簽名" className="h-20 w-auto" />) : <span className="text-slate-400">未簽名</span>}</div></div>
                <div className="text-center"><strong>客戶簽認：</strong><div className="mt-2 p-2 border border-slate-300 rounded-lg bg-slate-50 w-full min-h-[100px] flex items-center justify-center">{data.signature ? (<img src={data.signature} alt="客戶簽名" className="h-20 w-auto" />) : <span className="text-slate-400">未簽名</span>}</div></div>
            </div>
            {isPdf && <PdfFooter currentPage={currentPage} totalPages={totalPages} />}
         </div>
      )}
    </div>
  );
};

const PdfPhotoPage = ({ photos, pageNumber, totalPhotoPages, data, textPageCount, pdfTotalPages }: { photos: string[], pageNumber:number, totalPhotoPages: number, data: WorkOrderData, textPageCount: number, pdfTotalPages: number }) => {
    const formattedDate = data.dateTime ? new Date(data.dateTime).toLocaleDateString('zh-TW') : 'N/A';
    const pageTitle = totalPhotoPages > 1 ? `施工照片 (第 ${pageNumber} / ${totalPhotoPages} 頁) - ${data.serviceUnit} (${formattedDate})` : `施工照片 - ${data.serviceUnit} (${formattedDate})`;

    return (
        <div id={`pdf-photo-page-${pageNumber - 1}`} className="p-8 bg-white" style={{ width: '210mm', height: '297mm', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
            <div className="text-center mb-4 flex-shrink-0"><h3 className="text-xl font-semibold text-slate-700">{pageTitle}</h3></div>
            <div className="grid grid-cols-2 grid-rows-2 gap-4 flex-grow">
                {photos.map((photo, index) => (<div key={index} className="flex items-center justify-center border border-slate-200 p-1 bg-slate-50 rounded-md overflow-hidden"><img src={photo} alt={`photo-${index}`} className="max-w-full max-h-full object-contain" /></div>))}
                {Array(4 - photos.length).fill(0).map((_, i) => <div key={`placeholder-${i}`}></div>)}
            </div>
            <PdfFooter currentPage={textPageCount + pageNumber} totalPages={pdfTotalPages} />
        </div>
    );
};

interface ReportViewProps {
    data: WorkOrderData;
    onUploadPdf: () => void;
    onSharePdf: () => void;
    onDownloadPdf: () => void;
    onReset: () => void;
    onEdit: () => void;
    isProcessing: boolean;
}

const ReportView: React.FC<ReportViewProps> = ({ data, onUploadPdf, onSharePdf, onDownloadPdf, onReset, onEdit, isProcessing }) => {
    const photoChunks = chunk(data.photos, 4);
    const tasksLines = calculateVisualLines(data.tasks);
    const statusLines = calculateVisualLines(data.status);
    const productsLines = data.products.filter(p => p.name.trim() !== '').length;
    const remarksLines = calculateVisualLines(data.remarks);
    const totalContentLines = tasksLines + statusLines + productsLines + remarksLines;
    const textPages = totalContentLines > config.app.pdfLimits.totalContent ? 2 : 1;
    const photoPages = photoChunks.length;
    const totalPages = textPages + photoPages;

    return (
    <>
      <div className="pdf-render-container">
        {totalContentLines > config.app.pdfLimits.totalContent ? (
            <><ReportLayout data={data} mode="pdf-page1" currentPage={1} totalPages={totalPages} /><ReportLayout data={data} mode="pdf-page2" currentPage={2} totalPages={totalPages} /></>
        ) : (
            <ReportLayout data={data} mode="pdf-full" currentPage={1} totalPages={totalPages} />
        )}
        {photoChunks.map((photoChunk, index) => (<PdfPhotoPage key={index} photos={photoChunk} pageNumber={index + 1} totalPhotoPages={photoChunks.length} data={data} textPageCount={textPages} pdfTotalPages={totalPages} />))}
      </div>
      
      <div className="p-4 sm:p-6 bg-slate-50/50 overflow-x-auto">
        <div className="w-full max-w-[800px] mx-auto origin-top">
            <div className="shadow-lg"><ReportLayout data={data} mode="screen" /></div>
        </div>
      </div>

      <div className="p-4 sm:p-6 bg-slate-50 border-t border-slate-200 flex flex-wrap gap-3 justify-between items-center">
            <button onClick={onReset} className="px-6 py-2 text-sm bg-red-600 text-white font-semibold rounded-md shadow-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500">建立新服務單</button>
            <div className="flex flex-wrap gap-3">
              <button onClick={onUploadPdf} disabled={isProcessing} className="px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-md shadow-sm hover:bg-blue-700 disabled:opacity-50">上傳PDF</button>
              <button onClick={onSharePdf} disabled={isProcessing} className="px-4 py-2 text-sm font-semibold bg-green-600 text-white rounded-md shadow-sm hover:bg-green-700 disabled:opacity-50">分享PDF</button>
              <button onClick={onDownloadPdf} disabled={isProcessing} className="px-4 py-2 text-sm font-semibold bg-white border border-slate-300 text-slate-700 rounded-md shadow-sm hover:bg-slate-50 disabled:opacity-50">下載PDF</button>
              <button onClick={onEdit} disabled={isProcessing} className="px-4 py-2 text-sm font-semibold bg-white border border-slate-300 text-slate-700 rounded-md shadow-sm hover:bg-slate-50">修改內容</button>
            </div>
      </div>
    </>
    );
};


// --- 主應用程式元件 ---

const ApiKeyErrorDisplay = () => (
    <div className="p-8 text-center bg-red-50 border-l-4 border-red-400">
        <h3 className="text-xl font-bold text-red-800">⛔️ Google Drive 功能設定錯誤</h3>
        <p className="mt-2 text-md text-red-700">應用程式偵測到 Google API 金鑰或用戶端 ID 尚未設定。</p>
        <p className="mt-4 text-sm text-slate-600 bg-slate-100 p-3 rounded-md">請開發者依照 <code>README.md</code> 檔案中的指示，建立 <code>.env.local</code> 檔案並填入正確的金鑰資訊 (變數名稱須以 <code>VITE_</code> 開頭)。</p>
    </div>
);

const BrevoApiKeyErrorDisplay = () => {
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    return (
    <div className="p-8 text-center bg-orange-50 border-l-4 border-orange-400">
        <h3 className="text-xl font-bold text-orange-800">✉️ Email 功能設定不完整</h3>
        <p className="mt-2 text-md text-orange-700">應用程式偵測到 Email 發送服務所需的部分資訊尚未設定。</p>
        <div className="mt-4 text-sm text-slate-600 bg-slate-100 p-4 rounded-md text-left">
           <p className="font-semibold">請開發者依照以下步驟解決：</p>
           {isLocal ? (
            <ul className="list-disc list-inside mt-2 space-y-1">
                <li>請在專案的根目錄下，找到或建立 <code>.env.local</code> 檔案。</li>
                <li>確認檔案中包含以下**所有**變數並已填入正確的值 (注意 <code>VITE_</code> 前綴)：
                    <ul className="list-['-_'] list-inside ml-4 mt-1 font-mono bg-slate-200 p-2 rounded">
                        <li>VITE_BREVO_API_KEY</li>
                        <li>VITE_BREVO_SENDER_EMAIL</li>
                        <li>VITE_BREVO_SENDER_NAME</li>
                    </ul>
                </li>
                 <li>修改完畢後，請務必**重新啟動**本地開發伺服器 (關閉後再執行 <code>npm run dev</code> 或 <code>netlify dev</code>)。</li>
            </ul>
           ) : (
            <ul className="list-disc list-inside mt-2 space-y-1">
                <li>請登入您的網站託管平台 (例如 Netlify)。</li>
                <li>前往網站設定中的「環境變數 (Environment variables)」區塊。</li>
                <li>確認以下**所有**變數都已建立並填入正確的值 (注意 <code>VITE_</code> 前綴)：
                    <ul className="list-['-_'] list-inside ml-4 mt-1 font-mono bg-slate-200 p-2 rounded">
                        <li>VITE_BREVO_API_KEY</li>
                        <li>VITE_BREVO_SENDER_EMAIL</li>
                        <li>VITE_BREVO_SENDER_NAME</li>
                    </ul>
                </li>
                <li>儲存設定後，請**重新部署 (re-deploy)** 您的網站以讓變更生效。</li>
            </ul>
           )}
        </div>
    </div>
)};

export const App: React.FC = () => {
  const [formData, setFormData] = useState<WorkOrderData>(initialFormData);
  const [namedDrafts, setNamedDrafts] = useState<{ [name: string]: WorkOrderData }>({});
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  
  const [gapiReady, setGapiReady] = useState(false);
  const [gisReady, setGisReady] = useState(false);
  const [tokenClient, setTokenClient] = useState<any>(null);
  const pickerApiLoaded = useRef(false);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalAction, setModalAction] = useState<'delete' | 'export' | null>(null);

  const isGoogleApiConfigured = config.api.google.apiKey && config.api.google.clientId;
  const isBrevoApiConfigured = config.api.brevo.apiKey && config.api.brevo.senderEmail && config.api.brevo.senderName;

  useEffect(() => {
    if (!isGoogleApiConfigured) return;
    const gapiScript = document.createElement('script');
    gapiScript.src = 'https://apis.google.com/js/api.js';
    gapiScript.async = true; gapiScript.defer = true;
    gapiScript.onload = () => gapi.load('client', async () => { await gapi.client.init({ apiKey: config.api.google.apiKey, discoveryDocs: [config.api.google.discoveryDoc] }); setGapiReady(true); });
    document.body.appendChild(gapiScript);
    const gisScript = document.createElement('script');
    gisScript.src = 'https://accounts.google.com/gsi/client';
    gisScript.async = true; gisScript.defer = true;
    gisScript.onload = () => { const client = google.accounts.oauth2.initTokenClient({ client_id: config.api.google.clientId, scope: config.api.google.scopes, callback: '', }); setTokenClient(client); setGisReady(true); };
    document.body.appendChild(gisScript);
    return () => { document.body.removeChild(gapiScript); document.body.removeChild(gisScript); };
  }, [isGoogleApiConfigured]);

  useEffect(() => {
    setToastMessage("請記得使用 Chrome/Edge/Firefox 等現代瀏覽器開啟，以確保所有功能正常，謝謝!");
    try {
        const savedDrafts = localStorage.getItem(config.app.storageKeys.drafts);
        if (savedDrafts) { setNamedDrafts(JSON.parse(savedDrafts)); }
    } catch (error) { console.error("Failed to load named drafts.", error); }
  }, []);

  const clearCurrentForm = useCallback(() => {
    setFormData({ ...initialFormData, products: [{ ...initialProduct, id: `product-${Date.now()}` }], dateTime: getFormattedDateTime() });
  }, []);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(currentData => {
      const tempState = {...currentData, [name]: value};
      if ((name === 'tasks' || name === 'status') && calculateVisualLines(tempState.tasks) + calculateVisualLines(tempState.status) > config.app.pdfLimits.tasksStatus) {
        return currentData;
      }
      if (name === 'remarks' && tempState.products.reduce((acc, p) => acc + p.quantity, 0) + calculateVisualLines(tempState.remarks) > config.app.pdfLimits.productsRemarks) {
        return currentData;
      }
      return tempState;
    });
  }, []);
  
  const handleProductChange = useCallback((index: number, field: 'name' | 'quantity', value: string | number) => {
    setFormData(currentData => {
        const newProducts = [...currentData.products];
        const productToUpdate = { ...newProducts[index] };

        if (field === 'quantity') {
            const newQuantity = Number(value);
            const oldQuantity = productToUpdate.quantity;
            const otherProductsLines = currentData.products.reduce((acc, p, productIndex) => (productIndex === index ? acc : acc + p.quantity), 0);
            if (otherProductsLines + newQuantity + calculateVisualLines(currentData.remarks) > config.app.pdfLimits.productsRemarks) {
                alert(`已達產品與備註的總行數上限 (${config.app.pdfLimits.productsRemarks})，無法增加數量。`);
                return currentData; 
            }
            let newSerialNumbers = productToUpdate.serialNumbers || [];
            if (newQuantity > oldQuantity) {
                newSerialNumbers = [...newSerialNumbers, ...Array(newQuantity - oldQuantity).fill('')];
            } else if (newQuantity < oldQuantity) {
                newSerialNumbers = newSerialNumbers.slice(0, newQuantity);
            }
            productToUpdate.quantity = newQuantity;
            productToUpdate.serialNumbers = newSerialNumbers;
        } else if (field === 'name') {
            productToUpdate.name = String(value);
        }
        
        newProducts[index] = productToUpdate;
        return { ...currentData, products: newProducts };
    });
  }, []);
  
  const handleProductSerialNumberChange = (productIndex: number, serialIndex: number, value: string) => {
      setFormData(prev => {
          const newProducts = [...prev.products];
          const productToUpdate = { ...newProducts[productIndex] };
          productToUpdate.serialNumbers = [...productToUpdate.serialNumbers];
          productToUpdate.serialNumbers[serialIndex] = value;
          newProducts[productIndex] = productToUpdate;
          return { ...prev, products: newProducts };
      });
  };

  const handleAddProduct = useCallback(() => {
    setFormData(prev => {
      if (prev.products.reduce((acc, p) => acc + p.quantity, 0) + 1 + calculateVisualLines(prev.remarks) > config.app.pdfLimits.productsRemarks) {
          alert(`已達產品與備註的總行數上限 (${config.app.pdfLimits.productsRemarks})，無法新增產品。`);
          return prev;
      }
      return { ...prev, products: [...prev.products, { ...initialProduct, id: `product-${Date.now()}` }] };
    });
  }, []);

  const handleRemoveProduct = useCallback((index: number) => {
    setFormData(prev => {
      if (prev.products.length <= 1) return prev;
      return { ...prev, products: prev.products.filter((_, i) => i !== index) };
    });
  }, []);

  const handleCustomerSignatureSave = useCallback((s: string) => setFormData(p => ({ ...p, signature: s })), []);
  const handleCustomerSignatureClear = useCallback(() => setFormData(p => ({ ...p, signature: null })), []);
  const handleTechnicianSignatureSave = useCallback((s: string) => setFormData(p => ({ ...p, technicianSignature: s })), []);
  const handleTechnicianSignatureClear = useCallback(() => setFormData(p => ({ ...p, technicianSignature: null })), []);
  const handlePhotosChange = useCallback((photos: string[]) => setFormData(p => ({ ...p, photos })), []);
  
  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); setIsSubmitted(true); window.scrollTo(0, 0); };
  const handleEdit = () => setIsSubmitted(false);
  const handleReset = useCallback(() => { if (window.confirm("確定要清除所有資料並建立新的服務單嗎？")) { clearCurrentForm(); setIsSubmitted(false); } }, [clearCurrentForm]);

  const handleSaveAsDraft = useCallback(() => {
    const draftName = prompt("請為此暫存命名：");
    if (!draftName) return;
    const currentDrafts = { ...namedDrafts };
    const isOverwriting = !!currentDrafts[draftName];
    if (!isOverwriting && Object.keys(currentDrafts).length >= config.app.maxDrafts) { alert(`無法儲存，已達上限 (${config.app.maxDrafts}份)。`); return; }
    if (isOverwriting && !window.confirm(`暫存 "${draftName}" 已存在。要覆蓋它嗎？`)) return;
    const newDrafts = { ...currentDrafts, [draftName]: formData };
    setNamedDrafts(newDrafts);
    localStorage.setItem(config.app.storageKeys.drafts, JSON.stringify(newDrafts));
    setToastMessage(`✅ 暫存 "${draftName}" 已儲存！(提醒: 清除瀏覽器 cookie 會導致暫存遺失)`);
  }, [formData, namedDrafts]);

  const handleLoadDraft = useCallback((name: string) => {
    if (namedDrafts[name] && window.confirm(`確定要載入 "${name}" 嗎？這將覆蓋目前內容。`)) {
      setFormData(migrateWorkOrderData(namedDrafts[name]));
      setToastMessage(`暫存 "${name}" 已載入。`);
    }
  }, [namedDrafts]);

  const handleClearData = useCallback(() => {
    if (window.confirm("確定要清除目前表單的所有欄位嗎？")) { clearCurrentForm(); setToastMessage('表單資料已清除。'); }
  }, [clearCurrentForm]);
  
  const getAuthToken = useCallback(() => {
    return new Promise((resolve, reject) => {
        if (!tokenClient) return reject(new Error("Google Auth client is not ready."));
        tokenClient.callback = (resp: any) => resp.error ? (localStorage.removeItem(config.app.storageKeys.googleAuth), reject(resp)) : (localStorage.setItem(config.app.storageKeys.googleAuth, 'true'), resolve(resp));
        if (localStorage.getItem(config.app.storageKeys.googleAuth)) { tokenClient.requestAccessToken({ prompt: '' }); } 
        else { tokenClient.requestAccessToken({ prompt: 'consent' }); }
    });
  }, [tokenClient]);
  
  const handleOpenDraftActionModal = useCallback((action: 'delete' | 'export') => {
    if (action === 'export' && !isGoogleApiConfigured) { setToastMessage("❌ Google Drive 功能未設定。"); return; }
    if (Object.keys(namedDrafts).length === 0) { setToastMessage(action === 'delete' ? "沒有暫存可以刪除。" : "沒有暫存可以匯出。"); return; }
    setModalAction(action); setIsModalOpen(true);
  }, [namedDrafts, isGoogleApiConfigured]);
  
  const handleDeleteDraft = useCallback(() => handleOpenDraftActionModal('delete'), [handleOpenDraftActionModal]);
  const handleExportToDrive = useCallback(() => handleOpenDraftActionModal('export'), [handleOpenDraftActionModal]);
  
  const performExportToDrive = useCallback(async (nameToExport: string) => {
    if (!gapiReady || !gisReady || !namedDrafts[nameToExport]) { setToastMessage("❌ 匯出功能未就緒或找不到暫存。"); return; }
    try {
        await getAuthToken();
        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify({ 'name': `${nameToExport}-服務單暫存.json`, 'mimeType': 'application/json', 'parents': ['root'] })], { type: 'application/json' }));
        form.append('file', new Blob([JSON.stringify(namedDrafts[nameToExport], null, 2)], { type: 'application/json' }));
        const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', { method: 'POST', headers: new Headers({ 'Authorization': 'Bearer ' + gapi.client.getToken().access_token }), body: form });
        if (!res.ok) { const err = await res.json(); throw new Error(`匯出失敗：${err.error?.message || res.statusText}`); }
        setToastMessage(`✅ 暫存 "${nameToExport}" 已成功匯出至 Google 雲端硬碟！`);
    } catch (error) { console.error("GDrive export failed", error); setToastMessage(`❌ 匯出失敗：${error instanceof Error ? error.message : "未知錯誤"}`); }
  }, [gapiReady, gisReady, namedDrafts, getAuthToken]);

  const handleConfirmDraftAction = useCallback((draftName: string) => {
    if (modalAction === 'delete') {
      if (namedDrafts[draftName] && window.confirm(`確定要永久刪除暫存 "${draftName}" 嗎？`)) {
        const newDrafts = { ...namedDrafts };
        delete newDrafts[draftName];
        setNamedDrafts(newDrafts);
        localStorage.setItem(config.app.storageKeys.drafts, JSON.stringify(newDrafts));
        setToastMessage(`暫存 "${draftName}" 已刪除。`);
      }
    } else if (modalAction === 'export') {
      performExportToDrive(draftName);
    }
    setIsModalOpen(false); setModalAction(null);
  }, [modalAction, namedDrafts, performExportToDrive]);
  
  const loadPickerApi = useCallback(async () => {
    if (pickerApiLoaded.current) return;
    return new Promise<void>((resolve, reject) => gapi.load('picker', (err: any) => err ? reject(err) : (pickerApiLoaded.current = true, resolve())));
  }, []);

  const showGooglePicker = useCallback(async (): Promise<any> => {
    return new Promise((resolve, reject) => {
        const picker = new google.picker.PickerBuilder()
            .addView(new google.picker.View(google.picker.ViewId.DOCS).setMimeTypes("application/json"))
            .setOAuthToken(gapi.client.getToken().access_token).setDeveloperKey(config.api.google.apiKey)
            .setCallback((data: any) => { if (data.action === google.picker.Action.PICKED) { resolve(data.docs?.[0]); } else if (data.action === google.picker.Action.CANCEL) { resolve(null); } })
            .build();
        picker.setVisible(true);
    });
  }, []);

  const handleImportFromDrive = useCallback(async () => {
    if (!isGoogleApiConfigured) return setToastMessage("❌ Google Drive 功能未設定。");
    if (!gapiReady || !gisReady) return setToastMessage("⏳ Google Drive 功能正在初始化，請稍候。");
    try {
        await getAuthToken(); await loadPickerApi();
        const doc = await showGooglePicker();
        if (!doc?.id) return;
        const res = await gapi.client.drive.files.get({ fileId: doc.id, alt: 'media' });
        const importedData = (typeof res.result === 'object') ? res.result : JSON.parse(res.result);
        
        const dName = prompt(`請為匯入的暫存檔命名：`, (doc.name || 'imported-draft').replace(/\.json$/i, '').replace(/^服務單暫存-/, ''));
        if (!dName) return;
        setNamedDrafts(cD => {
            if (cD[dName] && !window.confirm(`暫存 "${dName}" 已存在，要覆蓋嗎？`)) return cD;
            if (!cD[dName] && Object.keys(cD).length >= config.app.maxDrafts) { setToastMessage(`❌ 無法儲存，已達上限 (${config.app.maxDrafts}份)。`); return cD; }
            const newDrafts = { ...cD, [dName]: migrateWorkOrderData(importedData) };
            localStorage.setItem(config.app.storageKeys.drafts, JSON.stringify(newDrafts));
            setToastMessage(`✅ 暫存 "${dName}" 已成功從雲端匯入！`);
            return newDrafts;
        });
    } catch (error: any) {
        console.error("GDrive import failed:", error);
        setToastMessage(`❌ 匯入失敗: ${error?.result?.error?.message || error?.message || '未知錯誤'}`);
    }
  }, [gapiReady, gisReady, getAuthToken, loadPickerApi, showGooglePicker, isGoogleApiConfigured]);


  const generatePdfBlob = useCallback(async (): Promise<Blob | null> => {
    try {
      const { jsPDF: JSPDF } = (window as any).jspdf;
      const pdf = new JSPDF('p', 'mm', 'a4');
      const pdfWidth = 210;
      const pdfHeight = 297;
      const options = { scale: 2, useCORS: true, backgroundColor: '#ffffff' };
      const imageType = 'image/jpeg';
      const imageQuality = 0.92;
      let pageCount = 0;
      const totalContentLines = calculateVisualLines(formData.tasks) + calculateVisualLines(formData.status) + formData.products.filter(p => p.name.trim() !== '').length + calculateVisualLines(formData.remarks);

      if (totalContentLines > config.app.pdfLimits.totalContent) {
        const [p1, p2] = [document.getElementById('pdf-pdf-page1'), document.getElementById('pdf-pdf-page2')];
        if (!p1 || !p2) throw new Error('Split page elements not found');
        const [c1, c2] = await Promise.all([html2canvas(p1, options), html2canvas(p2, options)]);
        pdf.addImage(c1.toDataURL(imageType, imageQuality), 'JPEG', 0, 0, pdfWidth, pdfHeight); pageCount++;
        pdf.addPage(); pdf.addImage(c2.toDataURL(imageType, imageQuality), 'JPEG', 0, 0, pdfWidth, pdfHeight); pageCount++;
      } else {
        const fullEl = document.getElementById('pdf-pdf-full');
        if (!fullEl) throw new Error('Full report element not found');
        const canvas = await html2canvas(fullEl, options);
        pdf.addImage(canvas.toDataURL(imageType, imageQuality), 'JPEG', 0, 0, pdfWidth, Math.min(pdfHeight, (canvas.height * pdfWidth) / canvas.width)); pageCount++;
      }
      if (formData.photos.length > 0) {
        for (let i = 0; i < chunk(formData.photos, 4).length; i++) {
          const photoPageEl = document.getElementById(`pdf-photo-page-${i}`);
          if (photoPageEl) {
              if (pageCount > 0) pdf.addPage();
              const canvas = await html2canvas(photoPageEl, options);
              pdf.addImage(canvas.toDataURL(imageType, imageQuality), 'JPEG', 0, 0, pdfWidth, pdfHeight); pageCount++;
          }
        }
      }
      return pdf.output('blob');
    } catch (error) { console.error("PDF blob generation failed:", error); setToastMessage("❌ 無法產生PDF。"); return null; }
  }, [formData]);

  const handleDownloadPdf = useCallback(async () => {
    if (isProcessing) return; setIsProcessing(true);
    try {
        const blob = await generatePdfBlob();
        if (!blob) return;
        const fileName = `工作服務單-${formData.serviceUnit || 'report'}-${new Date().toISOString().split('T')[0]}.pdf`;
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob); link.download = fileName;
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
    } finally { setIsProcessing(false); }
  }, [isProcessing, formData.serviceUnit, generatePdfBlob]);
  
  const handleSharePdf = useCallback(async () => {
    if (isProcessing) return; setIsProcessing(true);
    try {
        const blob = await generatePdfBlob();
        if (!blob) return;
        const fileName = `工作服務單-${formData.serviceUnit || 'report'}-${new Date().toISOString().split('T')[0]}.pdf`;
        const file = new File([blob], fileName, { type: 'application/pdf' });
        const shareData = { files: [file], title: `工作服務單 - ${formData.serviceUnit}`, text: `請查收 ${formData.serviceUnit} 的工作服務單。` };
        if (navigator.share && navigator.canShare?.(shareData)) {
            await navigator.share(shareData).catch(err => { if (err.name !== 'AbortError') throw err; });
        } else { setToastMessage('您的瀏覽器不支援檔案分享。請先下載PDF後再手動分享。'); }
    } catch(e) { console.error('PDF share failed:', e); setToastMessage('❌ PDF 分享失敗。'); } 
    finally { setIsProcessing(false); }
  }, [isProcessing, formData.serviceUnit, generatePdfBlob]);

  const handleConfirmUpload = useCallback(async (options: UploadOptions, recipients: string) => {
    setIsUploadModalOpen(false);

    if (!options.nas && !options.email) {
      setToastMessage('未選擇任何傳送方式。');
      return;
    }

    const recipientList = recipients.split(/[,;\n]/).map(email => email.trim()).filter(Boolean);
    if (options.email && recipientList.length === 0) {
      setToastMessage('若要透過 Email 傳送，請至少輸入一個有效的收件人信箱。');
      return;
    }

    if (options.email && !isBrevoApiConfigured) {
      document.getElementById('brevo-error-display')?.scrollIntoView({ behavior: 'smooth' });
      setToastMessage('❌ Email 功能設定不完整，無法寄送。');
      return;
    }

    setIsProcessing(true);
    try {
      const blob = await generatePdfBlob();
      if (!blob) {
        throw new Error('無法產生 PDF 檔案。');
      }

      const datePart = formData.dateTime.split('T')[0];
      const fileName = `工作服務單-${datePart}-${formData.serviceUnit || 'report'}.pdf`;

      const promises = [];
      if (options.nas) {
        promises.push(uploadToNas(blob, fileName));
      }
      if (options.email && recipientList.length > 0) {
        promises.push(sendByEmail(blob, fileName, recipientList));
      }

      const results = await Promise.allSettled(promises);
      let successMessages: string[] = [];
      let errorMessages: string[] = [];

      results.forEach((result, index) => {
          let action = (options.nas && options.email) ? (index === 0 ? 'NAS 上傳' : 'Email 寄送') : (options.nas ? 'NAS 上傳' : 'Email 寄送');
          if (result.status === 'fulfilled') {
              successMessages.push(`✅ ${result.value}`);
          } else {
              errorMessages.push(`❌ ${action}失敗: ${result.reason instanceof Error ? result.reason.message : '未知錯誤'}`);
          }
      });
      
      let finalMessage = [ ...successMessages, ...errorMessages].join('\n\n');
      alert(finalMessage || '沒有執行任何操作。');

    } catch (error) {
      console.error("An unexpected error occurred during upload/send:", error);
      setToastMessage(`❌ 發生未預期的錯誤: ${error instanceof Error ? error.message : '未知錯誤'}`);
    } finally {
      setIsProcessing(false);
    }
  }, [formData, generatePdfBlob, isBrevoApiConfigured]);
  
  const uploadToNas = async (blob: Blob, fileName: string): Promise<string> => {
    const fileContentBase64 = await blobToBase64(blob);
    const response = await fetch('/.netlify/functions/upload-to-nas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName, fileContentBase64 }),
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.message || 'NAS 上傳請求失敗');
    }
    return result.message;
  };
  
  const sendByEmail = async (blob: Blob, fileName: string, recipients: string[]): Promise<string> => {
    const base64Pdf = await blobToBase64(blob);
    const toPayload = recipients.map(email => ({ email }));

    const payload = {
      sender: { name: config.api.brevo.senderName, email: config.api.brevo.senderEmail },
      to: toPayload,
      subject: `${formData.dateTime.split('T')[0]} ${formData.serviceUnit} 的工作服務單`,
      htmlContent: config.app.emailTemplate(formData.serviceUnit, formData.dateTime),
      attachment: [{ content: base64Pdf, name: fileName }],
    };

    const response = await fetch(config.api.brevo.apiUrl, {
      method: 'POST',
      headers: { 'accept': 'application/json', 'api-key': config.api.brevo.apiKey!, 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Brevo API 請求失敗');
    }
    return `Email 已成功寄送至 ${recipients.length} 位收件人。`;
  };

  return (
    <div className="min-h-screen bg-slate-100">
        <Toast message={toastMessage} onClose={() => setToastMessage(null)} />
        <div className="relative max-w-4xl mx-auto bg-white rounded-xl shadow-2xl ring-1 ring-black ring-opacity-5 overflow-hidden my-8 sm:my-12">
           <span className="absolute top-4 right-6 text-xs font-mono text-slate-400 select-none" aria-label={`應用程式版本 ${config.version.formatted}`}>
              {config.version.formatted}
            </span>
           
           {isSubmitted ? (
             <ReportView 
                data={formData}
                onUploadPdf={() => setIsUploadModalOpen(true)}
                onSharePdf={handleSharePdf}
                onDownloadPdf={handleDownloadPdf}
                onReset={handleReset}
                onEdit={handleEdit}
                isProcessing={isProcessing}
              />
            ) : (
            <>
              {!isGoogleApiConfigured && <ApiKeyErrorDisplay />}
              <div id="brevo-error-display">{!isBrevoApiConfigured && <BrevoApiKeyErrorDisplay />}</div>
              
              <WorkOrderForm 
                formData={formData} onInputChange={handleInputChange} onProductChange={handleProductChange} onProductSerialNumberChange={handleProductSerialNumberChange}
                onAddProduct={handleAddProduct} onRemoveProduct={handleRemoveProduct} onPhotosChange={handlePhotosChange}
                onTechnicianSignatureSave={handleTechnicianSignatureSave} onTechnicianSignatureClear={handleTechnicianSignatureClear}
                onCustomerSignatureSave={handleCustomerSignatureSave} onCustomerSignatureClear={handleCustomerSignatureClear}
                onSubmit={handleSubmit} onSaveAsDraft={handleSaveAsDraft} onLoadDraft={handleLoadDraft} onDeleteDraft={handleDeleteDraft}
                onClearData={handleClearData} onImportFromDrive={handleImportFromDrive} onExportToDrive={handleExportToDrive} namedDrafts={namedDrafts}
              />
            </>
            )}
        </div>
        
        <DraftActionModal isOpen={isModalOpen} action={modalAction} drafts={Object.keys(namedDrafts)} onClose={() => setIsModalOpen(false)} onConfirm={handleConfirmDraftAction} />

        <UploadModal
          isOpen={isUploadModalOpen}
          onClose={() => setIsUploadModalOpen(false)}
          onConfirm={handleConfirmUpload}
          isProcessing={isProcessing}
          defaultRecipient={config.app.defaultEmailRecipient}
        />

        {isProcessing && (
            <div className="fixed inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-[60]">
              <div className="text-center">
                <p className="text-lg font-semibold text-slate-700">正在處理中...</p>
                <p className="text-sm text-slate-500">請稍候</p>
              </div>
            </div>
        )}
    </div>
  );
};
