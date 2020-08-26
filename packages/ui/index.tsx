import { h, render } from 'preact'
import { css } from 'linaria'
import './global-styles.css'
import { CodeBox } from './code-box'
import { colors, textFonts } from './colors'
import { useEffect, useState } from 'preact/hooks'
import { Timeline } from './timeline'
import {
  createProcessor,
  createTransformCache,
  process,
  TransformerInstance,
} from 'processor'
import { PopupArea } from './popup'
import { decode, encode } from 'qss'
import { allTransformers } from './transformers-list'
import {
  cancelIdleCallback,
  requestIdleCallback,
} from './request-idle-callback'

const root = document.querySelector('.root')

const appStyle = css`
  background: ${colors.bg};
  color: ${colors.fg};
  font-family: ${textFonts};
  height: 100vh;
  width: 100vw;
  display: grid;
  grid-template-rows: 1fr 15rem;
`

const codeViewerStyle = css`
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
  gap: 2rem;
  padding: 2rem 2rem 0;
`

const qs = decode<{ transformer?: unknown; code?: unknown }>(
  location.search.slice(1),
)

const initialCode =
  typeof qs.code === 'string'
    ? atob(qs.code)
    : `// enter your code here

import { h, render } from 'preact'

render(foo, document.body)
`

const getProcessorFromUrl = () => {
  if (!qs.transformer) return createProcessor()
  const transformers = Array.isArray(qs.transformer)
    ? qs.transformer
    : [qs.transformer]
  const foundTransformers = transformers
    .map((jsonTransformer): TransformerInstance<any> | null => {
      const t = JSON.parse(jsonTransformer)
      const transformer = allTransformers.find(
        (fullTransformer) =>
          fullTransformer.name === t.name &&
          fullTransformer.version === t.version,
      )
      if (!transformer) return null
      return {
        transformer,
        options: t.options || transformer.defaultOptions,
        cache: createTransformCache(),
      }
    })
    .filter((t): t is Exclude<typeof t, null> => t !== null)
  return createProcessor(foundTransformers)
}

const initialProcessor = getProcessorFromUrl()

const App = () => {
  const [inputCode, setInputCode] = useState(initialCode)
  const [outputCode, setOutputCode] = useState('')
  const [processor, setProcessor] = useState(initialProcessor)
  const [selectedTransformerIndex, setSelectedTransformerIndex] = useState<
    number | null
  >(null)

  useEffect(() => {
    let isDone = false
    const clearIfIncomplete = () => {
      if (!isDone) setOutputCode('')
    }
    const timeout = setTimeout(clearIfIncomplete, 70)
    const emitter = process(processor, inputCode)
    emitter.on('error', (error) => {
      clearIfIncomplete()
      console.error('error happened in transformer', error)
    })
    emitter.on('outputCode', (code) => {
      isDone = true
      setOutputCode(code)
    })
    const idleHandle = requestIdleCallback(() => {
      history.replaceState(
        null,
        '',
        '?' +
          encode({
            transformer: processor.transformers.map(
              ({ transformer: { name, version }, options }) =>
                JSON.stringify({ name, version, options }),
            ),
            code: btoa(inputCode),
          }),
      )
    })
    return () => {
      emitter.cancel()
      cancelIdleCallback(idleHandle)
      clearTimeout(timeout)
    }
  }, [inputCode, processor])

  useEffect(() => {
    setSelectedTransformerIndex(null)
  }, [processor.transformers.length])

  const selectedTransformer =
    selectedTransformerIndex !== null &&
    processor.transformers[selectedTransformerIndex]

  return (
    <div class={appStyle}>
      <div class={codeViewerStyle}>
        <CodeBox title="Input" code={inputCode} onChange={setInputCode} />
        {selectedTransformer && (
          <CodeBox
            title={`Settings for ${selectedTransformer.transformer.name}`}
            close={() => setSelectedTransformerIndex(null)}
            code={JSON.stringify(selectedTransformer.options, null, 2)}
            onChange={(code) => {
              try {
                const parsed = JSON.parse(code)
                const clonedTransforms = processor.transformers.slice()
                if (selectedTransformerIndex !== null)
                  clonedTransforms[selectedTransformerIndex] = {
                    ...selectedTransformer,
                    cache: createTransformCache(),
                    options: parsed,
                  }
                setProcessor(createProcessor(clonedTransforms))
              } catch {}
            }}
          />
        )}
        <CodeBox title="Output" code={outputCode} readonly />
      </div>
      <Timeline
        processor={processor}
        onChange={setProcessor}
        openSettings={setSelectedTransformerIndex}
        selectedTransformerIndex={selectedTransformerIndex}
      />
      <PopupArea />
    </div>
  )
}

if (root) render(<App />, root)
