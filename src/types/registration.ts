export type GstStatus = 'yes' | 'no';

export const BUSINESS_CATEGORIES = [
  'Retail & E-commerce',
  'Food & Restaurant',
  'Education & Training',
  'Healthcare',
  'Fashion & Clothing',
  'Beauty & Salon',
  'Real Estate',
  'Professional Services',
  'Manufacturing',
  'Agriculture',
] as const;

export interface RegistrationDetails {
  fullName: string;
  businessName: string;
  industry: string;
  hasGst: GstStatus;
  whatsappNumber: string;
}
