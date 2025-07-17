
import React, { useState, useEffect } from 'react';

export interface UploadOptions {
  nas: boolean;
  email: boolean;
}

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (options: UploadOptions, recipients: string) => void;
  isProcessing: boolean;
  defaultRecipient: string;
}

const NasIcon: React.FC<{ className?: string }> = ({ className = "w-6 h-6" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M19 4H5C3.9 4 3 4.9 3 6V20C3 21.1 3.9 22 5 22H19C20.1 22 21 21.1 21 20V6C21 4.9 20.1 4 19 4ZM9.5 19C8.67 19 8 18.33 8 17.5C8 16.67 8.67 16 9.5 16S11 16.67 11 17.5C11 18.33 10.33 19 9.5 19ZM9.5 14C8.67 14 8 13.33 8 12.5C8 11.67 8.67 11 9.5 11S11 11.67 11 12.5C11 13.33 10.33 14 9.5 14ZM18 12H13V10H18V12ZM18 8H13V6H18V8Z" />
  </svg>
);

const EmailIcon: React.FC<{ className?: string }> = ({ className = "w-6 h-6" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
  </svg>
);

export const UploadModal: React.FC<UploadModalProps> = ({ isOpen, onClose, onConfirm, isProcessing, defaultRecipient }) => {
  const [options, setOptions] = useState<UploadOptions>({ nas: true, email: true });
  const [recipients, setRecipients] = useState(defaultRecipient);

  useEffect(() => {
    if (isOpen) {
      setOptions({ nas: true, email: true });
      setRecipients(defaultRecipient);
    }
  }, [isOpen, defaultRecipient]);

  if (!isOpen) {
    return null;
  }

  const handleOptionChange = (option: keyof UploadOptions) => {
    setOptions(prev => ({ ...prev, [option]: !prev[option] }));
  };

  const handleConfirmClick = () => {
    if (options.nas || options.email) {
      onConfirm(options, recipients);
    }
  };

  const isValidSelection = options.nas || options.email;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-labelledby="upload-modal-title">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md transform transition-all">
        <div className="p-6">
          <h3 id="upload-modal-title" className="text-lg font-medium leading-6 text-gray-900">選擇傳送方式</h3>
          <p className="mt-2 text-sm text-gray-500">請選擇您希望如何處理這份服務單 PDF。您可以選擇多個項目。</p>
          <div className="mt-6 space-y-4">
            
            <label htmlFor="nas-option" className={`flex items-center p-4 border-2 rounded-lg cursor-pointer transition-colors ${options.nas ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-gray-300'}`}>
              <NasIcon className={`mr-4 ${options.nas ? 'text-indigo-600' : 'text-gray-400'}`} />
              <div className="flex-grow">
                <span className="font-medium text-gray-800">上傳至 NAS</span>
                <p className="text-sm text-gray-500">將 PDF 檔案儲存至公司內部網路儲存裝置。</p>
              </div>
              <input id="nas-option" type="checkbox" checked={options.nas} onChange={() => handleOptionChange('nas')} className="h-5 w-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
            </label>

            <div className={`p-4 border-2 rounded-lg transition-colors ${options.email ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200'}`}>
                <label htmlFor="email-option" className="flex items-center cursor-pointer">
                    <EmailIcon className={`mr-4 ${options.email ? 'text-indigo-600' : 'text-gray-400'}`} />
                    <div className="flex-grow">
                        <span className="font-medium text-gray-800">透過 Email 傳送</span>
                        <p className="text-sm text-gray-500">將 PDF 作為附件，寄送給指定收件人。</p>
                    </div>
                    <input id="email-option" type="checkbox" checked={options.email} onChange={() => handleOptionChange('email')} className="h-5 w-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                </label>
                
                <div className={`mt-4 pl-10 transition-all duration-300 ease-in-out ${options.email ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0 overflow-hidden'}`}>
                    <label htmlFor="email-recipients" className="block text-sm font-medium text-gray-700 mb-1">收件人 Email</label>
                    <textarea
                        id="email-recipients"
                        rows={2}
                        value={recipients}
                        onChange={(e) => setRecipients(e.target.value)}
                        disabled={!options.email}
                        className="block w-full px-3 py-2 text-sm border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-slate-100 disabled:cursor-not-allowed"
                        placeholder="例: user1@example.com,user2@example.com"
                    />
                    <p className="mt-1 text-xs text-gray-500">如要傳送給多位收件人，請使用逗號 (,) 或換行分隔。</p>
                </div>
            </div>
            
          </div>
        </div>
        <div className="bg-gray-50 px-6 py-4 flex flex-row-reverse gap-3">
          <button
            type="button"
            onClick={handleConfirmClick}
            disabled={!isValidSelection || isProcessing}
            className="inline-flex justify-center w-full sm:w-auto px-4 py-2 text-sm font-medium text-white border border-transparent rounded-md shadow-sm bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
          >
            {isProcessing ? '處理中...' : '確認傳送'}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="w-full sm:w-auto px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
};
