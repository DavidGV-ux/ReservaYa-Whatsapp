import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SQSClient,
  SendMessageCommand,
} from '@aws-sdk/client-sqs';

export interface IncomingWhatsappJob {
  whatsappMessageId: string;
  fromPhone: string;
  metaPhoneNumberId?: string;
  profileName?: string;
  text: string;
  receivedAt: string;
  tenantHintSlug?: string;
}

export interface EnqueueResult {
  enqueued: boolean;
  deduplicated: boolean;
  sqsMessageId: string;
}

export interface MessageQueuePort {
  enqueue(job: IncomingWhatsappJob): Promise<EnqueueResult>;
  drain(handler: (job: IncomingWhatsappJob) => Promise<void>): Promise<number>;
}

export interface SqsClientLike {
  send(command: unknown): Promise<{
    MessageId?: string;
    Messages?: Array<{ MessageId?: string; ReceiptHandle?: string; Body?: string }>;
  }>;
}

export interface SqsMessageQueueOptions {
  queueUrl?: string;
  region?: string;
  sqsClient?: SqsClientLike;
}

/**
 * B-04 / B-08 / RNF-27: Adaptador real de AWS SQS mediante `@aws-sdk/client-sqs`
 * con deduplicación estricta por `whatsappMessageId` (wamid).
 *
 * - Si `SQS_QUEUE_URL` está configurada (o se inyecta `sqsClient`), publica mensajes reales en SQS
 *   (añadiendo `MessageDeduplicationId` y `MessageGroupId` automáticamente en colas `.fifo`).
 * - En entornos de desarrollo/pruebas sin `SQS_QUEUE_URL`, utiliza una cola en memoria determinista.
 * - En producción (`NODE_ENV === 'production'`), exige `SQS_QUEUE_URL` (fail-closed).
 */
export class SqsMessageQueue implements MessageQueuePort {
  private readonly memoryQueue: IncomingWhatsappJob[] = [];
  private readonly processedMessageIds = new Set<string>();
  private readonly queueUrl: string;
  private readonly sqsClient?: SqsClientLike;

  constructor(options: SqsMessageQueueOptions = {}) {
    this.queueUrl = (options.queueUrl ?? process.env.SQS_QUEUE_URL ?? '').trim();
    if (options.sqsClient) {
      this.sqsClient = options.sqsClient;
    } else if (this.queueUrl) {
      this.sqsClient = new SQSClient({
        region: options.region ?? process.env.AWS_REGION ?? 'us-east-1',
      });
    }
  }

  get isSqsBacked(): boolean {
    return Boolean(this.queueUrl && this.sqsClient);
  }

  async enqueue(job: IncomingWhatsappJob): Promise<EnqueueResult> {
    if (this.processedMessageIds.has(job.whatsappMessageId)) {
      return {
        enqueued: false,
        deduplicated: true,
        sqsMessageId: `dedup-${job.whatsappMessageId}`,
      };
    }

    if (process.env.NODE_ENV === 'production' && !this.isSqsBacked) {
      throw new Error('SQS_QUEUE_URL is required in production for asynchronous webhook processing');
    }

    this.processedMessageIds.add(job.whatsappMessageId);

    if (this.isSqsBacked && this.sqsClient) {
      const isFifo = this.queueUrl.endsWith('.fifo');
      const command = new SendMessageCommand({
        QueueUrl: this.queueUrl,
        MessageBody: JSON.stringify(job),
        MessageAttributes: {
          whatsappMessageId: {
            DataType: 'String',
            StringValue: job.whatsappMessageId,
          },
          ...(job.metaPhoneNumberId
            ? {
                metaPhoneNumberId: {
                  DataType: 'String',
                  StringValue: job.metaPhoneNumberId,
                },
              }
            : {}),
        },
        ...(isFifo
          ? {
              MessageDeduplicationId: job.whatsappMessageId,
              MessageGroupId:
                job.metaPhoneNumberId ?? (job.fromPhone.replace(/\W/g, '') || 'default'),
            }
          : {}),
      });

      const response = await this.sqsClient.send(command);
      return {
        enqueued: true,
        deduplicated: false,
        sqsMessageId: response.MessageId ?? `sqs-${job.whatsappMessageId}`,
      };
    }

    this.memoryQueue.push(job);
    return {
      enqueued: true,
      deduplicated: false,
      sqsMessageId: `mem-${job.whatsappMessageId}`,
    };
  }

  async drain(handler: (job: IncomingWhatsappJob) => Promise<void>): Promise<number> {
    if (this.isSqsBacked && this.sqsClient) {
      let processed = 0;
      const received = await this.sqsClient.send(
        new ReceiveMessageCommand({
          QueueUrl: this.queueUrl,
          MaxNumberOfMessages: 10,
          WaitTimeSeconds: 0,
        }),
      );
      for (const message of received.Messages ?? []) {
        if (!message.Body) continue;
        const job = JSON.parse(message.Body) as IncomingWhatsappJob;
        await handler(job);
        if (message.ReceiptHandle) {
          await this.sqsClient.send(
            new DeleteMessageCommand({
              QueueUrl: this.queueUrl,
              ReceiptHandle: message.ReceiptHandle,
            }),
          );
        }
        processed += 1;
      }
      return processed;
    }

    let processed = 0;
    while (this.memoryQueue.length > 0) {
      const next = this.memoryQueue.shift()!;
      await handler(next);
      processed += 1;
    }
    return processed;
  }
}
