
import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { WorkOrderData, ProductItem } from './types';
import SignaturePad from './components/SignaturePad';
import ImageUploader from './components/ImageUploader';

// --- 全域型別宣告 ---
declare const jsPDF: any;
declare const html2canvas: any;
declare const gapi: any;
declare const google: any;

// --- 版本號統一來源 ---
const rawVersion = process.env.APP_VERSION || '1.6.0'; 
const APP_VERSION = `V${rawVersion.split('.').slice(0, 2).join('.')}`;

// --- API 設定 ---
const DROPBOX_ACCESS_TOKEN = process.env.DROPBOX_ACCESS_TOKEN;
const API_KEY = process.env.GOOGLE_API_KEY;
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';
const SCOPES = 'https://www.googleapis.com/auth/drive.file';
const GOOGLE_AUTH_GRANTED_KEY = 'googleAuthGranted';
const BREVO_API_KEY = process.env.BREVO_API_KEY;
const BREVO_SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL;
const BREVO_SENDER_NAME = process.env.BREVO_SENDER_NAME;

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
    return manualLines.reduce((acc, line) => acc + Math.max(1, Math.ceil(line.length / avgCharsPerLine)), 0);
};

const migrateWorkOrderData = (data: any): WorkOrderData => {
    const sanitizedData = { ...initialFormData, ...data };
    if (!Array.isArray(sanitizedData.products) || sanitizedData.products.length === 0) {
        sanitizedData.products = [{...initialProduct}];
    }
    sanitizedData.products = sanitizedData.products.map((p: any) => {
        if (typeof p !== 'object' || p === null) return { ...initialProduct, id: `product-${Date.now()}` };
        const product = { ...initialProduct, ...p }; 
        const quantity = Number(product.quantity) || 1;
        product.quantity = quantity;
        if (!Array.isArray(product.serialNumbers)) product.serialNumbers = Array(quantity).fill('');
        else {
            const currentLength = product.serialNumbers.length;
            if (currentLength < quantity) product.serialNumbers.push(...Array(quantity - currentLength).fill(''));
            else if (currentLength > quantity) product.serialNumbers = product.serialNumbers.slice(0, quantity);
        }
        return product;
    });
    const stringKeys: (keyof WorkOrderData)[] = ['dateTime', 'serviceUnit', 'contactPerson', 'contactPhone', 'tasks', 'status', 'remarks'];
    stringKeys.forEach(key => { if (typeof sanitizedData[key] !== 'string') sanitizedData[key] = ''; });
    sanitizedData.photos = Array.isArray(sanitizedData.photos) ? sanitizedData.photos : [];
    sanitizedData.signature = typeof sanitizedData.signature === 'string' ? sanitizedData.signature : null;
    sanitizedData.technicianSignature = typeof sanitizedData.technicianSignature === 'string' ? sanitizedData.technicianSignature : null;
    return sanitizedData as WorkOrderData;
};

const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
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

const FormField: React.FC<FormFieldProps> = ({ label, id, value, onChange, type = 'text', required = false, rows = 3, autoSize = false, cornerHint, }) => {
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
          <textarea ref={textareaRef} id={id} name={id} rows={autoSize ? 1 : rows} value={value} onChange={onChange} required={required} className="appearance-none block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm placeholder-slate-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" style={autoSize ? { overflowY: 'hidden', resize: 'none' } : {}} />
        ) : (
          <input id={id} name={id} type={type} value={value} onChange={onChange} required={required} className="appearance-none block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm placeholder-slate-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" />
        )}
      </div>
    </div>
  );
};

