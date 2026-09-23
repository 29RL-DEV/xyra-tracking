import { prisma } from "@/lib/db";
import { errors } from "@/lib/api/errors";
import { toStaffNote, type StaffNote } from "@/lib/dto/shipment";
import type { CreateNoteInput } from "@/lib/validation/note";

/**
 * Internal notes. Authorship comes from the verified session, never from the
 * request body, so a caller cannot attribute a note to someone else.
 */
export async function addNote(
  shipmentId: string,
  input: CreateNoteInput,
  authorId: string,
): Promise<StaffNote> {
  const shipment = await prisma.shipment.findUnique({
    where: { id: shipmentId },
    select: { id: true },
  });

  if (!shipment) {
    throw errors.shipmentNotFound();
  }

  const note = await prisma.internalNote.create({
    data: { shipmentId, authorId, body: input.body },
    select: {
      id: true,
      body: true,
      createdAt: true,
      author: { select: { id: true, name: true } },
    },
  });

  return toStaffNote(note);
}
