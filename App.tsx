

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
const API_KEY = "AIzaSyAfht6ocQcr3myRBRENVGyrxQuMRLmVFok";
const CLIENT_ID = "442400601776-j23oihd97u8s7j0uo8kflvh1h6s2nqdu.apps.googleusercontent.com";
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';
const SCOPES = 'https://www.googleapis.com/auth/drive.file';
// ------------------------------


// --- 全域設定參數 ---

// 這裡可以設定服務單內容的總行數限制，超過此限制將會觸發分頁
const TOTAL_CONTENT_LINES_LIMIT = 20; 
// 這裡可以設定「處理事項」與「處理情形」的總行數限制
const TASKS_STATUS_LIMIT = 18; 
// 這裡可以設定「產品項目」與「備註」的總行數限制
const PRODUCTS_REMARKS_LIMIT = 16; 
// 用於 localStorage 儲存暫存檔的鍵值，通常不需要修改
const NAMED_DRAFTS_STORAGE_KEY = 'workOrderNamedDrafts';
// 這裡可以設定最多允許儲存幾份暫存檔
const MAX_DRAFTS = 3;


const getFormattedDateTime = () => {
  const now = new Date();
  // 為了符合 <input type="datetime-local"> 的格式，需要調整時區
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
};

// 預設的產品項目結構
const initialProduct: ProductItem = {
    id: `product-${Date.now()}`,
    name: '', // 預設產品品名
    quantity: 1, // 預設產品數量
    serialNumbers: [''], // 預設一個空的序號欄位
};

// 全新表單的初始資料
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
// 將陣列分塊的函式，用於將照片分頁
const chunk = <T,>(arr: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(arr.length / size) }, (v, i) =>
    arr.slice(i * size, i * size + size)
  );

/**
 * 估算字串在 textarea 中會佔據的視覺行數
 * @param str 要測量的字串
 * @param avgCharsPerLine 每行平均字元數，可調整此數值來改變行數估算的靈敏度
 * @returns 估算的視覺行數
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
 * 遷移舊版資料格式至新版
 * @param data WorkOrderData
 * @returns 遷移完成的 WorkOrderData
 */
const migrateWorkOrderData = (data: any): WorkOrderData => {
    const migratedData = JSON.parse(JSON.stringify(data));
    if (migratedData.products && Array.isArray(migratedData.products)) {
        migratedData.products = migratedData.products.map((p: any) => {
            const product = {...p}; 
            const quantity = product.quantity || 1;

            // Handle legacy serialNumber (singular) field
            if (product.serialNumber !== undefined && product.serialNumbers === undefined) {
                product.serialNumbers = [product.serialNumber || ''];
                delete product.serialNumber;
            }
            
            // Ensure serialNumbers is an array
            if (!Array.isArray(product.serialNumbers)) {
                product.serialNumbers = [];
            }
            
            // Sync serialNumbers array length with quantity
            const currentLength = product.serialNumbers.length;
            if (currentLength < quantity) {
                product.serialNumbers.push(...Array(quantity - currentLength).fill(''));
            } else if (currentLength > quantity) {
                product.serialNumbers = product.serialNumbers.slice(0, quantity);
            }
            
            return product;
        });
    }
    return migratedData;
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
            rows={autoSize ? 1 : rows} // autoSize為true時，初始行數為1，否則使用傳入的rows
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


// --- 新增：互動式彈出視窗元件 ---
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

// 主要的表單元件
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
            {/* // 表單主標題，可在此修改 */}
            <h1 className="text-2xl font-bold text-slate-800">富元機電有限公司</h1>
            {/* // 表單副標題，可在此修改 */}
            <h2 className="text-xl font-semibold text-slate-600 mt-1">工作服務單</h2>
        </div>
        <div className="space-y-6">
            {/* // 各個表單欄位的標籤文字都可以在 label 屬性中修改 */}
            <FormField label="工作日期及時間" id="dateTime" type="datetime-local" value={formData.dateTime} onChange={onInputChange} required />
            <FormField label="服務單位" id="serviceUnit" value={formData.serviceUnit} onChange={onInputChange} required />
            <FormField label="接洽人" id="contactPerson" value={formData.contactPerson} onChange={onInputChange} />
            <FormField label="連絡電話" id="contactPhone" type="tel" value={formData.contactPhone} onChange={onInputChange} />
            {/* // cornerHint 是右上角的提示文字 */}
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
                                {/* // 產品數量的下拉選單範圍，這裡設定為 1 到 20 */}
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
                                            // 序號輸入框的提示文字
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
                    {/* // "新增項目"按鈕文字 */}
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
                        {/* // "另存新檔"按鈕文字 */}
                        另存新檔
                    </button>
                    <button
                        type="button"
                        onClick={onClearData}
                        className="flex-1 sm:w-auto px-4 py-2 border border-red-600 text-red-600 rounded-md shadow-sm text-base font-medium hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                    >
                        {/* // "清除資料"按鈕文字 */}
                        清除資料
                    </button>
                </div>
                <button
                    type="submit"
                    className="w-full sm:w-auto px-6 py-3 border border-transparent rounded-md shadow-sm text-base font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                    {/* // "產生服務單報告"按鈕文字 */}
                    產生服務單報告
                </button>
            </div>
        </div>
    </form>
)};


