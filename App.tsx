
import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { WorkOrderData, ProductItem } from './types';
import SignaturePad from './components/SignaturePad';
import ImageUploader from './components/ImageUploader';

// --- 全域型別宣告 ---
// 為了讓 TypeScript 能夠識別透過 CDN <script> 標籤載入的函式庫，我們在此宣告它們的全域型別。
declare const jsPDF: any;
declare const html2canvas: any;
// 宣告 Google API 的全域變數
declare const gapi: any;
declare const google: any;

// --- 版本號統一來源 ---
// 此變數由 vite.config.ts 在建置階段從 package.json 檔案中自動注入 (例如 "1.3.0")
const rawVersion = process.env.APP_VERSION || '1.3.0'; 
// 將原始版本號格式化為更容易閱讀的 "V1.3" 格式，用於UI顯示
const APP_VERSION = `V${rawVersion.split('.').slice(0, 2).join('.')}`;


// --- GOOGLE DRIVE API 設定 ---
// 從環境變數讀取 Google API 金鑰，這些金鑰應存放在 .env.local 檔案中，以策安全
const API_KEY = process.env.GOOGLE_API_KEY;
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';
const SCOPES = 'https://www.googleapis.com/auth/drive.file'; // 授權範圍：允許應用程式存取使用者的 Google Drive 檔案
const GOOGLE_AUTH_GRANTED_KEY = 'googleAuthGranted'; // 用於在 localStorage 中記錄使用者是否已授權
// ------------------------------

// --- BREVO EMAIL API 設定 ---
// 從環境變數讀取 Brevo (前身為 Sendinblue) 的 API 金鑰及寄件人資訊
const BREVO_API_KEY = process.env.BREVO_API_KEY;
const BREVO_SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL;
const BREVO_SENDER_NAME = process.env.BREVO_SENDER_NAME;

/**
 * 產生 Email HTML 內容的範本函式。
 * @param serviceUnit - 服務單位名稱。
 * @param dateTime - 工作日期時間。
 * @returns 回傳一個包含問候語和公司資訊的 HTML 字串。
 */
const getEmailHtmlContent = (serviceUnit: string, dateTime: string): string => {
  const datePart = dateTime.split('T')[0];
  return `
  <p>您好，</p>
  <p>附件為 ${datePart} ${serviceUnit} 的工作服務單，請查收。</p>
  <p>此為系統自動發送信件，請勿直接回覆。</p>
  <p>謝謝您！</p>
  <p>富元機電有限公司 TEL:(02)2697-5163 FAX:(02)2697-5339</p>
  <p>新北市汐止區新台五路一段99號14樓之12</p>
  <p>E-mail：fuhyuan.w5339@msa.hinet.net</p>
`;
};
// ------------------------------


// --- 全域設定參數 ---
// 這些參數用於控制表單的行為和限制，方便統一管理。

// PDF 內容行數限制，超過此限制將觸發智慧分頁
const TOTAL_CONTENT_LINES_LIMIT = 20; 
// 「處理事項」和「處理情形」兩個區塊的總行數限制
const TASKS_STATUS_LIMIT = 18; 
// 「產品項目」和「備註」兩個區塊的總行數限制
const PRODUCTS_REMARKS_LIMIT = 16; 
// 儲存於瀏覽器 localStorage 的具名暫存檔所使用的鍵值
const NAMED_DRAFTS_STORAGE_KEY = 'workOrderNamedDrafts';
// 最大允許儲存的本機暫存數量
const MAX_DRAFTS = 3;


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
 * 主要用於將 PDF 檔案轉換成可以附加到 Email 中的格式。
 * @param blob - 要轉換的 Blob 物件。
 * @returns 回傳一個 Promise，其解析值為 Base64 字串。
 */
const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
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
        {/*
          註解: 欄位標題的樣式由此處的 Tailwind CSS class 控制。
          - `text-sm`: 字體大小。可改為 `text-base`, `text-lg` 等。
          - `font-medium`: 字體粗細。
          - `text-slate-700`: 字體顏色。
        */}
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
// 這些是簡單的 SVG 圖示元件，用於按鈕和介面中，使其更具語意和視覺吸引力。
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
  action: 'delete' | 'export' | null; // 'delete' 表示刪除操作, 'export' 表示匯出操作
  drafts: string[]; // 可供操作的暫存檔名稱列表
  onClose: () => void;
  onConfirm: (draftName: string) => void;
}

/**
 * @component DraftActionModal
 * @description 用於「刪除本機暫存」和「匯出至 Google Drive」的彈出式視窗。
 *              它會根據傳入的 `action` props 顯示不同的標題和按鈕。
 */
