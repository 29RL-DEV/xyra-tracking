/**
 * Demo data for the Shipment Tracking Dashboard.
 *
 * Everything here is fictional: invented town names, invented references and
 * invented enquiry text. No real names, addresses, contact details or customer
 * identifiers appear anywhere in this file.
 *
 * The script is idempotent. It clears the demo rows and re-inserts them, so
 * running it twice leaves the database in the same state as running it once.
 * It is never run automatically on deploy — see the README.
 */
import {
  PrismaClient,
  Prisma,
  type EnquiryCategory,
  type EnquiryStatus,
  type ServiceLevel,
  type ShipmentStatus,
  type ShipmentType,
} from "@prisma/client";
import bcrypt from "bcryptjs";
import { loadEnv } from "../scripts/load-env";
import {
  planSeed,
  resolveSeedPassword,
  SeedRefusedError,
} from "./seed-guard";

loadEnv();

const prisma = new PrismaClient();

const DEMO_STAFF_EMAIL = "staff@demo.test";
const DEMO_STAFF_NAME = "Demo Operator";

const DAY_MS = 24 * 60 * 60 * 1000;

/** UTC midnight, `days` from today. Negative values are in the past. */
function dateIn(days: number): Date {
  const now = new Date();
  const utcMidnight = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  return new Date(utcMidnight + days * DAY_MS);
}

/** A timestamp `hours` in the past. */
function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

interface SeedEvent {
  hoursAgo: number;
  location: string;
  type: ShipmentStatus;
  message: string;
}

interface SeedShipment {
  trackingNumber: string;
  status: ShipmentStatus;
  originCity: string;
  originCountry: string;
  destinationCity: string;
  destinationCountry: string;
  estimatedDeliveryInDays: number;
  originalEstimatedDeliveryInDays?: number;
  currentLocation: string;
  serviceLevel: ServiceLevel;
  shipmentType?: ShipmentType;
  packageCount: number;
  weightKg?: number;
  customerReference?: string;
  events: SeedEvent[];
  notes?: string[];
}

/**
 * The five scenarios the brief asks reviewers to be able to try, each built to
 * demonstrate its state end to end.
 */
