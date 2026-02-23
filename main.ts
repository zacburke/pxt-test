//% color=#0fbc11 icon="\uf2c9" weight=100
namespace dht11 {
    // DHT11: don't poll too frequently
    const MIN_INTERVAL_MS = 2500
    const LIB_VERSION = "0.0.4"

    let lastReadMs = -999999
    let lastTempC = 0
    let lastHumidity = 0
    let lastOk = false

    // Always-on serial debugging
    let serialInitDone = false

    function initSerialOnce(): void {
        if (serialInitDone) return
        serialInitDone = true
        serial.redirectToUSB()
        serial.writeLine("[dht11] serial debug ON, version=" + LIB_VERSION)
    }

    function dbg(msg: string): void {
        initSerialOnce()
        serial.writeLine("[dht11] " + msg)
    }

    function bytesToHex(data: number[]): string {
        const hex = "0123456789ABCDEF"
        let out = ""
        for (let i = 0; i < data.length; i++) {
            const b = data[i] & 0xff
            out += hex.charAt((b >> 4) & 0xf)
            out += hex.charAt(b & 0xf)
            if (i < data.length - 1) out += " "
        }
        return out
    }

    function readRaw(pin: DigitalPin): boolean {
        initSerialOnce()

        // Stabilize idle-high level
        pins.setPull(pin, PinPullMode.PullUp)

        // Idle high
        pins.digitalWritePin(pin, 1)
        basic.pause(60)

        // Start signal: pull low for >=18ms
        pins.digitalWritePin(pin, 0)
        basic.pause(20)

        // Release line and force input-ish behavior
        pins.digitalWritePin(pin, 1)
        pins.setPull(pin, PinPullMode.PullUp)
        // Force runtime to configure pin for reads
        pins.digitalReadPin(pin)
        control.waitMicros(40)

        dbg("line state before response read=" + pins.digitalReadPin(pin))

        // Sensor response: ~80us low then ~80us high (give generous timeouts)
        const respLow = pins.pulseIn(pin, PulseValue.Low, 3000)
        const respHigh = pins.pulseIn(pin, PulseValue.High, 3000)
        dbg(`resp low=${respLow}us high=${respHigh}us`)

        if (respLow == 0 || respHigh == 0) {
            dbg("timeout waiting for response (check wiring/pin order/shield S-V-G)")
            return false
        }

        // Read 40 bits
        const data = [0, 0, 0, 0, 0]
        for (let i = 0; i < 40; i++) {
            const lowLen = pins.pulseIn(pin, PulseValue.Low, 3000)
            const highLen = pins.pulseIn(pin, PulseValue.High, 3000)

            if (lowLen == 0 || highLen == 0) {
                dbg(`bit ${i}: timeout low=${lowLen} high=${highLen}`)
                return false
            }

            const byteIndex = (i / 8) | 0
            data[byteIndex] = (data[byteIndex] << 1) & 0xff

            // DHT11: 0 => ~26-28us high, 1 => ~70us high
            const bit = highLen > 50 ? 1 : 0
            data[byteIndex] |= bit

            // Keep serial readable: log first 8 and last 8 bits
            if (i < 8 || i >= 32) {
                dbg(`bit ${i}: low=${lowLen} high=${highLen} -> ${bit}`)
            }
        }

        const checksum = (data[0] + data[1] + data[2] + data[3]) & 0xff
        dbg("raw bytes: " + bytesToHex(data) + ` | checksum calc=${checksum}`)

        if (data[4] != checksum) {
            dbg(`checksum mismatch: got=${data[4]} expected=${checksum}`)
            return false
        }

        lastHumidity = data[0]
        lastTempC = data[2]
        lastOk = true
        dbg(`OK humidity=${lastHumidity}% temp=${lastTempC}C`)
        return true
    }

    function ensureFresh(pin: DigitalPin): void {
        const now = control.millis()
        if (now - lastReadMs < MIN_INTERVAL_MS && lastOk) return

        dbg(`reading on pin=${pin}...`)
        lastOk = readRaw(pin)
        lastReadMs = now

        if (!lastOk) dbg("read failed")
    }

    /**
     * Read temperature in Celsius from a DHT11 sensor.
     */
    //% block="DHT11 temperature (°C) on pin %pin"
    //% pin.fieldEditor="gridpicker" pin.fieldOptions.columns=4
    export function temperatureC(pin: DigitalPin): number {
        ensureFresh(pin)
        return lastOk ? lastTempC : -999
    }

    /**
     * Read humidity percentage from a DHT11 sensor.
     */
    //% block="DHT11 humidity (%) on pin %pin"
    //% pin.fieldEditor="gridpicker" pin.fieldOptions.columns=4
    export function humidity(pin: DigitalPin): number {
        ensureFresh(pin)
        return lastOk ? lastHumidity : -1
    }

    export enum DhtReading {
        //% block="temperature (°C)"
        TemperatureC = 0,
        //% block="humidity (%)"
        Humidity = 1
    }

    /**
     * Read a specific value from the DHT11 sensor.
     */
    //% block="DHT11 read %what on pin %pin"
    //% pin.fieldEditor="gridpicker" pin.fieldOptions.columns=4
    export function read(pin: DigitalPin, what: DhtReading): number {
        ensureFresh(pin)
        if (!lastOk) return what == DhtReading.TemperatureC ? -999 : -1
        return what == DhtReading.TemperatureC ? lastTempC : lastHumidity
    }
}