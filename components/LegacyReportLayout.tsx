import React from 'react';
import type { WorkOrderData } from '../types';

// Helper component to apply offset to text content
const MovableText: React.FC<{ children: React.ReactNode, offset: { x: number; y: number } }> = ({ children, offset }) => (
  // Applying negative Y to make positive values move text up, matching user expectation.
  <span style={{ display: 'inline-block', transform: `translate(${offset.x}px, ${-offset.y}px)` }}>
    {children}
  </span>
);

const LabelCell: React.FC<{ text: React.ReactNode, offset: {x: number, y: number}, className?: string }> = ({ text, offset, className }) => {
    return (
        <div className={`p-2 flex items-center justify-center text-center text-xl ${className}`}>
            <MovableText offset={offset}>{text}</MovableText>
        </div>
    );
};

// This component dynamically displays a checkbox based on the selected value.
const DynamicCheckboxDisplay: React.FC<{ label: string, value: string, selectedValue?: string, offset: { x: number; y: number } }> = ({ label, value, selectedValue, offset }) => (
    <label className="flex items-center space-x-1.5 cursor-default select-none">
        <MovableText offset={offset}>
            <span className="font-bold text-base select-none" aria-hidden="true">
                {`[ ${value === selectedValue ? 'X' : '\u00A0'} ]`}
            </span>
            <span>{label}</span>
        </MovableText>
    </label>
);


interface LegacyReportLayoutProps {
  data: WorkOrderData;
  currentPage?: number;
  totalPages?: number;
  offsets?: { x: number; y: number };
}

