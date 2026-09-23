/**
 * The short reference a customer is shown after sending an enquiry.
 *
 * Derived from the enquiry's id rather than stored, so the customer's
 * confirmation and every staff screen always agree on it.
 */
export function enquiryReference(id: string): string {
  return id.slice(-8).toUpperCase();
}
