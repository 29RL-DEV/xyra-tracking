// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiGet } from "@/lib/api-client";

/**
 * A session that runs out mid-task must return the person to sign-in rather
 * than stranding them on a staff page with an error they cannot act on.
 */

const assign = vi.fn();

function setPath(pathname: string) {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { pathname, assign },
  });
}

function respond(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
    ),
  );
}

describe("api client session handling", () => {
  beforeEach(() => {
    assign.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends an expired staff session back to sign-in with a reason", async () => {
    setPath("/staff/shipments");
    respond(401, { error: { code: "SESSION_EXPIRED", message: "Expired" } });

    await expect(apiGet("/api/staff/shipments")).rejects.toBeInstanceOf(ApiError);

    expect(assign).toHaveBeenCalledWith("/staff/login?reason=expired");
  });

  it("sends a missing staff session back to sign-in", async () => {
    setPath("/staff/enquiries");
    respond(401, { error: { code: "UNAUTHENTICATED", message: "Sign in" } });

    await expect(apiGet("/api/staff/enquiries")).rejects.toBeInstanceOf(ApiError);

    expect(assign).toHaveBeenCalledWith("/staff/login?reason=signed-out");
  });

  it("does not redirect from the sign-in page itself", async () => {
    setPath("/staff/login");
    respond(401, { error: { code: "UNAUTHENTICATED", message: "Wrong password" } });

    await expect(apiGet("/api/auth/me")).rejects.toBeInstanceOf(ApiError);

    expect(assign).not.toHaveBeenCalled();
  });

  it("never bounces a customer on a public page to a login screen", async () => {
    setPath("/track/TRK-DEMO-001");
    respond(401, { error: { code: "UNAUTHENTICATED", message: "Sign in" } });

    await expect(apiGet("/api/shipments/TRK-DEMO-001")).rejects.toBeInstanceOf(
      ApiError,
    );

    expect(assign).not.toHaveBeenCalled();
  });

  it("leaves other failures to the caller", async () => {
    setPath("/staff/shipments");
    respond(500, { error: { code: "INTERNAL_ERROR", message: "Boom" } });

    await expect(apiGet("/api/staff/shipments")).rejects.toBeInstanceOf(ApiError);

    expect(assign).not.toHaveBeenCalled();
  });

  it("surfaces field errors from the envelope", async () => {
    setPath("/staff/shipments");
    respond(400, {
      error: {
        code: "VALIDATION_FAILED",
        message: "Check the fields",
        fields: { destinationCity: "Destination city is required" },
      },
    });

    await expect(apiGet("/api/staff/shipments")).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      fields: { destinationCity: "Destination city is required" },
    });
  });
});
