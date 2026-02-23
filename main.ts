//% color=#0fbc11 icon="\uf2c9" weight=100
namespace dht11 {
    // DHT11: don't poll too frequently
    const MIN_INTERVAL_MS = 2500

    let lastReadMs = -999999
    let lastTempC = 0
    let lastHumidity = 0
    let lastOk = false

    // Debug control
    let debugEnabled = false

    export enum DhtReading {
        //% block="temperature (°C)"
        TemperatureC = 0,
        //% block="humidity (%)"
        Humidity = 1
    }

    function dbg(msg: string): void {
        if (!debugEnabled) return
        serial.writeLine("[dht11] " + msg)
    }

    function bytesToHex(data: number[]): string {
        const hex = "0123456789ABCDEF"
        let out = ""
        for (let i = 0; i < data.length; i++) {
            const b = data[i] & 0xFF
            out += hex.charAt((b >> 4) & 0xF)
            out += hex.charAt(b & 0xF)
            if (i < data.length - 1) out += " "
        }
        return out
    }

    function readRaw(pin: DigitalPin): boolean {
        // Strongly recommended even if the module has a resistor
        pins.setPull(pin, PinPullMode.PullUp)

        // Idle high
        pins.digitalWritePin(pin, 1)
        basic.pause(50)

        // Start signal: pull low for >=18ms (we use 20ms)
        pins.digitalWritePin(pin, 0)
        basic.pause(20)

        // Release line, wait 20–40us
        pins.digitalWritePin(pin, 1)
        control.waitMicros(40)

        // Sensor response: ~80us low then ~80us high
        // pulseIn returns microseconds (0 means timeout)
        const respLow = pins.pulseIn(pin, PulseValue.Low, 1500)
        const respHigh = pins.pulseIn(pin, PulseValue.High, 1500)
        dbg(`resp low=${respLow}us high=${respHigh}us`)
        if (respLow == 0 || respHigh == 0) {
            dbg("timeout waiting for response (check wiring/pin order/pull-up)")
            return false
        }

        // Read 40 bits: each is ~50us low + (26-28us high for 0, ~70us high for 1)
        const data = [0, 0, 0, 0, 0]

        for (let i = 0; i < 40; i++) {
            const lowLen = pins.pulseIn(pin, PulseValue.Low, 1500)
            const highLen = pins.pulseIn(pin, PulseValue.High, 1500)

            if (lowLen == 0 || highLen == 0) {
                dbg(`bit ${i}: timeout low=${lowLen} high=${highLen}`)
                return false
            }

            const byteIndex = (i / 8) | 0
            data[byteIndex] = (data[byteIndex] << 1) & 0xFF

            // Threshold: pick 50us (between ~28 and ~70)
            const bit = highLen > 50 ? 1 : 0
            data[byteIndex] |= bit

            if (debugEnabled && (i < 8 || i >= 32)) {
                // Log a few bits (first byte + last byte) to keep serial noise down
                dbg(`bit ${i}: low=${lowLen} high=${highLen} -> ${bit}`)
            }
        }

        const checksum = (data[0] + data[1] + data[2] + data[3]) & 0xff
        dbg("raw bytes: " + bytesToHex(data) + ` | checksum calc=${checksum}`)

        if (data[4] != checksum) {
            dbg(`checksum mismatch: got=${data[4]} expected=${checksum}`)
            return false
        }

        // DHT11: integer bytes for humidity/temp
        lastHumidity = data[0]
        lastTempC = data[2]
        lastOk = true
        dbg(`OK humidity=${lastHumidity}% temp=${lastTempC}C`)
        return true
    }

    function ensureFresh(pin: DigitalPin): void {
        const now = control.millis()
        if (now - lastReadMs < MIN_INTERVAL_MS && lastOk) return

        lastOk = readRaw(pin)
        lastReadMs = now

        if (!lastOk) {
            dbg("read failed")
        }
    }

    /**
     * Enable or disable debug logging to the Serial console.
     */
    //% block="DHT11 set debug %enabled"
    export function setDebug(enabled: boolean): void {
        debugEnabled = enabled
        if (debugEnabled) {
            serial.redirectToUSB()
            serial.writeLine("[dht11] debug enabled")
        }
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

    /**
     * Convenience block: prints the last reading (or failure) to serial.
     * Useful while debugging.
     */
    //% block="DHT11 debug print last reading"
    export function debugPrintLast(): void {
        if (!debugEnabled) {
            serial.redirectToUSB()
        }
        if (lastOk) {
            serial.writeLine(`[dht11] last: H=${lastHumidity}% T=${lastTempC}C`)
        } else {
            serial.writeLine("[dht11] last: FAILED")
        }
    }
}