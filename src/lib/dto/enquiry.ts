import type {
  EnquiryCategory,
  EnquiryStatus,
  ShipmentStatus,
} from "@prisma/client";

/**
 * There is no public enquiry projection beyond the receipt handed back to the
 * person who submitted one. Enquiries are not readable by the public at all.
 */
export interface EnquiryReceipt {
  id: string;
  status: EnquiryStatus;
  createdAt: string;
}

export interface StaffEnquiry {
  id: string;
  trackingNumber: string;
  category: EnquiryCategory;
  message: string;
  status: EnquiryStatus;
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: { id: string; name: string } | null;
  shipment: {
    id: string;
    status: ShipmentStatus;
    destinationCity: string;
  } | null;
}

export interface EnquiryForStaff {
  id: string;
  trackingNumber: string;
  category: EnquiryCategory;
  message: string;
  status: EnquiryStatus;
  createdAt: Date;
  resolvedAt: Date | null;
  resolvedBy: { id: string; name: string } | null;
  shipment: { id: string; status: ShipmentStatus; destinationCity: string } | null;
}

export function toEnquiryReceipt(enquiry: {
  id: string;
  status: EnquiryStatus;
  createdAt: Date;
}): EnquiryReceipt {
  return {
    id: enquiry.id,
    status: enquiry.status,
    createdAt: enquiry.createdAt.toISOString(),
  };
}

export function toStaffEnquiry(enquiry: EnquiryForStaff): StaffEnquiry {
  return {
    id: enquiry.id,
    trackingNumber: enquiry.trackingNumber,
    category: enquiry.category,
    message: enquiry.message,
    status: enquiry.status,
    createdAt: enquiry.createdAt.toISOString(),
    resolvedAt: enquiry.resolvedAt ? enquiry.resolvedAt.toISOString() : null,
    resolvedBy: enquiry.resolvedBy
      ? { id: enquiry.resolvedBy.id, name: enquiry.resolvedBy.name }
      : null,
    shipment: enquiry.shipment
      ? {
          id: enquiry.shipment.id,
          status: enquiry.shipment.status,
          destinationCity: enquiry.shipment.destinationCity,
        }
      : null,
  };
}