// --- 圖示元件 ---
const PlusIcon: React.FC<{ className?: string }> = ({ className }) => ( <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg> );
const TrashIcon: React.FC<{ className?: string }> = ({ className }) => ( <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg> );
const CloudArrowUpIcon: React.FC<{ className?: string }> = ({ className }) => ( <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l-3.75 3.75M12 9.75l3.75 3.75M17.25 12c0 2.899-2.351 5.25-5.25 5.25S6.75 14.899 6.75 12 9.101 6.75 12 6.75s5.25 2.351 5.25 5.25z" /></svg> );
const Cog6ToothIcon: React.FC<{ className?: string }> = ({ className }) => ( <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-1.007 1.11-1.226.55-.22 1.156-.22 1.706 0 .55.22 1.02.684 1.11 1.226l.082.499a.95.95 0 00.994.819c.595-.024 1.162.23 1.506.639.344.408.51.956.464 1.49l-.044.274c-.066.417.042.85.327 1.157.285.308.704.453 1.116.397.512-.07.996.174 1.32.57C21.056 9.31 21.2 9.8 21.2 10.337v3.326c0 .537-.144 1.027-.42 1.428-.276.402-.75.643-1.26.576-.413-.057-.83.09-1.116.398-.285.307-.393.74-.328 1.157l.044.273c.046.537-.12 1.082-.464 1.49-.344.41-.91.664-1.506.64l-.994-.04a.95.95 0 00-.994.818l-.082.499c-.09.542-.56 1.007-1.11 1.226-.55.22-1.156.22-1.706 0-.55-.22-1.02-.684-1.11-1.226l-.082-.499a.95.95 0 00-.994-.819c-.595.024-1.162-.23-1.506-.639-.344-.408-.51-.956-.464-1.49l.044-.274c.066-.417-.042-.85-.327-1.157-.285-.308-.704-.453-1.116-.397-.512.07-.996.174-1.32-.57C2.944 15.09 2.8 14.6 2.8 14.063v-3.326c0-.537.144-1.027.42-1.428.276-.402.75-.643 1.26-.576.413.057.83-.09 1.116-.398.285-.307.393-.74.328-1.157l-.044-.273c-.046-.537.12-1.082.464-1.49.344-.41.91-.664-1.506-.64l.994.04c.33.028.65.12.943.284.294.164.55.393.756.67l.082.499z" /><path strokeLinecap="round" strokeLinejoin="round" d="M12 15a3 3 0 100-6 3 3 0 000 6z" /></svg> );

// --- 統一彈出視窗元件 (New Unified Modal System) ---
interface ModalState {
  isOpen: boolean;
  title: string;
  content: React.ReactNode;
  onConfirm?: () => void;
  confirmText?: string;
  confirmClass?: string;
  onClose?: () => void;
  isProcessing?: boolean;
  backgroundIcon?: React.ReactNode;
}

const initialModalState: ModalState = {
  isOpen: false,
  title: '',
  content: null,
};

const CustomModal: React.FC<ModalState> = ({ isOpen, title, content, onConfirm, confirmText, confirmClass, onClose, isProcessing, backgroundIcon }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-sm sm:max-w-md transform transition-all overflow-hidden border border-slate-200/50">
        {backgroundIcon && <div className="absolute inset-0 flex items-center justify-center opacity-10 pointer-events-none">{backgroundIcon}</div>}
        <div className="relative z-10">
          <div className="p-6">
            <h3 id="modal-title" className="text-lg font-semibold leading-6 text-gray-900">{title}</h3>
            <div className="mt-4 text-sm text-gray-600">{content}</div>
          </div>
          <div className="bg-gray-50/70 backdrop-blur-sm px-6 py-4 flex flex-row-reverse gap-3 border-t border-slate-200">
            {onConfirm && (
              <button
                type="button"
                onClick={onConfirm}
                disabled={isProcessing}
                className={`inline-flex justify-center px-4 py-2 text-sm font-medium text-white border border-transparent rounded-md shadow-sm ${confirmClass || 'bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500'} disabled:opacity-50`}
              >
                {isProcessing ? '處理中...' : (confirmText || '確認')}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              disabled={isProcessing}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              {onConfirm ? '取消' : '關閉'}
            </button>
          </div>
        </div>
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
      <span>{`本表單(${APP_VERSION})由富元機電有限公司提供,電話(02)2697-5163 傳真(02)2697-5339`}</span>
      {totalPages && currentPage && (<span className="font-mono text-base">{`${currentPage} / ${totalPages}`}</span>)}
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
  const showTasksAndStatus = mode === 'screen' || mode === 'pdf-full' || mode === 'pdf-page1';
  const showProductsAndRemarks = mode === 'screen' || mode === 'pdf-full' || mode === 'pdf-page2';

  return (
    <div id={isPdf ? `pdf-${mode}` : undefined} className="p-8 bg-white" style={{ width: isPdf ? '210mm' : '100%', minHeight: isPdf ? '297mm' : 'auto', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', fontFamily: "'Helvetica Neue', 'Arial', 'sans-serif'" }}>
      <>
        <div className="text-center mb-10 flex-shrink-0">
          <h1 className="text-3xl font-bold text-gray-800">富元機電有限公司</h1>
          <h2 className="text-2xl font-semibold text-gray-600 mt-2">工作服務單{mode === 'pdf-page2' && ' (產品項目與備註)'}</h2>
        </div>
        <div className="grid grid-cols-12 gap-x-6 gap-y-4">
          <div className="col-span-12"><strong>工作日期及時間：</strong>{formattedDateTime}</div>
          <div className="col-span-7"><strong>服務單位：</strong>{data.serviceUnit || 'N/A'}</div>
          <div className="col-span-5"><strong>接洽人：</strong>{data.contactPerson || 'N/A'}</div>
          <div className="col-span-12"><strong>連絡電話：</strong>{data.contactPhone || 'N/A'}</div>
        </div>
      </>

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

       <div className="pt-12 mt-auto">
          <div className={`grid ${showManagerApproval ? 'grid-cols-3' : 'grid-cols-2'} gap-x-8 text-base`}>
              {showManagerApproval && (<div className="text-center"><strong>經理核可：</strong><div className="mt-2 p-2 border border-slate-300 rounded-lg bg-slate-50 w-full min-h-[100px] flex items-center justify-center"></div></div>)}
              <div className="text-center"><strong>服務人員簽認：</strong><div className="mt-2 p-2 border border-slate-300 rounded-lg bg-slate-50 w-full min-h-[100px] flex items-center justify-center">{data.technicianSignature ? (<img src={data.technicianSignature} alt="服務人員簽名" className="h-20 w-auto" />) : <span className="text-slate-400">未簽名</span>}</div></div>
              <div className="text-center"><strong>客戶簽認：</strong><div className="mt-2 p-2 border border-slate-300 rounded-lg bg-slate-50 w-full min-h-[100px] flex items-center justify-center">{data.signature ? (<img src={data.signature} alt="客戶簽名" className="h-20 w-auto" />) : <span className="text-slate-400">未簽名</span>}</div></div>
          </div>
          {isPdf && <PdfFooter currentPage={currentPage} totalPages={totalPages} />}
       </div>
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
    onOpenUploadModal: () => void;
    onDownloadPdf: () => void;
    onReset: () => void;
    onEdit: () => void;
    isProcessing: boolean;
}

const ReportView: React.FC<ReportViewProps> = ({ data, onOpenUploadModal, onDownloadPdf, onReset, onEdit, isProcessing }) => {
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
      <div className="pdf-render-container">
        {totalContentLines > TOTAL_CONTENT_LINES_LIMIT ? (
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
              <button onClick={onOpenUploadModal} disabled={isProcessing} className="px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-md shadow-sm hover:bg-blue-700 disabled:opacity-50">上傳PDF</button>
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
        <p className="mt-4 text-sm text-slate-600 bg-slate-100 p-3 rounded-md">請開發者依照 <code>README.md</code> 檔案中的指示，建立 <code>.env.local</code> 檔案並填入正確的金鑰資訊，以啟用雲端硬碟匯出/匯入功能。</p>
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
                <li>確認檔案中包含以下**所有**變數並已填入正確的值：
                    <ul className="list-['-_'] list-inside ml-4 mt-1 font-mono bg-slate-200 p-2 rounded">
                        <li>BREVO_API_KEY</li> <li>BREVO_SENDER_EMAIL</li> <li>BREVO_SENDER_NAME</li>
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
                        <li>BREVO_API_KEY</li> <li>BREVO_SENDER_EMAIL</li> <li>BREVO_SENDER_NAME</li>
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
  const [gapiReady, setGapiReady] = useState(false);
  const [gisReady, setGisReady] = useState(false);
  const [tokenClient, setTokenClient] = useState<any>(null);
  const pickerApiLoaded = useRef(false);
  const [modalState, setModalState] = useState<ModalState>(initialModalState);

  const isDropboxConfigured = !!DROPBOX_ACCESS_TOKEN;
  const isGoogleApiConfigured = !!(API_KEY && CLIENT_ID);
  const isBrevoApiConfigured = !!(BREVO_API_KEY && BREVO_SENDER_EMAIL && BREVO_SENDER_NAME);

  const closeModal = () => setModalState(initialModalState);
  
  const showAlert = (title: string, content: React.ReactNode) => {
    setModalState({ isOpen: true, title, content, onClose: closeModal });
  };

  const showConfirm = (title: string, content: React.ReactNode, onConfirm: () => void, confirmText?: string, confirmClass?: string) => {
    setModalState({ isOpen: true, title, content, onConfirm: () => { onConfirm(); closeModal(); }, confirmText, confirmClass, onClose: closeModal });
  };
  
  const showPrompt = (title: string, content: React.ReactNode, onConfirm: (value: string) => void) => {
    let inputValue = '';
    const PromptContent = <>
      {content}
      <input type="text" autoFocus onChange={e => inputValue = e.target.value} className="mt-2 appearance-none block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm placeholder-slate-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" />
    </>;
    setModalState({ isOpen: true, title, content: PromptContent, onConfirm: () => { onConfirm(inputValue); closeModal(); }, confirmText: "確認", onClose: closeModal});
  };

  useEffect(() => {
    if (sessionStorage.getItem('welcomeBannerDismissed') !== 'true') {
        alert('溫馨提醒：請記得使用Chrome、Edge、Firefox等現代瀏覽器開啟，以確保所有功能正常運作，謝謝！');
        sessionStorage.setItem('welcomeBannerDismissed', 'true');
    }
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

  useEffect(() => {
    try {
        const savedDrafts = localStorage.getItem(NAMED_DRAFTS_STORAGE_KEY);
        if (savedDrafts) { setNamedDrafts(JSON.parse(savedDrafts)); }
    } catch (error) { console.error("Failed to load named drafts.", error); }
  }, []);

  const clearCurrentForm = useCallback(() => {
    setFormData({ ...initialFormData, products: [{ ...initialProduct, id: `product-${Date.now()}` }], dateTime: getFormattedDateTime() });
  }, []);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => {
      const tempState = {...prev, [name]: value};
      if ((name === 'tasks' || name === 'status') && calculateVisualLines(tempState.tasks) + calculateVisualLines(tempState.status) > TASKS_STATUS_LIMIT) return prev;
      if (name === 'remarks' && prev.products.reduce((acc, p) => acc + p.quantity, 0) + calculateVisualLines(tempState.remarks) > PRODUCTS_REMARKS_LIMIT) return prev;
      return tempState;
    });
  }, []);
  
  const handleProductChange = useCallback((index: number, field: 'name' | 'quantity', value: string | number) => {
    setFormData(prev => {
        const newProducts = [...prev.products];
        const productToChange = { ...newProducts[index] };
        
        if (field === 'quantity') {
            const newQuantity = Number(value);
            const otherProductsLines = prev.products.reduce((acc, p, i) => i === index ? acc : acc + p.quantity, 0);
            if (otherProductsLines + newQuantity + calculateVisualLines(prev.remarks) > PRODUCTS_REMARKS_LIMIT) {
                showAlert('行數超限', `已達產品與備註的總行數上限 (${PRODUCTS_REMARKS_LIMIT})，無法增加數量。`);
                return prev;
            }
            const oldQuantity = productToChange.quantity;
            let newSerialNumbers = productToChange.serialNumbers || [];
            if (newQuantity > oldQuantity) newSerialNumbers = [...newSerialNumbers, ...Array(newQuantity - oldQuantity).fill('')];
            else if (newQuantity < oldQuantity) newSerialNumbers = newSerialNumbers.slice(0, newQuantity);
            productToChange.quantity = newQuantity;
            productToChange.serialNumbers = newSerialNumbers;
        } else {
            productToChange.name = String(value);
        }
        newProducts[index] = productToChange;
        return { ...prev, products: newProducts };
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

  const handleAddProduct = () => {
    if (formData.products.reduce((acc, p) => acc + p.quantity, 0) + 1 + calculateVisualLines(formData.remarks) > PRODUCTS_REMARKS_LIMIT) {
        showAlert('行數超限', `已達產品與備註的總行數上限 (${PRODUCTS_REMARKS_LIMIT})，無法新增產品。`);
        return;
    }
    setFormData(prev => ({ ...prev, products: [...prev.products, { ...initialProduct, id: `product-${Date.now()}` }] }));
  };

  const handleRemoveProduct = (index: number) => {
    if (formData.products.length <= 1) return;
    setFormData(prev => ({ ...prev, products: prev.products.filter((_, i) => i !== index) }));
  };

  const handleCustomerSignatureSave = useCallback((s: string) => setFormData(p => ({ ...p, signature: s })), []);
  const handleCustomerSignatureClear = useCallback(() => setFormData(p => ({ ...p, signature: null })), []);
  const handleTechnicianSignatureSave = useCallback((s: string) => setFormData(p => ({ ...p, technicianSignature: s })), []);
  const handleTechnicianSignatureClear = useCallback(() => setFormData(p => ({ ...p, technicianSignature: null })), []);
  const handlePhotosChange = useCallback((photos: string[]) => setFormData(p => ({ ...p, photos })), []);
  
  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); setIsSubmitted(true); window.scrollTo(0, 0); };
  const handleEdit = () => setIsSubmitted(false);
  const handleReset = useCallback(() => { 
    showConfirm("確認清除?", "確定要清除所有資料並建立新的服務單嗎？", () => {
      clearCurrentForm(); setIsSubmitted(false); 
    }, "確認清除", "bg-red-600 hover:bg-red-700 focus:ring-red-500");
  }, [clearCurrentForm]);

  const handleSaveAsDraft = useCallback(() => {
    showPrompt("儲存暫存", "請為此暫存命名：", (draftName) => {
        if (!draftName) return;
        const currentDrafts = { ...namedDrafts };
        const isOverwriting = !!currentDrafts[draftName];
        if (!isOverwriting && Object.keys(currentDrafts).length >= MAX_DRAFTS) {
            showAlert('儲存失敗', `無法儲存，已達上限 (${MAX_DRAFTS}份)。`);
            return;
        }
        const confirmSave = () => {
            const newDrafts = { ...currentDrafts, [draftName]: formData };
            setNamedDrafts(newDrafts);
            localStorage.setItem(NAMED_DRAFTS_STORAGE_KEY, JSON.stringify(newDrafts));
            showAlert('儲存成功', <>✅ 暫存 "{draftName}" 已儲存！<br/><br/><b className="font-semibold">重要提醒：</b><br/>暫存資料會因清理瀏覽器快取而消失，請注意備份。</>);
        };
        if (isOverwriting) {
            showConfirm("覆蓋確認", `暫存 "${draftName}" 已存在。要覆蓋它嗎？`, confirmSave, "確認覆蓋");
        } else {
            confirmSave();
        }
    });
  }, [formData, namedDrafts]);

  const handleLoadDraft = useCallback((name: string) => {
    if (namedDrafts[name]) {
        showConfirm("載入確認", `確定要載入 "${name}" 嗎？這將覆蓋目前內容。`, () => {
            setFormData(migrateWorkOrderData(namedDrafts[name]));
            showAlert('載入成功', `暫存 "${name}" 已載入。`);
        });
    }
  }, [namedDrafts]);

  const handleClearData = useCallback(() => {
    showConfirm("確認清除?", "確定要清除目前表單的所有欄位嗎？", () => {
        clearCurrentForm();
        showAlert('操作完成', '表單資料已清除。');
    }, "確認清除", "bg-red-600 hover:bg-red-700 focus:ring-red-500");
  }, [clearCurrentForm]);
  
  const getAuthToken = useCallback(() => {
    return new Promise((resolve, reject) => {
        if (!tokenClient) return reject(new Error("Google Auth client is not ready."));
        tokenClient.callback = (resp: any) => resp.error ? (localStorage.removeItem(GOOGLE_AUTH_GRANTED_KEY), reject(resp)) : (localStorage.setItem(GOOGLE_AUTH_GRANTED_KEY, 'true'), resolve(resp));
        if (localStorage.getItem(GOOGLE_AUTH_GRANTED_KEY)) { tokenClient.requestAccessToken({ prompt: '' }); } 
        else { tokenClient.requestAccessToken({ prompt: 'consent' }); }
    });
  }, [tokenClient]);
  
  const openDraftActionModal = (action: 'delete' | 'export') => {
    if (action === 'export' && !isGoogleApiConfigured) { showAlert("功能未設定", "Google Drive 功能未設定。"); return; }
    const draftNames = Object.keys(namedDrafts);
    if (draftNames.length === 0) { showAlert("沒有暫存", action === 'delete' ? "沒有暫存可以刪除。" : "沒有暫存可以匯出。"); return; }
    
    let selectedDraft = draftNames[0];
    const title = action === 'delete' ? '刪除本機暫存' : '匯出至 Google 雲端硬碟';
    const confirmText = action === 'delete' ? '確認刪除' : '匯出';
    const confirmClass = action === 'delete' ? 'bg-red-600 hover:bg-red-700 focus:ring-red-500' : 'bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500';

    const onConfirmAction = () => {
        if (action === 'delete') {
            showConfirm("永久刪除?", `確定要永久刪除暫存 "${selectedDraft}" 嗎？`, () => {
              const newDrafts = { ...namedDrafts };
              delete newDrafts[selectedDraft];
              setNamedDrafts(newDrafts);
              localStorage.setItem(NAMED_DRAFTS_STORAGE_KEY, JSON.stringify(newDrafts));
              showAlert('刪除成功', `暫存 "${selectedDraft}" 已刪除。`);
            }, "確認刪除", "bg-red-600 hover:bg-red-700 focus:ring-red-500");
        } else if (action === 'export') {
            performExportToDrive(selectedDraft);
        }
    };
    
    const content = <div>
      <label htmlFor="draft-select" className="text-sm text-gray-500 mb-2 block">請從下方選擇要操作的暫存檔：</label>
      <select id="draft-select" defaultValue={selectedDraft} onChange={(e) => selectedDraft = e.target.value} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md">
        {draftNames.map(name => <option key={name} value={name}>{name}</option>)}
      </select>
    </div>;

    setModalState({ isOpen: true, title, content, onConfirm: onConfirmAction, confirmText, confirmClass, onClose: closeModal, backgroundIcon: <Cog6ToothIcon className="w-48 h-48" /> });
  };
  
  const handleDeleteDraft = () => openDraftActionModal('delete');
  const handleExportToDrive = () => openDraftActionModal('export');
  
  const performExportToDrive = useCallback(async (nameToExport: string) => {
    if (!gapiReady || !gisReady || !namedDrafts[nameToExport]) { showAlert("匯出錯誤", "匯出功能未就緒或找不到暫存。"); return; }
    try {
        await getAuthToken();
        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify({ 'name': `${nameToExport}-服務單暫存.json`, 'mimeType': 'application/json', 'parents': ['root'] })], { type: 'application/json' }));
        form.append('file', new Blob([JSON.stringify(namedDrafts[nameToExport], null, 2)], { type: 'application/json' }));
        const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', { method: 'POST', headers: new Headers({ 'Authorization': 'Bearer ' + gapi.client.getToken().access_token }), body: form });
        if (!res.ok) { const err = await res.json(); throw new Error(`匯出失敗：${err.error?.message || res.statusText}`); }
        showAlert('匯出成功', `暫存 "${nameToExport}" 已成功匯出至 Google 雲端硬碟！`);
    } catch (error) { console.error("GDrive export failed", error); showAlert('匯出失敗', `匯出失敗：${error instanceof Error ? error.message : "未知錯誤"}`); }
  }, [gapiReady, gisReady, namedDrafts, getAuthToken]);

  const loadPickerApi = useCallback(async () => {
    if (pickerApiLoaded.current) return;
    return new Promise<void>((resolve, reject) => gapi.load('picker', (err: any) => err ? reject(err) : (pickerApiLoaded.current = true, resolve())));
  }, []);

  const showGooglePicker = useCallback(async (): Promise<any> => {
    return new Promise((resolve) => {
        const picker = new google.picker.PickerBuilder()
            .addView(new google.picker.View(google.picker.ViewId.DOCS).setMimeTypes("application/json"))
            .setOAuthToken(gapi.client.getToken().access_token).setDeveloperKey(API_KEY)
            .setCallback((data: any) => { if (data.action === google.picker.Action.PICKED) { resolve(data.docs?.[0]); } else if (data.action === google.picker.Action.CANCEL) { resolve(null); } })
            .build();
        picker.setVisible(true);
    });
  }, []);

  const handleImportFromDrive = useCallback(async () => {
    if (!isGoogleApiConfigured) return showAlert("功能未設定", "Google Drive 功能未設定。");
    if (!gapiReady || !gisReady) return showAlert("尚未就緒", "Google Drive 功能正在初始化，請稍候。");
    try {
        await getAuthToken(); await loadPickerApi();
        const doc = await showGooglePicker();
        if (!doc?.id) return;
        const res = await gapi.client.drive.files.get({ fileId: doc.id, alt: 'media' });
        const importedData = (typeof res.result === 'object') ? res.result : JSON.parse(res.result);
        
        showPrompt("匯入暫存", "請為匯入的暫存檔命名：", (dName) => {
            if (!dName) return;
            setNamedDrafts(cD => {
                if (cD[dName]) {
                    showConfirm("覆蓋確認", `暫存 "${dName}" 已存在，要覆蓋嗎？`, () => {
                      const newDrafts = { ...cD, [dName]: migrateWorkOrderData(importedData) };
                      localStorage.setItem(NAMED_DRAFTS_STORAGE_KEY, JSON.stringify(newDrafts));
                      showAlert('匯入成功', `✅ 暫存 "${dName}" 已成功從雲端匯入並覆蓋！`);
                      setNamedDrafts(newDrafts);
                    });
                    return cD;
                }
                if (Object.keys(cD).length >= MAX_DRAFTS) { showAlert('儲存失敗', `無法儲存，已達上限 (${MAX_DRAFTS}份)。`); return cD; }
                const newDrafts = { ...cD, [dName]: migrateWorkOrderData(importedData) };
                localStorage.setItem(NAMED_DRAFTS_STORAGE_KEY, JSON.stringify(newDrafts));
                showAlert('匯入成功', `✅ 暫存 "${dName}" 已成功從雲端匯入！`);
                return newDrafts;
            });
        });
    } catch (error: any) {
        console.error("GDrive import failed:", error);
        showAlert('匯入失敗', `匯入失敗: ${error?.result?.error?.message || error?.message || '未知錯誤'}`);
    }
  }, [gapiReady, gisReady, getAuthToken, loadPickerApi, showGooglePicker, isGoogleApiConfigured]);

  const generatePdfBlob = useCallback(async (): Promise<Blob | null> => {
    try {
      const { jsPDF: JSPDF } = (window as any).jspdf;
      const pdf = new JSPDF('p', 'mm', 'a4');
      const options = { scale: 2, useCORS: true, backgroundColor: '#ffffff' };
      const totalContentLines = calculateVisualLines(formData.tasks) + calculateVisualLines(formData.status) + formData.products.filter(p => p.name.trim() !== '').length + calculateVisualLines(formData.remarks);

      if (totalContentLines > TOTAL_CONTENT_LINES_LIMIT) {
        const [p1, p2] = await Promise.all([html2canvas(document.getElementById('pdf-pdf-page1')!, options), html2canvas(document.getElementById('pdf-pdf-page2')!, options)]);
        pdf.addImage(p1.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 210, 297); pdf.addPage();
        pdf.addImage(p2.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 210, 297);
      } else {
        const canvas = await html2canvas(document.getElementById('pdf-pdf-full')!, options);
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 210, Math.min(297, (canvas.height * 210) / canvas.width));
      }
      for (let i = 0; i < chunk(formData.photos, 4).length; i++) {
          const photoPageEl = document.getElementById(`pdf-photo-page-${i}`);
          if (photoPageEl) {
              pdf.addPage();
              const canvas = await html2canvas(photoPageEl, options);
              pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 210, 297);
          }
      }
      return pdf.output('blob');
    } catch (error) { console.error("PDF blob generation failed:", error); showAlert("PDF 產生失敗", "無法產生PDF，請檢查主控台錯誤。"); return null; }
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
  }, [isProcessing, formData, generatePdfBlob]);
  
  const performDropboxUpload = useCallback(async (blob: Blob, fileName: string) => {
    if (!isDropboxConfigured) throw new Error("Dropbox 存取權杖未設定。");
    const args = { path: `/工作服務單/${fileName}`, mode: 'overwrite', autorename: true, mute: false, strict_conflict: false };
    const escapeNonAscii = (str: string) => str.replace(/[\u007f-\uffff]/g, c => '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4));
    const response = await fetch('https://content.dropboxapi.com/2/files/upload', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${DROPBOX_ACCESS_TOKEN}`, 'Dropbox-API-Arg': escapeNonAscii(JSON.stringify(args)), 'Content-Type': 'application/octet-stream' },
      body: blob
    });
    if (!response.ok) throw new Error(`Dropbox API 錯誤: ${await response.text()}`);
    return await response.json();
  }, [isDropboxConfigured]);

  const performEmailSend = useCallback(async (blob: Blob, fileName: string, recipientsStr: string) => {
    if (!isBrevoApiConfigured) throw new Error("Brevo API 未設定");
    const recipients = recipientsStr.split(',').map(email => email.trim()).filter(Boolean);
    if (recipients.length === 0) throw new Error("請提供至少一個有效的收件人 Email");
    const base64Pdf = await blobToBase64(blob);
    const payload = {
      sender: { name: BREVO_SENDER_NAME, email: BREVO_SENDER_EMAIL },
      to: recipients.map(email => ({ email })),
      subject: `${formData.dateTime.split('T')[0]} ${formData.serviceUnit} の工作服務單`,
      htmlContent: getEmailHtmlContent(formData.serviceUnit, formData.dateTime),
      attachment: [{ content: base64Pdf, name: fileName }],
    };
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'accept': 'application/json', 'api-key': BREVO_API_KEY!, 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error((await response.json()).message || 'Brevo API 請求失敗');
  }, [formData, isBrevoApiConfigured]);

  const handleConfirmUpload = useCallback(async (options: { uploadToNas: boolean; sendByEmail: boolean; emailRecipients: string }) => {
    const { uploadToNas, sendByEmail, emailRecipients } = options;
    if (!uploadToNas && !sendByEmail) { showAlert('未選擇操作', '請至少選擇一個操作 (上傳至 NAS 或透過 Email 寄送)。'); return; }
    
    setIsProcessing(true);
    closeModal();

    try {
      const blob = await generatePdfBlob();
      if (!blob) { showAlert('PDF 產生失敗', '無法產生 PDF，操作已取消。'); return; }
      const fileName = `工作服務單-${formData.dateTime.split('T')[0]}-${formData.serviceUnit || 'report'}.pdf`;
      
      const tasks: Promise<any>[] = [];
      if (uploadToNas) tasks.push(performDropboxUpload(blob, fileName));
      if (sendByEmail) tasks.push(performEmailSend(blob, fileName, emailRecipients));
      
      const results = await Promise.allSettled(tasks);
      const summary = [];
      if (uploadToNas) {
        const dropboxResult = results.shift();
        summary.push(`- NAS 上傳: ${dropboxResult?.status === 'fulfilled' ? `✅ 成功` : `❌ 失敗 (${(dropboxResult as PromiseRejectedResult)?.reason})`}`);
      }
      if (sendByEmail) {
        const emailResult = results.shift();
        summary.push(`- Email 寄送: ${emailResult?.status === 'fulfilled' ? `✅ 成功` : `❌ 失敗 (${(emailResult as PromiseRejectedResult)?.reason})`}`);
      }
      showAlert('操作完成', <div className="text-left whitespace-pre-wrap">{summary.join('\n')}</div>);

    } catch (error) {
        console.error("Upload/Share failed:", error);
        showAlert('未知錯誤', `發生未知錯誤：${error instanceof Error ? error.message : String(error)}`);
    } finally {
        setIsProcessing(false);
    }
  }, [formData, generatePdfBlob, performDropboxUpload, performEmailSend]);

  const handleOpenUploadModal = () => {
    let uploadToNas = isDropboxConfigured;
    let sendByEmail = isBrevoApiConfigured;
    let emailRecipients = 'fuhyuan.w5339@msa.hinet.net';
    
    const UploadOptionsContent = () => {
        const [nasChecked, setNasChecked] = useState(uploadToNas);
        const [emailChecked, setEmailChecked] = useState(sendByEmail);
        const [emails, setEmails] = useState(emailRecipients);

        uploadToNas = nasChecked;
        sendByEmail = emailChecked;
        emailRecipients = emails;
        
        return (
          <div className="space-y-4">
            <div className={`p-4 border rounded-md ${!isDropboxConfigured ? 'bg-slate-50 opacity-60' : 'bg-white'}`}>
              <label className="flex items-center">
                <input type="checkbox" className="h-5 w-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" checked={nasChecked} onChange={(e) => setNasChecked(e.target.checked)} disabled={!isDropboxConfigured}/>
                <span className="ml-3 text-sm font-medium text-gray-700">上傳至 NAS</span>
              </label>
              <p className={`text-xs text-slate-500 mt-2 ml-8`}>將PDF上傳至公司雲端硬碟。</p>
              {!isDropboxConfigured && <p className="text-xs text-red-600 mt-1 ml-8">此功能未設定，請參考 README.md 檔案進行設定。</p>}
            </div>
            <div className={`p-4 border rounded-md ${!isBrevoApiConfigured ? 'bg-slate-50 opacity-60' : 'bg-white'}`}>
                <label className="flex items-center">
                    <input type="checkbox" className="h-5 w-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" checked={emailChecked} onChange={(e) => setEmailChecked(e.target.checked)} disabled={!isBrevoApiConfigured}/>
                    <span className="ml-3 text-sm font-medium text-gray-700">透過 Email 寄送</span>
                </label>
                {!isBrevoApiConfigured && <p className="text-xs text-red-600 mt-2 ml-8">Email 功能未設定，請參考 README.md 檔案進行設定。</p>}
                <div className="mt-3 pl-8">
                    <label htmlFor="email-recipients" className="block text-xs font-medium text-gray-500 mb-1">收件人 (多個請用 , 分隔)</label>
                    <input type="text" id="email-recipients" value={emails} onChange={e => setEmails(e.target.value)} disabled={!emailChecked || !isBrevoApiConfigured} className="appearance-none block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm placeholder-slate-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm disabled:bg-slate-100 disabled:cursor-not-allowed"/>
                </div>
            </div>
          </div>
        );
    };

    setModalState({
        isOpen: true,
        title: "上傳PDF",
        content: <UploadOptionsContent />,
        onConfirm: () => handleConfirmUpload({ uploadToNas, sendByEmail, emailRecipients }),
        confirmText: "確認執行",
        onClose: closeModal,
        backgroundIcon: <CloudArrowUpIcon className="w-64 h-64" />
    });
  };

  return (
    <div className="min-h-screen bg-slate-100">
        <div className="relative max-w-4xl mx-auto bg-white rounded-xl shadow-2xl ring-1 ring-black ring-opacity-5 overflow-hidden my-8 sm:my-12">
           <span className="absolute top-4 right-6 text-xs font-mono text-slate-400 select-none" aria-label={`應用程式版本 ${APP_VERSION}`}>{APP_VERSION}</span>
           
           {isSubmitted ? (
             <ReportView data={formData} onOpenUploadModal={handleOpenUploadModal} onDownloadPdf={handleDownloadPdf} onReset={handleReset} onEdit={handleEdit} isProcessing={isProcessing} />
            ) : (
            <>
              {!isGoogleApiConfigured && <ApiKeyErrorDisplay />}
              {!isBrevoApiConfigured && <BrevoApiKeyErrorDisplay />}
              <WorkOrderForm formData={formData} onInputChange={handleInputChange} onProductChange={handleProductChange} onProductSerialNumberChange={handleProductSerialNumberChange} onAddProduct={handleAddProduct} onRemoveProduct={handleRemoveProduct} onPhotosChange={handlePhotosChange} onTechnicianSignatureSave={handleTechnicianSignatureSave} onTechnicianSignatureClear={handleTechnicianSignatureClear} onCustomerSignatureSave={handleCustomerSignatureSave} onCustomerSignatureClear={handleCustomerSignatureClear} onSubmit={handleSubmit} onSaveAsDraft={handleSaveAsDraft} onLoadDraft={handleLoadDraft} onDeleteDraft={handleDeleteDraft} onClearData={handleClearData} onImportFromDrive={handleImportFromDrive} onExportToDrive={handleExportToDrive} namedDrafts={namedDrafts} />
            </>
            )}
        </div>
        
        <CustomModal {...modalState} isProcessing={isProcessing} />

        {isProcessing && (
            <div className="fixed inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-[60]">
              <div className="text-center">
                <div role="status" className="flex items-center justify-center">
                    <svg aria-hidden="true" className="w-8 h-8 text-slate-200 animate-spin fill-indigo-600" viewBox="0 0 100 101" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M100 50.5908C100 78.2051 77.6142 100.591 50 100.591C22.3858 100.591 0 78.2051 0 50.5908C0 22.9766 22.3858 0.59082 50 0.59082C77.6142 0.59082 100 22.9766 100 50.5908ZM9.08144 50.5908C9.08144 73.1895 27.4013 91.5094 50 91.5094C72.5987 91.5094 90.9186 73.1895 90.9186 50.5908C90.9186 27.9921 72.5987 9.67226 50 9.67226C27.4013 9.67226 9.08144 27.9921 9.08144 50.5908Z" fill="currentColor"/>
                        <path d="M93.9676 39.0409C96.393 38.4038 97.8624 35.9116 97.0079 33.5539C95.2932 28.8227 92.871 24.3692 89.8167 20.348C85.8452 15.1192 80.8826 10.7238 75.2124 7.41289C69.5422 4.10194 63.2754 1.94025 56.7698 1.05124C51.7666 0.367541 46.6976 0.446843 41.7345 1.27873C39.2613 1.69328 37.813 4.19778 38.4501 6.62326C39.0873 9.04874 41.5694 10.4717 44.0505 10.1071C47.8511 9.54855 51.7191 9.52689 55.5402 10.0492C60.8642 10.7766 65.9928 12.5457 70.6331 15.2552C75.2735 17.9648 79.3347 21.5619 82.5849 25.841C84.9175 28.9121 86.7997 32.2913 88.1811 35.8758C89.083 38.2158 91.5421 39.6781 93.9676 39.0409Z" fill="currentFill"/>
                    </svg>
                    <span className="sr-only">Loading...</span>
                </div>
                <p className="text-lg font-semibold text-slate-700 mt-4">正在處理中...</p>
                <p className="text-sm text-slate-500">請稍候</p>
              </div>
            </div>
        )}
    </div>
  );
};
