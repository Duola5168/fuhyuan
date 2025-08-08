

/**
 * @file App.tsx
 * @description 這是工作服務單應用程式的主元件檔案。
 * 它包含了所有的狀態管理、表單邏輯、PDF 產生、雲端服務整合 (Dropbox, Google Drive, Brevo Email) 以及 UI 渲染。
 * 整個應用程式的核心功能都在此檔案中實現。
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { WorkOrderData, ProductItem } from './types';
import SignaturePad from './components/SignaturePad';
import ImageUploader from './components/ImageUploader';
import { ReportLayout, PdfFooter } from './components/ReportLayout';
import { LegacyReportLayout } from './components/LegacyReportLayout';
import { UserManual } from './components/UserManual';


// --- 全域型別宣告 (用於從 CDN 載入的函式庫) ---
declare const jsPDF: any;
declare const html2canvas: any;
declare const gapi: any;
declare const google: any;

// --- 版本號統一來源 ---
// 從 Vite 環境變數讀取版本號，此變數在 vite.config.ts 中被注入
const rawVersion = process.env.APP_VERSION || '1.8.0'; 
// 將 '1.8.0' 格式化為 'V1.8' 以顯示在 UI 上
export const APP_VERSION = `V${rawVersion.split('.').slice(0, 2).join('.')}`;

// --- API 設定 (從環境變數讀取，增強安全性) ---
/** Dropbox API 相關金鑰 */
const DROPBOX_APP_KEY = process.env.DROPBOX_APP_KEY;
const DROPBOX_APP_SECRET = process.env.DROPBOX_APP_SECRET;
const DROPBOX_REFRESH_TOKEN = process.env.DROPBOX_REFRESH_TOKEN;
/** Google Cloud API 金鑰，用於 Google Drive Picker 等服務 */
const API_KEY = process.env.GOOGLE_API_KEY;
/** Google Cloud OAuth 2.0 用戶端 ID，用於使用者授權 */
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
/** 外出/加班紀錄表的連結 */
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;
/** Google Drive API 的探索文件路徑，用於客戶端初始化 */
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';
/** Google OAuth 授權範圍，此處指定為僅能存取由本應用建立的檔案 */
const SCOPES = 'https://www.googleapis.com/auth/drive.file';
/** 用於在 localStorage 中標記使用者是否已授予 Google 權限的鍵名 */
const GOOGLE_AUTH_GRANTED_KEY = 'googleAuthGranted';
/** Brevo (Sendinblue) API 金鑰，用於發送 Email */
const BREVO_API_KEY = process.env.BREVO_API_KEY;
/** 使用 Brevo 發送 Email 時的寄件人信箱 */
const BREVO_SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL;
/** 使用 Brevo 發送 Email 時的寄件人名稱 */
const BREVO_SENDER_NAME = process.env.BREVO_SENDER_NAME;

/**
 * 產生 Email 的 HTML 內容。
 * @param serviceUnit - 服務單位名稱。
 * @param dateTime - 工作日期時間字串。
 * @returns {string} - 格式化後的 Email HTML 字串。
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

// --- 全域設定參數 ---
/** 服務單內容總行數上限，超過此限制將觸發 PDF 分頁 */
const TOTAL_CONTENT_LINES_LIMIT = 20; 
/** 「處理事項」和「處理情形」兩個欄位的合計視覺行數上限 */
const TASKS_STATUS_LIMIT = 18; 
/** 「產品項目」和「備註」兩個區塊的合計視覺行數上限 */
const PRODUCTS_REMARKS_LIMIT = 16; 
/** 在 localStorage 中儲存具名暫存檔的鍵名 */
const NAMED_DRAFTS_STORAGE_KEY = 'workOrderNamedDrafts';
/** 允許儲存的本機暫存檔數量上限 */
const MAX_DRAFTS = 3;
/** 舊式表格中，文字區域的建議行數上限 */
const LEGACY_TEXT_AREA_LINE_LIMIT = 11;
/** 舊式表格中，產品區域的建議行數上限 */
const LEGACY_PRODUCT_AREA_LINE_LIMIT = 4;


/**
 * 取得目前日期和時間，並格式化為 YYYY-MM-DDTHH:mm 格式。
 * @returns {string} 格式化後的日期時間字串。
 */
const getFormattedDateTime = () => {
  const now = new Date();
  // 校正時區差異
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
};

/**
 * 預設的初始產品項目物件。
 */
const initialProduct: ProductItem = {
    id: `product-${Date.now()}`,
    name: '',
    quantity: 1,
    serialNumbers: [''],
};

/**
 * 全新服務單的初始資料結構。
 */
const initialFormData: WorkOrderData = {
  dateTime: getFormattedDateTime(),
  serviceUnit: '',
  contactPerson: '',
  contactPhone: '',
  manufacturingOrderNumber: '',
  businessReportNumber: '',
  products: [initialProduct],
  tasks: '',
  status: '',
  remarks: '',
  photos: [],
  signature: null,
  technicianSignature: null,
  serviceRating: '',
  serviceConclusion: '',
};

// --- 工具函式 ---

/**
 * 將陣列分割成指定大小的子陣列。
 * @template T - 陣列元素的型別。
 * @param {T[]} arr - 要分割的來源陣列。
 * @param {number} size - 每個子陣列的大小。
 * @returns {T[][]} - 分割後包含多個子陣列的二維陣列。
 */
const chunk = <T,>(arr: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(arr.length / size) }, (v, i) =>
    arr.slice(i * size, i * size + size)
  );

/**
 * 估算字串在固定寬度容器中大約會佔用的視覺行數。
 * 用於判斷 PDF 是否需要分頁。
 * @param {string} str - 要計算的字串。
 * @param {number} [avgCharsPerLine=40] - 平均每行容納的字元數 (基於中文字元寬度估算)。
 * @returns {number} - 估算的視覺行數。
 */
const calculateVisualLines = (str: string, avgCharsPerLine: number = 40): number => {
    if (!str) return 0;
    // 首先根據手動換行符 `\n` 分割
    const manualLines = str.split('\n');
    if (manualLines.length === 1 && manualLines[0] === '') return 0;
    // 累加每行的視覺行數 (考慮自動換行)
    return manualLines.reduce((acc, line) => acc + Math.max(1, Math.ceil(line.length / avgCharsPerLine)), 0);
};

/**
 * 資料遷移與淨化函式。
 * 當從暫存載入資料時，確保資料結構符合最新的 `WorkOrderData` 格式，避免因舊版格式造成錯誤。
 * @param {any} data - 來源資料，可能是舊版或不完整的資料。
 * @returns {WorkOrderData} - 遷移和淨化後的、保證安全的 `WorkOrderData` 物件。
 */
const migrateWorkOrderData = (data: any): WorkOrderData => {
    // 使用初始資料作為基底，確保所有欄位都存在
    const sanitizedData = { ...initialFormData, ...data };
    // 處理產品列表
    if (!Array.isArray(sanitizedData.products) || sanitizedData.products.length === 0) {
        sanitizedData.products = [{...initialProduct}];
    }
    sanitizedData.products = sanitizedData.products.map((p: any) => {
        if (typeof p !== 'object' || p === null) return { ...initialProduct, id: `product-${Date.now()}` };
        const product = { ...initialProduct, ...p }; 
        const quantity = Number(product.quantity) || 1;
        product.quantity = quantity;
        // 同步序號欄位數量與產品數量
        if (!Array.isArray(product.serialNumbers)) product.serialNumbers = Array(quantity).fill('');
        else {
            const currentLength = product.serialNumbers.length;
            if (currentLength < quantity) product.serialNumbers.push(...Array(quantity - currentLength).fill(''));
            else if (currentLength > quantity) product.serialNumbers = product.serialNumbers.slice(0, quantity);
        }
        return product;
    });
    // 確保所有字串類型欄位都是字串
    const stringKeys: (keyof WorkOrderData)[] = ['dateTime', 'serviceUnit', 'contactPerson', 'contactPhone', 'manufacturingOrderNumber', 'businessReportNumber', 'tasks', 'status', 'remarks', 'serviceRating', 'serviceConclusion'];
    stringKeys.forEach(key => { if (typeof sanitizedData[key] !== 'string') sanitizedData[key] = ''; });
    // 確保照片、簽名等欄位型別正確
    sanitizedData.photos = Array.isArray(sanitizedData.photos) ? sanitizedData.photos : [];
    sanitizedData.signature = typeof sanitizedData.signature === 'string' ? sanitizedData.signature : null;
    sanitizedData.technicianSignature = typeof sanitizedData.technicianSignature === 'string' ? sanitizedData.technicianSignature : null;
    return sanitizedData as WorkOrderData;
};

/**
 * 將 Blob 物件轉換為 Base64 字串。
 * @param {Blob} blob - 要轉換的 Blob 物件。
 * @returns {Promise<string>} - 解析完成後，回傳不含 "data:..." 前綴的 Base64 字串。
 */
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
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
  type?: 'text' | 'textarea' | 'datetime-local' | 'tel' | 'select';
  required?: boolean;
  rows?: number;
  autoSize?: boolean;
  cornerHint?: string;
  children?: React.ReactNode;
}

