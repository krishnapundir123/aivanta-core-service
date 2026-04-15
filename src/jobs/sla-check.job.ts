import { prisma } from '../config/database';
import logger from '../shared/utils/logger';

export async function checkSlaBreachPredictions(): Promise<void> {
  const now = new Date();
  const predictionWindow = new Date(now.getTime() + 4 * 60 * 60 * 1000); // 4 hours ahead

  // Find tickets that might breach within prediction window
  const atRiskTickets = await prisma.ticket.findMany({
    where: {
      status: { notIn: ['RESOLVED', 'CLOSED'] },
      slaDeadline: {
        gt: now,
        lt: predictionWindow,
      },
    },
    include: {
      assignee: true,
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 5,
      },
    },
  });

  for (const ticket of atRiskTickets) {
    // Calculate risk factors
    const riskFactors: string[] = [];
    
    // Time pressure
    const timeRemaining = ticket.slaDeadline!.getTime() - now.getTime();
    const hoursRemaining = timeRemaining / (1000 * 60 * 60);
    
    if (hoursRemaining < 1) {
      riskFactors.push('Less than 1 hour remaining');
    } else if (hoursRemaining < 2) {
      riskFactors.push('Less than 2 hours remaining');
    }

    // No recent activity
    const lastMessage = ticket.messages[0];
    if (lastMessage) {
      const hoursSinceLastMessage = (now.getTime() - lastMessage.createdAt.getTime()) / (1000 * 60 * 60);
      if (hoursSinceLastMessage > 4) {
        riskFactors.push('No activity in last 4 hours');
      }
    }

    // High priority
    if (ticket.priority === 'CRITICAL' || ticket.priority === 'HIGH') {
      riskFactors.push('High priority ticket');
    }

    // Log prediction
    logger.warn(`SLA breach prediction for ticket ${ticket.id}`, {
      ticketId: ticket.id,
      hoursRemaining,
      riskFactors,
      confidence: riskFactors.length > 2 ? 'HIGH' : riskFactors.length > 0 ? 'MEDIUM' : 'LOW',
    });

    // TODO: Send proactive notifications
    // await notificationService.sendSlaRiskAlert(ticket, riskFactors);
  }
}
