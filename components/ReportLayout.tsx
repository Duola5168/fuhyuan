
import React from 'react';
import type { WorkOrderData } from '../types';

/**
 * PDF 頁尾元件。
 * @param {object} props - 元件屬性。
 * @param {number} [props.currentPage] - 目前頁碼。
 * @param {number} [props.totalPages] - 總頁碼。
 * @returns {React.ReactElement} - 渲染後的 PDF 頁尾。
 */
export const PdfFooter: React.FC<{ currentPage?: number; totalPages?: number; }> = ({ currentPage, totalPages }) => (
    <div className="flex-shrink-0 flex justify-between items-center text-sm text-slate-500 border-t border-slate-200 pt-2 mt-auto">
      <span>本表單由富元機電有限公司提供,電話(02)2697-5163 傳真(02)2697-5339</span>
      {totalPages && currentPage && (<span className="font-mono text-lg">{`${currentPage} / ${totalPages}`}</span>)}
    </div>
);

/**
 * ReportLayout 的屬性。
 */
type ReportLayoutProps = {
  data: WorkOrderData;
  mode: 'screen' | 'pdf-full' | 'pdf-page1' | 'pdf-page2';
  currentPage?: number;
  totalPages?: number;
};

/**
 * 服務單報告的核心佈局元件，可根據不同模式渲染。
 */
