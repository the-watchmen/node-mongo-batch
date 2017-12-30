#!/usr/bin/env node
import assert from 'assert'
import debug from '@watchmen/debug'
import Timer from '@watchmen/tymer'
import geocode from '@watchmen/geocodr'
import {sleep} from '@watchmen/helpr'
import {getArg, getRequiredArg, getJsonArg} from '@watchmen/helpr/dist/args'
import {getDb, unwind, closeDb} from '@watchmen/mongo-helpr'
import {getAddressKeyArray} from '@watchmen/mongo-data'
// move address-key helpers to geo-helper?
import {getGeocoderAdapter} from './geo-helper'
import constants from './constants'

const dbg = debug(__filename)

const addressKey = 'addressKey'
const inputName = getRequiredArg('inputCollection')
const outputName = getArg('outputCollection', {dflt: constants.GEO_ADDRESSES})
const thresh = getArg('thresh', {dflt: 100})
const sleepMillis = getArg('sleepMillis', {dflt: 0})
const query = getJsonArg('query')
const batchSize = getArg('batchSize', {dflt: 1000})
const dryRun = getArg('dryRun')
const limit = getArg('limit')

const geocoderAdapter = getGeocoderAdapter()
const line1Field = getAggregationField(getArg('line1Field', {dflt: 'addressLine1'}))
const cityField = getAggregationField(getArg('cityField', {dflt: 'city'}))
const stateField = getAggregationField(getArg('stateField', {dflt: 'state'}))
const zipField = getAggregationField(getArg('zipField', {dflt: 'zip'}))

const addressKeyArray = getAddressKeyArray({
  line1: line1Field,
  city: cityField,
  state: stateField,
  zip: zipField
})

export default (async function() {
  try {
    const db = await getDb()
    assert(db)

    const input = db.collection(inputName)
    const output = db.collection(outputName)

    const inputCount = await input.count()
    if (inputCount === 0) {
      dbg('no records found, exiting: input=%o', inputName)
      process.exit(0)
    } else {
      dbg('processing records: input=%o, count=%o', inputName, inputCount)
    }

    output.createIndex({[addressKey]: 1}, {unique: true})

    const steps = [
      {$match: query},
      {
        $project: {
          [addressKey]: {$concat: addressKeyArray},
          address: {
            line1: line1Field,
            city: cityField,
            state: stateField,
            zip: zipField
          }
        }
      },
      {
        $lookup: {
          from: outputName,
          localField: addressKey,
          foreignField: addressKey,
          as: 'geocoded'
        }
      },
      unwind('$geocoded'),
      {$match: {'geocoded.geoPoint': null, 'geocoded.isBadAddress': {$ne: true}}},
      {
        $group: {
          _id: `$${addressKey}`,
          address: {$last: '$address'}
        }
      }
    ]

    dbg(
      'begin aggregation: input=%o, output=%o, batch-size=%o, query=%o, sleep-millis=%o, dry-run=%o',
      inputName,
      outputName,
      batchSize,
      query,
      sleepMillis,
      dryRun
    )

    dbg(
      'address fields: line-1=%o, city=%o, state=%o, zip=%o',
      line1Field,
      cityField,
      stateField,
      zipField
    )

    const addresses = await input
      .aggregate([...steps, ...(limit ? [{$limit: limit}] : [])], {allowDiskUse: true})
      .toArray()

    if (addresses.length === 0) {
      dbg('all records geocoded, exiting: input=%o', inputName)
      process.exit(0)
    }

    const count = addresses.length

    dbg('geocoding records: count=%o, limit=%o', count, limit)

    if (dryRun) {
      dbg('dry-run: exiting...')
      process.exit(0)
    }

    await geocodeAddresses({addresses, getAddress, output})

    closeDb()
  } catch (err) {
    dbg('connect: caught=%o', err)
    process.exit(1)
  }
})()

function getAddress(r) {
  const {address} = r
  return `${address.line1} ${getCityStateZip(r)}`
}

function getCityStateZip(r) {
  const {address} = r
  return `${address.city}, ${getStateZip(r)}`
}

function getStateZip(r) {
  const {address} = r
  return `${address.state} ${address.zip}`
}

function getAggregationField(name) {
  return `$${name}`
}

async function geocodeAddresses({addresses, getAddress, output}) {
  const timer = new Timer('main')
  dbg('addresses.length=%o', addresses.length)
  let failed = 0
  let geocoded = 0

  if (dryRun) {
    dbg('dry-run: exiting...')
    process.exit(0)
  }

  let begin = 0

  /* eslint-disable no-await-in-loop */
  while (begin < addresses.length) {
    timer.start()
    let coordinates

    if (batchSize > 1) {
      const batch = addresses.slice(begin, begin + batchSize).map(getAddress)
      coordinates = await geocode(batch, geocoderAdapter)
    } else {
      coordinates = [await geocode(getAddress(addresses[begin]), geocoderAdapter)]
    }

    for (let i = 0; i < coordinates.length; i++) {
      const record = addresses[begin + i]
      let geoPoint
      let isBadAddress

      if (coordinates[i]) {
        geoPoint = {geoPoint: {type: 'Point', coordinates: coordinates[i]}}
        geocoded += 1
      } else {
        isBadAddress = {isBadAddress: true}
        dbg('unable to geocode address [%o], marking as bad on output...', getAddress(record))
        failed += 1
      }

      const result = await output.insertOne({
        ...geoPoint,
        addressLine1: record.address.line1,
        city: record.address.city,
        state: record.address.state,
        zip: record.address.zip,
        addressKey: record._id,
        ...isBadAddress
      })
      assert.equal(result.insertedCount, 1)
    }

    timer.stop()
    if (timer.count() % thresh === 0) {
      dbg('timer=%o', timer.toString())
    }
    sleep(sleepMillis)
    begin += batchSize
  }

  dbg(
    'geocode-addresses: geocoded=[%o], failed=[%o], batch-count=[%o], elapsed=[%ss]',
    geocoded,
    failed,
    timer.count(),
    (timer.total() / 1000).toFixed(3)
  )
}