const demoShipments: SeedShipment[] = [
  {
    trackingNumber: "TRK-DEMO-001",
    status: "IN_TRANSIT",
    originCity: "Ashmarket",
    originCountry: "United Kingdom",
    destinationCity: "Westmoor Quay",
    destinationCountry: "United Kingdom",
    estimatedDeliveryInDays: 3,
    currentLocation: "Gralebridge regional hub",
    serviceLevel: "STANDARD",
    shipmentType: "PARCEL",
    packageCount: 2,
    weightKg: 4.5,
    customerReference: "REF-88213",
    events: [
      {
        hoursAgo: 96,
        location: "Ashmarket depot",
        type: "CREATED",
        message: "Shipment details received. Awaiting collection.",
      },
      {
        hoursAgo: 84,
        location: "Ashmarket depot",
        type: "COLLECTED",
        message: "Collected from the sender.",
      },
      {
        hoursAgo: 60,
        location: "Ashmarket sorting centre",
        type: "IN_TRANSIT",
        message: "Sorted and despatched to the regional network.",
      },
      {
        hoursAgo: 18,
        location: "Gralebridge regional hub",
        type: "IN_TRANSIT",
        message: "Arrived at the regional hub and is on route to the delivery depot.",
      },
    ],
    notes: [
      "Customer called about the delivery window. Nothing to action, shipment is running to plan.",
    ],
  },
  {
    trackingNumber: "TRK-DEMO-002",
    status: "DELIVERED",
    originCity: "Brindleford",
    originCountry: "United Kingdom",
    destinationCity: "Redhaven",
    destinationCountry: "United Kingdom",
    estimatedDeliveryInDays: -1,
    currentLocation: "Redhaven",
    serviceLevel: "EXPRESS",
    shipmentType: "DOCUMENT",
    packageCount: 1,
    weightKg: 0.5,
    customerReference: "REF-41907",
    events: [
      {
        hoursAgo: 120,
        location: "Brindleford depot",
        type: "COLLECTED",
        message: "Collected from the sender.",
      },
      {
        hoursAgo: 96,
        location: "Brindleford sorting centre",
        type: "IN_TRANSIT",
        message: "Despatched on the express network.",
      },
      {
        hoursAgo: 40,
        location: "Redhaven delivery depot",
        type: "OUT_FOR_DELIVERY",
        message: "Out for delivery with the local driver.",
      },
      {
        hoursAgo: 34,
        location: "Redhaven",
        type: "DELIVERED",
        message: "Delivered and signed for at the reception desk.",
      },
    ],
  },
  {
    trackingNumber: "TRK-DEMO-003",
    status: "DELAYED",
    originCity: "Calderwick",
    originCountry: "United Kingdom",
    destinationCity: "Thornbeck",
    destinationCountry: "United Kingdom",
    estimatedDeliveryInDays: 4,
    originalEstimatedDeliveryInDays: 1,
    currentLocation: "Marsden Vale sorting centre",
    serviceLevel: "STANDARD",
    shipmentType: "PALLET",
    packageCount: 6,
    weightKg: 128.75,
    customerReference: "REF-55320",
    events: [
      {
        hoursAgo: 144,
        location: "Calderwick depot",
        type: "COLLECTED",
        message: "Collected from the sender.",
      },
      {
        hoursAgo: 120,
        location: "Calderwick sorting centre",
        type: "IN_TRANSIT",
        message: "Sorted and despatched to the regional network.",
      },
      {
        hoursAgo: 30,
        location: "Marsden Vale sorting centre",
        type: "DELAYED",
        message:
          "Severe weather has closed the route through the Marsden Vale pass. The shipment is safe and the estimated delivery date has moved to the new date shown above.",
      },
    ],
    notes: [
      "Route closure expected to clear within 48 hours. Re-book onto the Thornbeck run once the pass reopens.",
    ],
  },
  {
    trackingNumber: "TRK-DEMO-004",
    status: "EXCEPTION",
    originCity: "Dunmoor",
    originCountry: "United Kingdom",
    destinationCity: "Inglestead",
    destinationCountry: "United Kingdom",
    estimatedDeliveryInDays: 2,
    currentLocation: "Inglestead delivery depot",
    serviceLevel: "STANDARD",
    shipmentType: "PARCEL",
    packageCount: 1,
    weightKg: 2.1,
    customerReference: "REF-70184",
    events: [
      {
        hoursAgo: 72,
        location: "Dunmoor depot",
        type: "COLLECTED",
        message: "Collected from the sender.",
      },
      {
        hoursAgo: 48,
        location: "Dunmoor sorting centre",
        type: "IN_TRANSIT",
        message: "Sorted and despatched to the delivery depot.",
      },
      {
        hoursAgo: 6,
        location: "Inglestead delivery depot",
        type: "EXCEPTION",
        message:
          "The delivery address is incomplete: the building number is missing. The shipment is being held at the Inglestead depot until the address is confirmed.",
      },
    ],
    notes: [
      "Address query raised. Hold at depot for five working days before returning to sender.",
    ],
  },
  {
    trackingNumber: "TRK-DEMO-005",
    status: "COLLECTED",
    originCity: "Eastcliffe",
    originCountry: "United Kingdom",
    destinationCity: "Kelbury",
    destinationCountry: "Ireland",
    estimatedDeliveryInDays: 5,
    currentLocation: "Eastcliffe depot",
    serviceLevel: "ECONOMY",
    shipmentType: "PARCEL",
    packageCount: 1,
    weightKg: 1.2,
    customerReference: "REF-30655",
    events: [
      {
        hoursAgo: 8,
        location: "Eastcliffe depot",
        type: "COLLECTED",
        message: "Collected from the sender and booked into the network.",
      },
    ],
  },
];

/**
 * Additional volume so search, every status filter and pagination all have
 * something meaningful to show.
 */