export const ReportLayout: React.FC<ReportLayoutProps> = ({ data, mode, currentPage, totalPages }) => {
  const isPdf = mode.startsWith('pdf');
  const formattedDateTime = data.dateTime 
    ? new Date(data.dateTime).toLocaleString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }).replace('下午', ' 下午').replace('上午', ' 上午') 
    : 'N/A';
  const hasProducts = data.products && data.products.filter(p => p.name.trim() !== '').length > 0;
  
  // 根據模式決定顯示哪些區塊
  const showManagerApproval = mode !== 'pdf-page2';
  const showTasksAndStatus = mode === 'screen' || mode === 'pdf-full' || mode === 'pdf-page1';
  const showProductsAndRemarks = mode === 'screen' || mode === 'pdf-full' || mode === 'pdf-page2';

  return (
    <div id={isPdf ? `pdf-${mode}` : undefined} className="p-8 bg-white" style={{ width: isPdf ? '210mm' : '100%', minHeight: isPdf ? '297mm' : 'auto', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', fontFamily: "'Helvetica Neue', 'Arial', 'sans-serif'" }}>
      <header className="flex-shrink-0">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold text-gray-800">富元機電有限公司</h1>
          <h2 className="text-3xl font-semibold text-gray-600 mt-2">工作服務單{mode === 'pdf-page2' && ' (產品項目與備註)'}</h2>
        </div>
        <div className="grid grid-cols-12 gap-x-6 gap-y-4 text-xl">
            <div className="col-span-12"><strong>工作日期及時間：</strong>{formattedDateTime}</div>
            
            <div className="col-span-7"><strong>服務單位：</strong>{data.serviceUnit || 'N/A'}</div>
            <div className="col-span-5"><strong>製造單號：</strong>{data.manufacturingOrderNumber || 'N/A'}</div>

            <div className="col-span-7">
                <span className="mr-8"><strong>接洽人：</strong>{data.contactPerson || 'N/A'}</span>
                <span><strong>連絡電話：</strong>{data.contactPhone || 'N/A'}</span>
            </div>
            <div className="col-span-5"><strong>業務會報單號：</strong>{data.businessReportNumber || 'N/A'}</div>
        </div>
      </header>

      <main className="flex-grow text-xl text-gray-800 space-y-5 pt-5">
        {showTasksAndStatus && (
          <>
            <div><strong className="text-xl block mb-2">處理事項：</strong><div className="p-3 border border-slate-300 rounded-md bg-slate-50 whitespace-pre-wrap w-full min-h-[10rem]">{data.tasks || '\u00A0'}</div></div>
            <div><strong className="text-xl block mb-2">處理情形：</strong><div className="p-3 border border-slate-300 rounded-md bg-slate-50 whitespace-pre-wrap w-full min-h-[10rem]">{data.status || '\u00A0'}</div></div>
          </>
        )}
        {showProductsAndRemarks && (
          <div>
            <strong className="text-xl block mb-2">產品項目：</strong>
            <div className="border border-slate-300 rounded-md overflow-hidden">
              <table className="min-w-full divide-y divide-slate-300 text-lg">
                <thead className="bg-slate-100"><tr className="align-middle"><th scope="col" className="px-3 py-2 text-left font-medium text-slate-700">產品品名</th><th scope="col" className="px-3 py-2 text-left font-medium text-slate-700">数量</th><th scope="col" className="px-3 py-2 text-left font-medium text-slate-700">序號</th></tr></thead>
                <tbody className="divide-y divide-slate-300 bg-white">
                  {hasProducts ? (
                    data.products.filter(p => p.name.trim() !== '').map((product, index) => (
                      <tr key={index} className="align-middle">
                        <td className="px-3 py-2 whitespace-nowrap">{product.name}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{product.quantity}</td>
                        <td className="px-3 py-2">
                          {(() => {
                            const serials = (product.serialNumbers || []).map(s => s.trim()).filter(s => s);
                            if (serials.length === 0) return 'N/A';
                            return (<div className="flex flex-col">{serials.map((s, idx) => (<React.Fragment key={idx}>{idx > 0 && <div className="border-t border-slate-200 my-1"></div>}<span>{`#${idx + 1}: ${s}`}</span></React.Fragment>))}</div>);
                          })()}
                        </td>
                      </tr>
                    ))
                  ) : (<tr><td colSpan={3} className="px-3 py-2 whitespace-nowrap text-center text-slate-400">無產品項目</td></tr>)}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {showProductsAndRemarks && (
          <div><strong className="text-xl block mb-2">備註：</strong><div className="p-3 border border-slate-300 rounded-md bg-slate-50 whitespace-pre-wrap w-full min-h-[3rem]">{data.remarks || '\u00A0'}</div></div>
        )}
        {mode === 'screen' && data.photos.length > 0 && (
          <div><strong className="text-xl block mb-2">現場照片：</strong><div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-4">{data.photos.map((photo, index) => (<img key={index} src={photo} alt={`現場照片 ${index + 1}`} className="rounded-lg shadow-md w-full h-auto object-cover aspect-square" />))}</div></div>
        )}
      </main>

       <footer className="pt-12 mt-auto flex-shrink-0">
          <div className={`grid ${showManagerApproval ? 'grid-cols-3' : 'grid-cols-2'} gap-x-8 text-xl`}>
              {showManagerApproval && (<div className="text-center"><strong>經理核可：</strong><div className="mt-2 p-2 border border-slate-400 rounded-lg bg-slate-50 w-full min-h-[120px] flex items-center justify-center"></div></div>)}
              <div className="text-center"><strong>服務人員：</strong><div className="mt-2 p-2 border border-slate-400 rounded-lg bg-slate-50 w-full min-h-[120px] flex items-center justify-center">{data.technicianSignature ? (<img src={data.technicianSignature} alt="服務人員" className="h-28 w-auto" />) : <span className="text-slate-400">未簽名</span>}</div></div>
              <div className="text-center"><strong>客戶簽認：</strong><div className="mt-2 p-2 border border-slate-400 rounded-lg bg-slate-50 w-full min-h-[120px] flex items-center justify-center">{data.signature ? (<img src={data.signature} alt="客戶簽名" className="h-28 w-auto" />) : <span className="text-slate-400">未簽名</span>}</div></div>
          </div>
          {isPdf && <PdfFooter currentPage={currentPage} totalPages={totalPages} />}
       </footer>
    </div>
  );
};
