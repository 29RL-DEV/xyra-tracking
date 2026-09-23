import type { NextRequest } from "next/server";
import { searchParamsToObject } from "@/lib/api/request";
import { handleRoute, jsonResponse } from "@/lib/api/respond";
import { requireStaff } from "@/lib/auth/require-staff";
import { listEnquiries } from "@/lib/services/enquiry-service";
import { enquiryQuerySchema } from "@/lib/validation/enquiry";

export const dynamic = "force-dynamic";

export const GET = handleRoute(async (request: NextRequest) => {
  await requireStaff();

  const query = enquiryQuerySchema.parse(searchParamsToObject(request));
  const result = await listEnquiries(query);

  return jsonResponse(result);
});
