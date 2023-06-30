import process from 'node:process'
import readline from 'node:readline'

import { bgWhite, black, bold, cyan, gray, green, red, yellow } from 'colorette'
import TreeModel from 'tree-model'

import { SPACE } from '@/constants'
import { capitalize } from '@/utils'

import { TaskEvent, TaskStatus } from './event'
import { SYMBOLS } from './symbols'

export const MAGIC_STRING = '__INSIDE_TRACKER__' // a unique "magic" string that used to identify the output of the tracker

// eslint-disable-next-line no-control-regex
const RE_ANSI_ESCAPES = /^(\x1b\[[0-9;]*[ABCDHJK]|[\r\n])+$/ // cursor movement, screen clearing, etc.

const originalStdoutWrite = process.stdout.write
const originalStderrWrite = process.stderr.write

export interface TerminalTaskTrackerOptions {
  spinnerInterval?: number
  inactivityThreshold?: number
}

export class TerminalTaskTracker {
  protected _tree = new TreeModel()
  protected _root = this._tree.parse({ id: 'root' })
  protected _interval: NodeJS.Timeout | null = null
  protected _inactivityTimeout: NodeJS.Timeout | null = null
  protected _truncateOutput = false
  protected _viewMode = 'tasks'
  protected _outputs: Array<string | Uint8Array> = []
  protected _renderingPaused = false

  protected _spinnerInterval: number
  protected _inactivityThreshold: number

  private _stdoutBuffer: string[] = []
  private _stderrBuffer: string[] = []

  constructor({
    spinnerInterval = 100,
    inactivityThreshold = 3_000
  }: TerminalTaskTrackerOptions = {}) {
    this._spinnerInterval = spinnerInterval
    this._inactivityThreshold = inactivityThreshold

    if (!process.stderr.isTTY) {
      // If stderr is not a TTY, don't render any dynamic output...
      return
    }

    process.stdout.write = (buffer: string | Uint8Array) => {
      if (buffer instanceof Uint8Array) {
        buffer = Buffer.from(buffer).toString('utf-8')
      }

      if (!this._renderingPaused) {
        this._stdoutBuffer.push(buffer)
      }

      return originalStdoutWrite.call(process.stdout, buffer)
    }

    process.stderr.write = (buffer: string | Uint8Array) => {
      if (buffer instanceof Uint8Array) {
        buffer = Buffer.from(buffer).toString('utf-8')
      }

      if (typeof buffer === 'string' && buffer.startsWith(MAGIC_STRING)) {
        // This write is from inside the tracker, remove the magic string and write to stderr:
        return originalStderrWrite.call(
          process.stderr,
          buffer.replace(MAGIC_STRING, '')
        )
      } else {
        if (!this._renderingPaused && !RE_ANSI_ESCAPES.test(buffer)) {
          // If an ANSI escape sequence is written to stderr, it will mess up the output, so we need to write it to stdout instead:
          // This write is from outside the tracker, add it to stderrBuffer and write to stderr:
          this._stderrBuffer.push(buffer)
        }

        return originalStderrWrite.call(process.stderr, buffer)
      }
    }

    this.start()
  }

  handleKeyPress = (str, key) => {
    if (key.ctrl && key.name === 'c') {
      process.exit()
    }

    if (key.ctrl && key.name === 'e') {
      this.toggleOutputTruncation()
    }

    if (key.ctrl && key.name === 'right') {
      this.toggleView('next')
    }

    if (key.ctrl && key.name === 'left') {
      this.toggleView('prev')
    }
  }

  start() {
    this._interval = setInterval(() => {
      this.render()
    }, this._spinnerInterval)

    readline.emitKeypressEvents(process.stdin)

    process.stdin.setRawMode(true)

    process.stdin.on('keypress', this.handleKeyPress)

    this.startInactivityTimeout()
  }

  close() {
    if (this._interval) {
      clearInterval(this._interval)
    }

    if (this._inactivityTimeout) {
      clearTimeout(this._inactivityTimeout)
    }

    process.stdin.setRawMode(false)

    // Remove the keypress listener:
    process.stdin.off('keypress', this.handleKeyPress)

    // Restore the original `process.stdout.write()` and `process.stderr.write()` functions:
    process.stdout.write = originalStdoutWrite
    process.stderr.write = originalStderrWrite

    const finalLines = [
      '',
      '',
      bgWhite(black(' Completed all tasks. ')),
      '',
      '',
      bgWhite(black(' stderr: ')),
      '',
      this._stderrBuffer.join(''),
      '',
      bgWhite(black(' stdout: ')),
      '',
      this._stdoutBuffer.join(''),
      ''
    ]

    process.stderr.write(finalLines.join('\n'))

    // Pause the reading of stdin so that the Node.js process will exit once done:
    process.stdin.pause()
  }

  pause() {
    this.clearAndSetCursorPosition()
    this._renderingPaused = true
  }

  resume() {
    this._renderingPaused = false
    this.render()
  }

  stringify(value: any): string {
    if (this._truncateOutput) {
      const json = JSON.stringify(value)
      if (json.length < 40) {
        return json
      }

      return json.slice(0, 20) + '...' + json.slice(-20)
    }

    return JSON.stringify(value)
  }

  toggleOutputTruncation() {
    this._truncateOutput = !this._truncateOutput
  }

  startInactivityTimeout() {
    this._inactivityTimeout = setTimeout(() => {
      const allTasksCompleted = this._root.all((node) => {
        return (
          node.model.status === TaskStatus.COMPLETED ||
          node.model.status === TaskStatus.FAILED
        )
      })

      if (allTasksCompleted) {
        this.close()
      } else {
        this.startInactivityTimeout()
      }
    }, this._inactivityThreshold)
  }

  addEvent<TInput, TOutput>(event: TaskEvent<TInput, TOutput>) {
    const {
      parentTaskId = 'root',
      taskId: id,
      name,
      status,
      inputs,
      output
    } = event
    const parentNode = this._root.first(
      (node) => node.model.id === parentTaskId
    )

    const existingEventNode = parentNode
      ? parentNode.first((node) => node.model.id === id)
      : null

    if (existingEventNode) {
      // If the event already exists, update its status and output:
      existingEventNode.model.status = status
      existingEventNode.model.output = output
    } else {
      // If the event does not exist, add it to the array:
      const node = this._tree.parse({ id, name, status, inputs, output: null })
      if (parentNode) {
        parentNode.addChild(node)
      } else {
        this._root.addChild(node)
      }
    }
  }

  private getStatusSymbolColor(
    status: TaskStatus
  ): [string, (text: string) => string] {
    switch (status) {
      case TaskStatus.COMPLETED:
        return [SYMBOLS.CIRCLE, green]
      case TaskStatus.FAILED:
        return [SYMBOLS.CROSS, red]
      case TaskStatus.RETRYING:
        return [this.getSpinnerSymbol(), yellow]
      case TaskStatus.RUNNING:
      default:
        return [this.getSpinnerSymbol(), cyan]
    }
  }

  renderTree(id?: string, level = 0): string[] {
    const indent = SPACE.repeat(level * 2)
    let lines: string[] = []

    const root = id
      ? this._root.first((node) => node.model.id === id)
      : this._root

    if (root?.children) {
      root.children.forEach(
        ({ model: { id, name, status, output, inputs } }) => {
          const [statusSymbol, color] = this.getStatusSymbolColor(status)

          lines.push(
            indent +
              color(statusSymbol) +
              SPACE +
              bold(name) +
              gray('(' + this.stringify(inputs) + ')')
          )

          const hasChildren = root.hasChildren()

          if (hasChildren) {
            lines = lines.concat(
              this.renderTree(id, level + 1).map((line, index, arr) => {
                if (index === arr.length - 1) {
                  return indent + gray(SYMBOLS.BAR) + line
                }

                return indent + gray(SYMBOLS.BAR) + line
              })
            )
          }

          let line = ''
          if (hasChildren) {
            line = indent + gray(SYMBOLS.BAR_END)
          }

          const formattedOutput = this.stringify(output || '')
          if (status === TaskStatus.COMPLETED) {
            line +=
              indent +
              '  ' +
              gray(SYMBOLS.RIGHT_ARROW + SPACE + formattedOutput)
          } else if (status === TaskStatus.FAILED) {
            line +=
              indent +
              '  ' +
              gray(SYMBOLS.RIGHT_ARROW) +
              SPACE +
              red(formattedOutput)
          } else if (status === TaskStatus.RETRYING) {
            line +=
              indent +
              '  ' +
              yellow(SYMBOLS.WARNING) +
              SPACE +
              gray(formattedOutput)
          }

          lines.push(line)
        }
      )
    }

    return lines
  }

  clearAndSetCursorPosition() {
    process.stderr.cursorTo(0, 0)
    process.stderr.clearScreenDown()
  }

  clearPreviousRender(linesCount: number) {
    for (let i = 0; i < linesCount; i++) {
      process.stderr.moveCursor(0, -1)
      process.stderr.clearLine(1)
    }
  }

  private writeWithMagicString(content: string | string[]) {
    let output

    if (Array.isArray(content)) {
      if (content.length === 0) {
        return
      }

      output = content.join('\n')
    } else {
      output = content
    }

    process.stderr.write(MAGIC_STRING + output)
  }

  toggleView(direction: string) {
    const viewModes = ['tasks', 'stdout', 'stderr']
    const currentIdx = viewModes.indexOf(this._viewMode)

    if (direction === 'next') {
      this._viewMode = viewModes[(currentIdx + 1) % viewModes.length]
    } else if (direction === 'prev') {
      this._viewMode =
        viewModes[(currentIdx - 1 + viewModes.length) % viewModes.length]
    }

    this.render()
  }

  getSpinnerSymbol(): string {
    return SYMBOLS.SPINNER[
      Math.floor(Date.now() / this._spinnerInterval) % SYMBOLS.SPINNER.length
    ]
  }

  renderHeader() {
    const commands = [
      'ctrl+c: exit',
      'ctrl+e: truncate output',
      'ctrl+left/right: switch view'
    ].join(' | ')

    const header = [
      ` Agentic - ${capitalize(this._viewMode)} View`,
      ' ' + commands + ' ',
      '',
      ''
    ].join('\n')
    this.writeWithMagicString(bgWhite(black(header)))
  }

  render() {
    if (this._renderingPaused) {
      return // Do not render if paused
    }

    this.clearAndSetCursorPosition()
    if (this._viewMode === 'tasks') {
      const lines = this.renderTree('root')
      this.clearPreviousRender(lines.length)
      this.renderHeader()
      this.writeWithMagicString(lines)
    } else if (this._viewMode === 'stdout') {
      this.clearPreviousRender(this._stdoutBuffer.length)
      this.renderHeader()
      this.writeWithMagicString(this._stdoutBuffer)
    } else if (this._viewMode === 'stderr') {
      this.clearPreviousRender(this._stderrBuffer.length)
      this.renderHeader()
      this.writeWithMagicString(this._stderrBuffer)
    }
  }
}