const routes: Array<[string, string, string, string]> = [
  ["Fernhollow", "United Kingdom", "Northwick Bay", "United Kingdom"],
  ["Harrowmere", "United Kingdom", "Pelforth", "United Kingdom"],
  ["Larkfield Cross", "United Kingdom", "Quarrybrook", "Ireland"],
  ["Oakhampton Ridge", "United Kingdom", "Stonemill", "United Kingdom"],
  ["Uppercombe", "United Kingdom", "Vardenhall", "Netherlands"],
  ["Gralebridge", "United Kingdom", "Ashmarket", "United Kingdom"],
  ["Redhaven", "United Kingdom", "Dunmoor", "France"],
  ["Thornbeck", "United Kingdom", "Brindleford", "United Kingdom"],
  ["Kelbury", "Ireland", "Eastcliffe", "United Kingdom"],
  ["Northwick Bay", "United Kingdom", "Calderwick", "United Kingdom"],
  ["Stonemill", "United Kingdom", "Harrowmere", "Germany"],
  ["Pelforth", "United Kingdom", "Larkfield Cross", "United Kingdom"],
  ["Marsden Vale", "United Kingdom", "Fernhollow", "United Kingdom"],
  ["Quarrybrook", "Ireland", "Oakhampton Ridge", "United Kingdom"],
  ["Vardenhall", "Netherlands", "Uppercombe", "United Kingdom"],
  ["Inglestead", "United Kingdom", "Westmoor Quay", "United Kingdom"],
  ["Westmoor Quay", "United Kingdom", "Marsden Vale", "United Kingdom"],
];

/** Two shipments in every status, so every filter returns a real result. */
const fillerStatuses: ShipmentStatus[] = [
  "CREATED",
  "CREATED",
  "COLLECTED",
  "COLLECTED",
  "IN_TRANSIT",
  "IN_TRANSIT",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "DELIVERED",
  "DELIVERED",
  "DELAYED",
  "DELAYED",
  "EXCEPTION",
  "EXCEPTION",
  "IN_TRANSIT",
];

const SERVICE_CYCLE: ServiceLevel[] = ["STANDARD", "EXPRESS", "ECONOMY"];
const TYPE_CYCLE: ShipmentType[] = ["PARCEL", "PALLET", "DOCUMENT"];

/** Deterministic filler numbers, distinguishable at a glance from the demo set. */
const fillerNumbers = [
  "TRK-4KP2M9",
  "TRK-7QT3VH",
  "TRK-9XJ5RB",
  "TRK-2WN8KD",
  "TRK-6HZ4PC",
  "TRK-3MY7TF",
  "TRK-8VC2QN",
  "TRK-5RB9JK",
  "TRK-4TD6WM",
  "TRK-7KN3ZP",
  "TRK-2PJ8HV",
  "TRK-9CF5MB",
  "TRK-6XQ2TR",
  "TRK-3ZW7KD",
  "TRK-8HM4NJ",
  "TRK-5VT9PC",
  "TRK-4JB3QF",
];

function eventsForStatus(status: ShipmentStatus, origin: string, destination: string): SeedEvent[] {
  const collected: SeedEvent = {
    hoursAgo: 72,
    location: `${origin} depot`,
    type: "COLLECTED",
    message: "Collected from the sender.",
  };
  const inTransit: SeedEvent = {
    hoursAgo: 48,
    location: `${origin} sorting centre`,
    type: "IN_TRANSIT",
    message: "Sorted and despatched to the regional network.",
  };
  const outForDelivery: SeedEvent = {
    hoursAgo: 5,
    location: `${destination} delivery depot`,
    type: "OUT_FOR_DELIVERY",
    message: "Out for delivery with the local driver.",
  };

  switch (status) {
    case "CREATED":
      return [
        {
          hoursAgo: 4,
          location: `${origin} depot`,
          type: "CREATED",
          message: "Shipment details received. Awaiting collection.",
        },
      ];
    case "COLLECTED":
      return [collected];
    case "IN_TRANSIT":
      return [collected, inTransit];
    case "OUT_FOR_DELIVERY":
      return [collected, inTransit, outForDelivery];
    case "DELIVERED":
      return [
        collected,
        inTransit,
        outForDelivery,
        {
          hoursAgo: 2,
          location: destination,
          type: "DELIVERED",
          message: "Delivered and signed for.",
        },
      ];
    case "DELAYED":
      return [
        collected,
        inTransit,
        {
          hoursAgo: 12,
          location: `${origin} sorting centre`,
          type: "DELAYED",
          message:
            "A vehicle breakdown on the trunk route has held this shipment overnight. The estimated delivery date has been updated.",
        },
      ];
    case "EXCEPTION":
      return [
        collected,
        inTransit,
        {
          hoursAgo: 9,
          location: `${destination} delivery depot`,
          type: "EXCEPTION",
          message:
            "The delivery site was closed on arrival and no alternative instructions were on file. We are holding the shipment at the depot.",
        },
      ];
    default:
      return [collected];
  }
}

