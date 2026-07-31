export type LatestFrameProcessingResult = 'processed' | 'superseded' | 'discarded' | 'failed'

export interface LatestFrameProcessorStats {
  receivedFrames: number
  processedFrames: number
  failedFrames: number
  supersededFrames: number
  discardedFrames: number
  processing: boolean
  pending: boolean
  lastProcessingDurationMs: number
  maximumProcessingDurationMs: number
  lastError: string
}

interface PendingFrame<T> {
  sequence: number
  value: T
}

interface ProcessingWaiter {
  sequence: number
  resolve: (result: LatestFrameProcessingResult) => void
}

export class LatestFrameProcessor<T> {
  private accepting = true
  private nextSequence = 0
  private pendingFrame: PendingFrame<T> | null = null
  private processing = false
  private completedSequence = 0
  private lastProcessedSequence = 0
  private lastFailedSequence = 0
  private lastDiscardedSequence = 0
  private idleWaiters: Array<() => void> = []
  private processingWaiters: ProcessingWaiter[] = []
  private readonly statistics: LatestFrameProcessorStats = {
    receivedFrames: 0,
    processedFrames: 0,
    failedFrames: 0,
    supersededFrames: 0,
    discardedFrames: 0,
    processing: false,
    pending: false,
    lastProcessingDurationMs: 0,
    maximumProcessingDurationMs: 0,
    lastError: ''
  }

  constructor(
    private readonly handler: (value: T) => Promise<void>,
    private readonly onError: (error: unknown) => void = () => undefined,
    private readonly keepPending: (pending: T, incoming: T) => boolean = () => false
  ) {}

  submit(value: T): number {
    this.statistics.receivedFrames += 1
    if (!this.accepting) {
      this.statistics.discardedFrames += 1
      return 0
    }
    this.nextSequence += 1
    const sequence = this.nextSequence
    if (this.pendingFrame && this.keepPending(this.pendingFrame.value, value)) {
      this.statistics.discardedFrames += 1
      return this.pendingFrame.sequence
    }
    if (this.pendingFrame) this.statistics.supersededFrames += 1
    this.pendingFrame = { sequence, value }
    this.statistics.pending = true
    void this.drain()
    return sequence
  }

  waitFor(sequence: number): Promise<LatestFrameProcessingResult> {
    if (sequence <= 0) return Promise.resolve('discarded')
    if (sequence === this.lastDiscardedSequence) return Promise.resolve('discarded')
    if (sequence <= this.completedSequence) {
      if (sequence === this.lastProcessedSequence) return Promise.resolve('processed')
      if (sequence === this.lastFailedSequence) return Promise.resolve('failed')
      return Promise.resolve('superseded')
    }
    return new Promise((resolve) => {
      this.processingWaiters.push({ sequence, resolve })
    })
  }

  async suspendAndDrain(): Promise<void> {
    this.accepting = false
    if (this.pendingFrame) {
      this.statistics.discardedFrames += 1
      this.lastDiscardedSequence = this.pendingFrame.sequence
      this.pendingFrame = null
      this.statistics.pending = false
    }
    await this.waitForIdle()
    const waiters = this.processingWaiters
    this.processingWaiters = []
    for (const waiter of waiters) waiter.resolve('discarded')
  }

  resume(): void {
    this.accepting = true
  }

  getStats(): LatestFrameProcessorStats {
    return { ...this.statistics }
  }

  private async drain(): Promise<void> {
    if (this.processing) return
    this.processing = true
    this.statistics.processing = true
    try {
      while (this.pendingFrame) {
        const frame = this.pendingFrame
        this.pendingFrame = null
        this.statistics.pending = false
        const startedAtMs = Date.now()
        let result: LatestFrameProcessingResult = 'processed'
        try {
          await this.handler(frame.value)
          this.statistics.processedFrames += 1
          this.lastProcessedSequence = frame.sequence
        } catch (error) {
          result = 'failed'
          this.statistics.failedFrames += 1
          this.lastFailedSequence = frame.sequence
          this.statistics.lastError = error instanceof Error ? error.message : String(error)
          this.onError(error)
        }
        const durationMs = Math.max(0, Date.now() - startedAtMs)
        this.statistics.lastProcessingDurationMs = durationMs
        this.statistics.maximumProcessingDurationMs = Math.max(
          this.statistics.maximumProcessingDurationMs,
          durationMs
        )
        this.completedSequence = Math.max(this.completedSequence, frame.sequence)
        this.resolveWaitersThrough(frame.sequence, result)
      }
    } finally {
      this.processing = false
      this.statistics.processing = false
      this.statistics.pending = this.pendingFrame !== null
      const idleWaiters = this.idleWaiters
      this.idleWaiters = []
      for (const resolve of idleWaiters) resolve()
      if (this.pendingFrame) void this.drain()
    }
  }

  private resolveWaitersThrough(sequence: number, result: LatestFrameProcessingResult): void {
    const remaining: ProcessingWaiter[] = []
    for (const waiter of this.processingWaiters) {
      if (waiter.sequence > sequence) {
        remaining.push(waiter)
      } else {
        waiter.resolve(waiter.sequence === sequence ? result : 'superseded')
      }
    }
    this.processingWaiters = remaining
  }

  private waitForIdle(): Promise<void> {
    if (!this.processing) return Promise.resolve()
    return new Promise((resolve) => {
      this.idleWaiters.push(resolve)
    })
  }
}