// --- 報告相關元件 ---

// PDF 頁尾元件
const PdfFooter: React.FC<{ currentPage?: number; totalPages?: number; }> = ({ currentPage, totalPages }) => (
    <div className="flex-shrink-0 flex justify-between items-center text-xs text-slate-500 border-t border-slate-200 pt-2 mt-auto">
      {/* // PDF 頁尾左側的文字，可在此修改 */}
      <span>本表單(V1.1)由富元機電有限公司提供,電話(02)2697-5163 傳真(02)2697-5339</span>
      {totalPages && currentPage && (
        // 頁碼的字體大小，可在此修改。常用尺寸: text-xs, text-sm, text-base, text-lg
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

// 報告排版元件
const ReportLayout: React.FC<ReportLayoutProps> = ({ data, mode, currentPage, totalPages }) => {
  const isPdf = mode.startsWith('pdf');
  const formattedDateTime = data.dateTime ? new Date(data.dateTime).toLocaleString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'N/A';
  const hasProducts = data.products && data.products.filter(p => p.name.trim() !== '').length > 0;
  // 決定是否顯示經理核可欄位，目前設定為第二頁不顯示
  const showManagerApproval = mode !== 'pdf-page2';

  const showMainHeaderAndCustomerInfo = mode === 'screen' || mode === 'pdf-full' || mode === 'pdf-page1' || mode === 'pdf-page2';
  const showTasksAndStatus = mode === 'screen' || mode === 'pdf-full' || mode === 'pdf-page1';
  const showProductsAndRemarks = mode === 'screen' || mode === 'pdf-full' || mode === 'pdf-page2';
  const showSignatures = true;

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
        fontFamily: "'Helvetica Neue', 'Arial', 'sans-serif'" // PDF 使用的字體
      }}
    >
      {/* 報告標頭 */}
      {showMainHeaderAndCustomerInfo && (
        <>
          <div className="text-center mb-10 flex-shrink-0">
            {/* // 報告主標題 */}
            <h1 className="text-3xl font-bold text-gray-800">富元機電有限公司</h1>
            <h2 className="text-2xl font-semibold text-gray-600 mt-2">
              {/* // 報告副標題 */}
              工作服務單
              {/* // 第二頁的特殊標題後綴 */}
              {mode === 'pdf-page2' && ' (產品項目與備註)'}
            </h2>
          </div>

          <div className="grid grid-cols-12 gap-x-6 gap-y-4">
            {/* // 報告中各欄位的標籤文字 */}
            <div className="col-span-12"><strong>工作日期及時間：</strong>{formattedDateTime}</div>
            <div className="col-span-7"><strong>服務單位：</strong>{data.serviceUnit || 'N/A'}</div>
            <div className="col-span-5"><strong>接洽人：</strong>{data.contactPerson || 'N/A'}</div>
            <div className="col-span-12"><strong>連絡電話：</strong>{data.contactPhone || 'N/A'}</div>
          </div>
        </>
      )}

      {/* 報告主體 */}
      <div className="flex-grow text-base text-gray-800 space-y-5 pt-5">
        {showTasksAndStatus && (
          <>
            <div>
              <strong className="text-base">處理事項：</strong>
              {/* // 處理事項的最小高度，可在此修改 'min-h-[9rem]' */}
              <div className="mt-1 p-3 border border-slate-200 rounded-md bg-slate-50 whitespace-pre-wrap w-full min-h-[9rem]">{data.tasks || '\u00A0'}</div>
            </div>
            <div>
              <strong className="text-base">處理情形：</strong>
              {/* // 處理情形的最小高度，可在此修改 'min-h-[9rem]' */}
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
                    {/* // 產品表格的欄位標題 */}
                    <th scope="col" className="px-3 py-2 text-left font-medium text-slate-600">產品品名</th>
                    <th scope="col" className="px-3 py-2 text-left font-medium text-slate-600">數量</th>
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

                            if (serials.length === 0) {
                              return 'N/A'; // 如果沒有序號，顯示的文字
                            }

                            return (
                              <div className="flex flex-col">
                                {serials.map((s, idx) => (
                                  <React.Fragment key={idx}>
                                    {/* // 序號之間的分隔線與間距，可修改 my-1 (margin-top/bottom) */}
                                    {idx > 0 && <div className="border-t border-slate-200 my-1"></div>}
                                    {/* // 序號前的編號格式 */}
                                    <span>{`#${idx + 1}: ${s}`}</span>
                                  </React.Fragment>
                                ))}
                              </div>
                            );
                          })()}
                        </td>
                      </tr>
                    ))
                  ) : ( // 如果沒有任何產品，預設顯示一筆空白列
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
            {/* // 備註欄位的最小高度，可在此修改 'min-h-[3rem]' */}
            <div className="mt-1 p-3 border border-slate-200 rounded-md bg-slate-50 whitespace-pre-wrap w-full min-h-[3rem]">{data.remarks || '\u00A0'}</div>
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

      {/* 簽名區 & 頁尾 */}
      {showSignatures && (
         <div className="pt-12 mt-auto">
            {/* // 簽名區的排版，三欄或兩欄 */}
            <div className={`grid ${showManagerApproval ? 'grid-cols-3' : 'grid-cols-2'} gap-x-8 text-base`}>
                {showManagerApproval && (
                  <div className="text-center">
                      <strong>經理核可：</strong>
                      {/* // 簽名框的最小高度，可在此修改 'min-h-[100px]' */}
                      <div className="mt-2 p-2 border border-slate-300 rounded-lg bg-slate-50 w-full min-h-[100px] flex items-center justify-center">
                          {/* 留白供手寫簽名 */}
                      </div>
                  </div>
                )}
                <div className="text-center">
                    <strong>服務人員簽認：</strong>
                    <div className="mt-2 p-2 border border-slate-300 rounded-lg bg-slate-50 w-full min-h-[100px] flex items-center justify-center">
                    {data.technicianSignature ? (
                        <img src={data.technicianSignature} alt="服務人員簽名" className="h-20 w-auto" />
                    ) : <span className="text-slate-400">未簽名</span>}
                    </div>
                </div>
                <div className="text-center">
                    <strong>客戶簽認：</strong>
                    <div className="mt-2 p-2 border border-slate-300 rounded-lg bg-slate-50 w-full min-h-[100px] flex items-center justify-center">
                    {data.signature ? (
                        <img src={data.signature} alt="客戶簽名" className="h-20 w-auto" />
                    ) : <span className="text-slate-400">未簽名</span>}
                    </div>
                </div>
            </div>
            {isPdf && <PdfFooter currentPage={currentPage} totalPages={totalPages} />}
         </div>
      )}
    </div>
  );
};