function buildFillerShipments(): SeedShipment[] {
  return fillerStatuses.map((status, index) => {
    const route = routes[index % routes.length]!;
    const [originCity, originCountry, destinationCity, destinationCountry] = route;
    const events = eventsForStatus(status, originCity, destinationCity);
    const latest = events[events.length - 1]!;

    const delivered = status === "DELIVERED";
    const delayed = status === "DELAYED";

    return {
      trackingNumber: fillerNumbers[index]!,
      status,
      originCity,
      originCountry,
      destinationCity,
      destinationCountry,
      estimatedDeliveryInDays: delivered ? -1 : delayed ? 3 : (index % 5) + 1,
      ...(delayed ? { originalEstimatedDeliveryInDays: 1 } : {}),
      currentLocation: latest.location,
      serviceLevel: SERVICE_CYCLE[index % SERVICE_CYCLE.length]!,
      shipmentType: TYPE_CYCLE[index % TYPE_CYCLE.length]!,
      packageCount: (index % 4) + 1,
      weightKg: Number((1.5 + index * 1.75).toFixed(2)),
      customerReference: `REF-${10000 + index * 137}`,
      events,
    };
  });
}

interface SeedEnquiry {
  trackingNumber: string;
  category: EnquiryCategory;
  message: string;
  status: EnquiryStatus;
  hoursAgo: number;
}

const demoEnquiries: SeedEnquiry[] = [
  {
    trackingNumber: "TRK-DEMO-003",
    category: "DELIVERY_DELAY",
    message:
      "The tracking page says this is delayed because of the weather. Is there a new delivery date yet? I need to know whether to arrange for someone to be in.",
    status: "OPEN",
    hoursAgo: 20,
  },
  {
    trackingNumber: "TRK-DEMO-004",
    category: "WRONG_ADDRESS",
    message:
      "I think the building number was left off when this was booked. The address should include unit 14. Can you add it and try again?",
    status: "OPEN",
    hoursAgo: 4,
  },
  {
    trackingNumber: "TRK-DEMO-001",
    category: "OTHER",
    message:
      "Can this be left with a neighbour if nobody answers the door? Happy for it to go next door either side.",
    status: "OPEN",
    hoursAgo: 2,
  },
  {
    trackingNumber: "TRK-DEMO-002",
    category: "DAMAGED_OR_MISSING",
    message:
      "The envelope arrived with a torn corner but everything inside looks fine. Flagging it in case you track that sort of thing.",
    status: "RESOLVED",
    hoursAgo: 28,
  },
  {
    trackingNumber: "TRK-4KP2M9",
    category: "COLLECTION_ISSUE",
    message:
      "Nobody came to collect this yesterday even though it was booked for the afternoon. Can it be rebooked?",
    status: "RESOLVED",
    hoursAgo: 50,
  },
  {
    trackingNumber: "TRK-7QT3VH",
    category: "DELIVERY_DELAY",
    message:
      "This has been showing the same status for two days. Is it still moving or is there a problem?",
    status: "OPEN",
    hoursAgo: 9,
  },
];

async function clearDemoData() {
  // Foreign-key-safe order. This is the only delete in the application, and it
  // runs only when someone explicitly invokes the seed command.
  //
  // One transaction: a failure part-way through leaves the database as it was
  // rather than half-emptied.
  await prisma.$transaction([
    prisma.enquiry.deleteMany(),
    prisma.internalNote.deleteMany(),
    prisma.trackingEvent.deleteMany(),
    prisma.shipment.deleteMany(),
    prisma.staffUser.deleteMany(),
  ]);
}

