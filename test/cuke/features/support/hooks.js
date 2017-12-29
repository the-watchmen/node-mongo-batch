import debug from 'debug'
import {getDb} from 'mongo-helpr'
import {initDb} from 'mongo-test-helpr'
import {clearArgDefaults} from '@watchmen/helpr'

const dbg = debug('test:batch:support:hooks')

export default function() {
  // this === World
  this.Before(async scenario => {
    try {
      dbg('before: scenario=%o', scenario.getName())
      clearArgDefaults()
      const db = await getDb()
      const result = await initDb(db)
      dbg('before: init-db result=%o', result)
    } catch (err) {
      dbg('before: caught=%o', err)
      throw err
    }
  })
}
