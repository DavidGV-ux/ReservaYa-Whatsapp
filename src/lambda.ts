import serverless from 'serverless-http';
import { createDefaultBotRuntime } from './server';
import { IncomingWhatsappJob } from './queue/sqs-queue';

const runtime = createDefaultBotRuntime();

/**
 * Handler HTTP para API Gateway / AWS Lambda (Webhook de Meta + /internal/events + /user/verify-code).
 */
export const httpHandler = serverless(runtime.app);

export interface SqsEventRecord {
  messageId: string;
  body: string;
}

export interface SqsLambdaEvent {
  Records: SqsEventRecord[];
}

/**
 * Consumidor asíncrono de AWS SQS (RNF-27): procesa los lotes encolados por el webhook de Meta.
 */
export async function sqsWorkerHandler(event: SqsLambdaEvent): Promise<{
  batchItemFailures: Array<{ itemIdentifier: string }>;
}> {
  const batchItemFailures: Array<{ itemIdentifier: string }> = [];

  for (const record of event.Records ?? []) {
    try {
      const job = JSON.parse(record.body) as IncomingWhatsappJob;
      await runtime.botService.processSingleJob(job);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[sqs-worker] failed processing message', record.messageId, err);
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  return { batchItemFailures };
}

/**
 * Tarea programada para expirar conversaciones abandonadas y redirigir al portal web (RF-4.6).
 */
export async function expireConversationsHandler(): Promise<{
  statusCode: number;
  body: string;
}> {
  const expired = await runtime.botService.expireStaleConversations();
  return {
    statusCode: 200,
    body: JSON.stringify({ event: 'expire-conversations', redirectedToWeb: expired.length }),
  };
}