async function main() {
  // Decided before anything is deleted: a non-local database needs an explicit
  // override, and may not fall back to the password published in the README.
  const plan = planSeed({
    databaseUrl: process.env.DATABASE_URL,
    allowDestructive: process.env.ALLOW_DESTRUCTIVE_SEED,
  });
  const staffPassword = resolveSeedPassword(process.env.SEED_STAFF_PASSWORD, plan);

  if (plan.overridden) {
    console.warn(
      "WARNING: seeding a non-local database. Every existing shipment, event, note, enquiry and staff user will be deleted.",
    );
  }

  console.log("Seeding demo data...");

  await clearDemoData();

  const passwordHash = await bcrypt.hash(staffPassword, 10);

  const staff = await prisma.staffUser.create({
    data: {
      email: DEMO_STAFF_EMAIL,
      name: DEMO_STAFF_NAME,
      passwordHash,
    },
  });

  const shipments = [...demoShipments, ...buildFillerShipments()];

  for (const shipment of shipments) {
    const created = await prisma.shipment.create({
      data: {
        trackingNumber: shipment.trackingNumber,
        status: shipment.status,
        originCity: shipment.originCity,
        originCountry: shipment.originCountry,
        destinationCity: shipment.destinationCity,
        destinationCountry: shipment.destinationCountry,
        estimatedDelivery: dateIn(shipment.estimatedDeliveryInDays),
        ...(shipment.originalEstimatedDeliveryInDays === undefined
          ? {}
          : {
              originalEstimatedDelivery: dateIn(
                shipment.originalEstimatedDeliveryInDays,
              ),
            }),
        currentLocation: shipment.currentLocation,
        serviceLevel: shipment.serviceLevel,
        ...(shipment.shipmentType ? { shipmentType: shipment.shipmentType } : {}),
        packageCount: shipment.packageCount,
        ...(shipment.weightKg === undefined
          ? {}
          : { weightKg: new Prisma.Decimal(shipment.weightKg) }),
        ...(shipment.customerReference
          ? { customerReference: shipment.customerReference }
          : {}),
      },
    });

    for (const event of shipment.events) {
      await prisma.trackingEvent.create({
        data: {
          shipmentId: created.id,
          occurredAt: hoursAgo(event.hoursAgo),
          location: event.location,
          type: event.type,
          message: event.message,
        },
      });
    }

    for (const note of shipment.notes ?? []) {
      await prisma.internalNote.create({
        data: { shipmentId: created.id, authorId: staff.id, body: note },
      });
    }
  }

  for (const enquiry of demoEnquiries) {
    const shipment = await prisma.shipment.findUnique({
      where: { trackingNumber: enquiry.trackingNumber },
      select: { id: true },
    });

    if (!shipment) {
      throw new Error(
        `Seed enquiry references an unknown tracking number: ${enquiry.trackingNumber}`,
      );
    }

    await prisma.enquiry.create({
      data: {
        shipmentId: shipment.id,
        trackingNumber: enquiry.trackingNumber,
        category: enquiry.category,
        message: enquiry.message,
        status: enquiry.status,
        createdAt: hoursAgo(enquiry.hoursAgo),
        ...(enquiry.status === "RESOLVED"
          ? {
              resolvedAt: hoursAgo(Math.max(0, enquiry.hoursAgo - 3)),
              resolvedById: staff.id,
            }
          : {}),
      },
    });
  }

  const counts = {
    staff: await prisma.staffUser.count(),
    shipments: await prisma.shipment.count(),
    events: await prisma.trackingEvent.count(),
    notes: await prisma.internalNote.count(),
    enquiries: await prisma.enquiry.count(),
  };

  console.log("Seed complete:", counts);
  console.log(
    plan.isLocal
      ? `Demo staff login: ${DEMO_STAFF_EMAIL} / ${staffPassword}`
      : `Demo staff login: ${DEMO_STAFF_EMAIL} / (the SEED_STAFF_PASSWORD you supplied)`,
  );
  console.log(
    "Demo tracking numbers: TRK-DEMO-001, TRK-DEMO-002, TRK-DEMO-003, TRK-DEMO-004, TRK-DEMO-005",
  );
}

main()
  .catch((error) => {
    if (error instanceof SeedRefusedError) {
      console.error(`
Seed refused.

${error.message}
`);
    } else {
      console.error("Seed failed:", error);
    }
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
