
export interface ProductItem {
  id: string;
  name: string;
  quantity: number;
  serialNumber: string;
}

export interface WorkOrderData {
  dateTime: string;
  serviceUnit: string;
  contactPerson: string;
  contactPhone: string;
  products: ProductItem[];
  tasks: string;
  status: string;
  remarks: string;
  photos: string[];
  signature: string | null;
  technicianSignature: string | null;
}