var hid = require('hidstream')
var core = require('coremidi')()
var program = require('commander')
var state = undefined // always with the state machines
var received // event counter
var device // HID device object
var note
var previous = [ ] // previous keys
var layout = [ ] // key-interval value
var scale // The scale intervals to play
var currentRelativeNote = 0 // The current note relative to the scale interval, e.g. 0-7 except 12 tone which is 0-11

const scales = {

	major : [2, 2, 1, 2, 2, 2, 1],
	minor : [2, 1, 2, 2, 1, 2, 2],
	twelvetone: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
}

const states = {

	'CREATING' : 0
	, 'IDLE' : 1
	, 'PLAYING' : 2
	, 'SEARCHING' : 3
	, 'CLOSING' : 4
	, 'EXITING' : 5
}

program
	.version(require('./package').version)
	.option('-k, --key [key]', 'The key to play in, e.g. "cmajor"', 'twelvetone')
	.option('-c, --config [config]', 'The instrument config file to use', './config.json')
	.parse(process.argv)
var config = require(program.config)

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
 * Parse the key signature
 */
function initScale() {

	var key = program.key
	if (key == 'twelvetone') {

		scale = scales.twelvetone
		note = 60 // middle C
	} else {

		var signature = /(^[abcdefg])(sharp|flat)?(major|minor)$/.exec(program.key)
		if (!signature) {

			console.error('Invalid key signature "' + key + '"')
			process.exit(1)
		}

		scale = scales[signature[3]]

		// Non-sharp/flat keys, starting at A, is the A-minor scale
		note = 57
		var keyOffset = signature[0].charCodeAt(0) - 'a'.charCodeAt(0)
		for (var i = 0; i < keyOffset; i++) {

			note += scales.minor[i]
		}
		if (note < 60) {

			note += 12
		}
		if (signature[2] == 'sharp') {

			note++
		} else if (signature[2] == 'flat') {

			note--
		}
	}
}

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
 * Create stream device
 */

function createStream() {

	process.stdin.setRawMode(true)
	process.stdin.on('data', function(key) {

		var char = key.toString()

		// Check for ctrl-c
		if (char.charCodeAt(0) == 3) {

			process.exit(0)
		}
		data({

			keyCodes: [ char ]
		})
	})
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
	
	if(key in layout) {

		var change = 0
		var layoutChange = layout[key]
		var i
		if (layoutChange < 0) {

			for (i = 0; i > layoutChange; i--) {

				currentRelativeNote--
				if (currentRelativeNote < 0) {

					currentRelativeNote += scale.length
				}
				change -= scale[currentRelativeNote]
			}
		} else if (layoutChange > 0) {

			for (i = 0; i < layoutChange; i++) {

				change += scale[currentRelativeNote]
				currentRelativeNote++
				if (currentRelativeNote >= scale.length) {

					currentRelativeNote -= scale.length
				}
			}
		}
		note += change
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

// begin here!
initScale()
if (config.type == 'stream') {
	createStream()
} else {
	search()
}