const FormField: React.FC<FormFieldProps> = ({ label, id, value, onChange, type = 'text', required = false, rows = 3, autoSize = false, cornerHint, children }) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // 實現 textarea 高度自動增長
  useEffect(() => {
    if (autoSize && textareaRef.current) {
      const textarea = textareaRef.current;
      textarea.style.height = 'auto'; 
      textarea.style.height = `${textarea.scrollHeight}px`; 
    }
  }, [autoSize, value]);

  const commonClasses = "appearance-none block w-full px-3 py-2 border border-slate-500 rounded-md shadow-sm placeholder-slate-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 text-lg";

  return (
    <div>
      <div className="flex justify-between items-baseline mb-1">
        <label htmlFor={id} className="block text-lg font-medium text-slate-700">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
        {cornerHint && <span className="text-sm text-slate-500 font-mono">{cornerHint}</span>}
      </div>
      <div>
        {type === 'textarea' ? (
          <textarea ref={textareaRef} id={id} name={id} rows={autoSize ? 1 : rows} value={value} onChange={onChange} required={required} className={commonClasses} style={autoSize ? { overflowY: 'hidden', resize: 'none' } : {}} />
        ) : type === 'select' ? (
          <select id={id} name={id} value={value} onChange={onChange} required={required} className={`${commonClasses} pr-8`}>
            {children}
          </select>
        ) : (
          <input id={id} name={id} type={type} value={value} onChange={onChange} required={required} className={commonClasses} />
        )}
      </div>
    </div>
  );
};

