

import React from 'react';
import { APP_VERSION } from '../App';

// --- Icon Components ---
// These are self-contained copies for the manual to avoid complex imports.
const CameraIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
);
const UploadIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
  </svg>
);
const PenIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L13.5 6.5z" />
    </svg>
);
const PlusIcon: React.FC<{ className?: string }> = ({ className }) => ( <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg> );
const TrashIcon: React.FC<{ className?: string }> = ({ className }) => ( <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg> );


const BulletPoint: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <li className="flex">
        <span className="text-indigo-500 mr-3 mt-1.5 flex-shrink-0">✓</span>
        <span>{children}</span>
    </li>
);

/**
 * A component to display non-interactive UI mockups within the manual.
 * It provides a consistent and clear presentation for UI examples.
 */
const UIMockup: React.FC<{ children: React.ReactNode; caption: string; }> = ({ children, caption }) => (
    <div className="my-6 pointer-events-none">
        <div className="p-4 sm:p-6 border border-slate-300 rounded-t-lg bg-slate-50 flex justify-center items-center flex-wrap gap-4">
            {children}
        </div>
        <div className="px-4 py-2 bg-slate-200 text-slate-600 text-center rounded-b-lg text-sm font-medium">
            【操作示意圖: {caption}】
        </div>
    </div>
);


interface UserManualProps {
    onClose: () => void;
}

/**
 * The user manual component, displayed as a full-screen overlay.
 * It provides a comprehensive guide to using the application and can be printed to PDF.
 */
