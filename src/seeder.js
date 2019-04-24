import assert from 'assert'
import config from 'config'
import _ from 'lodash'
import Timer from '@watchmen/tymer'
import debug from '@watchmen/debug'
import {getData, getName} from '@watchmen/mongo-data'
import {closeDb} from '@watchmen/mongo-helpr'

const dbg = debug(__filename)

process.on('unhandledRejection', reason => {
  // eslint-disable-next-line no-console
  console.log('unhandled-rejection: reason=%o', reason)
  process.exit(1)
})

export default function({seeders}) {
  return (async function() {
    dbg('starting: config.seeder=%o', config.seeder)
    try {
      for (const seeder of seeders) {
        const meta = seeder.meta
        const name = getName(meta)
        const count = _.get(config.seeder, `${name}.count`, 100)
        const thresh = _.get(config.seeder, `${name}.thresh`, 100)
        dbg('seeding: name=%o, count=%o, thresh=%o', name, count, thresh)
        const timer = new Timer(`seeder(${name})`)
        assert(meta, 'meta required')
        const dao = getData(meta)
        assert(dao, 'dao required')
        const generate = seeder.generate
        assert(generate, 'generate required')
        for (let i = 1; i <= count; i++) {
          timer.lap()
          const {data, context} = generate({index: i})
          const instance = await dao.create({data, context})
          instance.result.ok || dbg('instance=%o', instance)
          assert(instance.result.ok)
          if (i % thresh === 0) {
            dbg(timer.toString())
            dbg('last-record=%o', data)
          }
        }
      }
    } finally {
      await closeDb()
    }
  })()
}
