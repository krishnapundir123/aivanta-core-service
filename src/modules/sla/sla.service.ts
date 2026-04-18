import { prisma } from '../../config/database';
import { TicketPriority } from '@prisma/client';
import logger from '../../shared/utils/logger';

interface BusinessHours {
  [key: string]: [number, number]; // day: [start, end] in 24h format
}

interface Holiday {
  date: string;
  name: string;
}

export async function calculateSlaDeadline(
  tenantId: string | undefined,
  priority: TicketPriority,
  startTime: Date = new Date()
): Promise<Date> {
  // Get SLA config
  const slaConfig = await prisma.slaConfig.findFirst({
    where: {
      OR: [
        { tenantId: tenantId || '' },
        { tenantId: null },
      ],
    },
    orderBy: {
      tenantId: 'desc', // Tenant-specific overrides global
    },
  });

  if (!slaConfig) {
    // Default fallback
    const hours = priority === 'CRITICAL' ? 4 : priority === 'HIGH' ? 8 : 24;
    const deadline = new Date(startTime);
    deadline.setHours(deadline.getHours() + hours);
    return deadline;
  }

  // Get response time in minutes based on priority
  const responseMinutes = {
    LOW: slaConfig.lowResponse,
    MEDIUM: slaConfig.mediumResponse,
    HIGH: slaConfig.highResponse,
    CRITICAL: slaConfig.criticalResponse,
  }[priority];

  const businessHours = slaConfig.businessHours as BusinessHours;
  const holidays = (slaConfig.holidays as unknown as Holiday[]) || [];

  return addBusinessMinutes(startTime, responseMinutes, businessHours, holidays);
}

function addBusinessMinutes(
  start: Date,
  minutes: number,
  businessHours: BusinessHours,
  holidays: Holiday[]
): Date {
  const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const holidayDates = new Set(holidays.map(h => h.date));
  
  let remainingMinutes = minutes;
  let current = new Date(start);

  while (remainingMinutes > 0) {
    const dayOfWeek = dayNames[current.getDay()]!;
    const dayHours = businessHours[dayOfWeek];
    const dateStr = current.toISOString().split('T')[0]!;

    // Skip weekends and holidays
    if (!dayHours || holidayDates.has(dateStr)) {
      current.setDate(current.getDate() + 1);
      current.setHours(0, 0, 0, 0);
      continue;
    }

    const [startHour, endHour] = dayHours;
    const currentHour = current.getHours();
    const currentMinute = current.getMinutes();

    // If before business hours, move to start
    if (currentHour < startHour) {
      current.setHours(startHour, 0, 0, 0);
      continue;
    }

    // If after business hours, move to next day
    if (currentHour >= endHour) {
      current.setDate(current.getDate() + 1);
      current.setHours(0, 0, 0, 0);
      continue;
    }

    // Calculate available minutes in current day
    const endOfDay = new Date(current);
    endOfDay.setHours(endHour, 0, 0, 0);
    const availableMinutes = Math.floor((endOfDay.getTime() - current.getTime()) / 60000);

    if (remainingMinutes <= availableMinutes) {
      current.setMinutes(current.getMinutes() + remainingMinutes);
      remainingMinutes = 0;
    } else {
      remainingMinutes -= availableMinutes;
      current.setDate(current.getDate() + 1);
      current.setHours(0, 0, 0, 0);
    }
  }

  return current;
}

export async function checkSlaBreaches(): Promise<void> {
  const now = new Date();
  
  const ticketsNearBreach = await prisma.ticket.findMany({
    where: {
      status: { notIn: ['RESOLVED', 'CLOSED'] },
      slaDeadline: {
        lt: new Date(now.getTime() + 2 * 60 * 60 * 1000), // Within 2 hours
        gt: now,
      },
    },
    include: {
      assignee: true,
      tenant: true,
    },
  });

  for (const ticket of ticketsNearBreach) {
    logger.warn(`Ticket ${ticket.id} approaching SLA breach`, {
      ticketId: ticket.id,
      deadline: ticket.slaDeadline,
      assignee: ticket.assigneeId,
    });

    // TODO: Send notification to assignee and managers
    // await notificationService.sendSlaWarning(ticket);
  }

  // Find breached tickets
  const breachedTickets = await prisma.ticket.findMany({
    where: {
      status: { notIn: ['RESOLVED', 'CLOSED'] },
      slaDeadline: { lt: now },
    },
    include: {
      assignee: true,
    },
  });

  for (const ticket of breachedTickets) {
    logger.error(`Ticket ${ticket.id} SLA breached!`, {
      ticketId: ticket.id,
      deadline: ticket.slaDeadline,
      hoursOverdue: Math.floor((now.getTime() - ticket.slaDeadline!.getTime()) / 3600000),
    });

    // TODO: Escalate and notify
    // await notificationService.sendSlaBreachAlert(ticket);
  }
}

export async function initializeDefaultSlaConfig(): Promise<void> {
  const exists = await prisma.slaConfig.findFirst({
    where: { tenantId: null },
  });

  if (!exists) {
    await prisma.slaConfig.create({
      data: {
        tenantId: null,
        lowResponse: 480,      // 8 hours
        mediumResponse: 240,   // 4 hours
        highResponse: 60,      // 1 hour
        criticalResponse: 15,  // 15 minutes
        lowResolution: 2880,   // 2 days
        mediumResolution: 1440,// 1 day
        highResolution: 480,   // 8 hours
        criticalResolution: 240,// 4 hours
        timezone: 'UTC',
      },
    });
    logger.info('Default SLA configuration created');
  }
}
