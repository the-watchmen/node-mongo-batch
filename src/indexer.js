import debug from '@watchmen/debug'
import {splitAndTrim} from '@watchmen/helpr'
import {getArg} from '@watchmen/helpr/dist/args'
import {createIndices, getDb, closeDb} from '@watchmen/mongo-helpr'

const dbg = debug(__filename)

const targets = splitAndTrim(getArg('targets'))
targets && dbg('targets=%o', targets)

export default function({indexMap}) {
  return async function() {
    try {
      const db = await getDb()
      for (const collectionName in indexMap) {
        if (targets && !targets.includes(collectionName)) {
          dbg('skipping collection=%o because it is absent from targets', collectionName)
          continue
        }
        dbg('dropping and creating indices for collection=%o', collectionName)
        // eslint-disable-next-line no-await-in-loop
        await createIndices({db, collectionName, indices: indexMap[collectionName], drop: true})
      }
    } catch (err) {
      dbg('caught error=%o, exiting...', err)
      throw err
    } finally {
      dbg('finally: closing db...')
      await closeDb()
    }
  }
}
