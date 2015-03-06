var hid = require('hidstream')
var core = require('coremidi')()
var config = require('./config')
var state = undefined // always with the state machines
var received // event counter
var device // HID device object
var note = 60 // middle C
var previous = [ ] // previous keys 
var current  = [ ] // current keys
var layout = [ ] // key-interval value

const states = {

	'CREATING' : 0
	, 'IDLE' : 1
	, 'PLAYING' : 2
	, 'SEARCHING' : 3
	, 'CLOSING' : 4
	, 'EXITING' : 5
}

process.on('SIGINT', exit)


/** *
 * Map keyboard layout to a 'lookup table'
 */

Object.keys(config.layout).forEach(function mapKeys(k) {

	var keys = config.layout[k]
	if((keys) && typeof keys == 'object') {

		keys.forEach(function mapMultiples(v) {

			layout[v] = interval(k)
		})
	}
	else {

		layout[keys] = interval(k)
	}
})


/** *
 * Convert text interval from config to integer
 */

function interval(text) {

	text = text.replace('minus', '-')
	text = text.replace('zero', '0')
	text = text.replace('plus', '')
	return parseInt(text)
}


/** *
 * Search for the input device listed in config.json
 */

function search() {

	state = states.SEARCHING
	console.log(
		"* Searching for device matching '%s'..."
		, config.pattern
	)
	hid.getDevices().forEach(function search(dev) {

		if(dev.product.match(config.pattern) && state != states.CREATING) {

			console.log("* Creating device...")
			return create(dev.path)
		}
	})
	if(state != states.CREATING) {

		setTimeout(search, 2000)
	}
}


/** *
 * Create a HID device from the path found
 */

function create(path) {

	state = states.CREATING
	device = new hid.device(path, { parser : hid.parser.keyboard })
	received = 0
	initialize(device)
}


/** * 
 * Add listeners to the device
 */

function initialize(dev) {

	dev.on('data', data)

	dev.on('error', reset)
	setTimeout(check, 500)
}


/** *
 * Process data from device
 */

function data(dat) {

	++received
	if(!dat.keyCodes.length) { 

		return previous = null
	}

	var key = dat.keyCodes[0]
	
	if(key != previous && key in layout) {
		
		note = note + layout[key]
		core.write([144, note , 127])
		console.log("> %s: %s", layout[key], note)
		previous = key
	}
}


/** *
 * Reset device
 */

function reset(err) {

	device && device.close()
	if(err) {

		console.log("* Error:")
		console.log(err)
	}
	else if(received == 0) {

		console.log("* No data received, retrying...")
	}
	search()
}


/** *
 * Check if device stalled
 */

function check() { 

	if(received == 0) { return reset() } 
	console.log("* Successfully connected. Ready to play!")
}


/** *
 * Cleanup device & exit properly
 */

function exit() {

	if(state != states.EXITING && device) { 

		console.log("* Closing device...") 
	}
	device && device.close()
	setImmediate(function() {

		console.log('* Exiting.')
		process.exit(0)
	})
	state = states.EXITING
}

search() // begin here!
