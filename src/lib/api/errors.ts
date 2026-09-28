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
  | "INVALID_STATUS"
  | "EVENT_IN_FUTURE"
  | "DELIVERED_EVENT_NOT_LATEST"
  | "INVALID_STATUS_TRANSITION"
  | "EVENT_OUT_OF_ORDER"
  | "IMMUTABLE_FIELD"
  | "IDEMPOTENCY_KEY_REUSED"
  | "UNAUTHENTICATED"
  | "SESSION_EXPIRED"
  | "RATE_LIMITED"
  | "TOO_MANY_ATTEMPTS"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "CROSS_SITE_REQUEST"
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

  statusFollowsEvents: () =>
    new AppError(
      "VALIDATION_FAILED",
      400,
      "A shipment's status changes when a tracking event is added, so the customer is always told why.",
      { status: "Add a tracking event to change the status." },
    ),

  deliveredEventNotLatest: () =>
    new AppError(
      "DELIVERED_EVENT_NOT_LATEST",
      422,
      "A delivered event must be the latest update. This shipment already has a later event.",
      { occurredAt: "Delivery must be dated after the shipment's latest event." },
    ),

  invalidStatusTransition: (
    field: "type" | "status",
    from: string,
    to: string,
    allowed: string[],
  ) =>
    new AppError(
      "INVALID_STATUS_TRANSITION",
      422,
      allowed.length === 0
        ? `A shipment that is "${from}" is final and cannot move to "${to}".`
        : `A shipment that is "${from}" cannot move to "${to}". From here it can go to: ${allowed.join(", ")}.`,
      { [field]: "This status does not follow from the shipment's current one." },
    ),

  eventOutOfOrder: (field: "occurredAt" | "type", message: string) =>
    new AppError("EVENT_OUT_OF_ORDER", 422, message, { [field]: message }),

  immutableField: (field: string, explanation: string) =>
    new AppError("IMMUTABLE_FIELD", 400, explanation, { [field]: explanation }),

  /**
   * An Idempotency-Key that already created a shipment, sent again with
   * different details. Answering with that shipment would suggest the new
   * details were saved, so nothing is created and the reuse is refused.
   */
  idempotencyKeyReused: () =>
    new AppError(
      "IDEMPOTENCY_KEY_REUSED",
      422,
      "This Idempotency-Key has already created a shipment with different details, so nothing new was created. Use a new key for a new shipment.",
    ),

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
      "That is a lot of enquiries in a short time. Please try again later.",
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

  unsupportedMediaType: () =>
    new AppError(
      "UNSUPPORTED_MEDIA_TYPE",
      415,
      "Send the request body as JSON, with Content-Type: application/json.",
    ),

  crossSiteRequest: () =>
    new AppError(
      "CROSS_SITE_REQUEST",
      403,
      "This request has to come from the application itself.",
    ),

  internal: () =>
    new AppError(
      "INTERNAL_ERROR",
      500,
      "Something went wrong on our side. Please try again.",
    ),
};