// --- 圖示元件 (SVG) ---
const PlusIcon: React.FC<{ className?: string }> = ({ className }) => ( <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg> );
const TrashIcon: React.FC<{ className?: string }> = ({ className }) => ( <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg> );
const Cog6ToothIcon: React.FC<{ className?: string }> = ({ className }) => ( <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-1.007 1.11-1.226.55-.22 1.156-.22 1.706 0 .55.22 1.02.684 1.11 1.226l.082.499a.95.95 0 00.994.819c.595-.024 1.162.23 1.506.639.344.408.51.956.464 1.49l-.044.274c-.066.417.042.85.327 1.157.285.308.704.453 1.116.397.512-.07.996.174 1.32.57C21.056 9.31 21.2 9.8 21.2 10.337v3.326c0 .537-.144 1.027-.42 1.428-.276.402-.75.643-1.26.576-.413-.057-.83.09-1.116.398-.285.307-.393.74-.328 1.157l.044.273c.046.537-.12 1.082-.464 1.49-.344.41-.91.664-1.506.64l-.994-.04a.95.95 0 00-.994.818l-.082.499c-.09.542-.56 1.007-1.11 1.226-.55.22-1.156-.22-1.706 0-.55-.22-1.02-.684-1.11-1.226l-.082-.499a.95.95 0 00-.994-.819c-.595.024-1.162-.23-1.506-.639-.344.408-.51.956-.464-1.49l.044-.274c.066.417-.042.85-.327 1.157-.285.308-.704.453-1.116.397-.512.07-.996.174-1.32.57C2.944 15.09 2.8 14.6 2.8 14.063v-3.326c0-.537.144-1.027.42-1.428.276.402.75-.643 1.26-.576.413.057.83.09 1.116.398.285.307.393.74.328 1.157l-.044-.273c-.046-.537.12-1.082-.464-1.49.344.41.91.664-1.506-.64l.994.04c.33.028.65.12.943.284.294.164.55.393.756.67l.082.499z" /><path strokeLinecap="round" strokeLinejoin="round" d="M12 15a3 3 0 100-6 3 3 0 000 6z" /></svg> );
const ServerStackIcon: React.FC<{ className?: string }> = ({ className }) => ( <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" /></svg> );
const EnvelopeIcon: React.FC<{ className?: string }> = ({ className }) => ( <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg> );
const CheckCircleIcon: React.FC<{ className?: string }> = ({ className }) => ( <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> );
const XCircleIcon: React.FC<{ className?: string }> = ({ className }) => ( <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> );
const QuestionMarkCircleIcon: React.FC<{ className?: string }> = ({ className }) => ( <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" /></svg> );

// --- 統一彈出視窗系統 (Unified Modal System) ---
interface ModalButton {
  text: string;
  onClick: () => void;
  className?: string;
}

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
  footerButtons?: ModalButton[];
}

const initialModalState: ModalState = {
  isOpen: false,
  title: '',
  content: null,
};

/**
 * 通用的彈出視窗元件。
 * 透過 `ModalState` 控制其顯示、內容和行為。
 */
const CustomModal: React.FC<ModalState> = ({ isOpen, title, content, onConfirm, confirmText, confirmClass, onClose, isProcessing, backgroundIcon, footerButtons }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-lg transform transition-all overflow-hidden border border-slate-300">
        {backgroundIcon && <div className="absolute inset-0 flex items-center justify-center opacity-10 pointer-events-none">{backgroundIcon}</div>}
        <div className="relative z-10">
          <div className="p-6">
            <h3 id="modal-title" className="text-xl font-semibold leading-6 text-gray-900">{title}</h3>
            <div className="mt-4 text-lg text-gray-600">{content}</div>
          </div>
          <div className="bg-gray-50/70 backdrop-blur-sm px-6 py-4 flex flex-row-reverse flex-wrap gap-3 border-t border-slate-200">
            {onConfirm && (
              <button
                type="button"
                onClick={onConfirm}
                disabled={isProcessing}
                className={`inline-flex justify-center px-4 py-2 text-lg font-medium text-white border border-transparent rounded-md shadow-sm ${confirmClass || 'bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500'} disabled:opacity-50`}
              >
                {isProcessing ? '處理中...' : (confirmText || '確認')}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              disabled={isProcessing}
              className="px-4 py-2 text-lg font-medium text-gray-700 bg-white border border-gray-400 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              {onConfirm ? '取消' : '關閉'}
            </button>
            {(footerButtons || []).map((button, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={button.onClick}
                  disabled={isProcessing}
                  className={`inline-flex justify-center px-4 py-2 text-lg font-medium rounded-md shadow-sm ${button.className || 'text-white bg-green-600 hover:bg-green-700 border border-transparent focus:ring-green-500'}`}
                >
                  {button.text}
                </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};


/**
 * 服務單表單的核心元件，包含所有輸入欄位和操作按鈕。
 */
interface WorkOrderFormProps {
    formData: WorkOrderData;
    onInputChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
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
    technicianInputMode: 'signature' | 'select';
    onTechnicianInputModeChange: (mode: 'signature' | 'select') => void;
    onSelectTechnician: () => void;
}

const WorkOrderForm: React.FC<WorkOrderFormProps> = ({
    formData, onInputChange, onProductChange, onProductSerialNumberChange, onAddProduct, onRemoveProduct, onPhotosChange,
    onTechnicianSignatureSave, onTechnicianSignatureClear, onCustomerSignatureSave, onCustomerSignatureClear,
    onSubmit, onSaveAsDraft, onLoadDraft, onDeleteDraft, onClearData, onImportFromDrive, onExportToDrive, namedDrafts,
    technicianInputMode, onTechnicianInputModeChange, onSelectTechnician
}) => {
    // 動態計算行數以提供使用者提示
    const tasksStatusTotal = calculateVisualLines(formData.tasks) + calculateVisualLines(formData.status);
    const productsRemarksTotal = formData.products.reduce((acc, product) => acc + product.quantity, 0) + calculateVisualLines(formData.remarks);
    const draftNames = Object.keys(namedDrafts);

    const serviceRatingOptions = ["", "1. 劣", "2. 尚可", "3. 好", "4. 優良"];
    const serviceConclusionOptions = ["", "1. 圓滿完成", "2. 剩餘部份自行處理", "3. 另準備材料", "4. 再派員服務", "5. 提出檢修報價"];

    return (
     <form onSubmit={onSubmit} className="p-6 sm:p-8 space-y-8">
        <div className="text-center">
            <h1 className="text-4xl font-bold text-slate-800">富元機電有限公司</h1>
            <h2 className="text-3xl font-semibold text-slate-600 mt-1">工作服務單</h2>
        </div>
        <div className="space-y-6">
            <FormField label="工作日期及時間" id="dateTime" type="datetime-local" value={formData.dateTime} onChange={onInputChange} required />
            <FormField label="服務單位" id="serviceUnit" value={formData.serviceUnit} onChange={onInputChange} required />
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-6">
                <FormField label="接洽人" id="contactPerson" value={formData.contactPerson} onChange={onInputChange} />
                <FormField label="連絡電話" id="contactPhone" type="tel" value={formData.contactPhone} onChange={onInputChange} />
                <FormField label="製造單號" id="manufacturingOrderNumber" value={formData.manufacturingOrderNumber || ''} onChange={onInputChange} />
                <FormField label="業務會報單號" id="businessReportNumber" value={formData.businessReportNumber || ''} onChange={onInputChange} />
            </div>

            <FormField label="處理事項" id="tasks" type="textarea" value={formData.tasks} onChange={onInputChange} rows={8} cornerHint={`${tasksStatusTotal}/${TASKS_STATUS_LIMIT} 行`} />
            <FormField label="處理情形" id="status" type="textarea" value={formData.status} onChange={onInputChange} rows={8} cornerHint={`${tasksStatusTotal}/${TASKS_STATUS_LIMIT} 行`}/>
            
            <div>
              <div className="flex justify-between items-baseline mb-2">
                <label className="block text-lg font-medium text-slate-700">產品項目</label>
                <span className="text-sm text-slate-500 font-mono">{`${productsRemarksTotal}/${PRODUCTS_REMARKS_LIMIT} 行`}</span>
              </div>
              <div className="space-y-4">
                {formData.products.map((product, index) => (
                    <div key={product.id} className="grid grid-cols-12 gap-x-3 gap-y-4 p-4 border border-slate-300 rounded-lg relative">
                        <div className="col-span-12 sm:col-span-8">
                            <label htmlFor={`product-name-${index}`} className="block text-base font-medium text-slate-600">產品品名</label>
                            <input id={`product-name-${index}`} type="text" value={product.name} onChange={(e) => onProductChange(index, 'name', e.target.value)} className="mt-1 appearance-none block w-full px-3 py-2 border border-slate-500 rounded-md shadow-sm placeholder-slate-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 text-lg" />
                        </div>
                        <div className="col-span-12 sm:col-span-4">
                            <label htmlFor={`product-quantity-${index}`} className="block text-base font-medium text-slate-600">數量</label>
                            <select id={`product-quantity-${index}`} value={product.quantity} onChange={(e) => onProductChange(index, 'quantity', parseInt(e.target.value, 10))} className="mt-1 block w-full pl-3 pr-8 py-2 border-slate-500 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 text-lg rounded-md">
                                {Array.from({ length: 20 }, (_, i) => i + 1).map(q => <option key={q} value={q}>{q}</option>)}
                            </select>
                        </div>
                        <div className="col-span-12">
                            {(product.serialNumbers?.length || 0) > 0 && <label className="block text-base font-medium text-slate-600 mb-2">序號</label>}
                            <div className="space-y-2">
                                {(product.serialNumbers || []).map((serial, serialIndex) => (
                                    <div key={serialIndex} className="flex items-center gap-2">
                                        <span className="text-lg text-slate-500 font-mono w-8 text-right pr-2">#{serialIndex + 1}</span>
                                        <input type="text" value={serial} onChange={(e) => onProductSerialNumberChange(index, serialIndex, e.target.value)} placeholder={`第 ${serialIndex + 1} 組產品序號`} className="flex-1 min-w-0 appearance-none block w-full px-3 py-2 border border-slate-500 rounded-md shadow-sm placeholder-slate-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 text-lg" />
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
                <button type="button" onClick={onAddProduct} className="flex items-center justify-center w-full px-4 py-2 border-2 border-dashed border-slate-400 rounded-md text-lg font-medium text-slate-600 hover:bg-slate-50 hover:border-slate-500 focus:outline-none">
                    <PlusIcon className="w-5 h-5 mr-2" />
                    新增項目
                </button>
              </div>
            </div>

            <FormField label="備註" id="remarks" type="textarea" value={formData.remarks} onChange={onInputChange} autoSize cornerHint={`${productsRemarksTotal}/${PRODUCTS_REMARKS_LIMIT} 行`} />
            
            <div>
                <label className="block text-lg font-medium text-slate-700 mb-2">拍照插入圖片</label>
                <ImageUploader photos={formData.photos} onPhotosChange={onPhotosChange} />
            </div>
            <div>
                <div className="flex justify-between items-center mb-1">
                    <label className="block text-lg font-medium text-slate-700">服務人員</label>
                    <div className="flex items-center space-x-2">
                        <span className={`text-lg transition-colors ${technicianInputMode === 'signature' ? 'text-indigo-600 font-semibold' : 'text-slate-500'}`}>簽名</span>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" checked={technicianInputMode === 'select'} onChange={(e) => {
                                onTechnicianInputModeChange(e.target.checked ? 'select' : 'signature');
                                onTechnicianSignatureClear();
                            }} className="sr-only peer" />
                            <div className="w-11 h-6 bg-slate-200 rounded-full peer peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                        </label>
                        <span className={`text-lg transition-colors ${technicianInputMode === 'select' ? 'text-indigo-600 font-semibold' : 'text-slate-500'}`}>選單</span>
                    </div>
                </div>
                {technicianInputMode === 'signature' ? (
                    <SignaturePad 
                        signatureDataUrl={typeof formData.technicianSignature === 'string' && formData.technicianSignature.startsWith('data:image') ? formData.technicianSignature : null} 
                        onSave={onTechnicianSignatureSave} 
                        onClear={onTechnicianSignatureClear} 
                    />
                ) : (
                    <div className="mt-2 p-4 border-2 border-dashed border-slate-500 rounded-lg bg-slate-50 min-h-[212px] flex items-center justify-center text-center">
                        {formData.technicianSignature && typeof formData.technicianSignature === 'string' && !formData.technicianSignature.startsWith('data:image') ? (
                            <div>
                                <p className="text-5xl" style={{fontFamily: '"BiauKai", "KaiTi", "標楷體", serif'}}>{formData.technicianSignature}</p>
                                <button type="button" onClick={onTechnicianSignatureClear} className="mt-4 px-4 py-2 text-lg font-medium rounded-md shadow-sm text-red-600 bg-white border border-red-500 hover:bg-red-50">
                                    清除重選
                                </button>
                            </div>
                        ) : (
                            <button type="button" onClick={onSelectTechnician} className="px-6 py-3 text-xl font-medium text-white bg-indigo-600 rounded-md shadow-sm hover:bg-indigo-700">
                                從選單選擇服務人員
                            </button>
                        )}
                    </div>
                )}
            </div>
            <div>
                <label className="block text-lg font-medium text-slate-700 mb-1">客戶簽認</label>
                <SignaturePad signatureDataUrl={formData.signature} onSave={onCustomerSignatureSave} onClear={onCustomerSignatureClear} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <FormField label="服務總評" id="serviceRating" type="select" value={formData.serviceRating || ''} onChange={onInputChange}>
                    {serviceRatingOptions.map((opt, i) => <option key={i} value={opt} disabled={i===0}>{opt || '--- 請選擇 ---'}</option>)}
                </FormField>
                <FormField label="服務結案" id="serviceConclusion" type="select" value={formData.serviceConclusion || ''} onChange={onInputChange}>
                    {serviceConclusionOptions.map((opt, i) => <option key={i} value={opt} disabled={i===0}>{opt || '--- 請選擇 ---'}</option>)}
                </FormField>
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
                            // Reset select to show placeholder
                            e.target.value = '';
                        }}
                        defaultValue=""
                        className="w-full sm:w-auto px-3 py-2 border border-slate-500 text-slate-700 rounded-md shadow-sm text-lg font-medium bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
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

                    <button type="button" onClick={onSaveAsDraft} className="flex-1 sm:w-auto px-4 py-2 border border-blue-600 text-blue-600 rounded-md shadow-sm text-lg font-medium hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
                        另存新檔
                    </button>
                    <button type="button" onClick={onClearData} className="flex-1 sm:w-auto px-4 py-2 border border-red-600 text-red-600 rounded-md shadow-sm text-lg font-medium hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500">
                        清除資料
                    </button>
                </div>
                <button type="submit" className="w-full sm:w-auto px-8 py-4 border border-transparent rounded-md shadow-sm text-2xl font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
                    產生服務單報告
                </button>
            </div>
        </div>
    </form>
    );
};

// --- 報告相關元件 ---

/**
 * 專門用於產生 PDF 的照片附錄頁面元件。
 */
const PdfPhotoPage = ({ photos, pageNumber, totalPhotoPages, data, textPageCount, pdfTotalPages }: { photos: string[], pageNumber:number, totalPhotoPages: number, data: WorkOrderData, textPageCount: number, pdfTotalPages: number }) => {
    const formattedDate = data.dateTime ? new Date(data.dateTime).toLocaleDateString('zh-TW') : 'N/A';
    const pageTitle = totalPhotoPages > 1 ? `施工照片 (第 ${pageNumber} / ${totalPhotoPages} 頁) - ${data.serviceUnit} (${formattedDate})` : `施工照片 - ${data.serviceUnit} (${formattedDate})`;

    return (
        <div id={`pdf-photo-page-${pageNumber - 1}`} className="p-8 bg-white" style={{ width: '210mm', height: '297mm', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
            <div className="text-center mb-4 flex-shrink-0"><h3 className="text-2xl font-semibold text-slate-700">{pageTitle}</h3></div>
            <div className="grid grid-cols-2 grid-rows-2 gap-4 flex-grow min-h-0">
                {photos.map((photo, index) => (<div key={index} className="flex items-center justify-center border border-slate-300 p-1 bg-slate-50 rounded-md overflow-hidden"><img src={photo} alt={`photo-${index}`} className="max-w-full max-h-full object-contain" /></div>))}
                {/* 使用空白 div 填充剩餘的格子，確保佈局穩定 */}
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
    selectedTemplate: 'modern' | 'legacy';
    onTemplateChange: (template: 'modern' | 'legacy') => void;
    legacyLayoutOffsets: { x: number; y: number; };
    onLegacyOffsetChange: (axis: 'x' | 'y', value: number) => void;
}

/**
 * 報告預覽畫面元件，包含螢幕預覽和 PDF 操作按鈕。
 */
const ReportView: React.FC<ReportViewProps> = ({ data, onOpenUploadModal, onDownloadPdf, onReset, onEdit, isProcessing, selectedTemplate, onTemplateChange, legacyLayoutOffsets, onLegacyOffsetChange }) => {
    const photoChunks = chunk(data.photos, 4);
    
    // 預先計算 PDF 所需的頁數
    const tasksLines = calculateVisualLines(data.tasks);
    const statusLines = calculateVisualLines(data.status);
    const productsLines = data.products.filter(p => p.name.trim() !== '').length;
    const remarksLines = calculateVisualLines(data.remarks);
    const totalContentLines = tasksLines + statusLines + productsLines + remarksLines;
    
    // 為「智慧排版」計算頁數
    const modernTextPages = totalContentLines > TOTAL_CONTENT_LINES_LIMIT ? 2 : 1;
    const photoPages = photoChunks.length;
    const modernTotalPages = modernTextPages + photoPages;

    // 為「舊式表格」計算頁數
    const legacyTextPages = 1;
    const legacyTotalPages = legacyTextPages + photoPages;
    
    const totalPages = selectedTemplate === 'modern' ? modernTotalPages : legacyTotalPages;
    const textPageCount = selectedTemplate === 'modern' ? modernTextPages : legacyTextPages;

    // 為「舊式表格」的 PDF 版本建立專用的位移量
    // 根據使用者要求，在產生 PDF 時，將內容額外向上移動 9px (Y 軸 +9)
    const pdfLegacyOffsets = {
        x: legacyLayoutOffsets.x,
        y: legacyLayoutOffsets.y + 9,
    };

    return (
    <>
      {/* 這些是隱藏的容器，專門用於 html2canvas 渲染成 PDF */}
      <div className="pdf-render-container">
        {/* Modern Layouts for PDF */}
        {totalContentLines > TOTAL_CONTENT_LINES_LIMIT ? (
            <><ReportLayout data={data} mode="pdf-page1" currentPage={1} totalPages={modernTotalPages} /><ReportLayout data={data} mode="pdf-page2" currentPage={2} totalPages={modernTotalPages} /></>
        ) : (
            <ReportLayout data={data} mode="pdf-full" currentPage={1} totalPages={modernTotalPages} />
        )}

        {/* Legacy Layout for PDF */}
        <LegacyReportLayout data={data} currentPage={1} totalPages={legacyTotalPages} offsets={pdfLegacyOffsets} />
        
        {/* Photo Pages for BOTH Modern and Legacy PDFs */}
        {photoChunks.map((photoChunk, index) => (
            <PdfPhotoPage 
                key={index} 
                photos={photoChunk} 
                pageNumber={index + 1} 
                totalPhotoPages={photoChunks.length} 
                data={data} 
                textPageCount={textPageCount}
                pdfTotalPages={totalPages} 
            />
        ))}
      </div>
      
      {/* 這是顯示在螢幕上的預覽 */}
      <div className="p-4 sm:p-6 bg-slate-50/50 overflow-x-auto text-center">
        {selectedTemplate === 'modern' 
          ? (
            <div className="w-full max-w-[800px] mx-auto text-left">
              <div className="shadow-lg w-full"><ReportLayout data={data} mode="screen" /></div>
            </div>
            )
          : (
            <div className="inline-block shadow-lg transform scale-[0.9] origin-top">
              <LegacyReportLayout data={data} offsets={legacyLayoutOffsets} />
            </div>
            )
        }
      </div>

      {/* 操作按鈕區域 */}
      <div className="p-4 sm:p-6 bg-slate-50 border-t border-slate-200 flex flex-col gap-4">
        <div className="flex flex-wrap gap-4 justify-between items-center">
            <button onClick={onReset} className="px-6 py-3 text-xl bg-red-600 text-white font-semibold rounded-md shadow-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500">建立新服務單</button>
            <div className="flex flex-wrap gap-4 items-center">
              <div className="flex items-center p-1 bg-white rounded-md border border-slate-300 shadow-sm">
                <button onClick={() => onTemplateChange('modern')} disabled={isProcessing} className={`transition-all duration-200 px-3 py-1.5 text-lg rounded ${selectedTemplate === 'modern' ? 'bg-indigo-600 text-white shadow' : 'hover:bg-slate-100 text-slate-700'}`}>智慧排版</button>
                <button onClick={() => onTemplateChange('legacy')} disabled={isProcessing} className={`transition-all duration-200 px-3 py-1.5 text-lg rounded ${selectedTemplate === 'legacy' ? 'bg-indigo-600 text-white shadow' : 'hover:bg-slate-100 text-slate-700'}`}>舊式表格</button>
              </div>
              <button onClick={onOpenUploadModal} disabled={isProcessing} className="px-6 py-3 text-xl font-semibold bg-blue-600 text-white rounded-md shadow-sm hover:bg-blue-700 disabled:opacity-50">上傳PDF</button>
              <button onClick={onDownloadPdf} disabled={isProcessing} className="px-6 py-3 text-xl font-semibold bg-white border border-slate-400 text-slate-700 rounded-md shadow-sm hover:bg-slate-50 disabled:opacity-50">下載PDF</button>
              <button onClick={onEdit} disabled={isProcessing} className="px-6 py-3 text-xl font-semibold bg-white border border-slate-400 text-slate-700 rounded-md shadow-sm hover:bg-slate-50">修改內容</button>
            </div>
        </div>
         {selectedTemplate === 'legacy' && (
            <div className="p-3 bg-slate-200/70 rounded-md border border-slate-300 w-full flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-lg">
                <h4 className="font-semibold text-slate-800">版面位置微調:</h4>
                <div className="flex items-center gap-2">
                    <label htmlFor="offsetX" className="font-medium">左右 (X):</label>
                    <input type="range" id="offsetX" min="-20" max="20" step="1" value={legacyLayoutOffsets.x} onChange={(e) => onLegacyOffsetChange('x', parseInt(e.target.value, 10))} className="w-32 sm:w-40" />
                    <span className="font-mono w-12 text-center tabular-nums">{legacyLayoutOffsets.x}px</span>
                </div>
                 <div className="flex items-center gap-2">
                    <label htmlFor="offsetY" className="font-medium">上下 (Y):</label>
                    <input type="range" id="offsetY" min="-20" max="20" step="1" value={legacyLayoutOffsets.y} onChange={(e) => onLegacyOffsetChange('y', parseInt(e.target.value, 10))} className="w-32 sm:w-40" />
                    <span className="font-mono w-12 text-center tabular-nums">{legacyLayoutOffsets.y}px</span>
                </div>
                <button onClick={() => { onLegacyOffsetChange('x', 0); onLegacyOffsetChange('y', 0); }} className="px-3 py-1 text-base bg-white border border-slate-400 rounded-md shadow-sm hover:bg-slate-100">
                    重設
                </button>
            </div>
        )}
      </div>
    </>
    );
};

// --- 主應用程式元件 ---

/**
 * 當 Google API 金鑰未設定時顯示的錯誤提示元件。
 */
const ApiKeyErrorDisplay = () => (
    <div className="p-8 text-center bg-red-50 border-l-4 border-red-400">
        <h3 className="text-2xl font-bold text-red-800">⛔️ Google Drive 功能設定錯誤</h3>
        <p className="mt-2 text-lg text-red-700">應用程式偵測到 Google API 金鑰或用戶端 ID 尚未設定。</p>
        <p className="mt-4 text-base text-slate-600 bg-slate-100 p-3 rounded-md">請開發者依照 <code>README.md</code> 檔案中的指示，建立 <code>.env.local</code> 檔案並填入正確的金鑰資訊，以啟用雲端硬碟匯出/匯入功能。</p>
    </div>
);

const DropboxApiKeyErrorDisplay = () => {
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    return (
    <div className="p-8 text-center bg-blue-50 border-l-4 border-blue-400">
        <h3 className="text-2xl font-bold text-blue-800">☁️ Dropbox 功能設定不完整</h3>
        <p className="mt-2 text-lg text-blue-700">應用程式偵測到 Dropbox 上傳服務所需的部分資訊尚未設定。</p>
        <div className="mt-4 text-base text-slate-600 bg-slate-100 p-4 rounded-md text-left">
           <p className="font-semibold">請開發者依照以下步驟解決：</p>
           {isLocal ? (
            <ul className="list-disc list-inside mt-2 space-y-1">
                <li>請在專案的根目錄下，找到或建立 <code>.env.local</code> 檔案。</li>
                <li>確認檔案中包含以下**所有**變數並已填入正確的值：
                    <ul className="list-['-_'] list-inside ml-4 mt-1 font-mono bg-slate-200 p-2 rounded">
                        <li>DROPBOX_APP_KEY</li> <li>DROPBOX_APP_SECRET</li> <li>DROPBOX_REFRESH_TOKEN</li>
                    </ul>
                </li>
                 <li>修改完畢後，請務必**重新啟動**本地開發伺服器 (關閉後再執行 <code>npm run dev</code>)。</li>
            </ul>
           ) : (
            <ul className="list-disc list-inside mt-2 space-y-1">
                <li>請登入您的網站託管平台 (例如 Netlify, Vercel)。</li>
                <li>前往網站設定中的「環境變數 (Environment variables)」區塊。</li>
                <li>確認以下**所有**變數都已建立並填入正確的值：
                    <ul className="list-['-_'] list-inside ml-4 mt-1 font-mono bg-slate-200 p-2 rounded">
                        <li>DROPBOX_APP_KEY</li> <li>DROPBOX_APP_SECRET</li> <li>DROPBOX_REFRESH_TOKEN</li>
                    </ul>
                </li>
                <li>儲存設定後，請**重新部署 (re-deploy)** 您的網站以讓變更生效。</li>
            </ul>
           )}
           <p className="mt-3">詳細的權杖取得方式，請參考專案中的 <code>README.md</code> 文件。</p>
        </div>
    </div>
    );
};

/**
 * 當 Brevo Email API 金鑰未設定時顯示的錯誤提示元件。
 */
const BrevoApiKeyErrorDisplay = () => {
    // 根據執行環境（本地或線上）顯示不同的解決方案提示
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    return (
    <div className="p-8 text-center bg-orange-50 border-l-4 border-orange-400">
        <h3 className="text-2xl font-bold text-orange-800">✉️ Email 功能設定不完整</h3>
        <p className="mt-2 text-lg text-orange-700">應用程式偵測到 Email 發送服務所需的部分資訊尚未設定。</p>
        <div className="mt-4 text-base text-slate-600 bg-slate-100 p-4 rounded-md text-left">
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

/**
 * 應用程式的根元件 (Root Component)。
 */
export const App: React.FC = () => {
  // --- State 定義 ---
  /** 當前表單的資料 */
  const [formData, setFormData] = useState<WorkOrderData>(initialFormData);
  /** 已儲存的本機暫存檔 */
  const [namedDrafts, setNamedDrafts] = useState<{ [name: string]: WorkOrderData }>({});
  /** 標記表單是否已提交並進入預覽模式 */
  const [isSubmitted, setIsSubmitted] = useState(false);
  /** 標記是否正在進行非同步處理 (如 PDF 產生、上傳) */
  const [isProcessing, setIsProcessing] = useState(false);
  /** 標記 Google API Client 是否已準備就緒 */
  const [gapiReady, setGapiReady] = useState(false);
  /** 標記 Google Identity Services (GIS) 是否已準備就緒 */
  const [gisReady, setGisReady] = useState(false);
  /** Google OAuth Token Client 實例 */
  const [tokenClient, setTokenClient] = useState<any>(null);
  /** 標記 Google Picker API 是否已載入 */
  const pickerApiLoaded = useRef(false);
  /** 通用彈出視窗的狀態 */
  const [modalState, setModalState] = useState<ModalState>(initialModalState);
  /** Dropbox 授權狀態 */
  const [dropboxStatus, setDropboxStatus] = useState<'unchecked' | 'checking' | 'ok' | 'error'>('unchecked');
  /** 用於儲存最新的、有效的 Dropbox Refresh Token */
  const [liveRefreshToken, setLiveRefreshToken] = useState<string | null>(DROPBOX_REFRESH_TOKEN || null);
  /** 使用者選擇的報告模板 */
  const [selectedTemplate, setSelectedTemplate] = useState<'modern' | 'legacy'>('modern');
  /** 舊式表格的 XY 軸偏移量 */
  const [legacyLayoutOffsets, setLegacyLayoutOffsets] = useState({ x: 0, y: 0 });
  /** 服務人員簽名輸入模式 */
  const [technicianInputMode, setTechnicianInputMode] = useState<'signature' | 'select'>('signature');
  /** 使用手冊顯示狀態 */
  const [showManual, setShowManual] = useState(false);


  // --- 組態檢查 ---
  /** 檢查 Dropbox 功能是否已設定 */
  const isDropboxConfigured = !!(DROPBOX_APP_KEY && DROPBOX_APP_SECRET && liveRefreshToken);
  /** 檢查 Google Drive 功能是否已設定 */
  const isGoogleApiConfigured = !!(API_KEY && CLIENT_ID);
  /** 檢查 Brevo Email 功能是否已設定 */
  const isBrevoApiConfigured = !!(BREVO_API_KEY && BREVO_SENDER_EMAIL && BREVO_SENDER_NAME);

  // --- 彈出視窗相關函式 ---
  const closeModal = useCallback(() => setModalState(initialModalState), []);
  
  /** 顯示一個簡單的提示訊息視窗 */
  const showAlert = useCallback((title: string, content: React.ReactNode) => {
    setModalState({ isOpen: true, title, content, onClose: closeModal });
  }, [closeModal]);
  
  /** 
   * 顯示一個帶有確認和取消按鈕的確認視窗。
   * The `onConfirm` callback is now responsible for closing the modal, either by calling `closeModal()`
   * or by showing another modal (which replaces the current one).
   */
  const showConfirm = useCallback((title: string, content: React.ReactNode, onConfirm: () => void, confirmText?: string, confirmClass?: string) => {
    setModalState({ isOpen: true, title, content, onConfirm, confirmText, confirmClass, onClose: closeModal });
  }, [closeModal]);
  
  /** 顯示一個帶有輸入框的提示輸入視窗 */
  const showPrompt = useCallback((title: string, content: React.ReactNode, onConfirm: (value: string) => void) => {
    let inputValue = '';
    const PromptContent = <>
      {content}
      <input type="text" autoFocus onChange={e => inputValue = e.target.value} className="mt-2 appearance-none block w-full px-3 py-2 border border-slate-500 rounded-md shadow-sm placeholder-slate-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 text-lg" />
    </>;
    setModalState({ isOpen: true, title, content: PromptContent, onConfirm: () => onConfirm(inputValue), confirmText: "確認", onClose: closeModal});
  }, [closeModal]);
  
  /**
   * 將 Data URL 字串轉換為 Blob 物件。
   * @param {string} dataurl - 要轉換的 Data URL。
   * @returns {Blob} - 轉換後的 Blob 物件。
   */
  const dataURLtoBlob = (dataurl: string): Blob => {
      const arr = dataurl.split(',');
      if (arr.length < 2) throw new Error('Invalid data URL: missing comma');
      
      const mimeMatch = arr[0].match(/:(.*?);/);
      if (!mimeMatch) throw new Error('Invalid data URL: could not parse MIME type');
      
      const mime = mimeMatch[1];
      const bstr = atob(arr[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) {
          u8arr[n] = bstr.charCodeAt(n);
      }
      return new Blob([u8arr], { type: mime });
  };

  /**
   * 從 Dropbox API 獲取一個新的 Access Token 並可能更新 Refresh Token。
   */
  const getDropboxAccessToken = useCallback(async (): Promise<{ accessToken: string; newRefreshToken?: string }> => {
    if (!isDropboxConfigured) {
        throw new Error("Dropbox 應用程式憑證未完整設定。");
    }
    
    const params = new URLSearchParams();
    params.append('grant_type', 'refresh_token');
    params.append('refresh_token', liveRefreshToken!);
    
    // 使用 App Key 和 App Secret 進行 Basic Authentication
    const authHeader = 'Basic ' + btoa(`${DROPBOX_APP_KEY}:${DROPBOX_APP_SECRET}`);

    const response = await fetch('https://api.dropbox.com/oauth2/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': authHeader,
        },
        body: params,
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error("Dropbox token refresh error response:", errorText);
        // 提供更具體的錯誤訊息給開發者
        if (errorText.includes("invalid_grant")) {
            throw new Error(`更新 Dropbox 權杖失敗：無效的 Refresh Token。它可能已過期、被撤銷或不正確。請重新產生一個 Refresh Token 並更新應用程式設定。`);
        }
        if (errorText.includes("invalid_client")) {
            throw new Error(`更新 Dropbox 權杖失敗：無效的 App Key 或 App Secret。請檢查應用程式設定。`);
        }
        throw new Error(`更新 Dropbox 權杖失敗 (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    if (!data.access_token) {
        throw new Error("從 Dropbox API 回應中找不到 Access Token。");
    }
    // 返回包含 Access Token 和可能的新 Refresh Token 的物件
    return {
        accessToken: data.access_token,
        newRefreshToken: data.refresh_token, // Dropbox 可能會返回一個新的 refresh token
    };
  }, [isDropboxConfigured, liveRefreshToken]);

  const checkDropboxStatus = useCallback(async () => {
    if (!isDropboxConfigured) {
        setDropboxStatus('error');
        return;
    }
    setDropboxStatus('checking');
    try {
        const { newRefreshToken } = await getDropboxAccessToken();
        // 如果獲取到新的 refresh token，就更新 state
        if (newRefreshToken) {
            setLiveRefreshToken(newRefreshToken);
        }
        setDropboxStatus('ok');
    } catch (error) {
        console.error("Dropbox auth check failed:", error);
        setDropboxStatus('error');
    }
  }, [isDropboxConfigured, getDropboxAccessToken]);

  // --- Effect Hooks ---
  /**
   * 應用程式初始化 Effect。
   */
  useEffect(() => {
    if (sessionStorage.getItem('welcomeBannerDismissed') !== 'true') {
        alert('溫馨提醒：請記得使用Chrome、Edge、Firefox等瀏覽器開啟，以確保所有功能正常運作，謝謝！');
        sessionStorage.setItem('welcomeBannerDismissed', 'true');
    }

    checkDropboxStatus();

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
  }, [isGoogleApiConfigured, checkDropboxStatus]);

  /**
   * 從 localStorage 載入已儲存的暫存檔。
   */
  useEffect(() => {
    try {
        const savedDrafts = localStorage.getItem(NAMED_DRAFTS_STORAGE_KEY);
        if (savedDrafts) { setNamedDrafts(JSON.parse(savedDrafts)); }
    } catch (error) { console.error("Failed to load named drafts.", error); }
  }, []);

  // --- 回呼函式 (useCallback 用於效能優化) ---
  /**
   * 清空目前表單，重設為初始狀態。
   */
  const clearCurrentForm = useCallback(() => {
    setFormData({ ...initialFormData, products: [{ ...initialProduct, id: `product-${Date.now()}` }], dateTime: getFormattedDateTime() });
  }, []);

  /**
   * 處理表單欄位的通用輸入變更。
   */
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => {
      const tempState = {...prev, [name]: value};
      if ((name === 'tasks' || name === 'status') && calculateVisualLines(tempState.tasks) + calculateVisualLines(tempState.status) > TASKS_STATUS_LIMIT) return prev;
      if (name === 'remarks' && prev.products.reduce((acc, p) => acc + p.quantity, 0) + calculateVisualLines(tempState.remarks) > PRODUCTS_REMARKS_LIMIT) return prev;
      return tempState;
    });
  }, []);
  
  /**
   * 處理產品項目的名稱或數量變更。
   */
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
  }, [showAlert]);
  
  /**
   * 處理產品序號的輸入變更。
   */
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

  /**
   * 新增一個空的產品項目。
   */
  const handleAddProduct = () => {
    if (formData.products.reduce((acc, p) => acc + p.quantity, 0) + 1 + calculateVisualLines(formData.remarks) > PRODUCTS_REMARKS_LIMIT) {
        showAlert('行數超限', `已達產品與備註的總行數上限 (${PRODUCTS_REMARKS_LIMIT})，無法新增產品。`);
        return;
    }
    setFormData(prev => ({ ...prev, products: [...prev.products, { ...initialProduct, id: `product-${Date.now()}` }] }));
  };

  /**
   * 移除一個指定的產品項目。
   */
  const handleRemoveProduct = (index: number) => {
    if (formData.products.length <= 1) return; // 至少保留一項
    setFormData(prev => ({ ...prev, products: prev.products.filter((_, i) => i !== index) }));
  };

  // --- 簽名和照片的處理函式 ---
  const handleCustomerSignatureSave = useCallback((s: string) => setFormData(p => ({ ...p, signature: s })), []);
  const handleCustomerSignatureClear = useCallback(() => setFormData(p => ({ ...p, signature: null })), []);
  const handleTechnicianSignatureSave = useCallback((s: string) => setFormData(p => ({ ...p, technicianSignature: s })), []);
  const handleTechnicianSignatureClear = useCallback(() => setFormData(p => ({ ...p, technicianSignature: null })), []);
  const handlePhotosChange = useCallback((photos: string[]) => setFormData(p => ({ ...p, photos })), []);
  
  // --- 表單主要操作 ---
  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); setIsSubmitted(true); window.scrollTo(0, 0); };
  const handleEdit = () => setIsSubmitted(false);
  const handleReset = useCallback(() => { 
    showConfirm("確認清除?", "確定要清除所有資料並建立新的服務單嗎？", () => {
      clearCurrentForm(); 
      setIsSubmitted(false);
      closeModal();
    }, "確認清除", "bg-red-600 hover:bg-red-700 focus:ring-red-500");
  }, [clearCurrentForm, showConfirm, closeModal]);

  const handleLegacyOffsetChange = (axis: 'x' | 'y', value: number) => {
    setLegacyLayoutOffsets(prev => ({ ...prev, [axis]: value }));
  };

  /**
   * 處理報告模板的切換，並在切換至舊式表格時檢查內容是否超限。
   */
  const handleTemplateChange = (template: 'modern' | 'legacy') => {
    if (template === 'legacy') {
        const errorMessages = [];

        // 檢查文字內容是否超過 11 行
        const tasksLines = calculateVisualLines(formData.tasks, 25);
        if (tasksLines > LEGACY_TEXT_AREA_LINE_LIMIT) {
            errorMessages.push(`「處理事項」內容超過版面限制 (約 ${LEGACY_TEXT_AREA_LINE_LIMIT} 行)。`);
        }
        const statusLines = calculateVisualLines(formData.status, 20);
        if (statusLines > LEGACY_TEXT_AREA_LINE_LIMIT) {
            errorMessages.push(`「處理情形」內容超過版面限制 (約 ${LEGACY_TEXT_AREA_LINE_LIMIT} 行)。`);
        }
        const remarksLines = calculateVisualLines(formData.remarks, 15);
        if (remarksLines > LEGACY_TEXT_AREA_LINE_LIMIT) {
            errorMessages.push(`「備註」內容超過版面限制 (約 ${LEGACY_TEXT_AREA_LINE_LIMIT} 行)。`);
        }

        // 檢查產品項目總行數是否超過 4 行
        const productItemsText = formData.products
          .filter(p => p.name.trim() !== '')
          .map(p => {
            const serials = (p.serialNumbers || []).map(s => s.trim()).filter(Boolean);
            const serialsText = serials.length > 0 ? ` S/N: ${serials.join(', ')}` : '';
            return `${p.name} (數量: ${p.quantity})${serialsText}`;
          })
          .join('\n');
        
        // 舊式表格的產品欄位是單欄滿版，因此使用較大的每行字元數估算
        const totalProductLines = calculateVisualLines(productItemsText, 50);
        
        if (totalProductLines > LEGACY_PRODUCT_AREA_LINE_LIMIT) {
            errorMessages.push(`「產品品名及S/N」內容超過版面限制 (約 ${LEGACY_PRODUCT_AREA_LINE_LIMIT} 行)。`);
        }

        if (errorMessages.length > 0) {
            const fullMessage = (
                <div>
                    <p>內容在舊式表格中可能會被裁切：</p>
                    <ul className="list-disc list-inside mt-2 text-left">
                        {errorMessages.map((msg, i) => <li key={i}>{msg}</li>)}
                    </ul>
                    <p className="mt-4">建議您縮減內容，或使用「智慧排版」以獲得最佳顯示效果。</p>
                </div>
            );
            showAlert('內容可能過長', fullMessage);
        }
    }
    setSelectedTemplate(template);
  };
  
  /**
   * 儲存目前表單內容為一個具名暫存檔。
   */
  const handleSaveAsDraft = useCallback(() => {
    showPrompt("儲存暫存", "請為此暫存命名：", (draftName) => {
        const finalDraftName = draftName ? draftName.trim() : "";
        if (!finalDraftName) {
            showAlert('儲存失敗', '暫存檔名不可為空。請重新操作一次。');
            return;
        }

        const currentDrafts = { ...namedDrafts };
        const isOverwriting = !!currentDrafts[finalDraftName];

        const performSave = () => {
            const newDrafts = { ...currentDrafts, [finalDraftName]: formData };
            setNamedDrafts(newDrafts);
            localStorage.setItem(NAMED_DRAFTS_STORAGE_KEY, JSON.stringify(newDrafts));
            showAlert('儲存成功', <>✅ 暫存 "{finalDraftName}" 已儲存！<br/><br/><b className="font-semibold">重要提醒：</b><br/>暫存資料會因清理瀏覽器快取而消失，請注意備份。</>);
        };

        if (isOverwriting) {
            showConfirm(`覆蓋確認`, `暫存 "${finalDraftName}" 已存在。要覆蓋它嗎？`, () => {
                performSave();
            }, "確認覆蓋");
        } else {
            if (Object.keys(currentDrafts).length >= MAX_DRAFTS) {
                showAlert('儲存失敗', `無法儲存，已達上限 (${MAX_DRAFTS}份)。`);
                return;
            }
            performSave();
        }
    });
  }, [formData, namedDrafts, showPrompt, showAlert, showConfirm]);

  /**
   * 載入指定的暫存檔，並覆蓋目前表單內容。
   */
  const handleLoadDraft = useCallback((name: string) => {
    if (namedDrafts[name]) {
        showConfirm("載入確認", `確定要載入 "${name}" 嗎？這將覆蓋目前內容。`, () => {
            setFormData(migrateWorkOrderData(namedDrafts[name]));
            showAlert('載入成功', `暫存 "${name}" 已載入。`);
        });
    }
  }, [namedDrafts, showConfirm, showAlert]);

  /**
   * 清除目前表單的所有欄位，但不進入預覽模式。
   */
  const handleClearData = useCallback(() => {
    showConfirm("確認清除?", "確定要清除目前表單的所有欄位嗎？", () => {
        clearCurrentForm();
        showAlert('操作完成', '表單資料已清除。');
    }, "確認清除", "bg-red-600 hover:bg-red-700 focus:ring-red-500");
  }, [clearCurrentForm, showConfirm, showAlert]);
  
  /**
   * 獲取 Google OAuth 授權 Token。
   */
  const getAuthToken = useCallback(() => {
    return new Promise((resolve, reject) => {
        if (!tokenClient) return reject(new Error("Google Auth client is not ready."));
        tokenClient.callback = (resp: any) => {
            if (resp.error) {
                localStorage.removeItem(GOOGLE_AUTH_GRANTED_KEY);
                reject(resp);
            } else {
                localStorage.setItem(GOOGLE_AUTH_GRANTED_KEY, 'true');
                resolve(resp);
            }
        };
        if (localStorage.getItem(GOOGLE_AUTH_GRANTED_KEY)) {
            tokenClient.requestAccessToken({ prompt: '' });
        } else {
            tokenClient.requestAccessToken({ prompt: 'consent' });
        }
    });
  }, [tokenClient]);
  
  /**
   * 打開一個用於選擇暫存檔進行刪除或匯出的彈出視窗。
   */
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
      <select id="draft-select" defaultValue={selectedDraft} onChange={(e) => selectedDraft = e.target.value} className="mt-1 block w-full pl-3 pr-10 py-2 text-lg border-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-base rounded-md">
        {draftNames.map(name => <option key={name} value={name}>{name}</option>)}
      </select>
    </div>;

    setModalState({ isOpen: true, title, content, onConfirm: onConfirmAction, confirmText, confirmClass, onClose: closeModal, backgroundIcon: action === 'delete' ? undefined : <Cog6ToothIcon className="w-48 h-48" /> });
  };
  
  const handleDeleteDraft = () => openDraftActionModal('delete');
  const handleExportToDrive = () => openDraftActionModal('export');
  
  /**
   * 執行匯出暫存檔至 Google Drive 的操作。
   */
  const performExportToDrive = useCallback(async (nameToExport: string) => {
    if (!gapiReady || !gisReady || !namedDrafts[nameToExport]) { showAlert("匯出錯誤", "匯出功能未就緒或找不到暫存。"); return; }
    try {
        await getAuthToken();
        const form = new FormData();
        const metadata = { 'name': `${nameToExport}-服務單暫存.json`, 'mimeType': 'application/json', 'parents': ['root'] };
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', new Blob([JSON.stringify(namedDrafts[nameToExport], null, 2)], { type: 'application/json' }));
        
        const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', { 
            method: 'POST', 
            headers: new Headers({ 'Authorization': 'Bearer ' + gapi.client.getToken().access_token }), 
            body: form 
        });

        if (!res.ok) { 
            const err = await res.json(); 
            throw new Error(`匯出失敗：${err.error?.message || res.statusText}`); 
        }
        showAlert('匯出成功', `暫存 "${nameToExport}" 已成功匯出至 Google 雲端硬碟！`);
    } catch (error) { 
        console.error("GDrive export failed", error); 
        showAlert('匯出失敗', `匯出失敗：${error instanceof Error ? error.message : "未知錯誤"}`); 
    }
  }, [gapiReady, gisReady, namedDrafts, getAuthToken, showAlert]);

  /**
   * 載入 Google Picker API。
   */
  const loadPickerApi = useCallback(async () => {
    if (pickerApiLoaded.current) return;
    return new Promise<void>((resolve, reject) => gapi.load('picker', (err: any) => err ? reject(err) : (pickerApiLoaded.current = true, resolve())));
  }, []);

  /**
   * 顯示 Google Drive 檔案選擇器。
   */
  const showGooglePicker = useCallback(async (): Promise<any> => {
    return new Promise((resolve) => {
        const picker = new google.picker.PickerBuilder()
            .addView(new google.picker.View(google.picker.ViewId.DOCS).setMimeTypes("application/json"))
            .setOAuthToken(gapi.client.getToken().access_token).setDeveloperKey(API_KEY)
            .setCallback((data: any) => { 
                if (data.action === google.picker.Action.PICKED) { resolve(data.docs?.[0]); } 
                else if (data.action === google.picker.Action.CANCEL) { resolve(null); } 
            })
            .build();
        picker.setVisible(true);
    });
  }, [API_KEY]); // API_KEY 是依賴項

  /**
   * 處理從 Google Drive 匯入暫存檔的完整流程。
   */
  const handleImportFromDrive = useCallback(async () => {
    if (!isGoogleApiConfigured) return showAlert("功能未設定", "Google Drive 功能未設定。");
    if (!gapiReady || !gisReady) return showAlert("尚未就緒", "Google Drive 功能正在初始化，請稍候。");
    try {
        await getAuthToken(); await loadPickerApi();
        const doc = await showGooglePicker();
        if (!doc?.id) return; // 使用者取消選擇
        
        const res = await gapi.client.drive.files.get({ fileId: doc.id, alt: 'media' });
        const importedData = (typeof res.result === 'object') ? res.result : JSON.parse(res.result);
        
        showPrompt("匯入暫存", `請為匯入的檔案 (${doc.name}) 命名：`, (dName) => {
            if (!dName) {
              closeModal();
              return;
            }
            setNamedDrafts(cD => {
                const newDrafts = { ...cD, [dName]: migrateWorkOrderData(importedData) };
                if (cD[dName]) {
                    showConfirm("覆蓋確認", `暫存 "${dName}" 已存在，要覆蓋嗎？`, () => {
                      localStorage.setItem(NAMED_DRAFTS_STORAGE_KEY, JSON.stringify(newDrafts));
                      setNamedDrafts(newDrafts);
                      showAlert('匯入成功', `✅ 暫存 "${dName}" 已成功從雲端匯入並覆蓋！`);
                    });
                    return cD; // 暫不更新 state，等待使用者確認
                }
                if (Object.keys(cD).length >= MAX_DRAFTS) { 
                    showAlert('儲存失敗', `無法儲存，已達上限 (${MAX_DRAFTS}份)。`); 
                    return cD; 
                }
                localStorage.setItem(NAMED_DRAFTS_STORAGE_KEY, JSON.stringify(newDrafts));
                showAlert('匯入成功', `✅ 暫存 "${dName}" 已成功從雲端匯入！`);
                return newDrafts;
            });
        });
    } catch (error: any) {
        console.error("GDrive import failed:", error);
        showAlert('匯入失敗', `匯入失敗: ${error?.result?.error?.message || error?.message || '未知錯誤'}`);
    }
  }, [gapiReady, gisReady, getAuthToken, loadPickerApi, showGooglePicker, isGoogleApiConfigured, showAlert, showPrompt, showConfirm, closeModal]);

  /**
   * 產生 PDF 檔案的 Blob 物件。
   */
  const generatePdfBlob = useCallback(async (template: 'modern' | 'legacy'): Promise<Blob | null> => {
    try {
      const { jsPDF: JSPDF } = (window as any).jspdf;
      const pdf = new JSPDF('p', 'mm', 'a4');
      const options = { scale: 2, useCORS: true, backgroundColor: '#ffffff' };
      const photoChunks = chunk(formData.photos, 4);

      if (template === 'legacy') {
        const legacyEl = document.getElementById('pdf-legacy-report');
        if (!legacyEl) {
          showAlert("PDF 產生失敗", "找不到舊式表格的渲染元素。");
          return null;
        }
        const canvas = await html2canvas(legacyEl, options);
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 210, 297);
      } else { // Modern layout logic
        const totalContentLines = calculateVisualLines(formData.tasks) + calculateVisualLines(formData.status) + formData.products.filter(p => p.name.trim() !== '').length + calculateVisualLines(formData.remarks);
        if (totalContentLines > TOTAL_CONTENT_LINES_LIMIT) {
          const [p1, p2] = await Promise.all([html2canvas(document.getElementById('pdf-pdf-page1')!, options), html2canvas(document.getElementById('pdf-pdf-page2')!, options)]);
          pdf.addImage(p1.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 210, 297);
          pdf.addPage();
          pdf.addImage(p2.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 210, 297);
        } else {
          const canvas = await html2canvas(document.getElementById('pdf-pdf-full')!, options);
          pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 210, Math.min(297, (canvas.height * 210) / canvas.width));
        }
      }
      
      // Add photo pages for BOTH templates
      for (let i = 0; i < photoChunks.length; i++) {
        const photoPageEl = document.getElementById(`pdf-photo-page-${i}`);
        if (photoPageEl) {
          pdf.addPage();
          const canvas = await html2canvas(photoPageEl, options);
          pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 210, 297);
        }
      }
      
      return pdf.output('blob');
    } catch (error) {
      console.error("PDF blob generation failed:", error);
      showAlert("PDF 產生失敗", "無法產生PDF，請檢查主控台錯誤。");
      return null;
    }
  }, [formData, showAlert]);

  /**
   * 處理下載 PDF 到本機。
   */
  const handleDownloadPdf = useCallback(async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      const blob = await generatePdfBlob(selectedTemplate);
      if (!blob) return;
      const fileName = `工作服務單-${formData.serviceUnit || 'report'}-${new Date().toISOString().split('T')[0]}.pdf`;
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);

      const successButtons: ModalButton[] = [];
    
      if (GOOGLE_REDIRECT_URI) {
        successButtons.unshift({
          text: '外出/加班紀錄表',
          onClick: () => {
            window.open(GOOGLE_REDIRECT_URI, '_blank');
          },
          className: 'text-white bg-sky-600 hover:bg-sky-700 focus:ring-sky-500'
        });
      }
      
      setModalState({
          isOpen: true,
          title: '✅ 下載成功',
          content: `檔案 ${fileName} 已開始下載。`,
          onClose: closeModal,
          backgroundIcon: <CheckCircleIcon className="w-48 h-48" />,
          footerButtons: successButtons,
      });

    } finally {
      setIsProcessing(false);
    }
  }, [isProcessing, formData, generatePdfBlob, selectedTemplate, closeModal]);

  /**
   * 上傳 Blob 到 Dropbox 的指定路徑。此函式會在內部自動獲取最新的 Access Token。
   */
  const performDropboxUpload = useCallback(async (blob: Blob, fullPath: string) => {
    const { accessToken, newRefreshToken } = await getDropboxAccessToken();
    if (newRefreshToken) {
        setLiveRefreshToken(newRefreshToken);
    }
    
    const args = { path: fullPath, mode: 'add', autorename: true, mute: false, strict_conflict: false };
    const escapeNonAscii = (str: string) => str.replace(/[\u007f-\uffff]/g, c => '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4));
    
    const response = await fetch('https://content.dropboxapi.com/2/files/upload', {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${accessToken}`, 
        'Dropbox-API-Arg': escapeNonAscii(JSON.stringify(args)), 
        'Content-Type': 'application/octet-stream' 
      },
      body: blob
    });

    if (!response.ok) {
        let errorDetails = "未知錯誤";
        let userFriendlyMessage = "";
        try {
            const errorJson = await response.json();
            errorDetails = errorJson.error_summary || JSON.stringify(errorJson);
            
            if (typeof errorDetails === 'string' && errorDetails.includes('invalid_access_token')) {
                userFriendlyMessage = `無效的存取權杖 (invalid_access_token)。\n\n這通常表示 App 的權限不足 (例如缺少 'files.content.write')，或是 Refresh Token 已失效或被撤銷。\n\n請依照 README 文件，前往 Dropbox App 設定頁面，確認已勾選 'files.content.write' 權限後，再重新產生一個 Refresh Token 並更新至您的應用程式設定。`;
            } else if (typeof errorDetails === 'string' && errorDetails.includes('path/not_found')) {
                userFriendlyMessage = `找不到指定的路徑。請確認 '/工作服務單' 資料夾存在於您的 Dropbox 根目錄。`;
            } else {
                userFriendlyMessage = `Dropbox API 錯誤: ${errorDetails}`;
            }
        } catch (e) {
            errorDetails = await response.text();
            userFriendlyMessage = `Dropbox API 錯誤: ${errorDetails}`;
        }
        console.error(`Dropbox API Error for path: ${fullPath}`, errorDetails);
        throw new Error(userFriendlyMessage);
    }
    return await response.json();
  }, [getDropboxAccessToken]);

  /**
   * 透過 Brevo (Sendinblue) API 發送帶有 PDF 附件的 Email。
   */
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
  }, [formData.dateTime, formData.serviceUnit, isBrevoApiConfigured]);

  /**
   * 處理上傳/寄送確認視窗的最終操作。
   */
  const handleConfirmUpload = useCallback(async (options: { uploadToNas: boolean; sendByEmail: boolean; emailRecipients: string }) => {
    const { uploadToNas, sendByEmail, emailRecipients } = options;
    if (!uploadToNas && !sendByEmail) { showAlert('未選擇操作', '請至少選擇一個操作 (上傳至 NAS 或透過 Email 寄送)。'); return; }
    
    setIsProcessing(true);
    closeModal();

    try {
        const needsPdf = uploadToNas || sendByEmail;
        const pdfBlob = needsPdf ? await generatePdfBlob(selectedTemplate) : null;
        if (needsPdf && !pdfBlob) {
            throw new Error('PDF 產生失敗，操作已取消。');
        }

        const tasks: { type: 'nas' | 'email'; promise: Promise<any> }[] = [];
        const serviceDate = formData.dateTime.split('T')[0];
        const pdfFileNameForEmail = `工作服務單-${serviceDate}-${formData.serviceUnit || 'report'}.pdf`;
        
        // 建立一個統一的錯誤處理函式，以便追蹤
        const createNasUploadTask = async () => {
          if (!pdfBlob) return; // 確保 pdfBlob 存在
          const folderName = `${serviceDate}-${formData.serviceUnit || '未命名服務'}`;
          const basePath = `/工作服務單/${folderName}`;

          // 1. 上傳 PDF。
          const nasPdfFileName = `工作服務單-${formData.serviceUnit || '未命名服務'}-${serviceDate}.pdf`;
          const pdfPath = `${basePath}/${nasPdfFileName}`;
          await performDropboxUpload(pdfBlob, pdfPath);

          // 2. 循序上傳所有照片。
          for (let index = 0; index < formData.photos.length; index++) {
              const photoDataUrl = formData.photos[index];
              const photoBlob = dataURLtoBlob(photoDataUrl);
              const photoFileName = `${formData.serviceUnit || '未命名服務'}-${serviceDate}-照片-${index + 1}.jpg`;
              const photoPath = `${basePath}/${photoFileName}`;
              await performDropboxUpload(photoBlob, photoPath);
          }
          return `成功上傳 PDF 及 ${formData.photos.length} 張照片。`;
        };

        if (uploadToNas) {
            tasks.push({ type: 'nas', promise: createNasUploadTask() });
        }

        if (sendByEmail && pdfBlob) {
            tasks.push({ type: 'email', promise: performEmailSend(pdfBlob, pdfFileNameForEmail, emailRecipients) });
        }

        const results = await Promise.allSettled(tasks.map(t => t.promise));
        
        const summary: string[] = [];
        results.forEach((res, index) => {
            const taskType = tasks[index].type;
            const taskName = taskType === 'nas' ? 'NAS 上傳' : 'Email 寄送';
            if (res.status === 'fulfilled') {
                const successMessage = res.value || '成功';
                summary.push(`- ${taskName}: ✅ ${successMessage}`);
            } else {
                const reason = (res as PromiseRejectedResult).reason;
                const errorMessage = reason instanceof Error ? reason.message : String(reason);
                summary.push(`- ${taskName}: ❌ 失敗 (${errorMessage})`);
            }
        });

        const successButtons: ModalButton[] = [];
      
        if (GOOGLE_REDIRECT_URI) {
          successButtons.unshift({
            text: '外出/加班紀錄表',
            onClick: () => {
              window.open(GOOGLE_REDIRECT_URI, '_blank');
            },
            className: 'text-white bg-sky-600 hover:bg-sky-700 focus:ring-sky-500'
          });
        }

        setModalState({
            isOpen: true,
            title: '🚀 操作完成',
            content: <div className="text-left whitespace-pre-wrap">{summary.join('\n')}</div>,
            onClose: closeModal,
            backgroundIcon: <CheckCircleIcon className="w-48 h-48" />,
            footerButtons: successButtons,
        });

    } catch (error) {
        console.error("Upload/Share failed:", error);
        showAlert('操作失敗', `發生錯誤：${error instanceof Error ? error.message : String(error)}`);
    } finally {
        setIsProcessing(false);
    }
  }, [formData, generatePdfBlob, performDropboxUpload, performEmailSend, selectedTemplate, showAlert, closeModal]);

  /**
   * 打開上傳選項的彈出視窗。
   */
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
          <div className="space-y-4 text-left">
            <div className={`flex items-start gap-4 p-4 rounded-lg transition-all ${!isDropboxConfigured ? 'bg-slate-100 opacity-70 cursor-not-allowed' : 'bg-slate-50'}`}>
              <div className="flex-shrink-0 w-10 h-10 bg-indigo-100 text-indigo-600 rounded-lg flex items-center justify-center">
                <ServerStackIcon className="w-6 h-6" />
              </div>
              <div className="flex-grow">
                 <div className="flex items-center">
                    <p className="font-semibold text-lg text-slate-800">上傳至 NAS</p>
                    {dropboxStatus === 'checking' && <span className="text-sm text-slate-500 ml-2 animate-pulse">檢查授權中...</span>}
                    {dropboxStatus === 'ok' && <span className="text-sm text-green-600 ml-2 flex items-center"><CheckCircleIcon className="w-5 h-5 mr-1"/>已授權</span>}
                    {dropboxStatus === 'error' && <span className="text-sm text-red-600 ml-2 flex items-center"><XCircleIcon className="w-5 h-5 mr-1"/>授權失敗/未設定</span>}
                </div>
                <p className="text-base text-slate-500">將PDF及照片上傳至公司雲端硬碟。</p>
              </div>
              <div className="flex-shrink-0">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={nasChecked} onChange={(e) => setNasChecked(e.target.checked)} disabled={!isDropboxConfigured || dropboxStatus !== 'ok'} className="sr-only peer" />
                  <div className="w-11 h-6 bg-slate-200 rounded-full peer peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>
            </div>

            <div className={`p-4 rounded-lg transition-all duration-300 ${!isBrevoApiConfigured ? 'bg-slate-100 opacity-70 cursor-not-allowed' : 'bg-slate-50'}`}>
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-10 h-10 bg-teal-100 text-teal-600 rounded-lg flex items-center justify-center">
                    <EnvelopeIcon className="w-6 h-6"/>
                </div>
                <div className="flex-grow">
                  <p className="font-semibold text-lg text-slate-800">透過 Email 寄送</p>
                  <p className="text-base text-slate-500">將服務單寄送給指定收件人。</p>
                </div>
                <div className="flex-shrink-0">
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" checked={emailChecked} onChange={(e) => setEmailChecked(e.target.checked)} disabled={!isBrevoApiConfigured} className="sr-only peer" />
                        <div className="w-11 h-6 bg-slate-200 rounded-full peer peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-teal-300 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-teal-600"></div>
                    </label>
                </div>
              </div>
              <div className={`pl-[56px] pt-3 transition-all duration-300 ease-in-out ${emailChecked && isBrevoApiConfigured ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0 overflow-hidden'}`}>
                  <label htmlFor="email-recipients" className="block text-sm font-medium text-gray-500 mb-1">收件人 (多個請用 , 分隔)</label>
                  <input type="text" id="email-recipients" value={emails} onChange={e => setEmails(e.target.value)} disabled={!emailChecked || !isBrevoApiConfigured} className="appearance-none block w-full px-3 py-2 border border-slate-500 rounded-md shadow-sm placeholder-slate-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 text-lg disabled:bg-slate-100 disabled:cursor-not-allowed"/>
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
        backgroundIcon: undefined
    });
  };
  
  /**
   * 處理從選單選擇服務人員的邏輯。
   */
  const handleSelectTechnician = useCallback(() => {
    const technicians = ['1. 凃寬基', '2. 曾國榮', '3. 陳怡誠', '4. 林少宇', '5. 廖紹志'];
    let selectedTechnician = technicians[0];
    const content = (
        <div>
            <p className="mb-2">請選擇服務人員：</p>
            <select
                className="block w-full px-3 py-2 text-lg border border-slate-500 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                onChange={(e) => selectedTechnician = e.target.value}
                autoFocus
            >
                {technicians.map(name => <option key={name} value={name}>{name}</option>)}
            </select>
        </div>
    );
    showConfirm('選擇服務人員', content, () => {
        const nameOnly = selectedTechnician.replace(/^\d+\.\s*/, '');
        handleTechnicianSignatureSave(nameOnly);
        closeModal();
    }, '確認選取');
  }, [handleTechnicianSignatureSave, showConfirm, closeModal]);

  // --- 主渲染邏輯 ---
  return (
    <div className="bg-slate-100 min-h-screen">
      <header className="bg-white shadow-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex justify-between items-center">
          <div className="flex items-center">
            <span className="text-xl font-semibold text-slate-700">富元機電-工作服務單</span>
          </div>
          <div className="flex items-center space-x-4">
            {isDropboxConfigured && dropboxStatus !== 'unchecked' && (
                <div className="flex items-center space-x-2" title={
                    dropboxStatus === 'ok' ? 'Dropbox 服務已連線' : 
                    dropboxStatus === 'checking' ? '正在檢查 Dropbox 連線...' : 'Dropbox 服務連線失敗'
                }>
                    <ServerStackIcon className={`h-6 w-6 ${
                        dropboxStatus === 'ok' ? 'text-green-500' :
                        dropboxStatus === 'checking' ? 'text-yellow-500 animate-pulse' : 'text-red-500'
                    }`} />
                </div>
            )}
            {isBrevoApiConfigured && (
                 <div className="flex items-center space-x-2" title="Email 服務已啟用">
                    <EnvelopeIcon className="h-6 w-6 text-green-500" />
                </div>
            )}
            <button
              onClick={() => setShowManual(true)}
              className="p-1 text-slate-500 hover:text-indigo-600 transition-colors"
              title="開啟使用手冊"
            >
              <QuestionMarkCircleIcon className="h-7 w-7" />
            </button>
            <span className="text-sm font-mono text-slate-400 select-none">{APP_VERSION}</span>
          </div>
        </div>
      </header>

      <main>
        <div className="relative max-w-4xl mx-auto bg-white rounded-xl shadow-2xl ring-1 ring-black ring-opacity-5 overflow-hidden my-8 sm:my-12">
           {isSubmitted ? (
             <ReportView 
                data={formData} 
                onOpenUploadModal={handleOpenUploadModal} 
                onDownloadPdf={handleDownloadPdf} 
                onReset={handleReset} 
                onEdit={handleEdit} 
                isProcessing={isProcessing}
                selectedTemplate={selectedTemplate}
                onTemplateChange={handleTemplateChange}
                legacyLayoutOffsets={legacyLayoutOffsets}
                onLegacyOffsetChange={handleLegacyOffsetChange}
             />
            ) : (
            <>
              {!isDropboxConfigured && <DropboxApiKeyErrorDisplay />}
              {!isGoogleApiConfigured && <ApiKeyErrorDisplay />}
              {!isBrevoApiConfigured && <BrevoApiKeyErrorDisplay />}
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
                technicianInputMode={technicianInputMode}
                onTechnicianInputModeChange={setTechnicianInputMode}
                onSelectTechnician={handleSelectTechnician}
                />
            </>
            )}
        </div>
      </main>
        
      <CustomModal {...modalState} isProcessing={isProcessing} />

      {showManual && <UserManual onClose={() => setShowManual(false)} />}

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
              <p className="text-xl font-semibold text-slate-700 mt-4">正在處理中...</p>
              <p className="text-lg text-slate-500">請稍候</p>
            </div>
          </div>
      )}
    </div>
  );
};
