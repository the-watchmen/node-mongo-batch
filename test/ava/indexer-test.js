import test from 'ava'
import {getDb} from '@watchmen/mongo-helpr'
import {initDb} from '@watchmen/mongo-test-helpr'
import indexer from '../../src/indexer'

test('indexer', async t => {
	let db = await getDb()
	await initDb(db)
	const indexMap = {
		indexMe: [[{name: 1}, {unique: true}], {'sumthin._id': 1}]
	}
	await indexer({indexMap})()
	db = await getDb()
	const result = await db.indexInformation('indexMe')
	t.deepEqual(result, {
		_id_: [['_id', 1]],
		name_1: [['name', 1]],
		'sumthin._id_1': [['sumthin._id', 1]]
	})
})
