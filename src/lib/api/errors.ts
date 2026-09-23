/**
 * Application error taxonomy.
 *
 * Every failure that reaches a client passes through here, so no response can
 * carry a stack trace, an ORM message or an environment value. Unknown errors
 * are logged server-side and reported as a generic 500.
 */

export type ErrorCode =
  | "VALIDATION_FAILED"
  | "SHIPMENT_NOT_FOUND"
  | "ENQUIRY_NOT_FOUND"
  | "TRACKING_NUMBER_TAKEN"
  | "INVALID_STATUS"
  | "EVENT_IN_FUTURE"
  | "DELIVERED_REQUIRES_EVENT"
  | "IMMUTABLE_FIELD"
  | "UNAUTHENTICATED"
  | "SESSION_EXPIRED"
  | "RATE_LIMITED"
  | "TOO_MANY_ATTEMPTS"
  | "INTERNAL_ERROR";

export interface FieldErrors {
  [field: string]: string;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly fields: FieldErrors | undefined;

  constructor(
    code: ErrorCode,
    status: number,
    message: string,
    fields?: FieldErrors,
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.fields = fields;
  }
}

export const errors = {
  validation: (message: string, fields?: FieldErrors) =>
    new AppError("VALIDATION_FAILED", 400, message, fields),

  shipmentNotFound: () =>
    new AppError(
      "SHIPMENT_NOT_FOUND",
      404,
      "We could not find a shipment with that tracking number.",
    ),

  enquiryNotFound: () =>
    new AppError("ENQUIRY_NOT_FOUND", 404, "That enquiry no longer exists."),

  trackingNumberTaken: (trackingNumber: string) =>
    new AppError(
      "TRACKING_NUMBER_TAKEN",
      409,
      `Tracking number ${trackingNumber} is already in use. Tracking numbers must be unique.`,
      { trackingNumber: "This tracking number is already in use." },
    ),

  invalidStatus: () =>
    new AppError(
      "INVALID_STATUS",
      400,
      "That is not a supported shipment status.",
      { status: "Choose one of the supported statuses." },
    ),

  eventInFuture: () =>
    new AppError(
      "EVENT_IN_FUTURE",
      400,
      "An event cannot be dated in the future.",
      { occurredAt: "An event cannot be dated in the future." },
    ),

  deliveredRequiresEvent: () =>
    new AppError(
      "DELIVERED_REQUIRES_EVENT",
      422,
      "Add a delivered event before marking this shipment as delivered, so the customer can see when it arrived.",
      { status: "This shipment has no delivered event yet." },
    ),

  immutableField: (field: string, explanation: string) =>
    new AppError("IMMUTABLE_FIELD", 400, explanation, { [field]: explanation }),

  unauthenticated: () =>
    new AppError("UNAUTHENTICATED", 401, "You need to sign in to do that."),

  sessionExpired: () =>
    new AppError(
      "SESSION_EXPIRED",
      401,
      "Your session has expired. Please sign in again.",
    ),

  rateLimited: () =>
    new AppError(
      "RATE_LIMITED",
      429,
      "That is a lot of enquiries in a short time. Please wait a few minutes and try again.",
    ),

  lookupRateLimited: () =>
    new AppError(
      "RATE_LIMITED",
      429,
      "That is a lot of tracking lookups in a short time. Please wait a minute and try again.",
    ),

  /**
   * Sign-in throttling. The wording is deliberately identical whether or not
   * the email belongs to an account, so the response cannot be used to find
   * out which addresses exist.
   */
  tooManyAttempts: () =>
    new AppError(
      "TOO_MANY_ATTEMPTS",
      429,
      "Too many sign-in attempts. Please wait a few minutes and try again.",
    ),

  internal: () =>
    new AppError(
      "INTERNAL_ERROR",
      500,
      "Something went wrong on our side. Please try again.",
    ),
};
