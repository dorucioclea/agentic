import { defaultIDGeneratorFn } from '@/utils'

/**
 * Payload of an event.
 */
export interface EventPayload {
  [key: string]: unknown
}

/**
 * Data required to create a new Event object.
 */
export interface EventData<T extends EventPayload> {
  /**
   * Event identifier
   */
  id?: string

  /**
   * Event timestamp
   */
  timestamp?: Date

  /**
   * Key-value pairs holding event data.
   */
  payload?: T

  /**
   * Version of the event.
   */
  version?: number

  /**
   * Event type.
   */
  type?: string
}

/**
 * Events that occur within the library (should be treated as immutable).
 */
export class Event<T extends EventPayload> {
  public readonly id: string
  public readonly timestamp: Date
  public readonly payload?: T
  public readonly version: number

  constructor(data: EventData<T> = {}) {
    this.id = defaultIDGeneratorFn()
    this.timestamp = data.timestamp ?? new Date()
    this.payload = data.payload
      ? JSON.parse(JSON.stringify(data.payload))
      : undefined
    this.version = data.version ?? 1
  }

  /**
   * Converts a JSON string representation of an event back into an Event object.
   */
  static fromJSON<T extends EventPayload>(json: string): Event<T> {
    const data = JSON.parse(json)
    data.timestamp = new Date(data.timestamp)
    let Type
    switch (data.type) {
      case 'TaskEvent':
        Type = TaskEvent<any, any>
        break
      case 'Event':
        Type = Event
        break
      default:
        throw new Error(`Unknown event type: ${data.type}`)
    }

    return new Type(data)
  }

  /**
   * Serializes an event into a JSON string.
   */
  toJSON(): string {
    return JSON.stringify({
      id: this.id,
      timestamp: this.timestamp.toISOString(),
      payload: this.payload,
      version: this.version,
      type: this.constructor.name
    })
  }

  /**
   * Returns a human-readable string representation of an event.
   */
  toString(): string {
    return `Event { id: ${
      this.id
    }, timestamp: ${this.timestamp.toISOString()}, payload: ${JSON.stringify(
      this.payload
    )} }`
  }
}

/**
 * Payload of a task event.
 */
export interface TaskEventPayload<TInput, TOutput> extends EventPayload {
  taskName: string
  taskId: string
  taskStatus: TaskStatus
  taskInputs?: TInput
  taskOutput?: TOutput
  parentTaskId?: string
}

/**
 * Status of a task.
 */
export enum TaskStatus {
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  PENDING = 'PENDING',
  RETRYING = 'RETRYING',
  SKIPPED = 'SKIPPED',
  RUNNING = 'RUNNING',
  CANCELLED = 'CANCELLED'
}

/**
 * Events that occur within the library related to tasks.
 */
export class TaskEvent<TInput, TOutput> extends Event<
  TaskEventPayload<TInput, TOutput>
> {
  /**
   * Task name.
   */
  get name(): string {
    return this.payload?.taskName ?? ''
  }

  /**
   * Unique task identifier.
   */
  get taskId(): string {
    return this.payload?.taskId ?? ''
  }

  /**
   * Task status.
   */
  get status(): TaskStatus {
    return this.payload?.taskStatus ?? TaskStatus.RUNNING
  }

  /**
   * Task inputs.
   */
  get inputs(): any {
    return this.payload?.taskInputs ?? ''
  }

  /**
   * Task output.
   */
  get output(): any {
    return this.payload?.taskOutput ?? ''
  }

  /**
   * Unique identifier of the parent task (or `'root'` if it is a top-level task).
   */
  get parentTaskId(): string {
    return this.payload?.parentTaskId ?? 'root'
  }
}