export const UserManual: React.FC<UserManualProps> = ({ onClose }) => {
    return (
        <div className="fixed inset-0 bg-white z-[100] overflow-y-auto user-manual-container" aria-modal="true" role="dialog">
            <div className="relative max-w-5xl mx-auto p-4 sm:p-6 md:p-8">
                {/* Header with Print and Close buttons (hidden on print) */}
                <header className="flex justify-between items-center mb-8 print:hidden sticky top-0 bg-white/80 backdrop-blur-sm py-4 z-10 -mx-4 px-4 border-b border-slate-200">
                    <h1 className="text-2xl sm:text-3xl font-bold text-slate-800">應用程式使用手冊</h1>
                    <div className="flex items-center gap-3">
                        <button 
                            onClick={() => window.print()} 
                            className="px-4 py-2 text-lg font-medium text-slate-700 bg-slate-100 border border-slate-300 rounded-md shadow-sm hover:bg-slate-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                        >
                            列印
                        </button>
                        <button 
                            onClick={onClose} 
                            className="px-4 py-2 text-lg font-medium text-white bg-indigo-600 border border-transparent rounded-md shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                            aria-label="關閉手冊"
                        >
                           關閉
                        </button>
                    </div>
                </header>

                {/* Manual Content styled for readability */}
                <article className="prose-custom">
                    <section>
                        <h2 id="intro">1. 前言</h2>
                        <p>歡迎使用「富元機電 - 工作服務單」應用程式！本工具旨在將傳統的紙本服務單數位化，提供一個從現場資料填寫、拍照、客戶簽名到最終 PDF 報告產出的一站式解決方案。無論您身在何處，都能透過手機、平板或電腦高效完成工作記錄與歸檔。</p>
                    </section>
                    
                    <section>
                        <h2 id="workflow">2. 主要操作流程</h2>
                        <p>一般的使用流程非常直觀，大致可分為「填寫表單」與「產生報告」兩個階段。</p>
                        <h3>2.1 填寫服務單資料</h3>
                        <p>在主畫面中，您可以依序填寫所有服務單需要的資訊。全部填寫完畢後，點擊最下方的按鈕即可產生報告。</p>
                        <UIMockup caption="填寫完畢後，點此產生報告">
                           <button type="button" className="w-full sm:w-auto px-8 py-4 border border-transparent rounded-md shadow-sm text-2xl font-medium text-white bg-indigo-600 hover:bg-indigo-700">
                                產生服務單報告
                           </button>
                        </UIMockup>

                        <ul className="list-none p-0 space-y-3">
                           <BulletPoint><strong>基本資訊：</strong> 填寫「工作日期及時間」、「服務單位」、「接洽人」等欄位。</BulletPoint>
                           <BulletPoint><strong>工作內容：</strong> 在「處理事項」和「處理情形」欄位詳細記錄工作內容。系統會提示您剩餘的可填寫行數，以確保在「智慧排版」模式下版面美觀。</BulletPoint>
                           <BulletPoint><strong>產品項目：</strong>
                             <ul className="mt-2 list-disc pl-6 space-y-1">
                                <li>點擊「新增項目」來增加品項。</li>
                                <li>可調整每個品項的「數量」，下方的「序號」欄位會自動連動增減。</li>
                                <li>若品項超過一項，可點擊右上角的垃圾桶圖示刪除。</li>
                             </ul>
                             <UIMockup caption="產品品名與序號輸入區塊">
                                <div className="w-full space-y-4 max-w-lg">
                                    <div className="grid grid-cols-12 gap-x-3 gap-y-4 p-4 border border-slate-300 rounded-lg relative bg-white">
                                        <div className="col-span-12 sm:col-span-8">
                                            <label className="block text-base font-medium text-slate-600">產品品名</label>
                                            <input type="text" value="範例產品" disabled className="mt-1 block w-full px-3 py-2 border border-slate-500 rounded-md shadow-sm text-lg bg-slate-50" />
                                        </div>
                                        <div className="col-span-12 sm:col-span-4">
                                            <label className="block text-base font-medium text-slate-600">數量</label>
                                            <select value={1} disabled className="mt-1 block w-full pl-3 pr-8 py-2 border-slate-500 text-lg rounded-md bg-slate-50">
                                                <option value={1}>1</option>
                                            </select>
                                        </div>
                                        <button type="button" className="absolute top-2 right-2 p-1 text-slate-400">
                                            <TrashIcon className="w-5 h-5"/>
                                        </button>
                                    </div>
                                    <button type="button" className="flex items-center justify-center w-full px-4 py-2 border-2 border-dashed border-slate-400 rounded-md text-lg font-medium text-slate-600 bg-white">
                                        <PlusIcon className="w-5 h-5 mr-2" />
                                        新增項目
                                    </button>
                                </div>
                            </UIMockup>
                           </BulletPoint>
                            <BulletPoint><strong>拍照存證：</strong>
                             <ul className="mt-2 list-disc pl-6 space-y-1">
                                <li>點擊「拍照」會直接啟動裝置的相機。</li>
                                <li>點擊「上傳圖片」可從您的裝置相簿中選取多張照片。</li>
                                <li>所有上傳的照片都會以預覽圖顯示，並有計數提示。</li>
                             </ul>
                                <UIMockup caption="照片上傳功能按鈕">
                                    <button type="button" className="flex-1 flex justify-center items-center px-4 py-3 border-2 border-dashed border-slate-500 rounded-md shadow-sm text-xl font-medium text-slate-700 bg-white">
                                        <CameraIcon className="w-6 h-6 mr-2" /> 拍照
                                    </button>
                                    <button type="button" className="flex-1 flex justify-center items-center px-4 py-3 border-2 border-dashed border-slate-500 rounded-md shadow-sm text-xl font-medium text-slate-700 bg-white">
                                        <UploadIcon className="w-6 h-6 mr-2" /> 上傳圖片
                                    </button>
                                </UIMockup>
                           </BulletPoint>
                           <BulletPoint><strong>簽名確認：</strong>
                             <ul className="mt-2 list-disc pl-6 space-y-1">
                                <li><strong>服務人員：</strong> 您有兩種模式可選。使用右上角的開關切換：
                                     <UIMockup caption="服務人員簽名模式切換">
                                         <span className="text-lg text-indigo-600 font-semibold">簽名</span>
                                         <label className="relative inline-flex items-center">
                                            <input type="checkbox" className="sr-only peer" disabled />
                                            <div className="w-11 h-6 bg-slate-300 rounded-full peer peer-checked:bg-indigo-600 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
                                         </label>
                                         <span className="text-lg text-slate-500">選單</span>
                                    </UIMockup>
                                    <ul className="mt-2 list-['-_'] list-inside ml-4">
                                        <li><strong>簽名模式：</strong> 預設模式，直接在簽名板上手寫簽名。在手機上可點擊「手機簽名」進入全螢幕模式，橫放裝置可獲得最佳體驗。</li>
                                        <li><strong>選單模式：</strong> 切換後，點擊按鈕從預設列表中選擇人員姓名，姓名將以標楷體呈現。</li>
                                    </ul>
                                </li>
                                <li><strong>客戶簽認：</strong> 請客戶直接在簽名板上簽名。同樣支援手機全螢幕模式。</li>
                                <UIMockup caption="客戶簽名板區域">
                                    <div className="relative w-full max-w-md h-[150px] bg-slate-200/50 rounded-lg border-2 border-dashed border-slate-500 flex items-center justify-center text-slate-500">
                                        <PenIcon className="w-8 h-8 mr-2" />
                                        <span className="text-3xl">請在此處簽名</span>
                                    </div>
                                </UIMockup>
                             </ul>
                           </BulletPoint>
                           <BulletPoint><strong>服務評估：</strong> 從「服務總評」和「服務結案」的下拉選單中選擇對應的項目。</BulletPoint>
                        </ul>
                        <h3>2.2 產生與分享報告</h3>
                        <p>填寫完所有資料後，點擊最下方的「產生服務單報告」大按鈕，即可進入報告預覽畫面。</p>
                        <UIMockup caption="報告預覽畫面的主要操作按鈕">
                             <div className="flex items-center p-1 bg-white rounded-md border border-slate-300 shadow-sm">
                                <button className="transition-all duration-200 px-3 py-1.5 text-lg rounded bg-indigo-600 text-white shadow">智慧排版</button>
                                <button className="transition-all duration-200 px-3 py-1.5 text-lg rounded text-slate-700 hover:bg-slate-200">舊式表格</button>
                              </div>
                              <button className="px-6 py-3 text-xl font-semibold bg-blue-600 text-white rounded-md shadow-sm">上傳PDF</button>
                              <button className="px-6 py-3 text-xl font-semibold bg-white border border-slate-400 text-slate-700 rounded-md shadow-sm">下載PDF</button>
                        </UIMockup>
                        <ul className="list-none p-0 space-y-3">
                           <BulletPoint><strong>預覽與版面選擇：</strong>
                             <ul className="mt-2 list-disc pl-6 space-y-1">
                                 <li><strong>智慧排版：</strong> 現代化的版面，當內容過多時會自動分成兩頁，並將照片自動整理到後續的附錄頁，是推薦的預設選項。</li>
                                 <li><strong>舊式表格：</strong> 模擬傳統的紙本表格。若內容過多可能會被裁切（系統會提示），可使用下方的「版面位置微調」滑桿進行細部調整。</li>
                             </ul>
                           </BulletPoint>
                           <BulletPoint><strong>最終操作：</strong>
                             <ul className="mt-2 list-disc pl-6 space-y-1">
                                 <li><strong>下載PDF：</strong> 將目前預覽的報告（含照片）下載為 PDF 檔案存到您的裝置。</li>
                                 <li><strong>上傳PDF：</strong> 彈出視窗，選擇上傳至NAS則系統會將 PDF 上傳到您設定的 NAS 資料夾，選擇寄送Email則在輸入收件人 Email 後(預設公司mail)，系統會透過 Brevo 服務將報告作為附件寄送給客戶。</li>
                                 <li><strong>修改內容：</strong> 返回表單編輯頁面。</li>
                                 <li><strong>建立新服務單：</strong> 清空所有資料，開始一筆新的記錄。</li>
                             </ul>
                           </BulletPoint>
                        </ul>
                    </section>
                    
                    <section>
                        <h2 id="data-management">3. 資料管理 (暫存與雲端)</h2>
                        <p>本應用提供強大的暫存與雲端備份功能，避免資料遺失。</p>
                        <h3>3.1 本機暫存</h3>
                        <p>您可以將填寫到一半的表單儲存在瀏覽器中。</p>
                        <UIMockup caption="暫存管理按鈕">
                            <select className="w-full sm:w-auto px-3 py-2 border border-slate-500 text-slate-700 rounded-md shadow-sm text-lg font-medium bg-white" disabled>
                                 <option value="" disabled>載入/管理暫存</option>
                            </select>
                            <button type="button" className="flex-1 sm:w-auto px-4 py-2 border border-blue-600 text-blue-600 rounded-md shadow-sm text-lg font-medium bg-white">
                                另存新檔
                            </button>
                        </UIMockup>

                        <ul className="list-none p-0 space-y-3">
                           <BulletPoint><strong>另存新檔：</strong> 點擊後，為您的暫存命名，即可儲存。最多可儲存 3 份。</BulletPoint>
                           <BulletPoint><strong>載入/管理暫存：</strong> 點擊下拉選單，可選擇「從本機載入」已儲存的暫存，或「刪除本機暫存」。</BulletPoint>
                           <BulletPoint><strong className="text-red-600">重要警告：</strong> 本機暫存會因為「清除瀏覽器快取/紀錄」或「使用無痕模式」而永久消失。對於重要資料，強烈建議使用下方的雲端硬碟功能進行備份。</BulletPoint>
                        </ul>
                        <h3>3.2 Google 雲端硬碟備份</h3>
                        <p>此功能可將您的暫存檔 (JSON 格式) 匯出至您的 Google Drive，或從中匯入，是跨裝置工作或永久備份的最佳方式。</p>
                        <div className="my-6 pointer-events-none">
                            <div className="w-full max-w-md mx-auto border bg-white rounded-lg shadow-lg">
                                <div className="p-3 border-b bg-slate-50 flex justify-between items-center">
                                    <p className="text-base font-semibold text-slate-800">從 Google 雲端硬碟中選擇一個檔案</p>
                                </div>
                                <div className="p-4 bg-slate-100/50">
                                    <div className="p-3 mb-2 bg-white border border-slate-300 rounded text-slate-700">暫存-客戶A-2023-10-26.json</div>
                                    <div className="p-3 bg-blue-100 border border-blue-400 rounded text-slate-700">暫存-緊急維修-2023-10-25.json</div>
                                </div>
                                <div className="p-3 bg-slate-50 border-t flex justify-end gap-2">
                                    <button className="px-4 py-1.5 text-sm font-semibold bg-blue-600 text-white rounded">選取</button>
                                    <button className="px-4 py-1.5 text-sm font-semibold bg-white border border-slate-400 text-slate-700 rounded">取消</button>
                                </div>
                            </div>
                             <div className="px-4 py-2 bg-slate-200 text-slate-600 text-center rounded-b-lg text-sm font-medium -mt-1 relative z-[-1]">
                                【操作示意圖: 從 Google 雲端硬碟匯入時的檔案選擇畫面】
                            </div>
                        </div>
                        <ul className="list-none p-0 space-y-3">
                           <BulletPoint><strong>匯出至 Google 雲端硬碟：</strong> 從「載入/管理暫存」選單中選擇此項，選擇要匯出的暫存檔，即可將其備份到您的 Google Drive 根目錄。</BulletPoint>
                           <BulletPoint><strong>從 Google 雲端硬碟匯入：</strong> 選擇此項後，會跳出 Google 檔案選擇器，您可以選取之前匯出的 <code>.json</code> 暫存檔，將其匯入並存為一份新的本機暫存。</BulletPoint>
                           <BulletPoint><strong>首次使用：</strong> 第一次使用雲端功能時，Google 會要求您授權，請務必同意以啟用此功能。</BulletPoint>
                        </ul>
                    </section>

                    <section>
                        <h2 id="dev-setup">4. 開發者設定 (首次部署時必讀)</h2>
                        <p>為確保所有功能（特別是雲端服務）正常運作，開發者在首次部署應用程式時，必須進行正確的環境變數設定。這些設定包含敏感的 API 金鑰，請務必妥善保管。</p>
                        <h3>4.1 環境變數檔案 (.env.local)</h3>
                        <p>您需要在專案的根目錄下建立一個名為 <code>.env.local</code> 的檔案。此檔案不會被上傳到版本控制系統 (如 Git)，可安全地儲存您的金鑰。</p>
                        <p>檔案內容應如下：</p>
                        <pre><code>
# Dropbox API (用於上傳 PDF 報告)
DROPBOX_APP_KEY="YOUR_DROPBOX_APP_KEY"
DROPBOX_APP_SECRET="YOUR_DROPBOX_APP_SECRET"
DROPBOX_REFRESH_TOKEN="YOUR_DROPBOX_REFRESH_TOKEN"

# Google Drive API (用於匯入/匯出暫存檔)
GOOGLE_API_KEY="YOUR_GOOGLE_API_KEY"
GOOGLE_CLIENT_ID="YOUR_GOOGLE_CLIENT_ID"

# Brevo (Sendinblue) Email API (用於寄送 PDF 報告)
BREVO_API_KEY="YOUR_BREVO_API_KEY"
BREVO_SENDER_EMAIL="your-sender@email.com"
BREVO_SENDER_NAME="您的公司或寄件人名稱"

# (選用) Google Sheet 連結 (用於下載成功後跳轉)
GOOGLE_REDIRECT_URI="https://docs.google.com/spreadsheets/d/..."
                        </code></pre>
                        <p className="note"><strong>注意：</strong> 如果您將網站部署到線上主機 (如 Netlify, Vercel)，請將這些變數設定在該平台的「環境變數」管理介面中，而非使用 <code>.env.local</code> 檔案。</p>
                    </section>
                    
                    <section>
                        <h2 id="troubleshooting">5. 錯誤排除指南</h2>
                        <dl className="space-y-4">
                            <div className="bg-slate-50 p-4 rounded-lg">
                                <dt>問題：畫面頂部出現「功能設定不完整」的錯誤訊息 (如 Dropbox, Google, Email)。</dt>
                                <dd className="mt-2"><strong>原因：</strong> 開發者尚未在環境變數中設定必要的 API 金鑰。<br/><strong>解決方案：</strong> 請聯繫應用程式的開發/維護人員，依照本手冊「<a href="#dev-setup">4. 開發者設定</a>」章節的指示，填入正確的金鑰並重新部署應用程式。</dd>
                            </div>
                            <div className="bg-slate-50 p-4 rounded-lg">
                                <dt>問題：點擊「上傳PDF」後，出現 "invalid_grant" 或 "invalid_access_token" 錯誤。</dt>
                                <dd className="mt-2"><strong>原因：</strong> Dropbox 的授權權杖 (Refresh Token) 失效，或 App 的權限設定不正確。<br/><strong>解決方案：</strong> 開發者需要：1. 重新產生一組 Refresh Token 並更新到環境變數。 2. 登入 Dropbox App Console，確認應用程式的權限 (Permissions) 分頁已勾選 <code>files.content.write</code>。</dd>
                            </div>
                            <div className="bg-slate-50 p-4 rounded-lg">
                                <dt>問題：切換到「舊式表格」時，提示內容過長可能被裁切。</dt>
                                <dd className="mt-2"><strong>原因：</strong> 舊式表格的欄位大小是固定的，無法容納過多文字或產品項目。<br/><strong>解決方案：</strong> 1. 盡量縮減文字內容。 2. 使用版面更靈活的「智慧排版」模式。 3. 使用下方的「版面位置微調」滑桿做細微調整。</dd>
                            </div>
                             <div className="bg-slate-50 p-4 rounded-lg">
                                <dt>問題：PDF 產生失敗或簽名顯示不完整。</dt>
                                <dd className="mt-2"><strong>原因：</strong> 可能是瀏覽器相容性問題或暫存錯誤。<br/><strong>解決方案：</strong> 1. 嘗試重新整理頁面。 2. 建議使用最新版本的 Chrome, Edge, Firefox 瀏覽器。 3. 確保在簽名時，尤其是手機，將裝置橫放以獲得最佳效果。</dd>
                            </div>
                        </dl>
                    </section>
                </article>

                <footer className="mt-12 text-center text-slate-500 border-t pt-4 print:hidden">
                    富元機電工作服務單 | 版本 {APP_VERSION}
                </footer>
            </div>
            
            {/* Custom styles for prose-like rendering and print */}
            <style>
                {`
                .prose-custom h2 {
                    font-size: 1.875rem; /* text-3xl */
                    font-weight: 700;
                    margin-top: 2.5rem;
                    margin-bottom: 1rem;
                    border-bottom: 1px solid #e2e8f0; /* slate-200 */
                    padding-bottom: 0.5rem;
                }
                .prose-custom h3 {
                    font-size: 1.5rem; /* text-2xl */
                    font-weight: 600;
                    margin-top: 2rem;
                    margin-bottom: 0.75rem;
                }
                .prose-custom p, .prose-custom li {
                    font-size: 1.125rem; /* text-lg */
                    line-height: 1.75;
                    color: #334155; /* slate-700 */
                }
                .prose-custom p + p, .prose-custom ul + p, .prose-custom .my-6 {
                    margin-top: 1.25rem;
                }
                .prose-custom a {
                    color: #4f46e5; /* indigo-600 */
                    text-decoration: underline;
                    font-weight: 500;
                }
                .prose-custom a:hover {
                    color: #3730a3; /* indigo-800 */
                }
                .prose-custom pre {
                    background-color: #f1f5f9; /* slate-100 */
                    padding: 1rem;
                    border-radius: 0.5rem;
                    font-size: 1rem;
                    overflow-x: auto;
                    color: #1e293b; /* slate-800 */
                }
                .prose-custom code {
                    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
                }
                .prose-custom .note {
                     background-color: #fefce8; /* yellow-50 */
                     border-left: 4px solid #facc15; /* yellow-400 */
                     padding: 0.75rem 1rem;
                     border-radius: 0.25rem;
                }

                @media print {
                    @page {
                        size: A4;
                        margin: 20mm;
                    }
                    html, body {
                        background-color: #fff;
                    }
                    .prose-custom {
                        font-size: 10pt;
                    }
                     .prose-custom p, .prose-custom li {
                        font-size: 10pt;
                    }
                    .prose-custom h2 {
                        font-size: 16pt;
                        page-break-before: auto;
                        page-break-after: avoid;
                    }
                    .prose-custom h3 {
                        font-size: 12pt;
                        page-break-after: avoid;
                    }
                    .prose-custom pre, .prose-custom .my-6 {
                        page-break-inside: avoid;
                    }
                    body {
                        -webkit-print-color-adjust: exact;
                        print-color-adjust: exact;
                    }

                    /* --- Print Pagination Fix --- */
                    /* This classic technique isolates the manual for printing. */
                    body * {
                        visibility: hidden;
                    }
                    .user-manual-container, .user-manual-container * {
                        visibility: visible;
                    }
                    .user-manual-container {
                        position: absolute;
                        left: 0;
                        top: 0;
                        width: 100%;
                        height: auto;
                        overflow: visible;
                        z-index: 9999;
                    }
                }
                `}
            </style>
        </div>
    );
};
