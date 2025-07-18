

/**
 * @interface ProductItem
 * @description 代表一個產品項目的資料結構。
 */
export interface ProductItem {
  /** 
   * @property {string} id - 產品的唯一識別碼，通常由時間戳生成。
   */
  id: string;
  /** 
   * @property {string} name - 產品的名稱。
   */
  name: string;
  /** 
   * @property {number} quantity - 產品的數量。
   */
  quantity: number;
  /** 
   * @property {string[]} serialNumbers - 產品的序號列表，陣列長度應與 quantity 相符。
   */
  serialNumbers: string[];
}

/**
 * @interface WorkOrderData
 * @description 代表一張完整工作服務單所需的所有資料。
 */
export interface WorkOrderData {
  /** 
   * @property {string} dateTime - 工作日期和時間，格式為 ISO 8601 (YYYY-MM-DDTHH:mm)。
   */
  dateTime: string;
  /** 
   * @property {string} serviceUnit - 服務單位的名稱。
   */
  serviceUnit: string;
  /** 
   * @property {string} contactPerson - 客戶方的接洽人姓名。
   */
  contactPerson: string;
  /** 
   * @property {string} contactPhone - 接洽人的連絡電話。
   */
  contactPhone: string;
  /** 
   * @property {ProductItem[]} products - 服務單中包含的產品項目列表。
   */
  products: ProductItem[];
  /** 
   * @property {string} tasks - 需要處理的事項描述。
   */
  tasks: string;
  /** 
   * @property {string} status - 實際的處理情形描述。
   */
  status: string;
  /** 
   * @property {string} remarks - 額外的備註事項。
   */
  remarks: string;
  /** 
   * @property {string[]} photos - 附加的現場照片列表，儲存為 Base64 Data URL 格式。
   */
  photos: string[];
  /** 
   * @property {string | null} signature - 客戶的數位簽名，儲存為 Base64 Data URL 格式。
   */
  signature: string | null;
  /** 
   * @property {string | null} technicianSignature - 服務人員的數位簽名，儲存為 Base64 Data URL 格式。
   */
  technicianSignature: string | null;
}