// 照片頁元件
const PdfPhotoPage = ({ photos, pageNumber, totalPhotoPages, data, textPageCount, pdfTotalPages }: { photos: string[], pageNumber:number, totalPhotoPages: number, data: WorkOrderData, textPageCount: number, pdfTotalPages: number }) => {
    const formattedDate = data.dateTime ? new Date(data.dateTime).toLocaleDateString('zh-TW') : 'N/A';
    // 照片頁的標題格式
    const pageTitle = totalPhotoPages > 1
        ? `施工照片 (第 ${pageNumber} / ${totalPhotoPages} 頁) - ${data.serviceUnit} (${formattedDate})`
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
            <PdfFooter currentPage={textPageCount + pageNumber} totalPages={pdfTotalPages} />
        </div>
    );
};

// 報告預覽畫面元件
interface ReportViewProps {
    data: WorkOrderData;
    onDownloadPdf: () => void;
    onSharePdf: () => void;
    onReset: () => void;
    onEdit: () => void;
    isGeneratingPdf: boolean;
}

const ReportView: React.FC<ReportViewProps> = ({ data, onDownloadPdf, onSharePdf, onReset, onEdit, isGeneratingPdf }) => {
    // 照片分頁，每頁 4 張，可在此修改
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
      {/* 隱藏的 PDF 渲染區 */}
      <div className="pdf-render-container">
        {totalContentLines > TOTAL_CONTENT_LINES_LIMIT ? (
            <>
              <ReportLayout data={data} mode="pdf-page1" currentPage={1} totalPages={totalPages} />
              <ReportLayout data={data} mode="pdf-page2" currentPage={2} totalPages={totalPages} />
            </>
        ) : (
            <ReportLayout data={data} mode="pdf-full" currentPage={1} totalPages={totalPages} />
        )}

        {photoChunks.map((photoChunk, index) => (
            <PdfPhotoPage
                key={index}
                photos={photoChunk}
                pageNumber={index + 1}
                totalPhotoPages={photoChunks.length}
                data={data}
                textPageCount={textPages}
                pdfTotalPages={totalPages}
            />
        ))}
      </div>
      
      {/* 畫面上可見的報告預覽 */}
      <div className="p-4 sm:p-6 bg-slate-50/50 overflow-x-auto">
        <div className="w-full max-w-[800px] mx-auto origin-top">
            <div className="shadow-lg">
                <ReportLayout data={data} mode="screen" />
            </div>
        </div>
      </div>

      {/* 操作按鈕 */}
      <div className="p-4 sm:p-6 bg-slate-50 border-t border-slate-200 flex flex-wrap gap-3 justify-between items-center">
            {/* // 報告頁面的按鈕文字，可在此修改 */}
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

// --- 主應用程式元件 ---

export const App: React.FC = () => {
  const [formData, setFormData] = useState<WorkOrderData>(initialFormData);
  const [namedDrafts, setNamedDrafts] = useState<{ [name: string]: WorkOrderData }>({});
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  
  // Google API state
  const [gapiReady, setGapiReady] = useState(false);
  const [gisReady, setGisReady] = useState(false);
  const [tokenClient, setTokenClient] = useState<any>(null);
  const pickerApiLoaded = useRef(false);
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalAction, setModalAction] = useState<'delete' | 'export' | null>(null);

  // --- Google API Initialization ---
  useEffect(() => {
    // Load GAPI for Drive API
    const gapiScript = document.createElement('script');
    gapiScript.src = 'https://apis.google.com/js/api.js';
    gapiScript.async = true;
    gapiScript.defer = true;
    gapiScript.onload = () => {
        gapi.load('client', async () => {
            await gapi.client.init({
                apiKey: API_KEY,
                discoveryDocs: [DISCOVERY_DOC],
            });
            setGapiReady(true);
        });
    };
    document.body.appendChild(gapiScript);

    // Load GIS for OAuth2
    const gisScript = document.createElement('script');
    gisScript.src = 'https://accounts.google.com/gsi/client';
    gisScript.async = true;
    gisScript.defer = true;
    gisScript.onload = () => {
        const client = google.accounts.oauth2.initTokenClient({
            client_id: CLIENT_ID,
            scope: SCOPES,
            callback: '', // Callback is handled by the promise
        });
        setTokenClient(client);
        setGisReady(true);
    };
    document.body.appendChild(gisScript);
    
    return () => {
        document.body.removeChild(gapiScript);
        document.body.removeChild(gisScript);
    };

  }, []);

  useEffect(() => {
    // 應用程式載入時的提示訊息
    alert("請記得使用chrome.Edge.Firefox等瀏覽器開啟,避免無法產出PDF,謝謝!");

    try {
        const savedDrafts = localStorage.getItem(NAMED_DRAFTS_STORAGE_KEY);
        if (savedDrafts) {
            setNamedDrafts(JSON.parse(savedDrafts));
        }
    } catch (error) {
        console.error("Failed to load named drafts from localStorage.", error);
    }
  }, []);

  const clearCurrentForm = useCallback(() => {
    setFormData({
        ...initialFormData,
        products: [{
            id: `product-${Date.now()}`,
            name: '',
            quantity: 1,
            serialNumbers: [''],
        }],
        dateTime: getFormattedDateTime()
    });
  }, []);


  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    
    const tempState = {...formData, [name]: value};

    if (name === 'tasks' || name === 'status') {
        const totalLines = calculateVisualLines(tempState.tasks) + calculateVisualLines(tempState.status);
        if (totalLines > TASKS_STATUS_LIMIT) {
            // 超出限制時的提示，若不想提示可註解掉
            // alert('「處理事項」與「處理情形」總行數已達上限。');
            return; 
        }
    }
    
    if (name === 'remarks') {
        const totalLines = formData.products.reduce((acc, p) => acc + p.quantity, 0) + calculateVisualLines(tempState.remarks);
        if (totalLines > PRODUCTS_REMARKS_LIMIT) {
             // 超出限制時的提示，若不想提示可註解掉
            // alert('「產品項目」與「備註」總行數已達上限。');
            return; 
        }
    }

    setFormData(tempState);
  }, [formData]);
  
  const handleProductChange = (index: number, field: 'name' | 'quantity', value: string | number) => {
    setFormData(prev => {
        if (field === 'quantity') {
            const newQuantity = Number(value);
            const remarksLines = calculateVisualLines(prev.remarks);
            const otherProductsLines = prev.products.reduce((acc, p, i) => i === index ? acc : acc + p.quantity, 0);
            if (otherProductsLines + newQuantity + remarksLines > PRODUCTS_REMARKS_LIMIT) {
                // 增加數量超出限制時的提示文字
                alert(`已達產品與備註的總行數上限 (${PRODUCTS_REMARKS_LIMIT})，無法增加數量。`);
                return prev;
            }
        }

        const newProducts = JSON.parse(JSON.stringify(prev.products));
        const productToUpdate = newProducts[index];

        if (field === 'quantity') {
            const newQuantity = Number(value);
            const oldQuantity = productToUpdate.quantity;
            productToUpdate.quantity = newQuantity;

            const currentSerialNumbers = productToUpdate.serialNumbers || [];
            if (newQuantity > oldQuantity) {
                productToUpdate.serialNumbers = [
                    ...currentSerialNumbers,
                    ...Array(newQuantity - oldQuantity).fill('')
                ];
            } else if (newQuantity < oldQuantity) {
                productToUpdate.serialNumbers = currentSerialNumbers.slice(0, newQuantity);
            }
        } else {
            productToUpdate[field] = value;
        }
        
        return { ...prev, products: newProducts };
    });
  };
  
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

  const handleAddProduct = () => {
    const totalLines = formData.products.reduce((acc, p) => acc + p.quantity, 0) + 1 + calculateVisualLines(formData.remarks);
    if (totalLines > PRODUCTS_REMARKS_LIMIT) {
        // 新增產品超出限制時的提示文字
        alert(`已達產品與備註的總行數上限 (${PRODUCTS_REMARKS_LIMIT})，無法新增產品。`);
        return;
    }
    const newProduct: ProductItem = {
      id: `product-${Date.now()}`,
      name: '',
      quantity: 1,
      serialNumbers: [''],
    };
    setFormData(prev => ({ ...prev, products: [...prev.products, newProduct] }));
  };

  const handleRemoveProduct = (index: number) => {
    if (formData.products.length <= 1) return;
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
  
  const handleReset = useCallback(() => {
    // 建立新服務單的確認提示文字
    if (window.confirm("您確定要清除所有資料並建立新的服務單嗎？")) {
        clearCurrentForm();
        setIsSubmitted(false);
    }
  }, [clearCurrentForm]);

  const handleSaveAsDraft = useCallback(() => {
    // 儲存暫存時的提示文字
    const draftName = prompt("請為此暫存命名：");
    if (!draftName) {
        return;
    }

    const currentDrafts = { ...namedDrafts };
    const isOverwriting = !!currentDrafts[draftName];

    if (!isOverwriting && Object.keys(currentDrafts).length >= MAX_DRAFTS) {
        // 達到暫存上限時的提示文字
        alert(`無法儲存新暫存，已達儲存上限 (${MAX_DRAFTS}份)。\n請先從「載入/管理暫存」中刪除一個舊暫存。`);
        return;
    }

    if (isOverwriting && !window.confirm(`暫存 "${draftName}" 已存在。您要覆蓋它嗎？`)) {
        return;
    }

    const newDrafts = { ...currentDrafts, [draftName]: formData };
    setNamedDrafts(newDrafts);
    localStorage.setItem(NAMED_DRAFTS_STORAGE_KEY, JSON.stringify(newDrafts));
    // 儲存成功後的提示文字
    alert(
`✅ 暫存 "${draftName}" 已成功儲存！

---
重要提醒：
暫存資料如用戶清理瀏覽器cookie暫存,資料將消失無法復原,請注意!`
    );
  }, [formData, namedDrafts]);

  const handleLoadDraft = useCallback((name: string) => {
    if (namedDrafts[name]) {
        // 載入暫存時的確認提示文字
        if (window.confirm(`您確定要載入暫存 "${name}" 嗎？\n這將會覆蓋目前表單的所有內容。`)) {
            const draftData = migrateWorkOrderData(namedDrafts[name]);
            setFormData(draftData);
            // 載入成功後的提示文字
            alert(`暫存 "${name}" 已載入。`);
        }
    }
  }, [namedDrafts]);


  const handleClearData = useCallback(() => {
    // 清除表單資料的確認提示文字
    if (window.confirm("您確定要清除目前表單的所有欄位嗎？\n此操作不會影響任何已儲存的暫存。")) {
        clearCurrentForm();
        // 清除成功後的提示文字
        alert('目前的表單資料已清除。');
    }
  }, [clearCurrentForm]);
  
  // --- Google Drive Handlers ---
  const getAuthToken = useCallback(() => {
    return new Promise((resolve, reject) => {
        if (!tokenClient) {
            reject(new Error("Google Auth client is not ready."));
            return;
        }
        
        tokenClient.callback = (resp: any) => {
            if (resp.error !== undefined) {
                reject(resp);
            }
            resolve(resp);
        };
        
        if (gapi.client.getToken() === null) {
            tokenClient.requestAccessToken({ prompt: 'consent' });
        } else {
            tokenClient.requestAccessToken({ prompt: '' });
        }
    });
  }, [tokenClient]);
  
  const handleOpenDraftActionModal = useCallback((action: 'delete' | 'export') => {
    const draftNames = Object.keys(namedDrafts);
    if (draftNames.length === 0) {
      alert(action === 'delete' ? "目前沒有已儲存的暫存可以刪除。" : "目前沒有本機暫存可以匯出。請先「另存新檔」。");
      return;
    }
    setModalAction(action);
    setIsModalOpen(true);
  }, [namedDrafts]);
  
  const handleDeleteDraft = useCallback(() => {
    handleOpenDraftActionModal('delete');
  }, [handleOpenDraftActionModal]);
  
  const handleExportToDrive = useCallback(() => {
    handleOpenDraftActionModal('export');
  }, [handleOpenDraftActionModal]);

  const performExportToDrive = useCallback(async (nameToExport: string) => {
    if (!gapiReady || !gisReady || !namedDrafts[nameToExport]) {
        alert("匯出功能未就緒或找不到暫存檔。");
        return;
    }
    
    try {
        await getAuthToken();
        
        const { photos, signature, technicianSignature, ...dataToExport } = namedDrafts[nameToExport];
        const fileContent = JSON.stringify(dataToExport, null, 2);
        const blob = new Blob([fileContent], { type: 'application/json' });
        const fileName = `富元工作服務單-${nameToExport}.json`;

        const metadata = {
            'name': fileName,
            'mimeType': 'application/json',
            'parents': ['root']
        };

        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', blob);

        const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
            method: 'POST',
            headers: new Headers({ 'Authorization': 'Bearer ' + gapi.client.getToken().access_token }),
            body: form,
        });

        if (res.ok) {
            alert(`暫存 "${nameToExport}" 已成功匯出至您的 Google 雲端硬碟！`);
        } else {
            const errorBody = await res.json();
            console.error("Google Drive API Error:", errorBody);
            alert(`匯出失敗：${errorBody.error?.message || res.statusText}`);
        }

    } catch (error) {
        console.error("Google Drive export failed", error);
        alert("匯出至 Google Drive 失敗。請檢查主控台中的錯誤訊息。");
    }
  }, [gapiReady, gisReady, namedDrafts, getAuthToken]);

  const handleConfirmDraftAction = (draftName: string) => {
    if (modalAction === 'delete') {
      if (namedDrafts[draftName]) {
        if (window.confirm(`您確定要永久刪除暫存 "${draftName}" 嗎？此操作無法復原。`)) {
            const newDrafts = { ...namedDrafts };
            delete newDrafts[draftName];
            setNamedDrafts(newDrafts);
            localStorage.setItem(NAMED_DRAFTS_STORAGE_KEY, JSON.stringify(newDrafts));
            alert(`暫存 "${draftName}" 已被刪除。`);
        }
      } else {
        alert(`找不到名為 "${draftName}" 的暫存。`);
      }
    } else if (modalAction === 'export') {
      performExportToDrive(draftName);
    }
    setIsModalOpen(false);
    setModalAction(null);
  };

  const handleImportFromDrive = useCallback(async () => {
    if (!gapiReady || !gisReady) {
        alert("Google Drive 功能正在初始化，請稍候再試。");
        return;
    }

    try {
        await getAuthToken();

        if (!pickerApiLoaded.current) {
            await new Promise<void>((resolve, reject) => {
                gapi.load('picker', (err: any) => {
                  if (err) { reject(err); } 
                  else {
                    pickerApiLoaded.current = true;
                    resolve()
                  }
                })
            });
        }

        const view = new google.picker.View(google.picker.ViewId.DOCS);
        view.setMimeTypes("application/json");

        const picker = new google.picker.PickerBuilder()
            .enableFeature(google.picker.Feature.NAV_HIDDEN)
            .setAppId(CLIENT_ID.split('-')[0])
            .setOAuthToken(gapi.client.getToken().access_token)
            .addView(view)
            .setDeveloperKey(API_KEY)
            .setCallback((data: any) => {
                if (data[google.picker.Action.PICKED]) {
                    const fileId = data[google.picker.Response.DOCUMENTS][0][google.picker.Document.ID];
                    gapi.client.drive.files.get({
                        fileId: fileId,
                        alt: 'media'
                    }).then((res: any) => {
                        if (window.confirm("您確定要從雲端硬碟載入此檔案嗎？\n這將會覆蓋目前表單的所有內容。")) {
                           try {
                                const importedData = migrateWorkOrderData(res.result);
                                setFormData(importedData);
                                alert(`檔案已成功從雲端硬碟匯入。`);
                           } catch (parseError) {
                               console.error("Error processing imported data:", parseError);
                               alert("匯入失敗：檔案內容可能已損毀或格式不符。");
                           }
                        }
                    }, (err: any) => {
                        console.error("Error fetching file content from Drive:", err);
                        alert(`從雲端硬碟讀取檔案失敗。請確認您有此檔案的讀取權限，或檢查主控台的錯誤訊息。\n\n錯誤: ${err.result?.error?.message || '未知錯誤'}`);
                    });
                }
            })
            .build();
        picker.setVisible(true);

    } catch (error) {
        console.error("Google Drive import failed", error);
        const errorMessage = (error instanceof Error) ? error.message : "未知錯誤";
        alert(`從 Google Drive 匯入失敗。請檢查主控台中的錯誤訊息。\n錯誤: ${errorMessage}`);
    }
  }, [gapiReady, gisReady, getAuthToken]);


  // --- PDF Generation and Sharing ---
  const generatePdfBlob = async (): Promise<Blob | null> => {
    try {
      const { jsPDF: JSPDF } = (window as any).jspdf;
      // PDF 設定: 'p' 直向, 'mm' 單位, 'a4' 尺寸
      const pdf = new JSPDF('p', 'mm', 'a4');
      const pdfWidth = 210;
      const pdfHeight = 297;
      const options = {
          scale: 2, // 提高解析度，可設為 1.5, 2, 3 等
          useCORS: true,
          backgroundColor: '#ffffff', // 背景色
      };
      const imageType = 'image/jpeg'; // 圖片格式
      const imageQuality = 0.92; // 圖片品質 (0 to 1)
      let pageCount = 0;

      const tasksLines = calculateVisualLines(formData.tasks);
      const statusLines = calculateVisualLines(formData.status);
      const productsLines = formData.products.filter(p => p.name.trim() !== '').length;
      const remarksLines = calculateVisualLines(formData.remarks);
      const totalContentLines = tasksLines + statusLines + productsLines + remarksLines;

      if (totalContentLines > TOTAL_CONTENT_LINES_LIMIT) {
        // --- 多頁邏輯 ---
        const page1Element = document.getElementById('pdf-pdf-page1');
        const page2Element = document.getElementById('pdf-pdf-page2');
        if (!page1Element || !page2Element) throw new Error('Split page elements not found');
        
        const canvas1 = await html2canvas(page1Element, options);
        pdf.addImage(canvas1.toDataURL(imageType, imageQuality), 'JPEG', 0, 0, pdfWidth, pdfHeight);
        pageCount++;

        pdf.addPage();
        const canvas2 = await html2canvas(page2Element, options);
        pdf.addImage(canvas2.toDataURL(imageType, imageQuality), 'JPEG', 0, 0, pdfWidth, pdfHeight);
        pageCount++;

      } else {
        // --- 單頁邏輯 ---
        const fullElement = document.getElementById('pdf-pdf-full');
        if (!fullElement) throw new Error('Full report element not found for rendering');
        
        const fullCanvas = await html2canvas(fullElement, options);
        const fullImgProps = pdf.getImageProperties(fullCanvas.toDataURL(imageType, imageQuality));
        const fullHeight = Math.min(pdfHeight, (fullImgProps.height * pdfWidth) / fullImgProps.width);
        pdf.addImage(fullCanvas.toDataURL(imageType, imageQuality), 'JPEG', 0, 0, pdfWidth, fullHeight);
        pageCount++;
      }
      
      // --- 新增照片頁 ---
      if (formData.photos.length > 0) {
        const photoChunks = chunk(formData.photos, 4); // 每頁 4 張照片
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
      // PDF 產生失敗時的提示文字
      alert("無法產生PDF，可能是內容過於複雜。請檢查主控台中的錯誤訊息。");
      return null;
    }
  };
  
  const handleDownloadPdf = async () => {
    if (isGeneratingPdf) return;
    setIsGeneratingPdf(true);

    const blob = await generatePdfBlob();
    if (blob) {
        // 下載的 PDF 檔案名稱格式
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

    // 分享時的 PDF 檔案名稱格式
    const fileName = `工作服務單-${formData.serviceUnit || 'report'}-${new Date().toISOString().split('T')[0]}.pdf`;
    const file = new File([blob], fileName, { type: 'application/pdf' });
    const shareData = {
      files: [file],
      title: `工作服務單 - ${formData.serviceUnit}`, // 分享時的標題
      text: `請查收 ${formData.serviceUnit} 的工作服務單。`, // 分享時的內文
    };
    
    if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
      try {
        await navigator.share(shareData);
      } catch (error) {
        const abortError = error as DOMException;
        if (abortError.name !== 'AbortError') {
            console.error('Error sharing PDF:', error);
            alert('分享失敗，請稍後再試。'); // 分享失敗的提示
        }
      }
    } else {
      // 瀏覽器不支援分享時的提示
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
                onProductSerialNumberChange={handleProductSerialNumberChange}
                onAddProduct={handleAddProduct}
                onRemoveProduct={handleRemoveProduct}
                onPhotosChange={handlePhotosChange}
                onTechnicianSignatureSave={handleTechnicianSignatureSave}
                onTechnicianSignatureClear={handleTechnicianSignatureClear}
                onCustomerSignatureSave={handleCustomerSignatureSave}
                onCustomerSignatureClear={handleCustomerSignatureClear}
                onSubmit={handleSubmit}
                onSaveAsDraft={handleSaveAsDraft}
                onLoadDraft={handleLoadDraft}
                onDeleteDraft={handleDeleteDraft}
                onClearData={handleClearData}
                onImportFromDrive={handleImportFromDrive}
                onExportToDrive={handleExportToDrive}
                namedDrafts={namedDrafts}
             />
            )}
        </div>
        
        <DraftActionModal
          isOpen={isModalOpen}
          action={modalAction}
          drafts={Object.keys(namedDrafts)}
          onClose={() => setIsModalOpen(false)}
          onConfirm={handleConfirmDraftAction}
        />

        {isGeneratingPdf && (
            <div className="fixed inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-50">
              <div className="text-center">
                {/* // 正在產生 PDF 時的提示文字 */}
                <p className="text-lg font-semibold text-slate-700">正在處理 PDF...</p>
                <p className="text-sm text-slate-500">請稍候</p>
              </div>
            </div>
        )}
    </div>
  );
};
