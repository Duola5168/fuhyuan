import React from 'react';
import type { WorkOrderData } from '../types';

/**
 * A helper component to statically display a checkbox in the legacy report.
 * Re-implemented with inline styles for maximum compatibility.
 */
const StaticCheckbox: React.FC<{ label: string; }> = ({ label }) => (
    <div style={{ display: 'flex', alignItems: 'center', columnGap: '0.75rem', userSelect: 'none' }}>
        <div style={{ width: '1rem', height: '1rem', border: '1.5px solid black' }} />
        <span>{label}</span>
    </div>
);

/**
 * The layout component for the legacy work order report, refactored for PDF generation reliability.
 * This version uses HTML tables and inline styles to ensure perfect rendering with html2canvas.
 * @param {object} props - Component props.
 * @param {WorkOrderData} props.data - The work order data to display.
 * @returns {React.ReactElement} - The rendered legacy report layout.
 */
export const LegacyReportLayout: React.FC<{ data: WorkOrderData; currentPage?: number; totalPages?: number; }> = ({ data, currentPage, totalPages }) => {
    // Data processing logic remains the same.
    const productsAsText = data.products
      .flatMap(p => 
        (p.serialNumbers || [])
          .map(s => ({ name: p.name, serial: s }))
      )
      .filter(item => item.name && item.name.trim() !== '' && item.serial && item.serial.trim() !== '')
      .map(item => `${item.name} S/N: ${item.serial}`)
      .join('\n');

    const finalRemarks = [
        data.remarks,
        productsAsText ? '--- 產品項目 ---\n' + productsAsText : ''
    ].filter(Boolean).join('\n\n');

    const formattedDate = data.dateTime 
        ? new Date(data.dateTime).toLocaleDateString('zh-TW', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
          })
        : '\u00A0'; // Non-breaking space for empty cells
    
    const contactInfo = [data.contactPerson, data.contactPhone].filter(Boolean).join(' / ');

    // --- Inline Style Definitions for consistency and reliability ---
    const tdBaseStyle: React.CSSProperties = { verticalAlign: 'top', padding: '1rem' };
    const tdCenterStyle: React.CSSProperties = { ...tdBaseStyle, textAlign: 'center', padding: '0.75rem' };
    const borderRightStyle: React.CSSProperties = { borderRight: '1.5px solid black' };
    const borderTopStyle: React.CSSProperties = { borderTop: '1.5px solid black' };

    return (
        <div id="pdf-legacy-report" style={{
            width: '210mm',
            height: '297mm',
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: 'white',
            padding: '0.75rem', // Reduced padding to bring content closer to edge
            fontFamily: 'Kai, "BiauKai", "標楷體", serif',
            border: '1.5px solid black'
        }}>
            <header style={{ textAlign: 'center', marginBottom: '0.75rem', flexShrink: 0 }}>
                <h1 style={{ fontSize: '2.5rem', fontWeight: 'bold' }}>
                    富元機電有限公司
                </h1>
            </header>

            {/* Main content now grows to fill available space, pushing footer down reliably */}
            <main style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, minHeight: 0 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', border: '1.5px solid black', fontSize: '1.25rem', tableLayout: 'fixed' }}>
                    <colgroup>
                        <col style={{ width: '16.67%' }} />
                        <col style={{ width: '33.33%' }} />
                        <col style={{ width: '16.67%' }} />
                        <col style={{ width: '33.33%' }} />
                    </colgroup>
                    <tbody>
                        <tr>
                            <td style={{ ...tdCenterStyle, ...borderRightStyle }}>單 位</td>
                            <td style={{ ...tdBaseStyle, ...borderRightStyle }}>&nbsp;</td>
                            <td colSpan={2} style={{ ...tdCenterStyle, verticalAlign: 'middle', fontSize: '2.25rem', fontWeight: 600, letterSpacing: '0.2em' }}>工作服務單</td>
                        </tr>
                        <tr style={borderTopStyle}>
                            <td style={{ ...tdCenterStyle, ...borderRightStyle }}>日 期</td>
                            <td style={{ ...tdBaseStyle, ...borderRightStyle }}>{formattedDate}</td>
                            <td style={{ ...tdCenterStyle, ...borderRightStyle }}>服務人員</td>
                            <td style={tdBaseStyle}>&nbsp;</td>
                        </tr>
                        <tr style={borderTopStyle}>
                            <td style={{ ...tdCenterStyle, ...borderRightStyle }}>客 戶</td>
                            <td style={{ ...tdBaseStyle, ...borderRightStyle }}>{data.serviceUnit || <>&nbsp;</>}</td>
                            <td style={{ ...tdCenterStyle, ...borderRightStyle }}>製造單號</td>
                            <td style={tdBaseStyle}>{data.manufacturingOrderNumber || <>&nbsp;</>}</td>
                        </tr>
                        <tr style={borderTopStyle}>
                            <td style={{ ...tdCenterStyle, ...borderRightStyle, lineHeight: 1.3 }}>接洽人<br />及電話</td>
                            <td style={{ ...tdBaseStyle, ...borderRightStyle, whiteSpace: 'pre-wrap' }}>{contactInfo || <>&nbsp;</>}</td>
                            <td style={{ ...tdCenterStyle, ...borderRightStyle, lineHeight: 1.3 }}>業務會報<br />單號</td>
                            <td style={{ ...tdBaseStyle, whiteSpace: 'pre-wrap' }}>{data.businessReportNumber || <>&nbsp;</>}</td>
                        </tr>
                    </tbody>
                </table>
                
                <table style={{ width: '100%', borderCollapse: 'collapse', border: '1.5px solid black', borderTop: 'none', fontSize: '1.25rem', tableLayout: 'fixed', height: '26rem' }}>
                     <thead>
                        <tr style={{ backgroundColor: '#f1f5f9', fontWeight: 600 }}>
                            <td style={{ ...tdCenterStyle, ...borderRightStyle, width: '45.45%' }}>處 理 事 項</td>
                            <td style={{ ...tdCenterStyle, ...borderRightStyle, width: '27.27%' }}>處 理 情 形</td>
                            <td style={{ ...tdCenterStyle }}>備 註 (客戶意見)</td>
                        </tr>
                    </thead>
                    <tbody>
                        <tr style={borderTopStyle}>
                            <td style={{ ...tdBaseStyle, ...borderRightStyle, whiteSpace: 'pre-wrap', overflow: 'hidden' }}>{data.tasks || <>&nbsp;</>}</td>
                            <td style={{ ...tdBaseStyle, ...borderRightStyle, whiteSpace: 'pre-wrap', overflow: 'hidden' }}>{data.status || <>&nbsp;</>}</td>
                            <td style={{ ...tdBaseStyle, whiteSpace: 'pre-wrap', overflow: 'hidden' }}>{finalRemarks || <>&nbsp;</>}</td>
                        </tr>
                    </tbody>
                </table>

                <table style={{ width: '100%', borderCollapse: 'collapse', border: '1.5px solid black', borderTop: 'none', fontSize: '1.25rem', tableLayout: 'fixed' }}>
                     <thead>
                        <tr style={{ backgroundColor: '#f1f5f9', fontWeight: 600, textAlign: 'center' }}>
                            <td style={{...tdCenterStyle, ...borderRightStyle, width: '25%'}}>日 期</td>
                            <td style={{...tdCenterStyle, ...borderRightStyle, width: '25%'}}>工 作 時 間</td>
                            <td style={{...tdCenterStyle, ...borderRightStyle, width: '25%'}}>客 戶 簽 認</td>
                            <td style={{...tdCenterStyle, width: '25%'}}>應攜帶之工具及材料</td>
                        </tr>
                    </thead>
                    <tbody>
                         <tr style={borderTopStyle}>
                            <td colSpan={2} style={{ padding: 0, ...borderRightStyle }}>
                                <table style={{ width: '100%', height: '10rem', borderCollapse: 'collapse' }}>
                                    <tbody>
                                        {[...Array(4)].map((_, i) => (
                                            <tr key={i} style={{ height: '25%' }}>
                                                <td style={{ width: '50%', ...borderRightStyle, borderTop: i > 0 ? '1.5px solid black' : 'none' }}>&nbsp;</td>
                                                <td style={{ borderTop: i > 0 ? '1.5px solid black' : 'none' }}>&nbsp;</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </td>
                            <td style={{ ...tdCenterStyle, ...borderRightStyle, minHeight: '10rem' }}>
                                {data.signature ? <img src={data.signature} alt="客戶簽名" style={{ height: '6rem', width: 'auto', objectFit: 'contain', display: 'inline-block' }} /> : <div style={{height: '6rem'}}>&nbsp;</div>}
                            </td>
                            <td style={{ ...tdBaseStyle, minHeight: '10rem' }}>&nbsp;</td>
                        </tr>
                    </tbody>
                </table>

                <div style={{ border: '1.5px solid black', borderTop: 'none', padding: '0.75rem', fontSize: '1.25rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', columnGap: '1rem', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 600 }}>服務總評：</span>
                        {['1. 劣', '2. 尚可', '3. 好', '4. 優良'].map(label => <StaticCheckbox key={label} label={label} />)}
                    </div>
                </div>
                <div style={{ border: '1.5px solid black', borderTop: 'none', padding: '0.75rem', fontSize: '1.25rem' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.75rem 1rem' }}>
                        <span style={{ fontWeight: 600 }}>服務結案：</span>
                        {['1. 圓滿完成', '2. 剩餘部份自行處理', '3. 另準備材料', '4. 再派員服務', '5. 提出檢修報價'].map(label => <StaticCheckbox key={label} label={label} />)}
                    </div>
                </div>
            </main>

            {/* Footer no longer needs marginTop: 'auto' because main element grows */}
            <footer style={{ paddingTop: '1rem', flexShrink: 0, fontSize: '1.25rem' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <tbody>
                        <tr>
                            <td style={{ width: '8.33%' }}></td>
                            <td style={{ width: '33.33%', verticalAlign: 'bottom' }}>
                                <div style={{ display: 'flex', alignItems: 'flex-end', minHeight: '60px' }}>
                                    <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>經理：</span>
                                </div>
                            </td>
                            <td style={{ width: '16.67%' }}></td>
                            <td style={{ width: '33.33%', verticalAlign: 'bottom' }}>
                                <div style={{ display: 'flex', alignItems: 'flex-end', minHeight: '60px' }}>
                                    <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>服務人員：</span>
                                    <div style={{ width: '100%', textAlign: 'center' }}>
                                        {data.technicianSignature ? <img src={data.technicianSignature} alt="服務人員簽名" style={{ height: '4rem', width: 'auto', display: 'inline-block' }} /> : <div style={{ height: '4rem' }}></div>}
                                    </div>
                                </div>
                            </td>
                            <td style={{ width: '8.33%' }}></td>
                        </tr>
                    </tbody>
                </table>
                {currentPage && totalPages && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.875rem', color: '#64748b', borderTop: '1.5px solid black', paddingTop: '0.75rem', marginTop: '0.75rem', fontFamily: 'sans-serif' }}>
                        <span>本表單由富元機電有限公司提供,電話(02)2697-5163 傳真(02)2697-5339</span>
                        <span style={{ fontFamily: 'monospace', fontSize: '1.5rem' }}>{`${currentPage} / ${totalPages}`}</span>
                    </div>
                )}
            </footer>
        </div>
    );
};
