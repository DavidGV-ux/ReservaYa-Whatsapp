export interface IncomingWhatsappJob {
  whatsappMessageId: string;
  fromPhone: string;
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

/**
 * B-04 / B-08: Adaptador de cola AWS SQS con deduplicación estricta por `whatsappMessageId` (wamid)
 * para evitar doble procesamiento ante reintentos de Meta o canales legacy.
 */
export class SqsMessageQueue implements MessageQueuePort {
  private readonly queue: IncomingWhatsappJob[] = [];
  private readonly processedMessageIds = new Set<string>();
  private readonly queueUrl?: string;
  private readonly fetchImpl?: typeof fetch;

  constructor(options?: { queueUrl?: string; fetchImpl?: typeof fetch }) {
    this.queueUrl = options?.queueUrl ?? process.env.SQS_QUEUE_URL;
    this.fetchImpl = options?.fetchImpl;
  }

  async enqueue(job: IncomingWhatsappJob): Promise<EnqueueResult> {
    if (this.processedMessageIds.has(job.whatsappMessageId)) {
      return {
        enqueued: false,
        deduplicated: true,
        sqsMessageId: `dedup-${job.whatsappMessageId}`,
      };
    }

    this.processedMessageIds.add(job.whatsappMessageId);

    if (this.queueUrl && this.fetchImpl) {
      await this.fetchImpl(this.queueUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          Action: 'SendMessage',
          MessageDeduplicationId: job.whatsappMessageId,
          MessageBody: JSON.stringify(job),
        }),
      });
    }

    this.queue.push(job);
    return {
      enqueued: true,
      deduplicated: false,
      sqsMessageId: `sqs-${job.whatsappMessageId}`,
    };
  }

  async drain(handler: (job: IncomingWhatsappJob) => Promise<void>): Promise<number> {
    let processed = 0;
    while (this.queue.length > 0) {
      const next = this.queue.shift()!;
      await handler(next);
      processed += 1;
    }
    return processed;
  }
}