export const LegacyReportLayout: React.FC<LegacyReportLayoutProps> = ({ data, currentPage, totalPages, offsets = { x: 0, y: 0 } }) => {
    
    const formattedDate = data.dateTime 
        ? new Date(data.dateTime).toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' })
        : '\u00A0';

    const contactPersonPhone = [data.contactPerson, data.contactPhone].filter(Boolean).join('\n');
    
    const productItems = data.products
      .filter(p => p.name.trim() !== '')
      .map(p => {
        const serials = (p.serialNumbers || []).map(s => s.trim()).filter(Boolean);
        const serialsText = serials.length > 0 ? ` S/N: ${serials.join(', ')}` : '';
        return `${p.name} (數量: ${p.quantity})${serialsText}`;
      });

    const toolsAndMaterials = '';

    const serviceRatingOptions = ["1. 劣", "2. 尚可", "3. 好", "4. 優良"];
    const serviceConclusionOptions = ["1. 圓滿完成", "2. 剩餘部份自行處理", "3. 另準備材料", "4. 再派員服務", "5. 提出檢修報價"];
    
    return (
        <div id="pdf-legacy-report" className="bg-white" style={{
            width: '210mm',
            height: '297mm', // Fixed height for A4
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
            padding: '1.5rem',
            fontFamily: '"BiauKai", "KaiTi", "標楷體", serif',
            border: '1.5px solid black',
        }}>
            <header className="text-center mb-4 flex-shrink-0">
                <h1 className="text-5xl font-bold"><MovableText offset={offsets}>富元機電有限公司</MovableText></h1>
            </header>

            <main className="flex-grow flex flex-col">
                {/* -- Top Section -- */}
                <div className="grid grid-cols-12 border-[1.5px] border-black">
                    <LabelCell text="單 位" offset={offsets} className="col-span-2 border-r border-black" />
                    <div className="col-span-3 border-r border-black p-2 text-xl">{'\u00A0'}</div>
                    <div className="col-span-7 p-2 text-center text-3xl font-semibold tracking-[0.2em] flex items-center justify-center">
                        <MovableText offset={offsets}>工作服務單</MovableText>
                    </div>
                    <div className="col-span-12 border-t border-black"></div>
                    <LabelCell text="日 期" offset={offsets} className="col-span-2 border-r border-black" />
                    <div className="col-span-3 border-r border-black p-2 text-xl"><MovableText offset={offsets}>{formattedDate}</MovableText></div>
                    <LabelCell text="服務人員" offset={offsets} className="col-span-2 border-r border-black" />
                    <div className="col-span-5 p-2 text-xl flex items-center justify-center">
                        <MovableText offset={offsets}>
                         {data.technicianSignature ? (
                            typeof data.technicianSignature === 'string' && data.technicianSignature.startsWith('data:image') ? (
                                <img src={data.technicianSignature} alt="服務人員簽名" className="h-12 w-auto object-contain" />
                            ) : (
                                <span className="text-2xl font-semibold">{data.technicianSignature}</span>
                            )
                        ) : '\u00A0'}
                        </MovableText>
                    </div>
                </div>
            
                {/* -- Customer Section -- */}
                <div className="grid grid-cols-12 border-x-[1.5px] border-b-[1.5px] border-black">
                    <LabelCell text="客 戶" offset={offsets} className="col-span-2 border-r border-black" />
                    <div className="col-span-3 border-r border-black p-2 text-xl"><MovableText offset={offsets}>{data.serviceUnit || '\u00A0'}</MovableText></div>
                    <LabelCell text="製造單號" offset={offsets} className="col-span-2 border-r border-black" />
                    <div className="col-span-5 p-2 text-xl whitespace-pre-wrap break-words"><MovableText offset={offsets}>{data.manufacturingOrderNumber || '\u00A0'}</MovableText></div>
                    
                    <div className="col-span-12 border-t border-black grid grid-cols-12 min-h-[4.5rem]">
                        <LabelCell text={<>接洽人<br/>及電話</>} offset={offsets} className="col-span-2 border-r border-black leading-tight" />
                        <div className="col-span-3 border-r border-black p-2 text-xl whitespace-pre-wrap break-words"><MovableText offset={offsets}>{contactPersonPhone || '\u00A0'}</MovableText></div>
                        <LabelCell text={<>業務會報<br/>單號</>} offset={offsets} className="col-span-2 border-r border-black leading-tight" />
                        <div className="col-span-5 p-2 text-xl whitespace-pre-wrap break-words"><MovableText offset={offsets}>{data.businessReportNumber || '\u00A0'}</MovableText></div>
                    </div>
                </div>

                {/* -- Work Details Section -- */}
                <div className="border-[1.5px] border-t-0 border-black flex-grow flex flex-col">
                    <div className="grid grid-cols-12 bg-slate-100 font-semibold">
                        <div className="col-span-5 border-r border-black p-2 text-center text-xl"><MovableText offset={offsets}>處 理 事 項</MovableText></div>
                        <div className="col-span-4 border-r border-black p-2 text-center text-xl"><MovableText offset={offsets}>處 理 情 形</MovableText></div>
                        <div className="col-span-3 p-2 text-center text-xl"><MovableText offset={offsets}>備 註 (客戶意見)</MovableText></div>
                    </div>
                    <div className="grid grid-cols-12 border-t border-black flex-grow">
                        <div className="col-span-5 border-r border-black p-2 text-xl whitespace-pre-wrap break-words min-h-[14rem]">{data.tasks || '\u00A0'}</div>
                        <div className="col-span-4 border-r border-black p-2 text-xl whitespace-pre-wrap break-words">{data.status || '\u00A0'}</div>
                        <div className="col-span-3 p-2 text-xl whitespace-pre-wrap break-words">{data.remarks || '\u00A0'}</div>
                    </div>
                </div>
            
                {/* -- Product Info Section -- */}
                <div className="border-[1.5px] border-t-0 border-black">
                    <div className="grid grid-cols-12 bg-slate-100 font-semibold">
                        <div className="col-span-12 p-2 text-center text-xl"><MovableText offset={offsets}>產品品名及S/N:</MovableText></div>
                    </div>
                    <div className="grid grid-cols-12 border-t border-black">
                        <div className="col-span-12 p-2 text-xl whitespace-pre-wrap break-words min-h-[4.5rem]">
                            {productItems.join('\n') || '\u00A0'}
                        </div>
                    </div>
                </div>

                {/* -- Signature/Materials Section -- */}
                <div className="border-[1.5px] border-t-0 border-black">
                    <div className="grid grid-cols-12 bg-slate-100 font-semibold">
                        <div className="col-span-5 border-r border-black p-2 text-center text-xl"><MovableText offset={offsets}>日 期 / 工 作 時 間</MovableText></div>
                        <div className="col-span-4 border-r border-black p-2 text-center text-xl"><MovableText offset={offsets}>客 戶 簽 認</MovableText></div>
                        <div className="col-span-3 p-2 text-center text-xl"><MovableText offset={offsets}>應攜帶之工具及材料</MovableText></div>
                    </div>
                    <div className="grid grid-cols-12 border-t border-black min-h-[6rem]">
                        <div className="col-span-5 border-r border-black p-2 text-xl flex items-center justify-center">
                            <MovableText offset={offsets}>{formattedDate}</MovableText>
                        </div>
                        <div className="col-span-4 border-r border-black p-2 flex items-center justify-center">
                            {data.signature ? <img src={data.signature} alt="客戶簽名" className="h-20 w-auto object-contain" /> : '\u00A0'}
                        </div>
                        <div className="col-span-3 p-2 text-xl whitespace-pre-wrap break-words">{toolsAndMaterials || '\u00A0'}</div>
                    </div>
                </div>

                {/* -- Conclusion Section (Data now dynamic) -- */}
                <div className="border-[1.5px] border-t-0 border-black p-2 text-lg">
                    <div className="flex items-center space-x-4">
                        <MovableText offset={offsets}><span className="font-semibold">服務總評：</span></MovableText>
                        {serviceRatingOptions.map(opt => (
                           <DynamicCheckboxDisplay key={opt} label={opt} value={opt} selectedValue={data.serviceRating} offset={offsets} />
                        ))}
                    </div>
                </div>
                <div className="border-[1.5px] border-t-0 border-black p-2 text-lg">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                        <MovableText offset={offsets}><span className="font-semibold">服務結案：</span></MovableText>
                        {serviceConclusionOptions.map(opt => (
                             <DynamicCheckboxDisplay key={opt} label={opt} value={opt} selectedValue={data.serviceConclusion} offset={offsets} />
                        ))}
                    </div>
                </div>
            </main>
            
            {/* -- Footer -- */}
            <footer className="mt-auto pt-4 flex-shrink-0">
                <div className="grid grid-cols-2 text-xl">
                    <div className="flex items-center space-x-2 pr-4">
                        <MovableText offset={offsets}><label className="font-semibold whitespace-nowrap">經理：</label></MovableText>
                    </div>
                    <div className="flex items-center space-x-2 pl-4">
                        <MovableText offset={offsets}><label className="font-semibold whitespace-nowrap">經辦人：</label></MovableText>
                         <MovableText offset={offsets}>
                            {data.technicianSignature ? (
                                typeof data.technicianSignature === 'string' && data.technicianSignature.startsWith('data:image') ? (
                                    <img src={data.technicianSignature} alt="經辦人簽名" className="h-16 w-auto object-contain ml-2" />
                                ) : (
                                    <span className="text-3xl font-semibold ml-2">{data.technicianSignature}</span>
                                )
                            ) : '\u00A0'}
                        </MovableText>
                    </div>
                </div>
                <div 
                    className="flex justify-between items-center text-sm text-slate-700 mt-6 pt-3 border-t border-slate-200"
                    style={{ fontFamily: "'Helvetica Neue', 'Arial', sans-serif" }}
                >
                    <MovableText offset={offsets}>
                        <span>本表單由富元機電有限公司提供,電話(02)2697-5163 傳真(02)2697-5339</span>
                    </MovableText>
                    {currentPage && totalPages && (
                        <MovableText offset={offsets}>
                            <span className="font-mono text-lg">{currentPage} / {totalPages}</span>
                        </MovableText>
                    )}
                </div>
            </footer>
        </div>
    );
};
