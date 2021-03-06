import debug from '@watchmen/debug'
import {defineSupportCode} from 'cucumber'
import {getDb} from '@watchmen/mongo-helpr'
import {initDb} from '@watchmen/mongo-test-helpr'
import {clearArgDefaults} from '@watchmen/helpr/dist/args'

const dbg = debug(__filename)

defineSupportCode(({Before}) => {
	Before(async testCase => {
		try {
			dbg('before: feature=%o, scenario=%o', testCase.sourceLocation.uri, testCase.pickle.name)
			clearArgDefaults()
			const db = await getDb()
			const result = await initDb(db)
			dbg('before: init-db result=%o', result)
		} catch (error) {
			dbg('before: caught=%o', error)
			throw error
		}
	})
})