const DraftActionModal: React.FC<DraftActionModalProps> = ({ isOpen, action, drafts, onClose, onConfirm }) => {
  const [selectedDraft, setSelectedDraft] = useState('');

  // 當視窗打開且有暫存檔時，預設選中第一個
  useEffect(() => {
    if (isOpen && drafts.length > 0) {
      setSelectedDraft(drafts[0]);
    }
  }, [isOpen, drafts]);

  if (!isOpen || !action) return null;

  // 根據 action 決定視窗的文案和樣式
  const title = action === 'delete' ? '刪除本機暫存' : '匯出至 Google 雲端硬碟';
  const buttonText = action === 'delete' ? '確認刪除' : '匯出';
  const buttonClass = action === 'delete' 
    ? 'bg-red-600 hover:bg-red-700 focus:ring-red-500' // 刪除按鈕為紅色
    : 'bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500'; // 匯出按鈕為藍紫色

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


/**
 * @interface WorkOrderFormProps
 * @description 工作服務單主表單元件的 props 介面。
 */
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

/**
 * @component WorkOrderForm
 * @description 這是應用的核心 UI，用於填寫所有工作服務單的資料。
 *              它由多個 FormField 和其他自訂元件（如 ImageUploader, SignaturePad）組成。
 */
const WorkOrderForm: React.FC<WorkOrderFormProps> = ({
    formData, onInputChange, onProductChange, onProductSerialNumberChange, onAddProduct, onRemoveProduct, onPhotosChange,
    onTechnicianSignatureSave, onTechnicianSignatureClear, onCustomerSignatureSave, onCustomerSignatureClear,
    onSubmit, onSaveAsDraft, onLoadDraft, onDeleteDraft, onClearData, onImportFromDrive, onExportToDrive, namedDrafts
}) => {
    // 動態計算目前已使用的行數，用於 UI 提示
    const tasksStatusTotal = calculateVisualLines(formData.tasks) + calculateVisualLines(formData.status);
    const productsRemarksTotal = formData.products.reduce((acc, product) => acc + product.quantity, 0) + calculateVisualLines(formData.remarks);
    const draftNames = Object.keys(namedDrafts);

    return (
     <form onSubmit={onSubmit} className="p-6 sm:p-8 space-y-8">
        <div className="text-center">
            {/* 
              註解: 這裡是表單的標題。
              - `text-2xl`, `text-xl`: 控制字體大小。
              - `font-bold`, `font-semibold`: 控制字體粗細。
              - `text-slate-800`, `text-slate-600`: 控制字體顏色。
              您可以將 `text-2xl` 改為 `text-3xl` 來讓主標題更大。
            */}
            <h1 className="text-2xl font-bold text-slate-800">富元機電有限公司</h1>
            <h2 className="text-xl font-semibold text-slate-600 mt-1">工作服務單</h2>
        </div>
        <div className="space-y-6">
            {/* 這裡使用上面定義的 FormField 元件來建立各個輸入欄位 */}
            <FormField label="工作日期及時間" id="dateTime" type="datetime-local" value={formData.dateTime} onChange={onInputChange} required />
            <FormField label="服務單位" id="serviceUnit" value={formData.serviceUnit} onChange={onInputChange} required />
            <FormField label="接洽人" id="contactPerson" value={formData.contactPerson} onChange={onInputChange} />
            <FormField label="連絡電話" id="contactPhone" type="tel" value={formData.contactPhone} onChange={onInputChange} />
            <FormField label="處理事項" id="tasks" type="textarea" value={formData.tasks} onChange={onInputChange} rows={8} cornerHint={`${tasksStatusTotal}/${TASKS_STATUS_LIMIT} 行`} />
            <FormField label="處理情形" id="status" type="textarea" value={formData.status} onChange={onInputChange} rows={8} cornerHint={`${tasksStatusTotal}/${TASKS_STATUS_LIMIT} 行`}/>
            
            {/* 產品項目區塊 */}
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

        {/* 表單底部的操作按鈕區 */}
        <div className="pt-5">
            <div className="flex flex-col-reverse sm:flex-row justify-between items-center gap-4">
                 {/* 左側的暫存管理按鈕 */}
                 <div className="flex gap-2 w-full sm:w-auto flex-wrap">
                    <select
                        onChange={(e) => {
                            const value = e.target.value;
                            if (value === '__DELETE__') { onDeleteDraft(); }
                            else if (value === '__EXPORT_GDRIVE__') { onExportToDrive(); } 
                            else if (value === '__IMPORT_GDRIVE__') { onImportFromDrive(); }
                            else if (value) { onLoadDraft(value); }
                            e.target.value = ''; // 每次操作後重置 select，以便可以重複選擇
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
                {/* 右側的主要提交按鈕 */}
                <button type="submit" className="w-full sm:w-auto px-6 py-3 border border-transparent rounded-md shadow-sm text-base font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
                    產生服務單報告
                </button>
            </div>
        </div>
    </form>
)};


// --- 報告相關元件 ---

/**
 * @component PdfFooter
 * @description PDF 頁尾元件，顯示公司資訊和頁碼。
 */
const PdfFooter: React.FC<{ currentPage?: number; totalPages?: number; }> = ({ currentPage, totalPages }) => (
    <div className="flex-shrink-0 flex justify-between items-center text-xs text-slate-500 border-t border-slate-200 pt-2 mt-auto">
      {/* 
        註解: 這裡是頁尾文字的樣式。
        - `text-xs`: 控制字體大小。可改為 `text-sm` 讓字體變大。
        - `text-slate-500`: 控制字體顏色。
      */}
      <span>{`本表單(${APP_VERSION})由富元機電有限公司提供,電話(02)2697-5163 傳真(02)2697-5339`}</span>
      {totalPages && currentPage && (
        <span className="font-mono text-base">{`${currentPage} / ${totalPages}`}</span>
      )}
    </div>
);

type ReportLayoutProps = {
  data: WorkOrderData;
  mode: 'screen' | 'pdf-full' | 'pdf-page1' | 'pdf-page2'; // 'screen'為螢幕預覽，'pdf-*'為PDF渲染
  currentPage?: number;
  totalPages?: number;
};

/**
 * @component ReportLayout
 * @description 這是報告的核心佈局元件，同時用於螢幕預覽和最終的 PDF 產生。
 *              `mode` props 會控制內容的顯示方式，以實現智慧分頁。
 *              **要調整 PDF 的字體大小、顏色等外觀，主要就是修改此處的 CSS class。**
 */
const ReportLayout: React.FC<ReportLayoutProps> = ({ data, mode, currentPage, totalPages }) => {
  const isPdf = mode.startsWith('pdf');
  const formattedDateTime = data.dateTime ? new Date(data.dateTime).toLocaleString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'N/A';
  const hasProducts = data.products && data.products.filter(p => p.name.trim() !== '').length > 0;
  
  // 根據 mode 決定是否顯示特定區塊，實現分頁邏輯
  const showManagerApproval = mode !== 'pdf-page2';
  const showMainHeaderAndCustomerInfo = true; // 所有頁面都顯示
  const showTasksAndStatus = mode === 'screen' || mode === 'pdf-full' || mode === 'pdf-page1'; // 只在第一頁或完整頁顯示
  const showProductsAndRemarks = mode === 'screen' || mode === 'pdf-full' || mode === 'pdf-page2'; // 只在第二頁或完整頁顯示
  const showSignatures = true; // 所有頁面都顯示

  return (
    <div id={isPdf ? `pdf-${mode}` : undefined} className="p-8 bg-white" style={{ width: isPdf ? '210mm' : '100%', minHeight: isPdf ? '297mm' : 'auto', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', fontFamily: "'Helvetica Neue', 'Arial', 'sans-serif'" }}>
      {showMainHeaderAndCustomerInfo && (
        <>
          <div className="text-center mb-10 flex-shrink-0">
            {/* 
              註解: 這裡是 PDF 報告的主標題。
              - `text-3xl`: 控制「富元機電有限公司」的字體大小。
              - `text-2xl`: 控制「工作服務單」的字體大小。
              - `font-bold`: 控制字體粗細。
              - `text-gray-800`: 控制字體顏色。
              - **範例**: 將 `text-3xl` 改為 `text-4xl` 可以讓主標題變得更大。
            */}
            <h1 className="text-3xl font-bold text-gray-800">富元機電有限公司</h1>
            <h2 className="text-2xl font-semibold text-gray-600 mt-2">
              工作服務單
              {mode === 'pdf-page2' && ' (產品項目與備註)'}
            </h2>
          </div>
          {/*
            註解: 客戶資訊區塊。
            - `grid grid-cols-12`: 使用 12 欄格線系統排版。
            - `gap-x-6 gap-y-4`: 控制欄和列的間距。
            - `col-span-*`: 控制每個項目佔用的欄數。
          */}
          <div className="grid grid-cols-12 gap-x-6 gap-y-4">
            <div className="col-span-12"><strong>工作日期及時間：</strong>{formattedDateTime}</div>
            <div className="col-span-7"><strong>服務單位：</strong>{data.serviceUnit || 'N/A'}</div>
            <div className="col-span-5"><strong>接洽人：</strong>{data.contactPerson || 'N/A'}</div>
            <div className="col-span-12"><strong>連絡電話：</strong>{data.contactPhone || 'N/A'}</div>
          </div>
        </>
      )}

      {/* 
        註解: 這裡是報告的主要內容區。
        - `text-base`: 控制此區塊內文字的基礎字體大小。
        - `text-gray-800`: 控制文字顏色。
      */}
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
              {/* 
                註解: 產品表格的樣式。
                - `text-sm`: 控制表格內文字的字體大小。
                - `bg-slate-50`: 表頭的背景顏色。
                - `font-medium text-slate-600`: 表頭文字的樣式。
              */}
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
            {/* 
              註解: 簽名區塊。
              - `min-h-[100px]`: 控制簽名框的最小高度。
            */}
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

/**
 * @component PdfPhotoPage
 * @description 用於產生 PDF 的照片附錄頁面，每頁最多顯示 4 張照片。
 */
const PdfPhotoPage = ({ photos, pageNumber, totalPhotoPages, data, textPageCount, pdfTotalPages }: { photos: string[], pageNumber:number, totalPhotoPages: number, data: WorkOrderData, textPageCount: number, pdfTotalPages: number }) => {
    const formattedDate = data.dateTime ? new Date(data.dateTime).toLocaleDateString('zh-TW') : 'N/A';
    const pageTitle = totalPhotoPages > 1 ? `施工照片 (第 ${pageNumber} / ${totalPhotoPages} 頁) - ${data.serviceUnit} (${formattedDate})` : `施工照片 - ${data.serviceUnit} (${formattedDate})`;

    return (
        <div id={`pdf-photo-page-${pageNumber - 1}`} className="p-8 bg-white" style={{ width: '210mm', height: '297mm', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
            {/*
              註解: 這是照片頁的標題。
              - `text-xl`: 控制標題字體大小。
            */}
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

/**
 * @component ReportView
 * @description 當表單提交後，顯示此報告預覽畫面。
 *              它會渲染 ReportLayout（用於螢幕預覽）和一系列隱藏的 PDF 渲染用元件。
 */
const ReportView: React.FC<ReportViewProps> = ({ data, onUploadPdf, onSharePdf, onDownloadPdf, onReset, onEdit, isProcessing }) => {
    // 根據內容計算 PDF 應該有多少文字頁和照片頁
    const photoChunks = chunk(data.photos, 4);
    const tasksLines = calculateVisualLines(data.tasks);
    const statusLines = calculateVisualLines(data.status);
    const productsLines = data.products.filter(p => p.name.trim() !== '').length;
    const remarksLines = calculateVisualLines(data.remarks);
    const totalContentLines = tasksLines + statusLines + productsLines + remarksLines;
    const textPages = totalContentLines > TOTAL_CONTENT_LINES_LIMIT ? 2 : 1;
    const photoPages = photoChunks.length;
    const totalPages = textPages + photoPages;

    return (
    <>
      {/* 
        註解: 這裡是真正用於產生 PDF 的隱藏元件。
        它們被放在一個 class 為 `pdf-render-container` 的 div 中，這個 class 會將其移出畫面外。
        html2canvas 會擷取這些元件的畫面來產生 PDF。
      */}
      <div className="pdf-render-container">
        {totalContentLines > TOTAL_CONTENT_LINES_LIMIT ? (
            <><ReportLayout data={data} mode="pdf-page1" currentPage={1} totalPages={totalPages} /><ReportLayout data={data} mode="pdf-page2" currentPage={2} totalPages={totalPages} /></>
        ) : (
            <ReportLayout data={data} mode="pdf-full" currentPage={1} totalPages={totalPages} />
        )}
        {photoChunks.map((photoChunk, index) => (<PdfPhotoPage key={index} photos={photoChunk} pageNumber={index + 1} totalPhotoPages={photoChunks.length} data={data} textPageCount={textPages} pdfTotalPages={totalPages} />))}
      </div>
      
      {/* 這是給使用者在螢幕上看的預覽畫面 */}
      <div className="p-4 sm:p-6 bg-slate-50/50 overflow-x-auto">
        <div className="w-full max-w-[800px] mx-auto origin-top">
            <div className="shadow-lg"><ReportLayout data={data} mode="screen" /></div>
        </div>
      </div>

      {/* 報告預覽頁面下方的操作按鈕 */}
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

/**
 * @component ApiKeyErrorDisplay
 * @description 當 Google API 金鑰未設定時，顯示此錯誤提示元件。
 */
const ApiKeyErrorDisplay = () => (
    <div className="p-8 text-center bg-red-50 border-l-4 border-red-400">
        <h3 className="text-xl font-bold text-red-800">⛔️ Google Drive 功能設定錯誤</h3>
        <p className="mt-2 text-md text-red-700">應用程式偵測到 Google API 金鑰或用戶端 ID 尚未設定。</p>
        <p className="mt-4 text-sm text-slate-600 bg-slate-100 p-3 rounded-md">請開發者依照 <code>README.md</code> 檔案中的指示，建立 <code>.env.local</code> 檔案並填入正確的金鑰資訊，以啟用雲端硬碟匯出/匯入功能。</p>
    </div>
);

/**
 * @component BrevoApiKeyErrorDisplay
 * @description 當 Brevo Email API 金鑰未設定時，顯示此錯誤提示元件。
 */
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
                <li>確認檔案中包含以下**所有**變數並已填入正確的值：
                    <ul className="list-['-_'] list-inside ml-4 mt-1 font-mono bg-slate-200 p-2 rounded">
                        <li>BREVO_API_KEY</li>
                        <li>BREVO_SENDER_EMAIL</li>
                        <li>BREVO_SENDER_NAME</li>
                    </ul>
                </li>
                 <li>修改完畢後，請務必**重新啟動**本地開發伺服器 (關閉後再執行 <code>npm run dev</code>)。</li>
            </ul>
           ) : (
            <ul className="list-disc list-inside mt-2 space-y-1">
                <li>請登入您的網站託管平台 (例如 Netlify)。</li>
                <li>前往網站設定中的「環境變數 (Environment variables)」區塊。</li>
                <li>確認以下**所有**變數都已建立並填入正確的值：
                    <ul className="list-['-_'] list-inside ml-4 mt-1 font-mono bg-slate-200 p-2 rounded">
                        <li>BREVO_API_KEY</li>
                        <li>BREVO_SENDER_EMAIL</li>
                        <li>BREVO_SENDER_NAME</li>
                    </ul>
                </li>
                <li>儲存設定後，請**重新部署 (re-deploy)** 您的網站以讓變更生效。</li>
            </ul>
           )}
        </div>
    </div>
)};

/**
 * @component App
 * @description 整個應用程式的根元件。
 *              負責管理所有狀態、處理所有事件、並根據狀態渲染 `WorkOrderForm` 或 `ReportView`。
 */
export const App: React.FC = () => {
  // --- 狀態管理 (State Management) ---
  const [formData, setFormData] = useState<WorkOrderData>(initialFormData); // 當前表單的資料
  const [namedDrafts, setNamedDrafts] = useState<{ [name: string]: WorkOrderData }>({}); // 所有已儲存的本機暫存
  const [isSubmitted, setIsSubmitted] = useState(false); // 標記表單是否已提交，以切換到報告預覽畫面
  const [isProcessing, setIsProcessing] = useState(false); // 標記是否正在處理耗時操作（如產生PDF、上傳），用於顯示載入畫面
  
  // Google API 相關狀態
  const [gapiReady, setGapiReady] = useState(false); // Google API Client 是否載入完成
  const [gisReady, setGisReady] = useState(false); // Google Identity Services 是否載入完成
  const [tokenClient, setTokenClient] = useState<any>(null); // Google Auth Token Client 實例
  const pickerApiLoaded = useRef(false); // 標記 Google Picker API 是否已載入
  
  // 彈出視窗相關狀態
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalAction, setModalAction] = useState<'delete' | 'export' | null>(null);

  // 檢查 API 金鑰是否已設定
  const isGoogleApiConfigured = API_KEY && CLIENT_ID;
  const isBrevoApiConfigured = BREVO_API_KEY && BREVO_SENDER_EMAIL && BREVO_SENDER_NAME;

  // --- 副作用 (Effects) ---

  // 元件掛載時，動態載入 Google API 的 script
  useEffect(() => {
    if (!isGoogleApiConfigured) return;
    const gapiScript = document.createElement('script');
    gapiScript.src = 'https://apis.google.com/js/api.js';
    gapiScript.async = true; gapiScript.defer = true;
    gapiScript.onload = () => gapi.load('client', async () => { await gapi.client.init({ apiKey: API_KEY, discoveryDocs: [DISCOVERY_DOC] }); setGapiReady(true); });
    document.body.appendChild(gapiScript);
    const gisScript = document.createElement('script');
    gisScript.src = 'https://accounts.google.com/gsi/client';
    gisScript.async = true; gisScript.defer = true;
    gisScript.onload = () => { const client = google.accounts.oauth2.initTokenClient({ client_id: CLIENT_ID, scope: SCOPES, callback: '', }); setTokenClient(client); setGisReady(true); };
    document.body.appendChild(gisScript);
    return () => { document.body.removeChild(gapiScript); document.body.removeChild(gisScript); };
  }, [isGoogleApiConfigured]);

  // 元件掛載時，從 localStorage 讀取已儲存的暫存檔
  useEffect(() => {
    alert("請記得使用chrome.Edge.Firefox等瀏覽器開啟,避免無法產出PDF,謝謝!");
    try {
        const savedDrafts = localStorage.getItem(NAMED_DRAFTS_STORAGE_KEY);
        if (savedDrafts) { setNamedDrafts(JSON.parse(savedDrafts)); }
    } catch (error) { console.error("Failed to load named drafts.", error); }
  }, []);

  // --- 事件處理函式 (Event Handlers) ---

  // 清空目前表單資料的函式
  const clearCurrentForm = useCallback(() => {
    setFormData({ ...initialFormData, products: [{ ...initialProduct, id: `product-${Date.now()}` }], dateTime: getFormattedDateTime() });
  }, []);

  // 處理表單輸入變更
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    const tempState = {...formData, [name]: value};
    // 檢查行數限制
    if ((name === 'tasks' || name === 'status') && calculateVisualLines(tempState.tasks) + calculateVisualLines(tempState.status) > TASKS_STATUS_LIMIT) return;
    if (name === 'remarks' && formData.products.reduce((acc, p) => acc + p.quantity, 0) + calculateVisualLines(tempState.remarks) > PRODUCTS_REMARKS_LIMIT) return;
    setFormData(tempState);
  }, [formData]);
  
  // 處理產品項目變更（品名、數量）
  const handleProductChange = useCallback((index: number, field: 'name' | 'quantity', value: string | number) => {
    setFormData(prev => {
        if (field === 'quantity') {
            const newQuantity = Number(value);
            // 檢查行數限制
            const otherProductsLines = prev.products.reduce((acc, p, i) => i === index ? acc : acc + p.quantity, 0);
            if (otherProductsLines + newQuantity + calculateVisualLines(prev.remarks) > PRODUCTS_REMARKS_LIMIT) {
                alert(`已達產品與備註的總行數上限 (${PRODUCTS_REMARKS_LIMIT})，無法增加數量。`);
                return prev;
            }
        }
        const newProducts = prev.products.map((product, i) => {
            if (i !== index) return product;
            if (field === 'quantity') {
                // 當數量改變時，自動調整序號輸入框的數量
                const newQuantity = Number(value);
                const oldQuantity = product.quantity;
                let newSerialNumbers = product.serialNumbers || [];
                if (newQuantity > oldQuantity) { newSerialNumbers = [...newSerialNumbers, ...Array(newQuantity - oldQuantity).fill('')]; }
                else if (newQuantity < oldQuantity) { newSerialNumbers = newSerialNumbers.slice(0, newQuantity); }
                return { ...product, quantity: newQuantity, serialNumbers: newSerialNumbers };
            }
            return { ...product, name: String(value) };
        });
        return { ...prev, products: newProducts };
    });
  }, []);
  
  // 處理產品序號變更
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

  // 新增一個產品項目
  const handleAddProduct = () => {
    if (formData.products.reduce((acc, p) => acc + p.quantity, 0) + 1 + calculateVisualLines(formData.remarks) > PRODUCTS_REMARKS_LIMIT) {
        alert(`已達產品與備註的總行數上限 (${PRODUCTS_REMARKS_LIMIT})，無法新增產品。`);
        return;
    }
    setFormData(prev => ({ ...prev, products: [...prev.products, { ...initialProduct, id: `product-${Date.now()}` }] }));
  };

  // 移除一個產品項目
  const handleRemoveProduct = (index: number) => {
    if (formData.products.length <= 1) return;
    setFormData(prev => ({ ...prev, products: prev.products.filter((_, i) => i !== index) }));
  };

  // 處理簽名和照片變更的回呼函式
  const handleCustomerSignatureSave = useCallback((s: string) => setFormData(p => ({ ...p, signature: s })), []);
  const handleCustomerSignatureClear = useCallback(() => setFormData(p => ({ ...p, signature: null })), []);
  const handleTechnicianSignatureSave = useCallback((s: string) => setFormData(p => ({ ...p, technicianSignature: s })), []);
  const handleTechnicianSignatureClear = useCallback(() => setFormData(p => ({ ...p, technicianSignature: null })), []);
  const handlePhotosChange = useCallback((photos: string[]) => setFormData(p => ({ ...p, photos })), []);
  
  // 處理表單提交、編輯、重置
  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); setIsSubmitted(true); window.scrollTo(0, 0); };
  const handleEdit = () => setIsSubmitted(false);
  const handleReset = useCallback(() => { if (window.confirm("確定要清除所有資料並建立新的服務單嗎？")) { clearCurrentForm(); setIsSubmitted(false); } }, [clearCurrentForm]);

  // 處理另存為暫存
  const handleSaveAsDraft = useCallback(() => {
    const draftName = prompt("請為此暫存命名：");
    if (!draftName) return;
    const currentDrafts = { ...namedDrafts };
    const isOverwriting = !!currentDrafts[draftName];
    if (!isOverwriting && Object.keys(currentDrafts).length >= MAX_DRAFTS) { alert(`無法儲存，已達上限 (${MAX_DRAFTS}份)。`); return; }
    if (isOverwriting && !window.confirm(`暫存 "${draftName}" 已存在。要覆蓋它嗎？`)) return;
    const newDrafts = { ...currentDrafts, [draftName]: formData };
    setNamedDrafts(newDrafts);
    localStorage.setItem(NAMED_DRAFTS_STORAGE_KEY, JSON.stringify(newDrafts));
    alert(`✅ 暫存 "${draftName}" 已儲存！\n\n重要提醒：\n暫存資料如用戶清理瀏覽器cookie暫存,資料將消失無法復原,請注意!`);
  }, [formData, namedDrafts]);

  // 處理載入暫存
  const handleLoadDraft = useCallback((name: string) => {
    if (namedDrafts[name] && window.confirm(`確定要載入 "${name}" 嗎？這將覆蓋目前內容。`)) {
      setFormData(migrateWorkOrderData(namedDrafts[name]));
      alert(`暫存 "${name}" 已載入。`);
    }
  }, [namedDrafts]);

  // 處理清除目前表單資料
  const handleClearData = useCallback(() => {
    if (window.confirm("確定要清除目前表單的所有欄位嗎？")) { clearCurrentForm(); alert('表單資料已清除。'); }
  }, [clearCurrentForm]);
  
  // --- Google Drive 相關函式 ---

  // 取得 Google 授權 token
  const getAuthToken = useCallback(() => {
    return new Promise((resolve, reject) => {
        if (!tokenClient) return reject(new Error("Google Auth client is not ready."));
        tokenClient.callback = (resp: any) => resp.error ? (localStorage.removeItem(GOOGLE_AUTH_GRANTED_KEY), reject(resp)) : (localStorage.setItem(GOOGLE_AUTH_GRANTED_KEY, 'true'), resolve(resp));
        // 如果之前已授權，則靜默請求；否則，彈出授權視窗
        if (localStorage.getItem(GOOGLE_AUTH_GRANTED_KEY)) { tokenClient.requestAccessToken({ prompt: '' }); } 
        else { tokenClient.requestAccessToken({ prompt: 'consent' }); }
    });
  }, [tokenClient]);
  
  // 打開「刪除/匯出」的彈出視窗
  const handleOpenDraftActionModal = useCallback((action: 'delete' | 'export') => {
    if (action === 'export' && !isGoogleApiConfigured) { alert("Google Drive 功能未設定。"); return; }
    if (Object.keys(namedDrafts).length === 0) { alert(action === 'delete' ? "沒有暫存可以刪除。" : "沒有暫存可以匯出。"); return; }
    setModalAction(action); setIsModalOpen(true);
  }, [namedDrafts, isGoogleApiConfigured]);
  
  const handleDeleteDraft = useCallback(() => handleOpenDraftActionModal('delete'), [handleOpenDraftActionModal]);
  const handleExportToDrive = useCallback(() => handleOpenDraftActionModal('export'), [handleOpenDraftActionModal]);
  
  // 執行匯出到 Google Drive 的操作
  const performExportToDrive = useCallback(async (nameToExport: string) => {
    if (!gapiReady || !gisReady || !namedDrafts[nameToExport]) { alert("匯出功能未就緒或找不到暫存。"); return; }
    try {
        await getAuthToken();
        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify({ 'name': `${nameToExport}-服務單暫存.json`, 'mimeType': 'application/json', 'parents': ['root'] })], { type: 'application/json' }));
        form.append('file', new Blob([JSON.stringify(namedDrafts[nameToExport], null, 2)], { type: 'application/json' }));
        const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', { method: 'POST', headers: new Headers({ 'Authorization': 'Bearer ' + gapi.client.getToken().access_token }), body: form });
        if (!res.ok) { const err = await res.json(); throw new Error(`匯出失敗：${err.error?.message || res.statusText}`); }
        alert(`暫存 "${nameToExport}" 已成功匯出至 Google 雲端硬碟！`);
    } catch (error) { console.error("GDrive export failed", error); alert(`匯出失敗：${error instanceof Error ? error.message : "未知錯誤"}`); }
  }, [gapiReady, gisReady, namedDrafts, getAuthToken]);

  // 處理彈出視窗的確認按鈕事件
  const handleConfirmDraftAction = (draftName: string) => {
    if (modalAction === 'delete') {
      if (namedDrafts[draftName] && window.confirm(`確定要永久刪除暫存 "${draftName}" 嗎？`)) {
        const newDrafts = { ...namedDrafts };
        delete newDrafts[draftName];
        setNamedDrafts(newDrafts);
        localStorage.setItem(NAMED_DRAFTS_STORAGE_KEY, JSON.stringify(newDrafts));
        alert(`暫存 "${draftName}" 已刪除。`);
      }
    } else if (modalAction === 'export') {
      performExportToDrive(draftName);
    }
    setIsModalOpen(false); setModalAction(null);
  };
  
  // 載入 Google Picker API（檔案選擇器）
  const loadPickerApi = useCallback(async () => {
    if (pickerApiLoaded.current) return;
    return new Promise<void>((resolve, reject) => gapi.load('picker', (err: any) => err ? reject(err) : (pickerApiLoaded.current = true, resolve())));
  }, []);

  // 顯示 Google Picker 檔案選擇器
  const showGooglePicker = useCallback(async (): Promise<any> => {
    return new Promise((resolve, reject) => {
        const picker = new google.picker.PickerBuilder()
            .addView(new google.picker.View(google.picker.ViewId.DOCS).setMimeTypes("application/json")) // 只顯示 JSON 檔案
            .setOAuthToken(gapi.client.getToken().access_token).setDeveloperKey(API_KEY)
            .setCallback((data: any) => { if (data.action === google.picker.Action.PICKED) { resolve(data.docs?.[0]); } else if (data.action === google.picker.Action.CANCEL) { resolve(null); } })
            .build();
        picker.setVisible(true);
    });
  }, []);

  // 處理從 Google Drive 匯入
  const handleImportFromDrive = useCallback(async () => {
    if (!isGoogleApiConfigured) return alert("Google Drive 功能未設定。");
    if (!gapiReady || !gisReady) return alert("Google Drive 功能正在初始化，請稍候。");
    try {
        await getAuthToken(); await loadPickerApi();
        const doc = await showGooglePicker();
        if (!doc?.id) return; // 使用者取消選擇
        const res = await gapi.client.drive.files.get({ fileId: doc.id, alt: 'media' });
        const importedData = (typeof res.result === 'object') ? res.result : JSON.parse(res.result);
        
        const dName = prompt(`請為匯入的暫存檔命名：`, (doc.name || 'imported-draft').replace(/\.json$/i, '').replace(/^服務單暫存-/, ''));
        if (!dName) return;
        setNamedDrafts(cD => {
            if (cD[dName] && !window.confirm(`暫存 "${dName}" 已存在，要覆蓋嗎？`)) return cD;
            if (!cD[dName] && Object.keys(cD).length >= MAX_DRAFTS) { alert(`無法儲存，已達上限 (${MAX_DRAFTS}份)。`); return cD; }
            const newDrafts = { ...cD, [dName]: migrateWorkOrderData(importedData) };
            localStorage.setItem(NAMED_DRAFTS_STORAGE_KEY, JSON.stringify(newDrafts));
            alert(`✅ 暫存 "${dName}" 已成功從雲端匯入！`);
            return newDrafts;
        });
    } catch (error: any) {
        console.error("GDrive import failed:", error);
        alert(`匯入失敗: ${error?.result?.error?.message || error?.message || '未知錯誤'}`);
    }
  }, [gapiReady, gisReady, getAuthToken, loadPickerApi, showGooglePicker, isGoogleApiConfigured]);


  // --- PDF & Email 處理邏輯 ---

  /**
   * 核心函式：產生 PDF 的 Blob 物件。
   * 它會使用 html2canvas 擷取 ReportLayout 元件的畫面，再用 jsPDF 將其轉換為 PDF。
   * @returns 回傳一個 Promise，其解析值為 PDF 的 Blob 物件，或在失敗時為 null。
   */
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

      // 如果內容超過一頁的限制，則分頁擷取
      if (totalContentLines > TOTAL_CONTENT_LINES_LIMIT) {
        const [p1, p2] = [document.getElementById('pdf-pdf-page1'), document.getElementById('pdf-pdf-page2')];
        if (!p1 || !p2) throw new Error('Split page elements not found');
        const [c1, c2] = await Promise.all([html2canvas(p1, options), html2canvas(p2, options)]);
        pdf.addImage(c1.toDataURL(imageType, imageQuality), 'JPEG', 0, 0, pdfWidth, pdfHeight); pageCount++;
        pdf.addPage(); pdf.addImage(c2.toDataURL(imageType, imageQuality), 'JPEG', 0, 0, pdfWidth, pdfHeight); pageCount++;
      } else {
        // 否則，直接擷取完整頁面
        const fullEl = document.getElementById('pdf-pdf-full');
        if (!fullEl) throw new Error('Full report element not found');
        const canvas = await html2canvas(fullEl, options);
        pdf.addImage(canvas.toDataURL(imageType, imageQuality), 'JPEG', 0, 0, pdfWidth, Math.min(pdfHeight, (canvas.height * pdfWidth) / canvas.width)); pageCount++;
      }
      // 如果有照片，則為照片建立附錄頁
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
    } catch (error) { console.error("PDF blob generation failed:", error); alert("無法產生PDF。"); return null; }
  }, [formData]);

  // 處理下載 PDF
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
  }, [isProcessing, formData, generatePdfBlob]);
  
  // 處理分享 PDF（使用 Web Share API）
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
        } else { alert('您的瀏覽器不支援檔案分享。請先下載PDF後再手動分享。'); }
    } catch(e) { console.error('PDF share failed:', e); alert('PDF 分享失敗。'); } 
    finally { setIsProcessing(false); }
  }, [isProcessing, formData, generatePdfBlob]);

  // 處理上傳/寄送 PDF
  const handleUploadPdf = useCallback(async () => {
    if (!isBrevoApiConfigured) {
        document.getElementById('brevo-error-display')?.scrollIntoView({ behavior: 'smooth' });
        return;
    }
    
    if (isProcessing) return;

    const recipientEmailsInput = window.prompt(
      "請輸入收件人 Email (若有多個，請用逗號 , 分隔):",
      "fuhyuan.w5339@msa.hinet.net"
    );

    if (!recipientEmailsInput) {
        return;
    }
    
    const recipients = recipientEmailsInput
      .split(',')
      .map(email => email.trim())
      .filter(email => email.length > 0);

    if (recipients.length === 0) {
      alert('請輸入至少一個有效的 Email 地址。');
      return;
    }

    if (!window.confirm(`確定要將此服務單傳送至以下信箱嗎？\n\n${recipients.join('\n')}`)) {
        return;
    }

    setIsProcessing(true);
    
    try {
        const blob = await generatePdfBlob();
        if (!blob) {
            alert('無法產生 PDF，郵件無法寄送。');
            return;
        }

        const base64Pdf = await blobToBase64(blob);
        const datePart = formData.dateTime.split('T')[0];
        const fileName = `工作服務單-${datePart}-${formData.serviceUnit || 'report'}.pdf`;
        
        const toPayload = recipients.map(email => ({ email }));

        const payload = {
            sender: { name: BREVO_SENDER_NAME, email: BREVO_SENDER_EMAIL },
            to: toPayload,
            subject: `${datePart}${formData.serviceUnit}的工作服務單`,
            htmlContent: getEmailHtmlContent(formData.serviceUnit, formData.dateTime),
            attachment: [{ content: base64Pdf, name: fileName }],
        };

        // 呼叫 Brevo 的 API 來寄送郵件
        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: { 'accept': 'application/json', 'api-key': BREVO_API_KEY!, 'content-type': 'application/json' },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Brevo API request failed');
        }
        
        alert(`✅ 郵件已成功寄送至：\n\n${recipients.join('\n')}`);

    } catch (error) {
        console.error("Brevo email sending failed:", error);
        alert(`郵件寄送失敗：${error instanceof Error ? error.message : '未知錯誤'}`);
    } finally {
        setIsProcessing(false);
    }
  }, [isProcessing, formData, generatePdfBlob, isBrevoApiConfigured]);


  // --- JSX 渲染 ---
  return (
    <div className="min-h-screen bg-slate-100">
        <div className="relative max-w-4xl mx-auto bg-white rounded-xl shadow-2xl ring-1 ring-black ring-opacity-5 overflow-hidden my-8 sm:my-12">
           {/* 右上角的版本號顯示 */}
           <span className="absolute top-4 right-6 text-xs font-mono text-slate-400 select-none" aria-label={`應用程式版本 ${APP_VERSION}`}>
              {APP_VERSION}
            </span>
           
           {/* 根據 isSubmitted 狀態，決定要渲染表單畫面還是報告預覽畫面 */}
           {isSubmitted ? (
             <ReportView 
                data={formData}
                onUploadPdf={handleUploadPdf}
                onSharePdf={handleSharePdf}
                onDownloadPdf={handleDownloadPdf}
                onReset={handleReset}
                onEdit={handleEdit}
                isProcessing={isProcessing}
              />
            ) : (
            <>
              {/* 如果 API 金鑰未設定，則顯示錯誤訊息 */}
              {!isGoogleApiConfigured && <ApiKeyErrorDisplay />}
              <div id="brevo-error-display">{!isBrevoApiConfigured && <BrevoApiKeyErrorDisplay />}</div>
              
              {/* 渲染主表單 */}
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
        
        {/* 暫存管理彈出視窗 */}
        <DraftActionModal isOpen={isModalOpen} action={modalAction} drafts={Object.keys(namedDrafts)} onClose={() => setIsModalOpen(false)} onConfirm={handleConfirmDraftAction} />

        {/* 正在處理時顯示的遮罩層 */}
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
