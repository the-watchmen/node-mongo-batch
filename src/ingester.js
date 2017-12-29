import path from 'path'
import assert from 'assert'
import v8 from 'v8'
import config from 'config'
import debug from 'debug'
import Timer from 'tymer'
import _ from 'lodash'
import {pretty, getArg, getJsonArg, deepClean, stringify} from '@watchmen/helpr'
import {getDb, closeDb, createIndices} from 'mongo-helpr'
import batchOpts from '../data/entities/batches'
import batchFailureOpts from '../data/entities/batch-failures'
import getData from '../data/data'
import {onlyScanned} from '../data/helper'

const heapLimitMb = Math.trunc(v8.getHeapStatistics().heap_size_limit / 1e6)
const batchData = getData(batchOpts)
const batchFailureData = getData(batchFailureOpts)

/* eslint-disable max-depth */

process.on('unhandledRejection', reason => {
  // eslint-disable-next-line no-console
  console.log('unhandled-rejection: reason=%o', reason)
  process.exit(1)
})

export default function({
  sourceHook = getArg('sourceId'),
  inputName,
  outputName,
  outputIndices,
  steps = [],
  postProcessor,
  isReplace,
  postIngestHook,
  query
}) {
  const dbg = debug(`app:batch:${path.basename(process.argv[1], '.js')}`)

  return async function() {
    const source = _.isFunction(sourceHook) ? await sourceHook() : sourceHook

    dbg('begin: source=%o, time=%o', source, new Date().toLocaleString())

    const mainTimer = new Timer('main')
    mainTimer.start()

    const _inputName = getArg('inputName', {dflt: inputName})
    const _outputName = getArg('outputName', {dflt: outputName})
    const batchSize = getArg('batchSize', {dflt: 1000})
    const thresh = getArg('thresh', {dflt: 100000})
    const date = getArg('date', {dflt: new Date()})
    const cursorTimeoutMs = getArg('cursorTimeoutMs', {
      dflt: _.get(config, 'mongo.cursorTimeoutMs', 300000)
    })
    const failOnError = getArg('failOnError')

    dbg('input=%o, output=%o', _inputName, _outputName)

    try {
      const db = await getDb()
      const input = db.collection(_inputName)
      const output = db.collection(_outputName)

      outputIndices &&
        (await createIndices({indices: outputIndices, db, collectionName: _outputName}))

      const count = await input.count()
      const skip = getArg('skip')
      const limit = getArg('limit')
      const _query = getJsonArg('query', {dflt: {...query}})

      dbg('input-count=%o', count)

      const _steps = [
        {$match: _query},
        ...(deepClean([{$skip: skip}, {$limit: limit}]) || []),
        ...(_.isFunction(steps) ? steps({date}) : steps)
      ]

      // if postProcess function not passed, just dump to $out
      //
      !postProcessor && isReplace && _steps.push({$out: _outputName})

      dbg('aggregate() steps:\n%s', JSON.stringify(_steps, null, 2))

      let result = await batchData.create({
        data: {
          initiator: path.basename(process.argv[1], '.js'),
          source,
          input: _inputName,
          output: _outputName,
          beginDate: date,
          config,
          ...(deepClean(_query) && {query: stringify(_query)}),
          ...deepClean({
            skip,
            limit,
            isReplace
          })
        }
      })
      assert(result.result.ok, 'ok required')
      const batchId = result.insertedId
      dbg('batch-id=%o', batchId)

      dbg('initializing cursor: timeout=%o', cursorTimeoutMs)

      const cursor = await input
        .aggregate(_steps, {allowDiskUse: true}, {cursor: {batchSize}})
        .maxTimeMS(cursorTimeoutMs)

      let inserted = 0
      let updated = 0
      let scanned = 0
      let failed = 0
      let postIngest
      if (postProcessor) {
        const timer = new Timer('post-process')
        let record

        /* eslint-disable no-await-in-loop */
        do {
          timer.start()
          record = await cursor.next()
          if (record) {
            const isThresh = timer.count() % thresh === 0
            if (isThresh) {
              dbg('thresh-record=%s', pretty(record))
            }
            try {
              const result = await postProcessor({output, record, source, date, isThresh})
              // dbg('post-processor result=%j', result)
              assert(result, `unexpected null result for record=${stringify(record)}`)
              inserted += result.upsertedCount || 0
              updated += result.modifiedCount || 0
              scanned += result.scannedCount || (onlyScanned(result) ? 1 : 0)
            } catch (err) {
              if (failOnError) {
                throw err
              }
              dbg('caught error=%j, continuing...', err)
              const stack = err.stack.split('\n')
              dbg('stack=%o, continuing...', stack)
              result = await batchFailureData.create({
                data: {
                  record: deepClean(record),
                  error: err.toString(),
                  stack
                },
                context: {batchId}
              })
              // dbg('result=%j', result)
              assert(result.result.ok, 'ok required')
              failed += 1
            }
            timer.stop()

            if (isThresh) {
              dbg('timer=%o', timer.toString())
              const heapUsedMb = Math.trunc(v8.getHeapStatistics().used_heap_size / 1e6)
              dbg(
                'heap: used/limit=%o/%o=%o% in mb',
                heapUsedMb,
                heapLimitMb,
                Math.trunc(heapUsedMb / heapLimitMb * 100)
              )
              dbg(
                'inserted=%o, updated=%o, scanned=%o, failed=%o',
                inserted,
                updated,
                scanned,
                failed
              )
            }
          }
        } while (record)

        if (postIngestHook) {
          const result = await postIngestHook({input, output, date})
          if (result.modifiedCount) {
            postIngest = {
              postIngest: {
                updated: result.modifiedCount
              }
            }
          }
        }

        dbg('final: timer=%o', timer.toString())
        dbg('inserted=%o, updated=%o, scanned=%o, failed=%o', inserted, updated, scanned, failed)
      } else {
        await cursor.toArray()
        inserted = count
      }
      mainTimer.stop()

      const elapsedSeconds = (mainTimer.total() / 1000).toFixed(3)

      dbg(
        'end: time=%o, source=%o, output=%o, source-records=%o, elapsed=%s s',
        new Date().toLocaleString(),
        _inputName,
        _outputName,
        count,
        elapsedSeconds
      )

      const metrics = {
        inserted,
        updated,
        scanned,
        failed,
        ...postIngest
      }

      result = await batchData.update({
        id: batchId,
        data: {
          endDate: new Date(),
          elapsedSeconds,
          metrics
        }
      })
      assert(result.result.ok, 'ok required')

      await closeDb()

      return metrics
    } catch (err) {
      dbg('connect: caught=%o', err)
      // eslint-disable-next-line unicorn/no-process-exit
      process.exit(1)
    }
  }
}
