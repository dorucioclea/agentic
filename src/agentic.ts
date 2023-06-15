import defaultKy from 'ky'

import * as types from './types'
import { DEFAULT_OPENAI_MODEL } from './constants'
import {
  HumanFeedbackMechanism,
  HumanFeedbackMechanismCLI
} from './human-feedback'
import { OpenAIChatCompletion } from './llms/openai'
import { defaultIDGeneratorFn } from './utils'

export class Agentic {
  // _taskMap: WeakMap<string, BaseTask<any, any>>
  protected _ky: types.KyInstance

  protected _openai?: types.openai.OpenAIClient
  protected _anthropic?: types.anthropic.Client

  protected _verbosity: number
  protected _openaiModelDefaults: Pick<
    types.BaseLLMOptions,
    'provider' | 'model' | 'modelParams' | 'timeoutMs' | 'retryConfig'
  >
  protected _defaultHumanFeedbackMechamism?: HumanFeedbackMechanism

  protected _idGeneratorFn: types.IDGeneratorFunction
  protected _id: string

  constructor(opts: {
    openai?: types.openai.OpenAIClient
    anthropic?: types.anthropic.Client
    verbosity?: number
    openaiModelDefaults?: Pick<
      types.BaseLLMOptions,
      'provider' | 'model' | 'modelParams' | 'timeoutMs' | 'retryConfig'
    >
    defaultHumanFeedbackMechanism?: HumanFeedbackMechanism
    idGeneratorFn?: types.IDGeneratorFunction
    ky?: types.KyInstance
  }) {
    // TODO: This is a bit hacky, but we're doing it to have a slightly nicer API
    // for the end developer when creating subclasses of `BaseTask` to use as
    // tools.
    if (!globalThis.__agentic?.deref()) {
      globalThis.__agentic = new WeakRef(this)
    }

    this._openai = opts.openai
    this._anthropic = opts.anthropic
    this._ky = opts.ky ?? defaultKy

    this._verbosity = opts.verbosity ?? 0

    this._openaiModelDefaults = {
      provider: 'openai',
      model: DEFAULT_OPENAI_MODEL,
      modelParams: {},
      timeoutMs: 2 * 60000,
      retryConfig: {
        retries: 3,
        strategy: 'heal',
        ...opts.openaiModelDefaults?.retryConfig
      },
      ...opts.openaiModelDefaults
    }

    // TODO
    // this._anthropicModelDefaults = {}

    this._defaultHumanFeedbackMechamism =
      opts.defaultHumanFeedbackMechanism ??
      new HumanFeedbackMechanismCLI({ agentic: this })

    this._idGeneratorFn = opts.idGeneratorFn ?? defaultIDGeneratorFn
    this._id = this._idGeneratorFn()
  }

  public get openai(): types.openai.OpenAIClient | undefined {
    return this._openai
  }

  public get anthropic(): types.anthropic.Client | undefined {
    return this._anthropic
  }

  public get ky(): types.KyInstance {
    return this._ky
  }

  public get defaultHumanFeedbackMechamism() {
    return this._defaultHumanFeedbackMechamism
  }

  public get idGeneratorFn(): types.IDGeneratorFunction {
    return this._idGeneratorFn
  }

  openaiChatCompletion(
    promptOrChatCompletionParams:
      | string
      | Partial<types.openai.ChatCompletionParams> // TODO: make more strict
  ) {
    let options: Partial<types.openai.ChatCompletionParams>

    if (typeof promptOrChatCompletionParams === 'string') {
      options = {
        messages: [
          {
            role: 'user',
            content: promptOrChatCompletionParams
          }
        ]
      }
    } else {
      options = promptOrChatCompletionParams

      if (!options.messages) {
        throw new Error('messages must be provided')
      }
    }

    return new OpenAIChatCompletion({
      agentic: this,
      ...(this._openaiModelDefaults as any), // TODO
      ...options
    })
  }

  /**
   * Shortcut for creating an OpenAI chat completion call with the `gpt-3.5-turbo` model.
   */
  gpt3(
    promptOrChatCompletionParams:
      | string
      | Omit<types.openai.ChatCompletionParams, 'model'>
  ) {
    let options: Omit<types.openai.ChatCompletionParams, 'model'>

    if (typeof promptOrChatCompletionParams === 'string') {
      options = {
        messages: [
          {
            role: 'user',
            content: promptOrChatCompletionParams
          }
        ]
      }
    } else {
      options = promptOrChatCompletionParams

      if (!options.messages) {
        throw new Error('messages must be provided')
      }
    }

    return new OpenAIChatCompletion({
      agentic: this,
      ...(this._openaiModelDefaults as any), // TODO
      model: 'gpt-3.5-turbo',
      ...options
    })
  }

  /**
   * Shortcut for creating an OpenAI chat completion call with the `gpt-4` model.
   */
  gpt4(
    promptOrChatCompletionParams:
      | string
      | Omit<types.openai.ChatCompletionParams, 'model'>
  ) {
    let options: Omit<types.openai.ChatCompletionParams, 'model'>

    if (typeof promptOrChatCompletionParams === 'string') {
      options = {
        messages: [
          {
            role: 'user',
            content: promptOrChatCompletionParams
          }
        ]
      }
    } else {
      options = promptOrChatCompletionParams

      if (!options.messages) {
        throw new Error('messages must be provided')
      }
    }

    return new OpenAIChatCompletion({
      agentic: this,
      ...(this._openaiModelDefaults as any), // TODO
      model: 'gpt-4',
      ...options
    })
  }
}
