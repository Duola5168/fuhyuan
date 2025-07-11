export interface WorkOrderData {
  dateTime: string;
  serviceUnit: string;
  contactPerson: string;
  contactPhone: string;
  tasks: string;
  status: string;
  remarks: string;
  photos: string[];
  signature: string | null;
  technicianSignature: string | null;
}